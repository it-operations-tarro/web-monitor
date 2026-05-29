'use client';

import { useEffect, useMemo, useState, useCallback, Fragment } from 'react';
import {
  Activity,
  AlertTriangle,
  Monitor,
  Globe,
  Clock,
  RefreshCw,
  LayoutDashboard,
  Sun,
  Moon,
  Trash2,
  ShieldCheck,
  ListChecks,
  Users,
  Gauge,
  Radio,
  ChevronRight,
  Plus,
  X,
  UserCog,
  Link2,
  Unlink,
  Eye,
  EyeOff,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { format } from 'date-fns';

// ─── utils ────────────────────────────────────────────────────────────────
const formatBytes = (bytes: number) => {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

type Tone = 'brand' | 'success' | 'warn' | 'danger' | 'info' | 'neutral';

const TONE: Record<Tone, { dot: string; pill: string; text: string; bar: string }> = {
  brand:   { dot: 'bg-[#a78bfa]',   pill: 'border-[#6a29e1]/40 bg-[#6a29e1]/10',     text: 'text-[#c4b5fd]',    bar: 'bg-[#6a29e1]' },
  success: { dot: 'bg-emerald-400', pill: 'border-emerald-500/40 bg-emerald-500/10', text: 'text-emerald-300',  bar: 'bg-emerald-500' },
  warn:    { dot: 'bg-amber-400',   pill: 'border-amber-500/40 bg-amber-500/10',     text: 'text-amber-300',    bar: 'bg-amber-500' },
  danger:  { dot: 'bg-rose-400',    pill: 'border-rose-500/40 bg-rose-500/10',       text: 'text-rose-300',     bar: 'bg-rose-500' },
  info:    { dot: 'bg-sky-400',     pill: 'border-sky-500/40 bg-sky-500/10',         text: 'text-sky-300',      bar: 'bg-sky-500' },
  neutral: { dot: 'bg-slate-500',   pill: 'border-slate-500/30 bg-slate-500/10',     text: 'text-slate-300',    bar: 'bg-slate-500' },
};

const CATEGORY: Record<string, { label: string; tone: Tone }> = {
  social:      { label: 'Social',    tone: 'info' },
  gambling:    { label: 'Gambling',  tone: 'danger' },
  streaming:   { label: 'Streaming', tone: 'warn' },
  ph_shopping: { label: 'Shopping',  tone: 'brand' },
  manual:      { label: 'Policy',    tone: 'neutral' },
};
const getCategory = (c: string) => CATEGORY[c] || { label: c || 'Policy', tone: 'neutral' as Tone };

const TH = 'px-4 py-2.5 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider';
const TD = 'px-4 py-3 text-sm';

// ─── primitives ───────────────────────────────────────────────────────────
function StatusPill({
  tone,
  label,
  pulse = false,
  className = '',
}: { tone: Tone; label: string; pulse?: boolean; className?: string }) {
  const t = TONE[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[11px] font-medium ${t.pill} ${t.text} ${className}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${t.dot} ${pulse ? 'animate-pulse' : ''}`} />
      {label}
    </span>
  );
}

function CategoryTag({ category }: { category: string }) {
  const info = getCategory(category);
  const t = TONE[info.tone];
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide border ${t.pill} ${t.text}`}>
      {info.label}
    </span>
  );
}

function Tile({
  title,
  value,
  sub,
  tone = 'brand',
  icon,
}: { title: string; value: React.ReactNode; sub?: React.ReactNode; tone?: Tone; icon?: React.ReactNode }) {
  const t = TONE[tone];
  return (
    <div className="relative bg-[var(--bg-card)] border border-[var(--border-ui)] rounded-lg p-5 transition-colors duration-200 hover:border-[#6a29e1]/60">
      <span className={`absolute left-0 top-3 bottom-3 w-0.5 rounded-r ${t.bar}`} />
      <div className="flex items-start justify-between mb-3">
        <span className="text-[11px] text-[var(--text-muted)] font-semibold uppercase tracking-wider">{title}</span>
        {icon && <span className="text-[var(--text-muted)] opacity-70">{icon}</span>}
      </div>
      <div className="text-2xl font-semibold text-[var(--text-main)] tabular-nums tracking-tight">{value}</div>
      {sub && <div className="mt-1 text-xs text-[var(--text-muted)]">{sub}</div>}
    </div>
  );
}

function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-[var(--bg-card)] border border-[var(--border-ui)] rounded-lg overflow-hidden ${className}`}>
      {children}
    </div>
  );
}

function PanelHeader({
  title,
  accent = 'brand',
  subtitle,
  right,
}: { title: string; accent?: Tone; subtitle?: string; right?: React.ReactNode }) {
  const t = TONE[accent];
  return (
    <div className="px-5 py-3 border-b border-[var(--border-ui)] flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <span className={`w-1 h-4 rounded-sm ${t.bar}`} />
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[var(--text-main)] truncate">{title}</h3>
          {subtitle && <p className="text-[11px] text-[var(--text-muted)] truncate">{subtitle}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}

function NavItem({
  active,
  icon,
  label,
  onClick,
}: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors border-l-2 ${
        active
          ? 'bg-[#6a29e1]/15 text-[var(--text-main)] border-[#6a29e1]'
          : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card-alt)] border-transparent'
      }`}
    >
      <span className={active ? 'text-[#a78bfa]' : ''}>{icon}</span>
      <span className="font-medium">{label}</span>
      {active && <ChevronRight size={14} className="ml-auto text-[#a78bfa]" />}
    </button>
  );
}

// ─── page ─────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'machines' | 'enforcement' | 'users'>('dashboard');
  const [stats, setStats] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [machines, setMachines] = useState<any[]>([]);
  const [bwViolations, setBwViolations] = useState<any[]>([]);
  const [enforcement, setEnforcement] = useState<any>(null);
  const [machineToDelete, setMachineToDelete] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  useEffect(() => {
    const saved = localStorage.getItem('tarro-theme') as 'light' | 'dark';
    if (saved) {
      setTheme(saved);
      document.documentElement.classList.toggle('light', saved === 'light');
    }
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('tarro-theme', next);
    document.documentElement.classList.toggle('light', next === 'light');
  };

  const getBaseUrl = () => `http://${window.location.hostname}:4448`;

  async function fetchData() {
    setError(false);
    try {
      const baseUrl = getBaseUrl();
      const fetchOpts = { cache: 'no-store' as RequestCache };

      const statsRes = await fetch(`${baseUrl}/api/stats`, fetchOpts);
      const logsRes = await fetch(`${baseUrl}/api/logs?limit=50`, fetchOpts);
      const machinesRes = await fetch(`${baseUrl}/api/machines`, fetchOpts);
      const bwRes = await fetch(`${baseUrl}/api/bandwidth-violations?limit=10`, fetchOpts);

      if (statsRes.ok && logsRes.ok && machinesRes.ok && bwRes.ok) {
        setStats(await statsRes.json());
        setLogs(await logsRes.json());
        setMachines(await machinesRes.json());
        setBwViolations(await bwRes.json());
      } else {
        setError(true);
      }

      // Enforcement endpoint is optional — pre-update collectors don't expose it.
      try {
        const enforcementRes = await fetch(`${baseUrl}/api/enforcement`, fetchOpts);
        if (enforcementRes.ok) setEnforcement(await enforcementRes.json());
      } catch {}
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteMachine() {
    if (!machineToDelete) return;
    try {
      const baseUrl = getBaseUrl();
      const res = await fetch(`${baseUrl}/api/machines/${encodeURIComponent(machineToDelete)}`, { method: 'DELETE' });
      if (res.ok) {
        setMachineToDelete(null);
        fetchData();
      }
    } catch (e) {
      console.error('Failed to delete machine:', e);
    }
  }

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  const onlineCount = useMemo(
    () => machines.filter((m) => new Date().getTime() - new Date(m.last_seen).getTime() < 120000).length,
    [machines]
  );

  const detectionRatio = stats?.totalLogs ? ((stats.totalViolations / stats.totalLogs) * 100).toFixed(1) : '0';

  const tabMeta = {
    dashboard:   { label: 'Overview',    title: 'Network Activity Overview',  subtitle: 'Real-time browsing surveillance from the collector' },
    machines:    { label: 'Fleet',       title: 'Workstation Fleet',          subtitle: 'Live agent connectivity and bandwidth' },
    enforcement: { label: 'Enforcement', title: 'Enforcement Policy',         subtitle: 'Active blocklists, categories, and top offenders' },
    users:       { label: 'Users',       title: 'User & Agent Management',    subtitle: 'Create portal accounts and assign agents to team leads, managers, and directors' },
  }[activeTab];

  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center bg-[var(--bg-page)] text-[var(--text-main)] h-screen">
        <div className="flex items-center gap-3 text-sm text-[var(--text-muted)]">
          <RefreshCw className="animate-spin" size={16} />
          Loading monitor…
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-page)] text-[var(--text-main)] transition-colors duration-300">
      {/* ─── sidebar ─────────────────────────────────────────────────── */}
      <aside className="fixed left-0 top-0 h-full w-60 bg-[var(--bg-sidebar)] border-r border-[var(--border-ui)] hidden lg:flex flex-col transition-colors duration-300">
        <div className="px-5 py-5 border-b border-[var(--border-ui)] flex items-center gap-3">
          <img src="/logo.jpg" alt="Tarro" className="w-8 h-8 rounded-md object-cover ring-1 ring-[var(--border-ui)]" />
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight text-[var(--text-main)]">Tarro</div>
            <div className="text-[10px] uppercase tracking-[0.15em] text-[var(--text-muted)]">Web Monitor</div>
          </div>
        </div>

        <div className="px-3 py-4 flex-1">
          <div className="px-2 mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Workspace</div>
          <nav className="space-y-1">
            <NavItem
              active={activeTab === 'dashboard'}
              onClick={() => setActiveTab('dashboard')}
              icon={<LayoutDashboard size={16} />}
              label="Overview"
            />
            <NavItem
              active={activeTab === 'machines'}
              onClick={() => setActiveTab('machines')}
              icon={<Activity size={16} />}
              label="Fleet"
            />
            <NavItem
              active={activeTab === 'enforcement'}
              onClick={() => setActiveTab('enforcement')}
              icon={<ShieldCheck size={16} />}
              label="Enforcement"
            />
            <NavItem
              active={activeTab === 'users'}
              onClick={() => setActiveTab('users')}
              icon={<UserCog size={16} />}
              label="Users"
            />
          </nav>
        </div>

        <div className="px-5 py-3 border-t border-[var(--border-ui)] text-[10px] text-[var(--text-muted)] flex items-center justify-between">
          <span>v1.0.1</span>
          <StatusPill tone={error ? 'danger' : 'success'} label={error ? 'Offline' : 'Connected'} pulse={!error} />
        </div>
      </aside>

      {/* ─── main ───────────────────────────────────────────────────── */}
      <main className="lg:ml-60 px-6 lg:px-8 py-6">
        {/* topbar */}
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-3 mb-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)] uppercase tracking-wider font-semibold">
              <span>Workspace</span>
              <ChevronRight size={12} className="opacity-60" />
              <span className="text-[#c4b5fd]">{tabMeta.label}</span>
            </div>
            <h2 className="mt-1.5 text-xl font-semibold text-[var(--text-main)]">{tabMeta.title}</h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">{tabMeta.subtitle}</p>
          </div>
          <div className="flex items-center gap-2">
            <StatusPill tone={error ? 'danger' : 'success'} label={error ? 'Collector unreachable' : 'Live · 10s'} pulse={!error} />
            <button
              onClick={toggleTheme}
              className="p-1.5 rounded-md border border-[var(--border-ui)] bg-[var(--bg-card)] hover:bg-[var(--bg-card-alt)] transition-colors"
              title="Toggle theme"
            >
              {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            </button>
            <button
              onClick={fetchData}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[var(--border-ui)] bg-[var(--bg-card)] text-xs font-medium hover:bg-[var(--bg-card-alt)] hover:border-[#6a29e1]/60 transition-colors"
            >
              <RefreshCw size={12} /> Refresh
            </button>
          </div>
        </header>

        {error && (
          <div className="mb-6 rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 flex items-center gap-3 text-sm text-rose-200">
            <AlertTriangle size={16} className="shrink-0" />
            <span>Connection error — failed to reach the collector API. Retrying every 10s.</span>
          </div>
        )}

        {activeTab === 'dashboard' && (
          <OverviewTab
            stats={stats}
            logs={logs}
            machines={machines}
            bwViolations={bwViolations}
            onlineCount={onlineCount}
            detectionRatio={detectionRatio}
          />
        )}
        {activeTab === 'machines' && <MachineStatusView machines={machines} onDelete={setMachineToDelete} />}
        {activeTab === 'enforcement' && <EnforcementView data={enforcement} getBaseUrl={getBaseUrl} onRefresh={fetchData} />}
        {activeTab === 'users' && <UserManagementTab getBaseUrl={getBaseUrl} />}

        {/* delete modal */}
        {machineToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <div className="bg-[var(--bg-card)] border border-[var(--border-ui)] rounded-lg p-6 max-w-md w-full shadow-2xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-rose-500/15 border border-rose-500/30 rounded-md">
                  <AlertTriangle size={18} className="text-rose-300" />
                </div>
                <h3 className="text-base font-semibold text-[var(--text-main)]">Remove workstation</h3>
              </div>
              <p className="text-sm text-[var(--text-muted)] mb-6 leading-relaxed">
                Remove <span className="font-mono text-[var(--text-main)]">{machineToDelete}</span> from the dashboard?
                It will reappear on its next heartbeat.
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setMachineToDelete(null)}
                  className="px-3 py-1.5 text-sm rounded-md border border-[var(--border-ui)] bg-[var(--bg-card-alt)] hover:bg-[var(--border-ui)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteMachine}
                  className="px-3 py-1.5 text-sm rounded-md bg-rose-600 hover:bg-rose-500 text-white font-medium transition-colors"
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ─── overview tab ─────────────────────────────────────────────────────────
function OverviewTab({
  stats,
  logs,
  machines,
  bwViolations,
  onlineCount,
  detectionRatio,
}: {
  stats: any;
  logs: any[];
  machines: any[];
  bwViolations: any[];
  onlineCount: number;
  detectionRatio: string;
}) {
  const highBandwidthMachines = useMemo(
    () =>
      machines.filter((m) => {
        const diff = new Date().getTime() - new Date(m.last_seen).getTime();
        return diff < 120000 && m.current_bandwidth > 10 * 1024 * 1024;
      }),
    [machines]
  );

  const recentViolations = logs.filter((l) => l.violation).slice(0, 3);

  return (
    <div className="space-y-6">
      {/* KPI strip */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <Tile
          title="Total Sessions"
          value={(stats?.totalLogs || 0).toLocaleString()}
          tone="brand"
          icon={<Globe size={14} />}
        />
        <Tile
          title="Policy Violations"
          value={(stats?.totalViolations || 0).toLocaleString()}
          tone="danger"
          sub={`${detectionRatio}% of traffic flagged`}
          icon={<AlertTriangle size={14} />}
        />
        <Tile
          title="Active Machines"
          value={`${onlineCount} / ${machines.length || stats?.uniqueMachines || 0}`}
          tone="success"
          sub="Heartbeat within 2 min"
          icon={<Monitor size={14} />}
        />
        <Tile
          title="Detection Ratio"
          value={`${detectionRatio}%`}
          tone="info"
          icon={<Activity size={14} />}
        />
      </div>

      {/* bandwidth banner */}
      {highBandwidthMachines.length > 0 && (
        <Panel className="border-amber-500/30">
          <PanelHeader
            accent="warn"
            title="High Bandwidth Utilization"
            subtitle={`${highBandwidthMachines.length} workstation${highBandwidthMachines.length === 1 ? '' : 's'} above 10 MB/min`}
            right={<Gauge size={14} className="text-amber-300" />}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 p-3">
            {highBandwidthMachines.map((m) => (
              <div key={`bw-${m.machine_id}`} className="bg-[var(--bg-card-alt)] border border-amber-500/20 rounded-md px-3 py-2.5">
                <div className="flex justify-between items-center mb-1">
                  <StatusPill tone="warn" label="Heavy" pulse />
                  <span className="text-[10px] text-[var(--text-muted)] font-mono">
                    {format(new Date(m.last_seen), 'HH:mm')}
                  </span>
                </div>
                <div className="text-lg font-semibold text-[var(--text-main)] tabular-nums">{formatBytes(m.current_bandwidth)}/min</div>
                <div className="mt-1 flex items-center gap-3 text-[11px] text-[var(--text-muted)] font-mono">
                  <span>{m.machine_id}</span>
                  <span className="text-[#c4b5fd]">{m.username || 'unknown_agent'}</span>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* violation alerts */}
      {recentViolations.length > 0 && (
        <Panel className="border-rose-500/30">
          <PanelHeader
            accent="danger"
            title="Active Violation Alerts"
            subtitle={`${recentViolations.length} most recent · ${logs.filter((l) => l.violation).length} total in feed`}
            right={<AlertTriangle size={14} className="text-rose-300" />}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 p-3">
            {recentViolations.map((alert) => (
              <div key={alert.id} className="bg-[var(--bg-card-alt)] border border-rose-500/20 rounded-md px-3 py-2.5">
                <div className="flex justify-between items-center mb-1.5">
                  <CategoryTag category={alert.category} />
                  <span className="text-[10px] text-[var(--text-muted)] font-mono">
                    {format(new Date(alert.timestamp), 'HH:mm')}
                  </span>
                </div>
                <div className="text-sm font-semibold text-[var(--text-main)] truncate">{alert.domain}</div>
                <div className="mt-1 flex items-center gap-3 text-[11px] text-[var(--text-muted)] font-mono">
                  <span>{alert.machine_id}</span>
                  <span className="text-rose-300">{alert.username || 'unknown_agent'}</span>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* chart + activity */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
        <Panel className="xl:col-span-2">
          <PanelHeader title="Top Domain Traffic" subtitle="Aggregate across all workstations" />
          <div className="p-4 h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats?.topDomains || []}>
                <XAxis dataKey="domain" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip
                  cursor={{ fill: 'rgba(106,41,225,0.05)' }}
                  contentStyle={{
                    backgroundColor: 'var(--bg-card)',
                    border: '1px solid var(--border-ui)',
                    borderRadius: '8px',
                    color: 'var(--text-main)',
                    fontSize: '12px',
                  }}
                  itemStyle={{ color: '#a78bfa' }}
                />
                <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                  {stats?.topDomains?.map((_: any, i: number) => (
                    <Cell key={i} fill={i === 0 ? '#6a29e1' : '#3b2470'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            title="Live Activity Stream"
            subtitle={`${logs.length} most recent events`}
            right={<Radio size={14} className="text-emerald-300 animate-pulse" />}
          />
          <div className="max-h-[300px] overflow-y-auto custom-scrollbar divide-y divide-[var(--border-ui)]">
            {logs.length === 0 ? (
              <div className="px-5 py-8 text-center text-xs text-[var(--text-muted)] italic">No activity yet.</div>
            ) : (
              logs.map((log) => (
                <div
                  key={log.id}
                  className={`px-4 py-2.5 border-l-2 transition-colors ${
                    log.violation
                      ? 'border-rose-500/60 bg-rose-500/5 hover:bg-rose-500/10'
                      : 'border-[#6a29e1]/40 hover:bg-[var(--bg-card-alt)]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-medium text-[var(--text-main)] truncate">{log.domain}</span>
                        {log.violation && <CategoryTag category={log.category} />}
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-[11px] text-[var(--text-muted)] font-mono">
                        <span>{log.machine_id}</span>
                        <span className={log.violation ? 'text-rose-300' : 'text-[#c4b5fd]'}>
                          {log.username || 'unknown_agent'}
                        </span>
                      </div>
                    </div>
                    <span className="text-[10px] text-[var(--text-muted)] font-mono tabular-nums shrink-0 mt-0.5">
                      {format(new Date(log.timestamp), 'HH:mm:ss')}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </Panel>
      </div>

      {/* bandwidth history */}
      <Panel>
        <PanelHeader
          accent="warn"
          title="Recent Bandwidth Violations"
          subtitle="Workstations exceeding the per-minute byte threshold"
        />
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[var(--bg-card-alt)] border-b border-[var(--border-ui)]">
              <th className={TH}>Time</th>
              <th className={TH}>Machine</th>
              <th className={TH}>Agent</th>
              <th className={`${TH} text-right`}>Data</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-ui)]">
            {bwViolations.map((v) => (
              <tr key={v.id} className="hover:bg-amber-500/5 transition-colors">
                <td className={`${TD} text-[var(--text-muted)] font-mono text-xs`}>
                  {format(new Date(v.timestamp), 'MMM dd, HH:mm:ss')}
                </td>
                <td className={TD}>
                  <span className="font-mono text-[var(--text-main)] text-xs">{v.machine_id}</span>
                </td>
                <td className={TD}>
                  <span className="text-[#c4b5fd] font-mono text-xs">{v.username || 'unknown'}</span>
                </td>
                <td className={`${TD} text-right`}>
                  <span className="text-amber-300 font-semibold tabular-nums">{formatBytes(v.bytes)}/min</span>
                </td>
              </tr>
            ))}
            {bwViolations.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-xs text-[var(--text-muted)] italic">
                  No historical violations recorded.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

// ─── fleet tab ────────────────────────────────────────────────────────────
function MachineStatusView({ machines, onDelete }: { machines: any[]; onDelete: (id: string) => void }) {
  const isOnline = (lastSeen: string) => new Date().getTime() - new Date(lastSeen).getTime() < 120000;

  const onlineCount = machines.filter((m) => isOnline(m.last_seen)).length;
  const offlineCount = machines.length - onlineCount;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <Tile title="Total Workstations" value={machines.length} tone="brand" icon={<Monitor size={14} />} />
        <Tile title="Online" value={onlineCount} tone="success" sub="Heartbeat within 2 min" />
        <Tile title="Offline" value={offlineCount} tone="neutral" />
        <Tile
          title="Avg Bandwidth"
          value={
            machines.length
              ? formatBytes(machines.reduce((sum, m) => sum + (m.current_bandwidth || 0), 0) / machines.length) + '/min'
              : '0 B/min'
          }
          tone="info"
          icon={<Gauge size={14} />}
        />
      </div>

      <Panel>
        <PanelHeader title="Workstation Fleet" subtitle={`${machines.length} registered agent${machines.length === 1 ? '' : 's'}`} />
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[var(--bg-card-alt)] border-b border-[var(--border-ui)]">
              <th className={TH}>Status</th>
              <th className={TH}>Machine</th>
              <th className={TH}>Agent</th>
              <th className={TH}>IP</th>
              <th className={TH}>Bandwidth</th>
              <th className={TH}>Last Activity</th>
              <th className={`${TH} text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-ui)]">
            {machines.map((m) => {
              const online = isOnline(m.last_seen);
              const heavy = m.current_bandwidth > 10 * 1024 * 1024;
              return (
                <tr key={m.machine_id} className="hover:bg-[var(--bg-card-alt)] transition-colors group">
                  <td className={TD}>
                    <StatusPill tone={online ? 'success' : 'neutral'} label={online ? 'Online' : 'Offline'} pulse={online} />
                  </td>
                  <td className={TD}>
                    <span className="font-mono text-[var(--text-main)] text-xs">{m.machine_id}</span>
                  </td>
                  <td className={TD}>
                    <span className="text-[#c4b5fd] font-mono text-xs">{m.username || 'unknown'}</span>
                  </td>
                  <td className={TD}>
                    <span className="text-[var(--text-muted)] font-mono text-xs">{m.ip_address?.replace('::ffff:', '') || 'N/A'}</span>
                  </td>
                  <td className={TD}>
                    <span className={`tabular-nums font-medium text-sm ${heavy ? 'text-amber-300' : 'text-[var(--text-main)]'}`}>
                      {formatBytes(m.current_bandwidth)}/min
                    </span>
                  </td>
                  <td className={`${TD} text-[var(--text-muted)] font-mono text-xs`}>
                    {format(new Date(m.last_seen), 'MMM dd, HH:mm:ss')}
                  </td>
                  <td className={`${TD} text-right`}>
                    <button
                      onClick={() => onDelete(m.machine_id)}
                      className="p-1.5 text-[var(--text-muted)] hover:text-rose-300 hover:bg-rose-500/10 rounded-md transition-colors opacity-0 group-hover:opacity-100"
                      title="Remove workstation"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
            {machines.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-xs text-[var(--text-muted)] italic">
                  No workstations detected yet. Ensure extensions are active.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

// ─── enforcement tab ──────────────────────────────────────────────────────
const BUILTIN_CATEGORIES = ['social', 'gambling', 'streaming', 'ph_shopping', 'manual'];

function EnforcementView({ data, getBaseUrl, onRefresh }: { data: any; getBaseUrl: () => string; onRefresh: () => void }) {
  const [domainRaw, setDomainRaw] = useState('');
  const [domainCategory, setDomainCategory] = useState('manual');
  const [domainSaving, setDomainSaving] = useState(false);
  const [domainError, setDomainError] = useState('');
  const [newCatName, setNewCatName] = useState('');
  const [catSaving, setCatSaving] = useState(false);
  const [catError, setCatError] = useState('');
  const [toggling, setToggling] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  if (!data) {
    return (
      <Panel>
        <div className="px-6 py-12 text-center">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-[#6a29e1]/10 border border-[#6a29e1]/30 mb-3">
            <ShieldCheck size={18} className="text-[#a78bfa]" />
          </div>
          <p className="text-sm font-medium text-[var(--text-main)] mb-1">Awaiting enforcement endpoint</p>
          <p className="text-xs text-[var(--text-muted)] max-w-md mx-auto">
            The collector hasn&apos;t exposed <span className="font-mono">/api/enforcement</span> yet.
            Restart the collector after deploying the latest <span className="font-mono">server.js</span> to see policy data here.
          </p>
        </div>
      </Panel>
    );
  }

  const {
    lastSyncedAt,
    totalBlockedDomains,
    enabledCategories = [],
    categoryCounts = {},
    manualBlacklist = [],
    topOffendingDomains = [],
    topOffendingUsers = [],
  } = data;

  // All categories: builtins + any custom ones in enabledCategories not already in builtins
  const customCategories = enabledCategories.filter((c: string) => !BUILTIN_CATEGORIES.includes(c));
  const allCategories = [...BUILTIN_CATEGORIES, ...customCategories];
  const allCategoryOptions = allCategories.filter(c => c !== 'manual');

  const parsedDomains = domainRaw
    .split(/[\n,;]+/)
    .map(d => d.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, ''))
    .filter(Boolean);

  const addDomains = async () => {
    setDomainError('');
    if (!parsedDomains.length) { setDomainError('Enter at least one domain.'); return; }
    setDomainSaving(true);
    try {
      const res = await fetch(`${getBaseUrl()}/api/enforcement/domains`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domains: parsedDomains, category: domainCategory }),
      });
      if (res.ok) { setDomainRaw(''); onRefresh(); }
      else { const d = await res.json().catch(() => ({})); setDomainError(d.error || `Error ${res.status}`); }
    } catch { setDomainError('Could not reach collector.'); }
    finally { setDomainSaving(false); }
  };

  const removeDomain = async (domain: string) => {
    setRemoving(domain);
    try {
      await fetch(`${getBaseUrl()}/api/enforcement/domains/${encodeURIComponent(domain)}`, { method: 'DELETE' });
      onRefresh();
    } finally { setRemoving(null); }
  };

  const toggleCategory = async (name: string) => {
    setToggling(name);
    try {
      await fetch(`${getBaseUrl()}/api/enforcement/categories/${encodeURIComponent(name)}/toggle`, { method: 'PATCH' });
      onRefresh();
    } finally { setToggling(null); }
  };

  const addCategory = async () => {
    setCatError('');
    if (!newCatName.trim()) { setCatError('Enter a category name.'); return; }
    setCatSaving(true);
    try {
      const res = await fetch(`${getBaseUrl()}/api/enforcement/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCatName.trim() }),
      });
      if (res.ok) { setNewCatName(''); onRefresh(); }
      else { const d = await res.json().catch(() => ({})); setCatError(d.error || `Error ${res.status}`); }
    } catch { setCatError('Could not reach collector.'); }
    finally { setCatSaving(false); }
  };

  const deleteCategory = async (name: string) => {
    setToggling(name);
    try {
      await fetch(`${getBaseUrl()}/api/enforcement/categories/${encodeURIComponent(name)}`, { method: 'DELETE' });
      onRefresh();
    } finally { setToggling(null); }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Tile title="Blocked Domains" value={totalBlockedDomains.toLocaleString()} tone="brand" icon={<ShieldCheck size={14} />} />
        <Tile title="Active Categories" value={enabledCategories.length} tone="success" icon={<ListChecks size={14} />} />
        <Tile title="Manual Entries" value={manualBlacklist.length} tone="danger" icon={<AlertTriangle size={14} />} />
      </div>

      {/* ── Add domains ─────────────────────────────────────────────────── */}
      <Panel>
        <PanelHeader accent="danger" title="Add Domains to Blocklist" subtitle="Paste one per line, or comma/semicolon separated — stripped to hostname automatically" />
        <div className="p-5 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="md:col-span-3">
              <textarea
                rows={3}
                className="w-full bg-[var(--bg-card-alt)] border border-[var(--border-ui)] rounded-md px-3 py-2 text-sm text-[var(--text-main)] placeholder-[var(--text-muted)] font-mono focus:outline-none focus:border-[#6a29e1]/60 resize-none"
                placeholder={"tiktok.com\nfacebook.com\nhttps://instagram.com/"}
                value={domainRaw}
                onChange={e => setDomainRaw(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Category</label>
              <select
                className="bg-[var(--bg-card-alt)] border border-[var(--border-ui)] rounded-md px-3 py-2 text-sm text-[var(--text-main)] focus:outline-none focus:border-[#6a29e1]/60 flex-1"
                value={domainCategory}
                onChange={e => setDomainCategory(e.target.value)}
              >
                {allCategoryOptions.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
                <option value="manual">manual (policy)</option>
              </select>
              <button
                onClick={addDomains}
                disabled={domainSaving || parsedDomains.length === 0}
                className="px-3 py-2 bg-[#6a29e1] hover:bg-[#7c3aed] disabled:opacity-40 text-white text-xs font-medium rounded-md transition-colors"
              >
                {domainSaving ? 'Adding…' : `Add ${parsedDomains.length || ''} domain${parsedDomains.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
          {domainError && <p className="text-xs text-rose-300">{domainError}</p>}
          {parsedDomains.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {parsedDomains.map(d => (
                <span key={d} className="px-2 py-0.5 bg-[var(--bg-card-alt)] border border-[var(--border-ui)] rounded text-[11px] font-mono text-[var(--text-main)]">{d}</span>
              ))}
            </div>
          )}
        </div>
      </Panel>

      {/* ── Category policy ─────────────────────────────────────────────── */}
      <Panel>
        <PanelHeader
          title="Category Policy"
          subtitle="Toggle enforcement per category — changes apply immediately to config"
          right={
            lastSyncedAt && (
              <span className="text-[10px] text-[var(--text-muted)] flex items-center gap-1.5 font-mono">
                <Clock size={11} /> {format(new Date(lastSyncedAt), 'MMM dd, HH:mm')}
              </span>
            )
          }
        />
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[var(--bg-card-alt)] border-b border-[var(--border-ui)]">
              <th className={TH}>Category</th>
              <th className={TH}>Status</th>
              <th className={`${TH} text-right`}>Domains</th>
              <th className={`${TH} text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-ui)]">
            {allCategories.map((cat) => {
              const isBuiltin = BUILTIN_CATEGORIES.includes(cat);
              const isOn = cat === 'manual' ? manualBlacklist.length > 0 : enabledCategories.includes(cat);
              const count = categoryCounts[cat] || 0;
              const busy = toggling === cat;
              return (
                <tr key={cat} className="hover:bg-[var(--bg-card-alt)] transition-colors group">
                  <td className={TD}><CategoryTag category={cat} /></td>
                  <td className={TD}>
                    <StatusPill tone={isOn ? 'success' : 'neutral'} label={isOn ? 'Enforced' : 'Inactive'} pulse={isOn} />
                  </td>
                  <td className={`${TD} text-right`}>
                    <span className="font-semibold tabular-nums text-[var(--text-main)]">{count.toLocaleString()}</span>
                  </td>
                  <td className={`${TD} text-right`}>
                    <div className="flex items-center justify-end gap-1">
                      {cat !== 'manual' && (
                        <button
                          onClick={() => toggleCategory(cat)}
                          disabled={busy}
                          className={`px-2.5 py-1 text-[11px] font-medium rounded-md border transition-colors disabled:opacity-40 ${
                            isOn
                              ? 'border-rose-500/30 text-rose-300 hover:bg-rose-500/10'
                              : 'border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10'
                          }`}
                        >
                          {busy ? '…' : isOn ? 'Disable' : 'Enable'}
                        </button>
                      )}
                      {!isBuiltin && (
                        <button
                          onClick={() => deleteCategory(cat)}
                          disabled={busy}
                          className="p-1.5 text-[var(--text-muted)] hover:text-rose-300 hover:bg-rose-500/10 rounded-md transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-40"
                          title="Delete category and all its domains"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Add new category */}
        <div className="px-5 py-3 border-t border-[var(--border-ui)] bg-[var(--bg-card-alt)] flex items-center gap-2">
          <input
            className="bg-[var(--bg-card)] border border-[var(--border-ui)] rounded-md px-3 py-1.5 text-sm text-[var(--text-main)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[#6a29e1]/60 flex-1 max-w-xs"
            placeholder="New category name…"
            value={newCatName}
            onChange={e => setNewCatName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addCategory()}
          />
          <button
            onClick={addCategory}
            disabled={catSaving || !newCatName.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#6a29e1] hover:bg-[#7c3aed] disabled:opacity-40 text-white text-xs font-medium rounded-md transition-colors"
          >
            <Plus size={12} /> Add category
          </button>
          {catError && <span className="text-xs text-rose-300">{catError}</span>}
        </div>
      </Panel>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <Panel>
          <PanelHeader accent="danger" title="Top Offending Domains" subtitle="Most-hit blocked domains" />
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[var(--bg-card-alt)] border-b border-[var(--border-ui)]">
                <th className={TH}>Domain</th>
                <th className={TH}>Category</th>
                <th className={`${TH} text-right`}>Hits</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-ui)]">
              {topOffendingDomains.map((d: any) => (
                <tr key={d.domain} className="hover:bg-rose-500/5 transition-colors">
                  <td className={TD}><span className="font-mono text-xs text-[var(--text-main)] truncate">{d.domain}</span></td>
                  <td className={TD}><CategoryTag category={d.category} /></td>
                  <td className={`${TD} text-right`}><span className="text-rose-300 font-semibold tabular-nums">{d.count}</span></td>
                </tr>
              ))}
              {topOffendingDomains.length === 0 && (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-xs text-[var(--text-muted)] italic">No policy violations recorded.</td></tr>
              )}
            </tbody>
          </table>
        </Panel>

        <Panel>
          <PanelHeader accent="brand" title="Top Offending Agents" subtitle="Users with the most flagged events" />
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[var(--bg-card-alt)] border-b border-[var(--border-ui)]">
                <th className={TH}>Agent</th>
                <th className={TH}>Last Machine</th>
                <th className={`${TH} text-right`}>Hits</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-ui)]">
              {topOffendingUsers.map((u: any) => (
                <tr key={u.username} className="hover:bg-[var(--bg-card-alt)] transition-colors">
                  <td className={TD}><span className="text-[#c4b5fd] font-mono text-xs">{u.username}</span></td>
                  <td className={TD}><span className="font-mono text-xs text-[var(--text-muted)]">{u.machine_id}</span></td>
                  <td className={`${TD} text-right`}><span className="text-rose-300 font-semibold tabular-nums">{u.count}</span></td>
                </tr>
              ))}
              {topOffendingUsers.length === 0 && (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-xs text-[var(--text-muted)] italic">No agent violations recorded.</td></tr>
              )}
            </tbody>
          </table>
        </Panel>
      </div>

      {/* ── Manual blacklist with remove ────────────────────────────────── */}
      <Panel>
        <PanelHeader accent="neutral" title="Manual Blacklist" subtitle="Domains pinned as policy — click × to remove" />
        <div className="p-5">
          {manualBlacklist.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)] italic">No manual entries. Add domains above and select the <span className="font-mono text-[#c4b5fd]">manual</span> category.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {manualBlacklist.map((domain: string) => (
                <span key={domain} className="flex items-center gap-1 px-2 py-0.5 bg-[var(--bg-card-alt)] border border-[var(--border-ui)] rounded text-[11px] font-mono text-[var(--text-main)]">
                  {domain}
                  <button
                    onClick={() => removeDomain(domain)}
                    disabled={removing === domain}
                    className="ml-0.5 text-[var(--text-muted)] hover:text-rose-300 disabled:opacity-40 transition-colors"
                  >
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}

// ─── role badge ───────────────────────────────────────────────────────────
const ROLE_META: Record<string, { label: string; tone: Tone }> = {
  team_lead: { label: 'Team Lead', tone: 'info' },
  manager:   { label: 'Manager',   tone: 'warn' },
  director:  { label: 'Director',  tone: 'brand' },
};

function RoleBadge({ role }: { role: string }) {
  const meta = ROLE_META[role] || { label: role, tone: 'neutral' as Tone };
  return <StatusPill tone={meta.tone} label={meta.label} />;
}

// ─── bulk email input ─────────────────────────────────────────────────────
function BulkEmailInput({ existing, onAssign }: { existing: string[]; onAssign: (emails: string[]) => Promise<void> }) {
  const [raw, setRaw] = useState('');
  const [saving, setSaving] = useState(false);

  const parsed = raw
    .split(/[\n,;]+/)
    .map(e => e.trim().toLowerCase())
    .filter(e => e.includes('@') && !existing.includes(e));

  const dupes = raw
    .split(/[\n,;]+/)
    .map(e => e.trim().toLowerCase())
    .filter(e => e.includes('@') && existing.includes(e));

  const handleAssign = async () => {
    if (!parsed.length) return;
    setSaving(true);
    try {
      await onAssign(parsed);
      setRaw('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
        Add agents by email — paste one per line, or comma/semicolon separated
      </label>
      <textarea
        rows={3}
        className="w-full bg-[var(--bg-card)] border border-[var(--border-ui)] rounded-md px-3 py-2 text-sm text-[var(--text-main)] placeholder-[var(--text-muted)] font-mono focus:outline-none focus:border-[#6a29e1]/60 resize-none"
        placeholder={"juan@company.com\nmaria@company.com\npedro@company.com"}
        value={raw}
        onChange={e => setRaw(e.target.value)}
      />
      {raw.trim() && (
        <div className="flex items-center gap-3 flex-wrap">
          {parsed.length > 0 && (
            <span className="text-[11px] text-emerald-300">
              {parsed.length} new email{parsed.length !== 1 ? 's' : ''} to add
            </span>
          )}
          {dupes.length > 0 && (
            <span className="text-[11px] text-[var(--text-muted)]">
              {dupes.length} already assigned (skipped)
            </span>
          )}
          {parsed.length === 0 && dupes.length === 0 && (
            <span className="text-[11px] text-amber-300">No valid email addresses detected.</span>
          )}
        </div>
      )}
      <button
        onClick={handleAssign}
        disabled={saving || parsed.length === 0}
        className="px-3 py-1.5 bg-[#6a29e1] hover:bg-[#7c3aed] disabled:opacity-40 text-white text-xs font-medium rounded-md transition-colors"
      >
        {saving ? 'Assigning…' : `Assign ${parsed.length > 0 ? parsed.length : ''} agent${parsed.length !== 1 ? 's' : ''}`}
      </button>
    </div>
  );
}

// ─── unassigned agents panel ──────────────────────────────────────────────
function UnassignedAgentsPanel({
  getBaseUrl,
  teamLeads,
  onAssigned,
}: {
  getBaseUrl: () => string;
  teamLeads: any[];
  onAssigned: () => void;
}) {
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selections, setSelections] = useState<Record<string, string>>({}); // email → tlId
  const [assigning, setAssigning] = useState<Record<string, boolean>>({});

  const fetchUnassigned = useCallback(async () => {
    try {
      const res = await fetch(`${getBaseUrl()}/api/users/unassigned-agents`, { cache: 'no-store' });
      if (res.ok) setAgents(await res.json());
    } finally {
      setLoading(false);
    }
  }, [getBaseUrl]);

  useEffect(() => { fetchUnassigned(); }, [fetchUnassigned]);

  const isOnline = (lastSeen: string) => new Date().getTime() - new Date(lastSeen).getTime() < 120000;

  const assign = async (agent: any) => {
    const tlId = selections[agent.username];
    if (!tlId) return;
    setAssigning(prev => ({ ...prev, [agent.username]: true }));
    try {
      await fetch(`${getBaseUrl()}/api/users/${tlId}/agents/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails: [agent.username] }),
      });
      await fetchUnassigned();
      onAssigned();
    } finally {
      setAssigning(prev => ({ ...prev, [agent.username]: false }));
    }
  };

  const assignAll = async () => {
    const toAssign = agents.filter(a => selections[a.username]);
    for (const agent of toAssign) await assign(agent);
  };

  if (!loading && agents.length === 0) {
    return (
      <Panel>
        <PanelHeader accent="success" title="Unassigned Agents" subtitle="All agents have a Team Lead assigned" />
        <div className="px-5 py-6 flex items-center gap-3 text-sm text-emerald-300">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          Every active agent is covered. Nothing to action.
        </div>
      </Panel>
    );
  }

  const allSelected = agents.length > 0 && agents.every(a => selections[a.username]);
  const someSelected = agents.some(a => selections[a.username]);

  return (
    <Panel className="border-amber-500/30">
      <PanelHeader
        accent="warn"
        title="Unassigned Agents"
        subtitle={loading ? 'Checking…' : `${agents.length} agent${agents.length !== 1 ? 's' : ''} not assigned to any Team Lead`}
        right={
          someSelected && teamLeads.length > 0 ? (
            <button
              onClick={assignAll}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-[#6a29e1] hover:bg-[#7c3aed] text-white transition-colors"
            >
              <Plus size={12} /> Assign selected
            </button>
          ) : undefined
        }
      />

      {teamLeads.length === 0 && (
        <div className="px-5 py-4 text-xs text-amber-300 bg-amber-500/5 border-b border-amber-500/20">
          No Team Lead accounts exist yet. Create one above before assigning agents.
        </div>
      )}

      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-[var(--bg-card-alt)] border-b border-[var(--border-ui)]">
            <th className={TH}>Status</th>
            <th className={TH}>Agent Email</th>
            <th className={TH}>Machine ID</th>
            <th className={TH}>Last Seen</th>
            <th className={TH}>Assign to Team Lead</th>
            <th className={`${TH} text-right`}>Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border-ui)]">
          {loading && (
            <tr><td colSpan={6} className="px-4 py-6 text-center text-xs text-[var(--text-muted)] italic">Loading…</td></tr>
          )}
          {agents.map(agent => {
            const online = isOnline(agent.last_seen);
            const selectedTl = selections[agent.username] || '';
            const busy = assigning[agent.username];
            return (
              <tr key={agent.machine_id} className="hover:bg-amber-500/5 transition-colors">
                <td className={TD}>
                  <StatusPill tone={online ? 'success' : 'neutral'} label={online ? 'Online' : 'Offline'} pulse={online} />
                </td>
                <td className={TD}>
                  <span className="font-mono text-sm text-[#c4b5fd]">{agent.username}</span>
                </td>
                <td className={TD}>
                  <span className="font-mono text-xs text-[var(--text-muted)]">{agent.machine_id}</span>
                </td>
                <td className={`${TD} text-[var(--text-muted)] font-mono text-xs`}>
                  {format(new Date(agent.last_seen), 'MMM dd, HH:mm')}
                </td>
                <td className={TD}>
                  <select
                    className="bg-[var(--bg-card)] border border-[var(--border-ui)] rounded-md px-2 py-1.5 text-xs text-[var(--text-main)] focus:outline-none focus:border-[#6a29e1]/60 w-full max-w-[200px]"
                    value={selectedTl}
                    onChange={e => setSelections(prev => ({ ...prev, [agent.username]: e.target.value }))}
                    disabled={teamLeads.length === 0}
                  >
                    <option value="">Select Team Lead…</option>
                    {teamLeads.map(tl => (
                      <option key={tl.id} value={tl.id}>{tl.name} ({tl.username})</option>
                    ))}
                  </select>
                </td>
                <td className={`${TD} text-right`}>
                  <button
                    onClick={() => assign(agent)}
                    disabled={!selectedTl || busy}
                    className="px-3 py-1.5 text-xs font-medium rounded-md bg-[#6a29e1] hover:bg-[#7c3aed] disabled:opacity-30 text-white transition-colors"
                  >
                    {busy ? 'Assigning…' : 'Assign'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );
}

// ─── user management tab ──────────────────────────────────────────────────
function UserManagementTab({ getBaseUrl }: { getBaseUrl: () => string }) {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', username: '', email: '', password: '', role: 'team_lead' });
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [expandedUser, setExpandedUser] = useState<number | null>(null);
  const [userAgents, setUserAgents] = useState<Record<number, string[]>>({});
  const [userReports, setUserReports] = useState<Record<number, any[]>>({});
  const [reportInput, setReportInput] = useState('');
  const [resetTarget, setResetTarget] = useState<any>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetShowPw, setResetShowPw] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetSaving, setResetSaving] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch(`${getBaseUrl()}/api/users`, { cache: 'no-store' });
      if (res.ok) setUsers(await res.json());
    } finally {
      setLoading(false);
    }
  }, [getBaseUrl]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const createUser = async () => {
    setFormError('');
    if (!form.name || !form.username || !form.password) { setFormError('Name, username, and password are required.'); return; }
    setSaving(true);
    try {
      const res = await fetch(`${getBaseUrl()}/api/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setForm({ name: '', username: '', email: '', password: '', role: 'team_lead' });
        setShowForm(false);
        fetchUsers();
      } else {
        const data = await res.json().catch(() => ({}));
        setFormError(data.error || `Server returned ${res.status}`);
      }
    } catch (e: any) {
      setFormError('Could not reach the collector. Is it running on port 4448?');
    } finally {
      setSaving(false);
    }
  };

  const deleteUser = async (id: number) => {
    await fetch(`${getBaseUrl()}/api/users/${id}`, { method: 'DELETE' });
    fetchUsers();
  };

  const refreshAgents = async (userId: number) => {
    const res = await fetch(`${getBaseUrl()}/api/users/${userId}/agents`);
    if (res.ok) { const data = await res.json(); setUserAgents(prev => ({ ...prev, [userId]: data })); }
  };

  const refreshReports = async (userId: number) => {
    const res = await fetch(`${getBaseUrl()}/api/users/${userId}/reports`);
    if (res.ok) { const data = await res.json(); setUserReports(prev => ({ ...prev, [userId]: data })); }
  };

  const expandUser = async (user: any) => {
    if (expandedUser === user.id) { setExpandedUser(null); return; }
    setExpandedUser(user.id);
    if (user.role === 'team_lead') {
      await refreshAgents(user.id);
    } else {
      await refreshReports(user.id);
    }
  };

  const unassignAgent = async (userId: number, email: string) => {
    await fetch(`${getBaseUrl()}/api/users/${userId}/agents/${encodeURIComponent(email)}`, { method: 'DELETE' });
    await refreshAgents(userId);
    fetchUsers();
  };

  const assignReport = async (userId: number) => {
    const childId = parseInt(reportInput.trim());
    if (!childId) return;
    await fetch(`${getBaseUrl()}/api/users/${userId}/reports`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ child_id: childId }),
    });
    setReportInput('');
    await refreshReports(userId);
    fetchUsers();
  };

  const unassignReport = async (userId: number, childId: number) => {
    await fetch(`${getBaseUrl()}/api/users/${userId}/reports/${childId}`, { method: 'DELETE' });
    await refreshReports(userId);
    fetchUsers();
  };

  const doResetPassword = async () => {
    setResetError('');
    if (!resetPassword || resetPassword.length < 6) { setResetError('Password must be at least 6 characters.'); return; }
    setResetSaving(true);
    try {
      const res = await fetch(`${getBaseUrl()}/api/users/${resetTarget.id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: resetPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setResetSuccess(true);
        setResetPassword('');
      } else {
        setResetError(data.error || `Server returned ${res.status}`);
      }
    } catch {
      setResetError('Could not reach the collector.');
    } finally {
      setResetSaving(false);
    }
  };

  const teamLeads = users.filter(u => u.role === 'team_lead');
  const managers = users.filter(u => u.role === 'manager');

  return (
    <div className="space-y-4">
      {/* summary tiles */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <Tile title="Total Portal Users" value={users.length} tone="brand" icon={<Users size={14} />} />
        <Tile title="Team Leads" value={users.filter(u => u.role === 'team_lead').length} tone="info" />
        <Tile title="Managers" value={users.filter(u => u.role === 'manager').length} tone="warn" />
        <Tile title="Directors" value={users.filter(u => u.role === 'director').length} tone="brand" />
      </div>

      {/* create user panel */}
      <Panel>
        <PanelHeader
          title="Portal Accounts"
          subtitle="Team Leads, Managers, and Directors can log in at /portal"
          right={
            <button
              onClick={() => { setShowForm(f => !f); setFormError(''); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-[#6a29e1] hover:bg-[#7c3aed] text-white transition-colors"
            >
              {showForm ? <X size={12} /> : <Plus size={12} />}
              {showForm ? 'Cancel' : 'New User'}
            </button>
          }
        />

        {showForm && (
          <div className="p-5 border-b border-[var(--border-ui)] bg-[var(--bg-card-alt)]">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 mb-3">
              {[
                { key: 'name', label: 'Full Name', placeholder: 'e.g. Juan dela Cruz' },
                { key: 'username', label: 'Username', placeholder: 'e.g. jdelacruz' },
                { key: 'email', label: 'Email (optional)', placeholder: 'e.g. juan@company.com' },
              ].map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">{label}</label>
                  <input
                    className="w-full bg-[var(--bg-card)] border border-[var(--border-ui)] rounded-md px-3 py-2 text-sm text-[var(--text-main)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[#6a29e1]/60"
                    placeholder={placeholder}
                    value={(form as any)[key]}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  />
                </div>
              ))}
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">Password</label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    className="w-full bg-[var(--bg-card)] border border-[var(--border-ui)] rounded-md px-3 py-2 pr-9 text-sm text-[var(--text-main)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[#6a29e1]/60"
                    placeholder="Min 6 characters"
                    value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-main)]"
                  >
                    {showPw ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">Role</label>
                <select
                  className="w-full bg-[var(--bg-card)] border border-[var(--border-ui)] rounded-md px-3 py-2 text-sm text-[var(--text-main)] focus:outline-none focus:border-[#6a29e1]/60"
                  value={form.role}
                  onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                >
                  <option value="team_lead">Team Lead</option>
                  <option value="manager">Manager</option>
                  <option value="director">Director</option>
                </select>
              </div>
            </div>
            {formError && <p className="text-xs text-rose-300 mb-3">{formError}</p>}
            <button
              onClick={createUser}
              disabled={saving}
              className="px-4 py-2 bg-[#6a29e1] hover:bg-[#7c3aed] disabled:opacity-50 text-white text-sm font-medium rounded-md transition-colors"
            >
              {saving ? 'Creating…' : 'Create Account'}
            </button>
          </div>
        )}

        {/* user table */}
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[var(--bg-card-alt)] border-b border-[var(--border-ui)]">
              <th className={TH}>Name</th>
              <th className={TH}>Username</th>
              <th className={TH}>Role</th>
              <th className={TH}>Assignments</th>
              <th className={TH}>Created</th>
              <th className={`${TH} text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-ui)]">
            {loading && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-xs text-[var(--text-muted)] italic">Loading…</td></tr>
            )}
            {!loading && users.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-xs text-[var(--text-muted)] italic">No portal accounts yet. Create one above.</td></tr>
            )}
            {users.map(user => (
              <Fragment key={user.id}>
                <tr className="hover:bg-[var(--bg-card-alt)] transition-colors group">
                  <td className={TD}>
                    <span className="font-medium text-[var(--text-main)] text-sm">{user.name}</span>
                    {user.email && <div className="text-[11px] text-[var(--text-muted)]">{user.email}</div>}
                  </td>
                  <td className={TD}><span className="font-mono text-xs text-[#c4b5fd]">{user.username}</span></td>
                  <td className={TD}><RoleBadge role={user.role} /></td>
                  <td className={TD}>
                    <span className="text-xs text-[var(--text-muted)]">
                      {user.assignedCount}{' '}
                      {user.role === 'team_lead' ? 'agent(s)' : user.role === 'manager' ? 'team lead(s)' : 'manager(s)'}
                    </span>
                  </td>
                  <td className={`${TD} text-[var(--text-muted)] font-mono text-xs`}>
                    {format(new Date(user.created_at), 'MMM dd, yyyy')}
                  </td>
                  <td className={`${TD} text-right`}>
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => expandUser(user)}
                        className="p-1.5 text-[var(--text-muted)] hover:text-[#a78bfa] hover:bg-[#6a29e1]/10 rounded-md transition-colors"
                        title="Manage assignments"
                      >
                        <Link2 size={13} />
                      </button>
                      <button
                        onClick={() => { setResetTarget(user); setResetPassword(''); setResetError(''); setResetSuccess(false); }}
                        className="p-1.5 text-[var(--text-muted)] hover:text-amber-300 hover:bg-amber-500/10 rounded-md transition-colors"
                        title="Reset password"
                      >
                        <EyeOff size={13} />
                      </button>
                      <button
                        onClick={() => deleteUser(user.id)}
                        className="p-1.5 text-[var(--text-muted)] hover:text-rose-300 hover:bg-rose-500/10 rounded-md transition-colors"
                        title="Delete account"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>

                {/* expanded assignment row */}
                {expandedUser === user.id && (
                  <tr>
                    <td colSpan={6} className="bg-[var(--bg-card-alt)] border-b border-[var(--border-ui)] px-6 py-4">
                      {user.role === 'team_lead' ? (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">Assigned Agents</p>
                          {/* assigned email chips */}
                          <div className="flex flex-wrap gap-1.5 mb-3">
                            {(userAgents[user.id] || []).map((email: string) => (
                              <span key={email} className="flex items-center gap-1 px-2 py-0.5 bg-[var(--bg-card)] border border-[var(--border-ui)] rounded text-[11px] font-mono text-[var(--text-main)]">
                                {email}
                                <button onClick={() => unassignAgent(user.id, email)} className="ml-1 text-[var(--text-muted)] hover:text-rose-300">
                                  <X size={11} />
                                </button>
                              </span>
                            ))}
                            {!(userAgents[user.id]?.length) && <span className="text-xs text-[var(--text-muted)] italic">No agents assigned.</span>}
                          </div>
                          {/* bulk paste input */}
                          <BulkEmailInput
                            existing={userAgents[user.id] || []}
                            onAssign={async (emails) => {
                              await fetch(`${getBaseUrl()}/api/users/${user.id}/agents/bulk`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ emails }),
                              });
                              await refreshAgents(user.id);
                              fetchUsers();
                            }}
                          />
                        </div>
                      ) : (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
                            Assigned {user.role === 'manager' ? 'Team Leads' : 'Managers'}
                          </p>
                          <div className="flex flex-wrap gap-1.5 mb-3">
                            {(userReports[user.id] || []).map((r: any) => (
                              <span key={r.id} className="flex items-center gap-1.5 px-2 py-0.5 bg-[var(--bg-card)] border border-[var(--border-ui)] rounded text-[11px] text-[var(--text-main)]">
                                <RoleBadge role={r.role} />
                                <span className="font-mono text-[#c4b5fd]">{r.username}</span>
                                <span>{r.name}</span>
                                <button onClick={() => unassignReport(user.id, r.id)} className="ml-1 text-[var(--text-muted)] hover:text-rose-300">
                                  <X size={11} />
                                </button>
                              </span>
                            ))}
                            {!(userReports[user.id]?.length) && <span className="text-xs text-[var(--text-muted)] italic">No reports assigned.</span>}
                          </div>
                          <div className="flex gap-2">
                            <select
                              className="bg-[var(--bg-card)] border border-[var(--border-ui)] rounded-md px-3 py-1.5 text-sm text-[var(--text-main)] focus:outline-none focus:border-[#6a29e1]/60 flex-1 max-w-xs"
                              value={reportInput}
                              onChange={e => setReportInput(e.target.value)}
                            >
                              <option value="">Select {user.role === 'manager' ? 'team lead' : 'manager'}…</option>
                              {(user.role === 'manager' ? teamLeads : managers)
                                .filter(u2 => !(userReports[user.id] || []).find((r: any) => r.id === u2.id))
                                .map(u2 => (
                                  <option key={u2.id} value={u2.id}>{u2.name} ({u2.username})</option>
                                ))}
                            </select>
                            <button onClick={() => assignReport(user.id)} className="px-3 py-1.5 bg-[#6a29e1] hover:bg-[#7c3aed] text-white text-xs font-medium rounded-md transition-colors">
                              Assign
                            </button>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </Panel>

      <UnassignedAgentsPanel getBaseUrl={getBaseUrl} teamLeads={teamLeads} onAssigned={fetchUsers} />

      {/* Portal access info */}
      <Panel>
        <PanelHeader accent="info" title="Portal Access" subtitle="Share this URL with your team" />
        <div className="p-5 text-sm text-[var(--text-muted)]">
          Team Leads, Managers, and Directors can log in at{' '}
          <code className="font-mono text-[#c4b5fd] bg-[var(--bg-card-alt)] px-1.5 py-0.5 rounded">
            {typeof window !== 'undefined' ? `${window.location.origin}/portal` : '/portal'}
          </code>{' '}
          using their assigned username and password. Each role sees only the agents and team members assigned to them.
          New accounts and reset accounts require the user to set a new password on first login.
        </div>
      </Panel>

      {/* Reset password modal */}
      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-[var(--bg-card)] border border-[var(--border-ui)] rounded-lg p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-amber-500/15 border border-amber-500/30 rounded-md">
                <EyeOff size={18} className="text-amber-300" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-[var(--text-main)]">Reset password</h3>
                <p className="text-xs text-[var(--text-muted)]">
                  <span className="font-mono text-[#c4b5fd]">{resetTarget.username}</span> · {resetTarget.name}
                </p>
              </div>
            </div>

            {resetSuccess ? (
              <div className="mb-5">
                <div className="flex items-center gap-2 text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-md px-3 py-2.5 mb-3">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  Password reset successfully. The user will be prompted to set a new password on next login.
                </div>
              </div>
            ) : (
              <>
                <p className="text-sm text-[var(--text-muted)] mb-4 leading-relaxed">
                  Set a temporary password. The user will be forced to change it immediately on their next login.
                </p>
                {resetError && (
                  <p className="text-xs text-rose-300 mb-3">{resetError}</p>
                )}
                <div className="relative mb-4">
                  <input
                    autoFocus
                    type={resetShowPw ? 'text' : 'password'}
                    className="w-full bg-[var(--bg-page)] border border-[var(--border-ui)] rounded-md px-3 py-2.5 pr-10 text-sm text-[var(--text-main)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[#6a29e1]/60"
                    placeholder="Temporary password (min 6 chars)"
                    value={resetPassword}
                    onChange={e => setResetPassword(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && doResetPassword()}
                  />
                  <button type="button" onClick={() => setResetShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-main)]">
                    {resetShowPw ? <Eye size={13} /> : <EyeOff size={13} />}
                  </button>
                </div>
              </>
            )}

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setResetTarget(null); setResetSuccess(false); }}
                className="px-3 py-1.5 text-sm rounded-md border border-[var(--border-ui)] bg-[var(--bg-card-alt)] hover:bg-[var(--border-ui)] transition-colors"
              >
                {resetSuccess ? 'Close' : 'Cancel'}
              </button>
              {!resetSuccess && (
                <button
                  onClick={doResetPassword}
                  disabled={resetSaving || !resetPassword}
                  className="px-3 py-1.5 text-sm rounded-md bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-medium transition-colors"
                >
                  {resetSaving ? 'Resetting…' : 'Reset password'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
