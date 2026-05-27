'use client';

import { useEffect, useMemo, useState } from 'react';
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
  const [activeTab, setActiveTab] = useState<'dashboard' | 'machines' | 'enforcement'>('dashboard');
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
        {activeTab === 'enforcement' && <EnforcementView data={enforcement} />}

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
function EnforcementView({ data }: { data: any }) {
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

  const allCategories = ['social', 'gambling', 'streaming', 'ph_shopping', 'manual'];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Tile title="Blocked Domains" value={totalBlockedDomains.toLocaleString()} tone="brand" icon={<ShieldCheck size={14} />} />
        <Tile title="Active Categories" value={enabledCategories.length} tone="success" icon={<ListChecks size={14} />} />
        <Tile title="Manual Entries" value={manualBlacklist.length} tone="danger" icon={<AlertTriangle size={14} />} />
      </div>

      <Panel>
        <PanelHeader
          title="Category Policy"
          subtitle="Per-category enforcement state and dictionary size"
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
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-ui)]">
            {allCategories.map((cat) => {
              const isOn = cat === 'manual' ? manualBlacklist.length > 0 : enabledCategories.includes(cat);
              const count = categoryCounts[cat] || 0;
              return (
                <tr key={cat} className="hover:bg-[var(--bg-card-alt)] transition-colors">
                  <td className={TD}>
                    <CategoryTag category={cat} />
                  </td>
                  <td className={TD}>
                    <StatusPill tone={isOn ? 'success' : 'neutral'} label={isOn ? 'Enforced' : 'Inactive'} pulse={isOn} />
                  </td>
                  <td className={`${TD} text-right`}>
                    <span className="font-semibold tabular-nums text-[var(--text-main)]">{count.toLocaleString()}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
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
                  <td className={TD}>
                    <span className="font-mono text-xs text-[var(--text-main)] truncate">{d.domain}</span>
                  </td>
                  <td className={TD}>
                    <CategoryTag category={d.category} />
                  </td>
                  <td className={`${TD} text-right`}>
                    <span className="text-rose-300 font-semibold tabular-nums">{d.count}</span>
                  </td>
                </tr>
              ))}
              {topOffendingDomains.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-xs text-[var(--text-muted)] italic">
                    No policy violations recorded.
                  </td>
                </tr>
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
                  <td className={TD}>
                    <span className="text-[#c4b5fd] font-mono text-xs">{u.username}</span>
                  </td>
                  <td className={TD}>
                    <span className="font-mono text-xs text-[var(--text-muted)]">{u.machine_id}</span>
                  </td>
                  <td className={`${TD} text-right`}>
                    <span className="text-rose-300 font-semibold tabular-nums">{u.count}</span>
                  </td>
                </tr>
              ))}
              {topOffendingUsers.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-xs text-[var(--text-muted)] italic">
                    No agent violations recorded.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Panel>
      </div>

      <Panel>
        <PanelHeader accent="neutral" title="Manual Blacklist" subtitle="Domains pinned via config.manual_blacklist" />
        <div className="p-5">
          {manualBlacklist.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)] italic">
              No manual entries. Add domains to{' '}
              <code className="font-mono text-[#c4b5fd] bg-[var(--bg-card-alt)] px-1 py-0.5 rounded">config.manual_blacklist</code>{' '}
              on the collector to enforce them across all agents.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {manualBlacklist.map((domain: string) => (
                <span
                  key={domain}
                  className="px-2 py-0.5 bg-[var(--bg-card-alt)] border border-[var(--border-ui)] rounded text-[11px] font-mono text-[var(--text-main)]"
                >
                  {domain}
                </span>
              ))}
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}
