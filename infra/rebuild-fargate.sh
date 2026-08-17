#!/bin/bash
# ==============================================================================
# Rebuild the web-monitor Fargate stack (ECS + internal ALB + EFS)
#
# WHY: web-monitor is moving off the shared nginx reverse proxy on the
# itam-prod EC2 so it has its own endpoint and is not coupled to another
# team's config. This recreates the Fargate stack that was torn down when we
# temporarily co-located on that EC2.
#
# RUN THIS ON: any host with ProdAdmin AWS credentials (e.g. messageboard).
#   export AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... AWS_SESSION_TOKEN=...
#   ./rebuild-fargate.sh
#
# It is safe to re-run: existing resources are detected and reused.
# The service is created with desired-count 0 — EFS must be seeded with
# config.json before the first task starts (see the printed next steps).
# ==============================================================================

set -uo pipefail

export AWS_DEFAULT_REGION=ap-southeast-1
export AWS_PAGER=""

ACCOUNT=329432956490
REGION=ap-southeast-1
CLUSTER=it-dashboard                      # existing cluster, alongside itam/tvm
SERVICE=itops-webmon
FAMILY=itops-webmon-task
IMAGE=$ACCOUNT.dkr.ecr.$REGION.amazonaws.com/itops-webmon:latest
SECRET_ARN=arn:aws:secretsmanager:$REGION:$ACCOUNT:secret:itops-webmon-waQHnx
VPC=vpc-081819541c020e58d
PRIV_A=subnet-0e6a166f09655f67e           # 1a  (same subnets as itam-service)
PRIV_B=subnet-031e1584d06a29c9d           # 1b
# The task reuses the shared services SG, exactly like itam-service and
# tvm-dashboard-service. That SG already permits itself, so RDS access works
# with no change to the shared DB security group.
TASK_SG=sg-0e2a9bb348a091e99
LOG_GROUP=/ecs/itops-webmon
OFFICES=("10.201.0.0/16" "10.203.0.0/16" "10.8.0.0/16")   # DGT, KL, VPC

say() { echo ""; echo "── $* ─────────────────────────────────────────────"; }
ok()  { echo "   ✅ $*"; }
note(){ echo "   •  $*"; }

# ── preflight ────────────────────────────────────────────────────────────────
say "Preflight"
if ! aws sts get-caller-identity --query Account --output text >/dev/null 2>&1; then
    echo "   ❌ No valid AWS credentials. Export your portal creds and retry." >&2
    exit 1
fi
ok "Authenticated to account $(aws sts get-caller-identity --query Account --output text)"

# ── 1. security groups ───────────────────────────────────────────────────────
say "1/8  Security groups"

get_sg() {   # $1 = group name  -> prints id or empty
    aws ec2 describe-security-groups \
        --filters "Name=group-name,Values=$1" "Name=vpc-id,Values=$VPC" \
        --query "SecurityGroups[0].GroupId" --output text 2>/dev/null | grep -v '^None$'
}

ALB_SG=$(get_sg itops-webmon-alb-sg)
if [ -z "$ALB_SG" ]; then
    ALB_SG=$(aws ec2 create-security-group --group-name itops-webmon-alb-sg \
        --description "web-monitor internal ALB" --vpc-id "$VPC" \
        --query GroupId --output text)
    for cidr in "${OFFICES[@]}"; do
        aws ec2 authorize-security-group-ingress --group-id "$ALB_SG" \
            --protocol tcp --port 80 --cidr "$cidr" >/dev/null 2>&1
    done
    ok "Created ALB SG $ALB_SG (port 80 from DGT/KL/VPC)"
else
    ok "Reusing ALB SG $ALB_SG"
fi

EFS_SG=$(get_sg itops-webmon-efs-sg)
if [ -z "$EFS_SG" ]; then
    EFS_SG=$(aws ec2 create-security-group --group-name itops-webmon-efs-sg \
        --description "web-monitor EFS" --vpc-id "$VPC" \
        --query GroupId --output text)
    # NFS from the task SG, and from the itam-prod EC2 (same SG) so we can seed it
    aws ec2 authorize-security-group-ingress --group-id "$EFS_SG" \
        --protocol tcp --port 2049 --source-group "$TASK_SG" >/dev/null 2>&1
    ok "Created EFS SG $EFS_SG (NFS 2049 from $TASK_SG)"
else
    ok "Reusing EFS SG $EFS_SG"
fi
note "Task SG: $TASK_SG (shared services SG — RDS access needs no new rule)"

# ── 2. EFS ───────────────────────────────────────────────────────────────────
say "2/8  EFS file system"

FS_ID=$(aws efs describe-file-systems \
    --query "FileSystems[?Name=='itops-webmon-efs'].FileSystemId | [0]" \
    --output text 2>/dev/null | grep -v '^None$')
if [ -z "$FS_ID" ]; then
    FS_ID=$(aws efs create-file-system --creation-token itops-webmon-efs-$(date +%s) \
        --encrypted --tags Key=Name,Value=itops-webmon-efs \
        --query FileSystemId --output text)
    ok "Created EFS $FS_ID"
    until [ "$(aws efs describe-file-systems --file-system-id "$FS_ID" \
              --query 'FileSystems[0].LifeCycleState' --output text)" = available ]; do
        echo "      waiting for EFS to become available..."; sleep 5
    done
else
    ok "Reusing EFS $FS_ID"
fi

for sn in "$PRIV_A" "$PRIV_B"; do
    existing=$(aws efs describe-mount-targets --file-system-id "$FS_ID" \
        --query "MountTargets[?SubnetId=='$sn'].MountTargetId | [0]" --output text 2>/dev/null | grep -v '^None$')
    if [ -z "$existing" ]; then
        aws efs create-mount-target --file-system-id "$FS_ID" --subnet-id "$sn" \
            --security-groups "$EFS_SG" >/dev/null 2>&1 && ok "Mount target in $sn"
    else
        ok "Mount target already in $sn"
    fi
done

AP_ID=$(aws efs describe-access-points --file-system-id "$FS_ID" \
    --query "AccessPoints[0].AccessPointId" --output text 2>/dev/null | grep -v '^None$')
if [ -z "$AP_ID" ]; then
    AP_ID=$(aws efs create-access-point --file-system-id "$FS_ID" \
        --tags Key=Name,Value=itops-webmon-ap \
        --posix-user Uid=1000,Gid=1000 \
        --root-directory 'Path=/webmon,CreationInfo={OwnerUid=1000,OwnerGid=1000,Permissions=0755}' \
        --query AccessPointId --output text)
    ok "Created access point $AP_ID"
else
    ok "Reusing access point $AP_ID"
fi

# ── 3. IAM roles ─────────────────────────────────────────────────────────────
say "3/8  IAM roles"

TRUST='{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ecs-tasks.amazonaws.com"},"Action":"sts:AssumeRole"}]}'

if ! aws iam get-role --role-name itops-webmon-ecs-exec >/dev/null 2>&1; then
    aws iam create-role --role-name itops-webmon-ecs-exec \
        --assume-role-policy-document "$TRUST" >/dev/null
    ok "Created itops-webmon-ecs-exec"
else
    ok "Reusing itops-webmon-ecs-exec"
fi
aws iam attach-role-policy --role-name itops-webmon-ecs-exec \
    --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy >/dev/null 2>&1
aws iam put-role-policy --role-name itops-webmon-ecs-exec --policy-name read-webmon-secret \
    --policy-document "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":\"secretsmanager:GetSecretValue\",\"Resource\":\"${SECRET_ARN}*\"}]}" >/dev/null 2>&1
ok "Exec role policies attached (ECR/logs + read itops-webmon secret)"

if ! aws iam get-role --role-name itops-webmon-ecs-task >/dev/null 2>&1; then
    aws iam create-role --role-name itops-webmon-ecs-task \
        --assume-role-policy-document "$TRUST" >/dev/null
    ok "Created itops-webmon-ecs-task"
else
    ok "Reusing itops-webmon-ecs-task"
fi
aws iam attach-role-policy --role-name itops-webmon-ecs-task \
    --policy-arn arn:aws:iam::aws:policy/AmazonElasticFileSystemClientReadWriteAccess >/dev/null 2>&1
ok "Task role policy attached (EFS read/write)"

# ── 4. log group ─────────────────────────────────────────────────────────────
say "4/8  CloudWatch log group"
aws logs create-log-group --log-group-name "$LOG_GROUP" >/dev/null 2>&1
ok "$LOG_GROUP ready"

# ── 5. internal ALB ──────────────────────────────────────────────────────────
say "5/8  Internal Application Load Balancer"

ALB_ARN=$(aws elbv2 describe-load-balancers --names itops-webmon-alb \
    --query "LoadBalancers[0].LoadBalancerArn" --output text 2>/dev/null | grep -v '^None$')
if [ -z "$ALB_ARN" ]; then
    ALB_ARN=$(aws elbv2 create-load-balancer --name itops-webmon-alb \
        --type application --scheme internal \
        --subnets "$PRIV_A" "$PRIV_B" --security-groups "$ALB_SG" \
        --query 'LoadBalancers[0].LoadBalancerArn' --output text)
    ok "Created internal ALB"
else
    ok "Reusing existing ALB"
fi
ALB_DNS=$(aws elbv2 describe-load-balancers --load-balancer-arns "$ALB_ARN" \
    --query 'LoadBalancers[0].DNSName' --output text)

TG_ARN=$(aws elbv2 describe-target-groups --names itops-webmon-tg \
    --query "TargetGroups[0].TargetGroupArn" --output text 2>/dev/null | grep -v '^None$')
if [ -z "$TG_ARN" ]; then
    TG_ARN=$(aws elbv2 create-target-group --name itops-webmon-tg \
        --protocol HTTP --port 4447 --vpc-id "$VPC" --target-type ip \
        --health-check-protocol HTTP --health-check-path / \
        --matcher HttpCode=200-399 \
        --query 'TargetGroups[0].TargetGroupArn' --output text)
    ok "Created target group (HTTP:4447, health check /)"
else
    ok "Reusing target group"
fi

if [ -z "$(aws elbv2 describe-listeners --load-balancer-arn "$ALB_ARN" \
           --query "Listeners[?Port==\`80\`].ListenerArn" --output text 2>/dev/null)" ]; then
    aws elbv2 create-listener --load-balancer-arn "$ALB_ARN" \
        --protocol HTTP --port 80 \
        --default-actions Type=forward,TargetGroupArn="$TG_ARN" >/dev/null
    ok "Created HTTP:80 listener"
else
    ok "Listener on :80 already present"
fi

# ── 6. task definition ───────────────────────────────────────────────────────
say "6/8  Task definition"

python3 - "$IMAGE" "$SECRET_ARN" "$FS_ID" "$AP_ID" "$LOG_GROUP" "$ACCOUNT" "$REGION" "$FAMILY" \
    > /tmp/itops-webmon-taskdef.json <<'PY'
import json, sys
image, secret, fs_id, ap_id, log_group, account, region, family = sys.argv[1:9]
keys = ["JWT_SECRET","DB_HOST","DB_PORT","DB_USER","DB_PASS","DB_NAME",
        "FLOOR_MAP_DB_HOST","FLOOR_MAP_DB_PORT","FLOOR_MAP_DB_USER",
        "FLOOR_MAP_DB_PASS","FLOOR_MAP_DB_NAME",
        "SLACK_WEBHOOK_URL","SLACK_BLOCK_WEBHOOK_URL","JIRA_BASE_URL","JIRA_EMAIL",
        "JIRA_API_TOKEN","JIRA_SERVICE_DESK_ID","JIRA_REQUEST_TYPE_ID","JIRA_POLL_MS",
        "JIRA_IMPACT_ID","JIRA_URGENCY_ID","JIRA_WORKSPACE_ID",
        "JIRA_LOCATION_OBJECT_ID","JIRA_SITE_OBJECT_ID"]
td = {
  "family": family, "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"], "cpu": "512", "memory": "1024",
  "executionRoleArn": f"arn:aws:iam::{account}:role/itops-webmon-ecs-exec",
  "taskRoleArn":      f"arn:aws:iam::{account}:role/itops-webmon-ecs-task",
  "containerDefinitions": [{
    "name": "web-monitor", "image": image, "essential": True,
    "portMappings": [{"containerPort": 4447, "protocol": "tcp"}],
    # Mutable paths live on the EFS mount; DB_SSL because RDS requires TLS;
    # TRUST_PROXY so req.ip resolves the real agent IP behind the ALB.
    "environment": [
      {"name": "CONFIG_PATH",  "value": "/data/config.json"},
      {"name": "UPDATES_DIR",  "value": "/data/updates"},
      {"name": "ARCHIVE_DIR",  "value": "/data/archives"},
      {"name": "DB_SSL",       "value": "true"},
      {"name": "TRUST_PROXY",  "value": "true"},
    ],
    "secrets": [{"name": k, "valueFrom": f"{secret}:{k}::"} for k in keys],
    "mountPoints": [{"sourceVolume": "efs-data", "containerPath": "/data"}],
    "logConfiguration": {"logDriver": "awslogs", "options": {
        "awslogs-group": log_group, "awslogs-region": region,
        "awslogs-stream-prefix": "ecs"}},
    "healthCheck": {
        "command": ["CMD-SHELL", "wget -qO- http://localhost:4447/ >/dev/null 2>&1 || exit 1"],
        "interval": 30, "timeout": 5, "retries": 3, "startPeriod": 60},
  }],
  "volumes": [{"name": "efs-data", "efsVolumeConfiguration": {
      "fileSystemId": fs_id, "transitEncryption": "ENABLED",
      "authorizationConfig": {"accessPointId": ap_id, "iam": "DISABLED"}}}],
}
print(json.dumps(td, indent=2))
PY

TD_ARN=$(aws ecs register-task-definition \
    --cli-input-json file:///tmp/itops-webmon-taskdef.json \
    --query 'taskDefinition.taskDefinitionArn' --output text)
rm -f /tmp/itops-webmon-taskdef.json
ok "Registered $TD_ARN"

# ── 7. service ───────────────────────────────────────────────────────────────
say "7/8  ECS service (starts at 0 tasks — EFS must be seeded first)"

EXISTING=$(aws ecs describe-services --cluster "$CLUSTER" --services "$SERVICE" \
    --query "services[?status=='ACTIVE'].serviceName" --output text 2>/dev/null)
if [ -z "$EXISTING" ]; then
    aws ecs create-service --cluster "$CLUSTER" --service-name "$SERVICE" \
        --task-definition "$FAMILY" --desired-count 0 --launch-type FARGATE \
        --network-configuration "awsvpcConfiguration={subnets=[$PRIV_A,$PRIV_B],securityGroups=[$TASK_SG],assignPublicIp=DISABLED}" \
        --load-balancers "targetGroupArn=$TG_ARN,containerName=web-monitor,containerPort=4447" \
        --health-check-grace-period-seconds 120 \
        --query 'service.serviceName' --output text >/dev/null
    ok "Created service $SERVICE in cluster $CLUSTER"
else
    aws ecs update-service --cluster "$CLUSTER" --service "$SERVICE" \
        --task-definition "$FAMILY" --query 'service.serviceName' --output text >/dev/null
    ok "Updated existing service $SERVICE to the new task definition"
fi

# ── 8. summary ───────────────────────────────────────────────────────────────
say "8/8  Done"
cat <<SUMMARY

  Cluster        : $CLUSTER
  Service        : $SERVICE   (desired-count 0)
  Task def       : $TD_ARN
  EFS            : $FS_ID   access point $AP_ID
  Task SG        : $TASK_SG   (shared — RDS reachable)
  ALB (internal) : $ALB_DNS

  ENDPOINT once running:   http://$ALB_DNS/

  ── NEXT STEPS ────────────────────────────────────────────────────────────
  1) Seed EFS with the live config (run ON itam-prod, which is in-VPC and
     already holds the current config.json):

       sudo mkdir -p /mnt/webmon-efs
       sudo mount -t efs -o tls,accesspoint=$AP_ID $FS_ID:/ /mnt/webmon-efs
       sudo cp /opt/webmon/data/config.json /mnt/webmon-efs/config.json
       sudo cp -r /opt/webmon/data/updates   /mnt/webmon-efs/updates
       sudo mkdir -p /mnt/webmon-efs/archives
       sudo chown -R 1000:1000 /mnt/webmon-efs
       ls -la /mnt/webmon-efs

  2) Start the task:
       aws ecs update-service --cluster $CLUSTER --service $SERVICE --desired-count 1

  3) Watch it come up:
       aws logs tail $LOG_GROUP --follow --since 5m

  4) Verify (from an office machine):
       curl -I http://$ALB_DNS/
       curl -s http://$ALB_DNS/api/stats

  5) Repack the extension against the new endpoint, then roll out:
       extension/api.js  ->  http://$ALB_DNS/logs

SUMMARY
