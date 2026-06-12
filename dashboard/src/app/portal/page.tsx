'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  AlertTriangle,
  Globe,
  Radio,
  Gauge,
  Eye,
  EyeOff,
  LogOut,
  RefreshCw,
  Sun,
  Moon,
  ChevronRight,
  ChevronLeft,
  Users,
  Monitor,
  Activity,
  Search,
  X,
  Filter,
  TrendingUp,
  ChevronDown,
  BarChart2,
  Clock,
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

const TONE: Record<Tone, { dot: string; pill: string; text: string; bar: string; glow: string }> = {
  brand:   { dot: 'bg-[#a78bfa]',   pill: 'border-[#6a29e1]/40 bg-[#6a29e1]/10',     text: 'text-[#c4b5fd]',   bar: 'bg-[#6a29e1]',   glow: 'shadow-[0_0_8px_rgba(106,41,225,0.4)]'  },
  success: { dot: 'bg-emerald-400', pill: 'border-emerald-500/40 bg-emerald-500/10', text: 'text-emerald-300', bar: 'bg-emerald-500', glow: 'shadow-[0_0_8px_rgba(52,211,153,0.4)]'  },
  warn:    { dot: 'bg-amber-400',   pill: 'border-amber-500/40 bg-amber-500/10',     text: 'text-amber-300',   bar: 'bg-amber-500',   glow: 'shadow-[0_0_8px_rgba(245,158,11,0.4)]'  },
  danger:  { dot: 'bg-rose-400',    pill: 'border-rose-500/40 bg-rose-500/10',       text: 'text-rose-300',    bar: 'bg-rose-500',    glow: 'shadow-[0_0_8px_rgba(239,68,68,0.4)]'   },
  info:    { dot: 'bg-sky-400',     pill: 'border-sky-500/40 bg-sky-500/10',         text: 'text-sky-300',     bar: 'bg-sky-500',     glow: 'shadow-[0_0_8px_rgba(56,189,248,0.3)]'  },
  neutral: { dot: 'bg-slate-500',   pill: 'border-slate-500/30 bg-slate-500/10',     text: 'text-slate-400',   bar: 'bg-slate-500',   glow: ''                                        },
};

const CATEGORY: Record<string, { label: string; tone: Tone }> = {
  social:      { label: 'Social',    tone: 'info' },
  gambling:    { label: 'Gambling',  tone: 'danger' },
  streaming:   { label: 'Streaming', tone: 'warn' },
  ph_shopping: { label: 'Shopping',  tone: 'brand' },
  adult:       { label: 'Adult',     tone: 'danger' },
  manual:      { label: 'Policy',    tone: 'neutral' },
};
const getCategory = (c: string) => CATEGORY[c] || { label: c || 'Policy', tone: 'neutral' as Tone };

const ROLE_META: Record<string, { label: string; tone: Tone }> = {
  team_lead: { label: 'Team Lead', tone: 'info' },
  manager:   { label: 'Manager',   tone: 'warn' },
  director:  { label: 'Director',  tone: 'brand' },
};

const TH = 'px-4 py-2.5 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider';
const TD = 'px-4 py-3 text-sm';

// ─── primitives ───────────────────────────────────────────────────────────
function StatusPill({ tone, label, pulse = false }: { tone: Tone; label: string; pulse?: boolean }) {
  const t = TONE[tone];
  const showGlow = pulse && (tone === 'danger' || tone === 'success' || tone === 'warn');
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[11px] font-semibold tracking-wide transition-all duration-200 ${t.pill} ${t.text} ${showGlow ? t.glow : ''}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${t.dot} ${pulse ? 'animate-pulse' : ''}`} />
      {label}
    </span>
  );
}

function CategoryTag({ category }: { category: string }) {
  const info = getCategory(category);
  const t = TONE[info.tone];
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest border ${t.pill} ${t.text}`}>
      {info.label}
    </span>
  );
}

function Tile({ title, value, sub, tone = 'brand', icon }: { title: string; value: React.ReactNode; sub?: React.ReactNode; tone?: Tone; icon?: React.ReactNode }) {
  const t = TONE[tone];
  return (
    <div className="group relative bg-[var(--bg-card)] border border-[var(--border-ui)] rounded-xl p-5 transition-all duration-200 hover:border-[#6a29e1]/40 hover:shadow-lg hover:shadow-black/30 overflow-hidden cursor-default">
      <div className={`absolute top-0 left-0 right-0 h-[2px] ${t.bar} opacity-70`} />
      <div className="absolute inset-0 bg-gradient-to-br from-[#6a29e1]/0 to-transparent opacity-0 group-hover:opacity-[0.04] transition-opacity duration-300 pointer-events-none" />
      <div className="flex items-start justify-between mb-3">
        <span className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-widest">{title}</span>
        {icon && <span className={`${t.text} opacity-50 group-hover:opacity-80 transition-opacity`}>{icon}</span>}
      </div>
      <div className="text-[26px] font-bold text-[var(--text-main)] tabular-nums tracking-tight">{value}</div>
      {sub && <div className="mt-1.5 text-[11px] text-[var(--text-muted)] leading-relaxed">{sub}</div>}
    </div>
  );
}

function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-[var(--bg-card)] border border-[var(--border-ui)] rounded-xl overflow-hidden shadow-sm shadow-black/20 ${className}`}>
      {children}
    </div>
  );
}

function PanelHeader({ title, accent = 'brand', subtitle, right }: { title: string; accent?: Tone; subtitle?: string; right?: React.ReactNode }) {
  const t = TONE[accent];
  return (
    <div className="px-5 py-3.5 border-b border-[var(--border-ui)] bg-[var(--bg-card-alt)]/50 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <span className={`w-[3px] h-5 rounded-full ${t.bar} shrink-0`} />
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[var(--text-main)] tracking-tight truncate">{title}</h3>
          {subtitle && <p className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}

// ─── login form ───────────────────────────────────────────────────────────
function LoginForm({ onLogin }: { onLogin: (token: string, user: any) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const getBaseUrl = () => `http://${window.location.hostname}:4448`;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${getBaseUrl()}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem('portal-token', data.token);
        onLogin(data.token, data.user);
      } else {
        setError(data.error || 'Login failed');
      }
    } catch {
      setError('Cannot reach the server. Make sure the collector is running.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-page)] flex items-center justify-center px-4 relative overflow-hidden">
      {/* Grid background */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(106,41,225,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(106,41,225,0.04)_1px,transparent_1px)] bg-[size:44px_44px]" />
      {/* Radial glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_40%,rgba(106,41,225,0.1)_0%,transparent_70%)]" />

      <div className="relative w-full max-w-sm fade-in">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="relative">
            <div className="absolute inset-0 rounded-xl bg-[#6a29e1]/30 blur-md" />
            <img src="/logo.jpg" alt="Tarro" className="relative w-10 h-10 rounded-xl object-cover ring-1 ring-[#6a29e1]/50" />
          </div>
          <div>
            <div className="text-base font-bold tracking-tight text-[var(--text-main)]">Tarro</div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-semibold">Team Portal</div>
          </div>
        </div>

        {/* Card */}
        <div className="bg-[var(--bg-card)]/80 backdrop-blur-xl border border-[var(--border-ui)] rounded-2xl p-8 shadow-2xl shadow-black/50 ring-1 ring-[#6a29e1]/10">
          {/* Top accent */}
          <div className="absolute top-0 left-8 right-8 h-px bg-gradient-to-r from-transparent via-[#6a29e1]/50 to-transparent rounded-full" />

          <h1 className="text-xl font-bold text-[var(--text-main)] tracking-tight mb-1">Sign in</h1>
          <p className="text-xs text-[var(--text-muted)] mb-6 leading-relaxed">Use the account created by your administrator.</p>

          {error && (
            <div className="mb-5 flex items-center gap-2 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-xl px-3.5 py-3">
              <AlertTriangle size={13} className="shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1.5">Username</label>
              <input
                autoFocus
                className="w-full bg-[var(--bg-page)]/80 border border-[var(--border-ui)] rounded-xl px-4 py-3 text-sm text-[var(--text-main)] placeholder-[var(--text-muted)]/50 focus:outline-none focus:border-[#6a29e1]/70 focus:ring-1 focus:ring-[#6a29e1]/30 transition-all duration-150"
                placeholder="your.username"
                value={username}
                onChange={e => setUsername(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  className="w-full bg-[var(--bg-page)]/80 border border-[var(--border-ui)] rounded-xl px-4 py-3 pr-11 text-sm text-[var(--text-main)] placeholder-[var(--text-muted)]/50 focus:outline-none focus:border-[#6a29e1]/70 focus:ring-1 focus:ring-[#6a29e1]/30 transition-all duration-150"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
                <button type="button" aria-label="Toggle password visibility" onClick={() => setShowPw(v => !v)} className="cursor-pointer absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors">
                  {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={loading || !username || !password}
              className="cursor-pointer w-full py-3 bg-[#6a29e1] hover:bg-[#7c3aed] disabled:opacity-40 text-white text-sm font-bold rounded-xl transition-all duration-150 shadow-lg shadow-[#6a29e1]/30 hover:shadow-[#6a29e1]/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6a29e1]/70"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

// ─── portal dashboard ─────────────────────────────────────────────────────
function PortalDashboard({ token, user, onLogout }: { token: string; user: any; onLogout: () => void }) {
  const [data, setData]                     = useState<any>(null);
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState(false);
  const [theme, setTheme]                   = useState<'light' | 'dark'>('dark');
  /* Agent inspect state */
  // Returns today's date in EST (UTC−5) as YYYY-MM-DD
  const todayStr = () => new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [inspectAgent, setInspectAgent]     = useState<any | null>(null);
  const [inspectDetail, setInspectDetail]   = useState<any | null>(null);
  const [inspectLogs, setInspectLogs]       = useState<any[]>([]);
  const [inspectLoading, setInspectLoading] = useState(false);
  const [inspectLogFilter, setInspectLogFilter] = useState<'all' | 'violations'>('all');
  const [inspectLogPage, setInspectLogPage] = useState(0);
  const [inspectHasMore, setInspectHasMore] = useState(true);
  const [inspectLogsLoading, setInspectLogsLoading] = useState(false);
  const [inspectDate, setInspectDate]       = useState<string>(todayStr());
  const [agentSearch, setAgentSearch]       = useState('');
  const LOG_PAGE_SIZE = 15;

  const getBaseUrl = () => `http://${window.location.hostname}:4448`;

  useEffect(() => {
    const saved = localStorage.getItem('tarro-theme') as 'light' | 'dark';
    if (saved) { setTheme(saved); document.documentElement.classList.toggle('light', saved === 'light'); }
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('tarro-theme', next);
    document.documentElement.classList.toggle('light', next === 'light');
  };

  const fetchData = useCallback(async () => {
    setError(false);
    try {
      const res = await fetch(`${getBaseUrl()}/api/portal/dashboard`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (res.status === 401) { onLogout(); return; }
      if (res.ok) setData(await res.json());
      else setError(true);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  /* ── Agent inspection helpers ── */
  const openInspect = async (agent: any) => {
    setInspectAgent(agent);
    setInspectDetail(null);
    setInspectLogs([]);
    setInspectLogPage(0);
    setInspectHasMore(false);
    setInspectLogFilter('all');
    setInspectDate(todayStr());
    setInspectLoading(true);
    try {
      const email = encodeURIComponent(agent.username);
      const base  = getBaseUrl();

      // Fetch stats first to resolve the agent's last active date
      const statsRes = await fetch(`${base}/api/agents/${email}/stats`, { cache: 'no-store' });
      let activeDate = todayStr();
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setInspectDetail(statsData);
        if (statsData?.overview?.last_activity) {
          // Convert last_activity UTC timestamp → EST date (UTC−5)
          activeDate = new Date(new Date(statsData.overview.last_activity).getTime() - 5 * 60 * 60 * 1000)
            .toISOString().slice(0, 10);
        }
      }
      setInspectDate(activeDate);

      // Fetch logs for the resolved active date
      const logsRes = await fetch(
        `${base}/api/agents/${email}/logs?limit=${LOG_PAGE_SIZE + 1}&offset=0&date=${activeDate}`,
        { cache: 'no-store' }
      );
      if (logsRes.ok) {
        const rows: any[] = await logsRes.json();
        setInspectHasMore(rows.length > LOG_PAGE_SIZE);
        setInspectLogs(rows.slice(0, LOG_PAGE_SIZE));
      }
    } catch {}
    setInspectLoading(false);
  };

  // Always replaces — pure page navigation, no appending
  const fetchInspectLogs = async (filter: 'all' | 'violations', page: number, date: string) => {
    if (!inspectAgent) return;
    setInspectLogsLoading(true);
    try {
      const email  = encodeURIComponent(inspectAgent.username);
      const params = new URLSearchParams({
        limit:  String(LOG_PAGE_SIZE + 1),
        offset: String(page * LOG_PAGE_SIZE),
        date,
        ...(filter === 'violations' ? { filter: 'violations' } : {}),
      });
      const res = await fetch(`${getBaseUrl()}/api/agents/${email}/logs?${params}`, { cache: 'no-store' });
      if (res.ok) {
        const rows: any[] = await res.json();
        setInspectHasMore(rows.length > LOG_PAGE_SIZE);
        setInspectLogs(rows.slice(0, LOG_PAGE_SIZE));
      }
    } catch {}
    setInspectLogsLoading(false);
  };

  const handleInspectFilterChange = (f: 'all' | 'violations') => {
    setInspectLogFilter(f);
    setInspectLogPage(0);
    fetchInspectLogs(f, 0, inspectDate);
  };

  const handleInspectDateChange = (d: string) => {
    setInspectDate(d);
    setInspectLogPage(0);
    fetchInspectLogs(inspectLogFilter, 0, d);
  };

  const handleInspectPageChange = (newPage: number) => {
    setInspectLogPage(newPage);
    fetchInspectLogs(inspectLogFilter, newPage, inspectDate);
  };

  const roleMeta = ROLE_META[user.role] || { label: user.role, tone: 'neutral' as Tone };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-screen bg-[var(--bg-page)] text-[var(--text-muted)]">
        <RefreshCw className="animate-spin mr-2" size={16} /> Loading portal…
      </div>
    );
  }

  const violations = data?.violations || [];
  const recentLogs = data?.recentLogs || [];
  const topDomains = data?.topDomains || [];
  const bwViolations = data?.bwViolations || [];
  const teamMembers = data?.teamMembers || [];
  const machineIds: string[] = data?.machineIds || [];
  const assignedAgents: any[] = data?.assignedAgents || [];

  const onlineCount = assignedAgents.filter(
    a => new Date().getTime() - new Date(a.last_seen).getTime() < 120000
  ).length;

  return (
    <div className="min-h-screen bg-[var(--bg-page)] text-[var(--text-main)] transition-colors duration-300">
      {/* topbar */}
      <header className="sticky top-0 z-40 bg-[var(--bg-sidebar)]/90 backdrop-blur-md border-b border-[var(--border-ui)] px-6 py-3 flex items-center justify-between gap-4">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#6a29e1]/50 to-transparent" />
        <div className="flex items-center gap-3">
          <img src="/logo.jpg" alt="Tarro" className="w-7 h-7 rounded object-cover ring-1 ring-[var(--border-ui)]" />
          <div className="leading-tight">
            <span className="text-sm font-semibold text-[var(--text-main)]">Tarro Portal</span>
            <span className="ml-2 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Team View</span>
          </div>
          <ChevronRight size={12} className="text-[var(--text-muted)]" />
          <StatusPill tone={roleMeta.tone} label={roleMeta.label} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--text-muted)] hidden sm:block">
            Signed in as <span className="text-[#c4b5fd] font-mono">{user.username}</span>
          </span>
          <StatusPill tone={error ? 'danger' : 'success'} label={error ? 'Offline' : 'Live · 10s'} pulse={!error} />
          <button onClick={toggleTheme} className="p-1.5 rounded-md border border-[var(--border-ui)] bg-[var(--bg-card)] hover:bg-[var(--bg-card-alt)] transition-colors">
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          </button>
          <button onClick={fetchData} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[var(--border-ui)] bg-[var(--bg-card)] text-xs font-medium hover:bg-[var(--bg-card-alt)] transition-colors">
            <RefreshCw size={12} /> Refresh
          </button>
          <button onClick={onLogout} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-rose-500/30 bg-rose-500/10 text-xs font-medium text-rose-300 hover:bg-rose-500/20 transition-colors">
            <LogOut size={12} /> Sign out
          </button>
        </div>
      </header>

      <main className="px-6 lg:px-8 py-6 space-y-6">
        {error && (
          <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 flex items-center gap-3 text-sm text-rose-200">
            <AlertTriangle size={16} className="shrink-0" />
            Connection error — could not reach the collector API. Retrying every 10s.
          </div>
        )}

        {/* page title */}
        <div>
          <h2 className="text-xl font-semibold text-[var(--text-main)]">
            Welcome back, {user.name}
          </h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            {user.role === 'team_lead'
              ? `Monitoring ${machineIds.length} assigned agent(s)`
              : user.role === 'manager'
              ? `Overseeing ${teamMembers.length} team lead(s) · ${machineIds.length} agent(s)`
              : `Overseeing ${teamMembers.length} manager(s) · ${machineIds.length} agent(s)`}
          </p>
        </div>

        {/* KPI tiles */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          <Tile
            title="Monitored Agents"
            value={`${onlineCount} / ${machineIds.length}`}
            sub={`${onlineCount} online · ${machineIds.length - onlineCount} offline`}
            tone="brand"
            icon={<Monitor size={14} />}
          />
          <Tile title="Active Violations" value={violations.length} tone="danger" sub="In live feed" icon={<AlertTriangle size={14} />} />
          <Tile title="Live Events" value={recentLogs.length} tone="success" icon={<Activity size={14} />} />
          {(user.role === 'manager' || user.role === 'director') && (
            <Tile
              title={user.role === 'manager' ? 'Team Leads' : 'Managers'}
              value={teamMembers.length}
              tone="info"
              icon={<Users size={14} />}
            />
          )}
          {user.role === 'team_lead' && (
            <Tile title="BW Violations" value={bwViolations.length} tone="warn" icon={<Gauge size={14} />} />
          )}
        </div>

        {/* Team members panel (managers/directors) */}
        {teamMembers.length > 0 && (
          <Panel>
            <PanelHeader
              accent={user.role === 'manager' ? 'warn' : 'brand'}
              title={user.role === 'manager' ? 'Your Team Leads' : 'Your Managers'}
              subtitle={`${teamMembers.length} direct report(s)`}
            />
            <div className="p-4 flex flex-wrap gap-2">
              {teamMembers.map((m: any) => (
                <div key={m.id} className="bg-[var(--bg-card-alt)] border border-[var(--border-ui)] rounded-md px-3 py-2 flex items-center gap-2">
                  <StatusPill tone={ROLE_META[m.role]?.tone || 'neutral'} label={ROLE_META[m.role]?.label || m.role} />
                  <span className="text-sm text-[var(--text-main)]">{m.name}</span>
                  <span className="text-[11px] font-mono text-[var(--text-muted)]">{m.username}</span>
                </div>
              ))}
            </div>
          </Panel>
        )}

        {/* ── Assigned Agents — enhanced card grid ── */}
        {assignedAgents.length > 0 && (
          <Panel>
            <PanelHeader
              accent="brand"
              title="Assigned Agents"
              subtitle={`${onlineCount} online · ${assignedAgents.length - onlineCount} offline`}
              right={
                <div className="flex items-center gap-2">
                  <StatusPill tone="success" label={`${onlineCount} online`} pulse={onlineCount > 0} />
                  {assignedAgents.length - onlineCount > 0 && (
                    <StatusPill tone="neutral" label={`${assignedAgents.length - onlineCount} offline`} />
                  )}
                </div>
              }
            />
            {/* Search */}
            <div className="px-4 py-3 border-b border-[var(--border-ui)] flex items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
                <input
                  type="text"
                  placeholder="Filter agents…"
                  value={agentSearch}
                  onChange={e => setAgentSearch(e.target.value)}
                  className="w-full bg-[var(--bg-page)] border border-[var(--border-ui)] rounded-lg pl-8 pr-3 py-1.5 text-xs text-[var(--text-main)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[#6a29e1]/60 transition-colors"
                />
                {agentSearch && (
                  <button onClick={() => setAgentSearch('')} className="cursor-pointer absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-main)]">
                    <X size={11} />
                  </button>
                )}
              </div>
              <span className="text-[11px] text-[var(--text-muted)]">
                {assignedAgents.filter(a => !agentSearch || (a.username || '').toLowerCase().includes(agentSearch.toLowerCase()) || (a.machine_id || '').toLowerCase().includes(agentSearch.toLowerCase())).length} agent(s)
              </span>
            </div>

            {/* Agent cards grid */}
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {assignedAgents
                .filter(a => !agentSearch ||
                  (a.username || '').toLowerCase().includes(agentSearch.toLowerCase()) ||
                  (a.machine_id || '').toLowerCase().includes(agentSearch.toLowerCase())
                )
                .map((agent: any) => {
                  const online = new Date().getTime() - new Date(agent.last_seen).getTime() < 120000;
                  const heavy  = agent.current_bandwidth > 10 * 1024 * 1024;
                  return (
                    <div
                      key={agent.machine_id}
                      className="group relative bg-[var(--bg-card-alt)] border border-[var(--border-ui)] rounded-xl p-4 transition-all duration-200 hover:border-[#6a29e1]/40 hover:shadow-lg hover:shadow-black/20 overflow-hidden"
                    >
                      {/* Online indicator strip */}
                      <div className={`absolute top-0 left-0 right-0 h-[2px] transition-all ${online ? 'bg-emerald-500' : 'bg-slate-700'}`} />

                      {/* Header row */}
                      <div className="flex items-start justify-between gap-2 mb-2.5">
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold text-[#c4b5fd] truncate leading-tight">{agent.username || '—'}</div>
                          <div className="font-mono text-[10px] text-[var(--text-muted)] mt-0.5">{agent.machine_id || '—'}</div>
                        </div>
                        <StatusPill tone={online ? 'success' : 'neutral'} label={online ? 'Online' : 'Offline'} pulse={online} />
                      </div>

                      {/* Stats row */}
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        <div className="bg-[var(--bg-card)] rounded-lg px-3 py-2 text-center">
                          <div className={`text-base font-bold tabular-nums ${heavy ? 'text-amber-300' : 'text-[var(--text-main)]'}`}>
                            {formatBytes(agent.current_bandwidth)}<span className="text-[9px] text-[var(--text-muted)] ml-0.5">/min</span>
                          </div>
                          <div className="text-[9px] text-[var(--text-muted)] uppercase tracking-widest font-semibold mt-0.5">Bandwidth</div>
                        </div>
                        <div className="bg-[var(--bg-card)] rounded-lg px-3 py-2 text-center">
                          <div className="text-base font-bold tabular-nums text-[var(--text-main)]">
                            {agent.ip_address?.replace('::ffff:', '') || '—'}
                          </div>
                          <div className="text-[9px] text-[var(--text-muted)] uppercase tracking-widest font-semibold mt-0.5">IP Address</div>
                        </div>
                      </div>

                      {/* Last seen */}
                      <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)] mb-3">
                        <Clock size={9} className="shrink-0" />
                        <span>Last seen {format(new Date(agent.last_seen), 'MMM dd, HH:mm:ss')}</span>
                      </div>

                      {/* Inspect button */}
                      <button
                        onClick={() => openInspect(agent)}
                        className="cursor-pointer w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-[#6a29e1]/40 bg-[#6a29e1]/10 text-[11px] font-semibold text-[#c4b5fd] hover:bg-[#6a29e1]/20 hover:border-[#6a29e1]/70 transition-all duration-150 focus:outline-none focus-visible:ring-1 focus-visible:ring-[#6a29e1]/60"
                      >
                        <Search size={11} />
                        Inspect Activity
                      </button>
                    </div>
                  );
                })}
            </div>
          </Panel>
        )}

        {/* ── Agent Inspection Modal ── */}
        {inspectAgent && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
            <div className="relative w-full sm:max-w-4xl max-h-screen sm:max-h-[90vh] bg-[var(--bg-card)] sm:rounded-2xl border border-[var(--border-ui)] shadow-2xl flex flex-col overflow-hidden animate-scale-in">

              {/* Modal header */}
              <div className="shrink-0 px-5 py-4 border-b border-[var(--border-ui)] bg-[var(--bg-card-alt)]/80 flex items-center gap-3">
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#6a29e1]/50 to-transparent" />
                {/* Avatar */}
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#6a29e1] to-[#3b2470] flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-md">
                  {(inspectAgent.username || '?')[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-[var(--text-main)] truncate">{inspectAgent.username}</span>
                    <StatusPill
                      tone={new Date().getTime() - new Date(inspectAgent.last_seen).getTime() < 120000 ? 'success' : 'neutral'}
                      label={new Date().getTime() - new Date(inspectAgent.last_seen).getTime() < 120000 ? 'Online' : 'Offline'}
                      pulse={new Date().getTime() - new Date(inspectAgent.last_seen).getTime() < 120000}
                    />
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-[var(--text-muted)] font-mono mt-0.5">
                    {inspectAgent.machine_id && <span>{inspectAgent.machine_id}</span>}
                    {inspectAgent.ip_address && <span>{inspectAgent.ip_address.replace('::ffff:', '')}</span>}
                  </div>
                </div>
                <button
                  onClick={() => setInspectAgent(null)}
                  aria-label="Close"
                  className="cursor-pointer shrink-0 p-1.5 rounded-md border border-[var(--border-ui)] bg-[var(--bg-card)] hover:bg-[var(--bg-card-alt)] transition-colors text-[var(--text-muted)] hover:text-[var(--text-main)]"
                >
                  <X size={14} />
                </button>
              </div>

              {/* Modal body — scrollable */}
              <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
                {inspectLoading ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[0,1,2,3].map(i => (
                        <div key={i} className="bg-[var(--bg-card-alt)] border border-[var(--border-ui)] rounded-xl p-4">
                          <div className="skeleton h-2 w-16 rounded mb-3" />
                          <div className="skeleton h-6 w-20 rounded mb-2" />
                          <div className="skeleton h-2 w-24 rounded" />
                        </div>
                      ))}
                    </div>
                    <div className="skeleton h-[200px] rounded-xl" />
                    <div className="skeleton h-[300px] rounded-xl" />
                  </div>
                ) : (
                  <>
                    {/* Stat tiles */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {(() => {
                        const total  = inspectDetail?.overview?.total_sessions  || 0;
                        const viols  = inspectDetail?.overview?.total_violations || 0;
                        const ratio  = viols / Math.max(total, 1);
                        const bw     = inspectAgent.total_bandwidth || 0;
                        return [
                          { title: 'Total Sessions',  value: total.toLocaleString(),       tone: 'brand'   as Tone, icon: <Globe size={13} /> },
                          { title: 'Violations',       value: viols.toLocaleString(),       tone: 'danger'  as Tone, icon: <AlertTriangle size={13} />, sub: `${(ratio*100).toFixed(1)}% of sessions` },
                          { title: 'Violation Ratio',  value: `${(ratio*100).toFixed(1)}%`, tone: ratio > 0.3 ? 'danger' as Tone : ratio > 0.1 ? 'warn' as Tone : 'success' as Tone, icon: <TrendingUp size={13} /> },
                          { title: 'Total Bandwidth',  value: formatBytes(bw),              tone: 'info'    as Tone, icon: <Gauge size={13} /> },
                        ];
                      })().map((tile, i) => (
                        <div key={i} className={`relative bg-[var(--bg-card-alt)] border border-[var(--border-ui)] rounded-xl p-4 overflow-hidden`}>
                          <div className={`absolute top-0 left-0 right-0 h-[2px] ${TONE[tile.tone].bar} opacity-70`} />
                          <div className="flex items-start justify-between mb-2">
                            <span className="text-[9px] text-[var(--text-muted)] font-bold uppercase tracking-widest">{tile.title}</span>
                            <span className={`${TONE[tile.tone].text} opacity-60`}>{tile.icon}</span>
                          </div>
                          <div className="text-xl font-bold text-[var(--text-main)] tabular-nums">{tile.value}</div>
                          {tile.sub && <div className="text-[10px] text-[var(--text-muted)] mt-1">{tile.sub}</div>}
                        </div>
                      ))}
                    </div>

                    {/* Top Domains chart + Category breakdown */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="md:col-span-2 bg-[var(--bg-card-alt)] border border-[var(--border-ui)] rounded-xl overflow-hidden">
                        <div className="px-4 py-3 border-b border-[var(--border-ui)] flex items-center gap-2">
                          <span className="w-[3px] h-4 rounded-full bg-[#6a29e1] shrink-0" />
                          <span className="text-xs font-semibold text-[var(--text-main)]">Top Visited Domains</span>
                        </div>
                        <div className="p-4 h-[200px]">
                          {(inspectDetail?.topDomains || []).length === 0 ? (
                            <div className="h-full flex items-center justify-center text-xs text-[var(--text-muted)] italic">No domain data yet.</div>
                          ) : (
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={inspectDetail.topDomains} layout="vertical" margin={{ left: 8, right: 24, top: 2, bottom: 2 }}>
                                <XAxis type="number" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                                <YAxis type="category" dataKey="domain" stroke="#64748b" fontSize={9} tickLine={false} axisLine={false} width={100} />
                                <Tooltip
                                  cursor={{ fill: 'rgba(106,41,225,0.05)' }}
                                  contentStyle={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-ui)', borderRadius: '8px', color: 'var(--text-main)', fontSize: '11px' }}
                                  itemStyle={{ color: '#a78bfa' }}
                                />
                                <Bar dataKey="count" radius={[0, 3, 3, 0]}>
                                  {(inspectDetail.topDomains as any[]).map((d: any, i: number) => (
                                    <Cell key={i} fill={d.is_violation ? '#ef4444' : i === 0 ? '#6a29e1' : '#3b2470'} />
                                  ))}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          )}
                        </div>
                      </div>

                      <div className="bg-[var(--bg-card-alt)] border border-[var(--border-ui)] rounded-xl overflow-hidden">
                        <div className="px-4 py-3 border-b border-[var(--border-ui)] flex items-center gap-2">
                          <span className="w-[3px] h-4 rounded-full bg-rose-500 shrink-0" />
                          <span className="text-xs font-semibold text-[var(--text-main)]">Non-Work Categories</span>
                        </div>
                        <div className="p-4 space-y-2.5">
                          {(inspectDetail?.categoryBreakdown || []).length === 0 ? (
                            <div className="py-6 text-center text-xs text-[var(--text-muted)] italic">No flagged categories.</div>
                          ) : (
                            (inspectDetail.categoryBreakdown as any[]).map((cat: any) => {
                              const info = getCategory(cat.category);
                              const t    = TONE[info.tone];
                              const max  = (inspectDetail.categoryBreakdown as any[])[0]?.count || 1;
                              return (
                                <div key={cat.category}>
                                  <div className="flex justify-between mb-1">
                                    <span className={`text-[10px] font-bold uppercase tracking-widest ${t.text}`}>{info.label}</span>
                                    <span className="text-[10px] font-mono text-[var(--text-main)]">{cat.count}</span>
                                  </div>
                                  <div className="h-1.5 rounded-full bg-[var(--bg-card)] overflow-hidden">
                                    <div className={`h-full rounded-full ${t.bar} transition-all duration-500`} style={{ width: `${(cat.count / max) * 100}%` }} />
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Browse log */}
                    <div className="bg-[var(--bg-card-alt)] border border-[var(--border-ui)] rounded-xl overflow-hidden">
                      <div className="px-4 py-3 border-b border-[var(--border-ui)] flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-2 mr-1">
                          <span className="w-[3px] h-4 rounded-full bg-sky-500 shrink-0" />
                          <span className="text-xs font-semibold text-[var(--text-main)]">Browse Log</span>
                        </div>

                        {/* Violation toggle */}
                        <button
                          onClick={() => handleInspectFilterChange('all')}
                          className={`cursor-pointer px-2 py-1 rounded text-[10px] font-semibold transition-all ${inspectLogFilter === 'all' ? 'bg-[#6a29e1]/20 text-[#c4b5fd] border border-[#6a29e1]/40' : 'text-[var(--text-muted)] hover:text-[var(--text-main)] border border-transparent'}`}
                        >
                          All
                        </button>
                        <button
                          onClick={() => handleInspectFilterChange('violations')}
                          className={`cursor-pointer flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold transition-all ${inspectLogFilter === 'violations' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' : 'text-[var(--text-muted)] hover:text-[var(--text-main)] border border-transparent'}`}
                        >
                          <Filter size={9} />Violations
                        </button>

                        {/* Date picker */}
                        <div className="ml-auto flex items-center gap-1.5">
                          <Clock size={11} className="text-[var(--text-muted)] shrink-0" />
                          <input
                            type="date"
                            value={inspectDate}
                            max={todayStr()}
                            onChange={e => e.target.value && handleInspectDateChange(e.target.value)}
                            className="cursor-pointer bg-[var(--bg-page)] border border-[var(--border-ui)] rounded-md px-2 py-1 text-[11px] text-[var(--text-main)] focus:outline-none focus:border-[#6a29e1]/60 transition-colors"
                          />
                          {inspectDate !== todayStr() && (
                            <button
                              onClick={() => handleInspectDateChange(todayStr())}
                              className="cursor-pointer px-1.5 py-1 rounded text-[10px] font-semibold text-[#c4b5fd] hover:bg-[#6a29e1]/10 transition-colors"
                              title="Jump to today"
                            >
                              Today
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-[var(--bg-card)] border-b border-[var(--border-ui)]">
                              <th className={TH}>Domain</th>
                              <th className={TH}>Category</th>
                              <th className={TH}>Machine</th>
                              <th className={TH}>Time</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--border-ui)]">
                            {inspectLogs.length === 0 && !inspectLogsLoading ? (
                              <tr>
                                <td colSpan={4} className="px-4 py-8 text-center text-xs text-[var(--text-muted)] italic">
                                  {inspectLogFilter === 'violations'
                                    ? `No violations on ${inspectDate}.`
                                    : `No browsing activity on ${inspectDate}.`}
                                </td>
                              </tr>
                            ) : (
                              inspectLogs.map((log: any) => (
                                <tr key={log.id} className={`transition-colors text-sm ${log.violation ? 'hover:bg-rose-500/5 border-l-2 border-rose-500/40' : 'hover:bg-[var(--bg-card)]/40 border-l-2 border-transparent'}`}>
                                  <td className={TD}>
                                    <span className={`font-medium truncate max-w-[160px] block ${log.violation ? 'text-rose-300' : 'text-[var(--text-main)]'}`}>{log.domain}</span>
                                  </td>
                                  <td className={TD}>
                                    {log.violation ? <CategoryTag category={log.category} /> : <span className="text-[var(--text-muted)] text-xs">—</span>}
                                  </td>
                                  <td className={TD}><span className="font-mono text-[10px] text-[var(--text-muted)]">{log.machine_id || '—'}</span></td>
                                  <td className={`${TD} font-mono text-[10px] text-[var(--text-muted)] whitespace-nowrap`}>{format(new Date(log.timestamp), 'MMM dd, HH:mm:ss')}</td>
                                </tr>
                              ))
                            )}
                            {inspectLogsLoading && Array.from({ length: 4 }).map((_, i) => (
                              <tr key={`sk-${i}`}>
                                {[180, 80, 100, 120].map((w, j) => (
                                  <td key={j} className="px-4 py-3"><div className={`skeleton h-2.5 rounded`} style={{ width: w }} /></td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {/* Pagination */}
                      {(inspectLogPage > 0 || inspectHasMore) && (
                        <div className="px-4 py-3 border-t border-[var(--border-ui)] flex items-center justify-between gap-3">
                          <button
                            onClick={() => handleInspectPageChange(inspectLogPage - 1)}
                            disabled={inspectLogPage === 0 || inspectLogsLoading}
                            className="cursor-pointer flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--border-ui)] bg-[var(--bg-card)] text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-main)] hover:border-[#6a29e1]/40 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150"
                          >
                            <ChevronLeft size={13} />Previous
                          </button>
                          <span className="text-[11px] text-[var(--text-muted)] tabular-nums">
                            Page {inspectLogPage + 1}
                          </span>
                          <button
                            onClick={() => handleInspectPageChange(inspectLogPage + 1)}
                            disabled={!inspectHasMore || inspectLogsLoading}
                            className="cursor-pointer flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--border-ui)] bg-[var(--bg-card)] text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-main)] hover:border-[#6a29e1]/40 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150"
                          >
                            Next<ChevronRight size={13} />
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Active violations */}
        {violations.length > 0 && (
          <Panel className="border-rose-500/30">
            <PanelHeader accent="danger" title="Active Violations" subtitle={`${violations.length} flagged in your agent scope`} right={<AlertTriangle size={14} className="text-rose-300" />} />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 p-3">
              {violations.slice(0, 6).map((v: any) => (
                <div key={v.id} className="bg-[var(--bg-card-alt)] border border-rose-500/20 rounded-md px-3 py-2.5">
                  <div className="flex justify-between items-center mb-1.5">
                    <CategoryTag category={v.category} />
                    <span className="text-[10px] text-[var(--text-muted)] font-mono">{format(new Date(v.timestamp), 'HH:mm')}</span>
                  </div>
                  <div className="text-sm font-semibold text-[var(--text-main)] truncate">{v.domain}</div>
                  <div className="mt-1 flex items-center gap-3 text-[11px] text-[var(--text-muted)] font-mono">
                    <span>{v.machine_id}</span>
                    <span className="text-rose-300">{v.username || 'unknown'}</span>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        )}

        {/* Chart + Activity */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
          <Panel className="xl:col-span-2">
            <PanelHeader title="Top Domain Traffic" subtitle="Across your assigned agents" />
            <div className="p-4 h-[280px]">
              {topDomains.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-[var(--text-muted)] italic">No traffic data yet.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topDomains}>
                    <XAxis dataKey="domain" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip
                      cursor={{ fill: 'rgba(106,41,225,0.05)' }}
                      contentStyle={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-ui)', borderRadius: '8px', color: 'var(--text-main)', fontSize: '12px' }}
                      itemStyle={{ color: '#a78bfa' }}
                    />
                    <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                      {topDomains.map((_: any, i: number) => <Cell key={i} fill={i === 0 ? '#6a29e1' : '#3b2470'} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Live Activity Stream" subtitle={`${recentLogs.length} events`} right={<Radio size={14} className="text-emerald-300 animate-pulse" />} />
            <div className="max-h-[280px] overflow-y-auto divide-y divide-[var(--border-ui)]">
              {recentLogs.length === 0 ? (
                <div className="px-5 py-8 text-center text-xs text-[var(--text-muted)] italic">No activity yet.</div>
              ) : (
                recentLogs.map((log: any) => (
                  <div key={log.id} className={`px-4 py-2.5 border-l-2 ${log.violation ? 'border-rose-500/60 bg-rose-500/5' : 'border-[#6a29e1]/40'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-[var(--text-main)] truncate">{log.domain}</span>
                          {log.violation && <CategoryTag category={log.category} />}
                        </div>
                        <div className="mt-1 flex items-center gap-3 text-[11px] text-[var(--text-muted)] font-mono">
                          <span>{log.machine_id}</span>
                          <span className={log.violation ? 'text-rose-300' : 'text-[#c4b5fd]'}>{log.username || 'unknown'}</span>
                        </div>
                      </div>
                      <span className="text-[10px] text-[var(--text-muted)] font-mono tabular-nums shrink-0 mt-0.5">{format(new Date(log.timestamp), 'HH:mm:ss')}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Panel>
        </div>

        {/* Bandwidth violations */}
        <Panel>
          <PanelHeader accent="warn" title="Recent Bandwidth Violations" subtitle="Agents exceeding per-minute byte threshold in your scope" />
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
              {bwViolations.map((v: any) => (
                <tr key={v.id} className="hover:bg-amber-500/5 transition-colors">
                  <td className={`${TD} text-[var(--text-muted)] font-mono text-xs`}>{format(new Date(v.timestamp), 'MMM dd, HH:mm:ss')}</td>
                  <td className={TD}><span className="font-mono text-[var(--text-main)] text-xs">{v.machine_id}</span></td>
                  <td className={TD}><span className="text-[#c4b5fd] font-mono text-xs">{v.username || 'unknown'}</span></td>
                  <td className={`${TD} text-right`}><span className="text-amber-300 font-semibold tabular-nums">{formatBytes(v.bytes)}/min</span></td>
                </tr>
              ))}
              {bwViolations.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-xs text-[var(--text-muted)] italic">No bandwidth violations recorded for your agents.</td></tr>
              )}
            </tbody>
          </table>
        </Panel>

        {/* Scope info */}
        {machineIds.length === 0 && !loading && (
          <div className="rounded-lg border border-[var(--border-ui)] bg-[var(--bg-card)] px-5 py-8 text-center">
            <Monitor size={24} className="mx-auto mb-3 text-[var(--text-muted)] opacity-40" />
            <p className="text-sm font-medium text-[var(--text-main)] mb-1">No agents assigned yet</p>
            <p className="text-xs text-[var(--text-muted)]">Ask your administrator to assign agents{user.role !== 'team_lead' ? ' or team members' : ''} to your account.</p>
          </div>
        )}
      </main>
    </div>
  );
}

// ─── forced password change screen ───────────────────────────────────────
function ChangePasswordScreen({ token, user, onDone }: { token: string; user: any; onDone: (token: string, user: any) => void }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const getBaseUrl = () => `http://${window.location.hostname}:4448`;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPassword.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (newPassword !== confirm) { setError('Passwords do not match.'); return; }
    setLoading(true);
    try {
      const res = await fetch(`${getBaseUrl()}/api/portal/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ newPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem('portal-token', data.token);
        onDone(data.token, data.user);
      } else {
        setError(data.error || 'Failed to change password.');
      }
    } catch {
      setError('Cannot reach the server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-page)] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <img src="/logo.jpg" alt="Tarro" className="w-9 h-9 rounded-md object-cover ring-1 ring-[var(--border-ui)]" />
          <div>
            <div className="text-base font-semibold text-[var(--text-main)]">Tarro</div>
            <div className="text-[10px] uppercase tracking-[0.15em] text-[var(--text-muted)]">Team Portal</div>
          </div>
        </div>

        <div className="bg-[var(--bg-card)] border border-amber-500/40 rounded-xl p-7 shadow-2xl">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <h1 className="text-lg font-semibold text-[var(--text-main)]">Set your password</h1>
          </div>
          <p className="text-xs text-[var(--text-muted)] mb-6">
            Welcome, <span className="text-[#c4b5fd] font-medium">{user.name}</span>. Your account was created with a temporary password. Please set a new one before continuing.
          </p>

          {error && (
            <div className="mb-4 flex items-center gap-2 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-md px-3 py-2.5">
              <AlertTriangle size={13} className="shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">New Password</label>
              <div className="relative">
                <input
                  autoFocus
                  type={showPw ? 'text' : 'password'}
                  className="w-full bg-[var(--bg-page)] border border-[var(--border-ui)] rounded-md px-3 py-2.5 pr-10 text-sm text-[var(--text-main)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[#6a29e1]/60"
                  placeholder="Min 6 characters"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                />
                <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-main)]">
                  {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">Confirm Password</label>
              <input
                type={showPw ? 'text' : 'password'}
                className="w-full bg-[var(--bg-page)] border border-[var(--border-ui)] rounded-md px-3 py-2.5 text-sm text-[var(--text-main)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[#6a29e1]/60"
                placeholder="Re-enter password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
              />
            </div>
            <button
              type="submit"
              disabled={loading || !newPassword || !confirm}
              className="w-full py-2.5 bg-[#6a29e1] hover:bg-[#7c3aed] disabled:opacity-50 text-white text-sm font-medium rounded-md transition-colors"
            >
              {loading ? 'Saving…' : 'Set password & continue'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

// ─── page entry ───────────────────────────────────────────────────────────
export default function PortalPage() {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('portal-token');
    if (saved) {
      try {
        const payload = JSON.parse(atob(saved.split('.')[1]));
        if (payload.exp * 1000 > Date.now()) {
          setToken(saved);
          setUser({ id: payload.id, name: payload.name, username: payload.username, role: payload.role, mustChangePassword: payload.mustChangePassword });
        } else {
          localStorage.removeItem('portal-token');
        }
      } catch {
        localStorage.removeItem('portal-token');
      }
    }
    setReady(true);
  }, []);

  const handleLogin = (t: string, u: any) => { setToken(t); setUser(u); };

  const handlePasswordChanged = (t: string, u: any) => {
    setToken(t);
    setUser(u);
  };

  const handleLogout = () => {
    localStorage.removeItem('portal-token');
    setToken(null);
    setUser(null);
  };

  if (!ready) return null;

  if (!token || !user) return <LoginForm onLogin={handleLogin} />;

  if (user.mustChangePassword) return <ChangePasswordScreen token={token} user={user} onDone={handlePasswordChanged} />;

  return <PortalDashboard token={token} user={user} onLogout={handleLogout} />;
}
