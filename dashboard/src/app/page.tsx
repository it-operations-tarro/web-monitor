'use client';

import { useEffect, useMemo, useState, useCallback, Fragment } from 'react';
import { createPortal } from 'react-dom';
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
  Eye,
  EyeOff,
  TrendingUp,
  Search,
  Filter,
  ChevronDown,
  ChevronLeft,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  CartesianGrid,
} from 'recharts';

// ─── utils ────────────────────────────────────────────────────────────────

/** Format a timestamp in EST/EDT, 12-hour clock, e.g. "Jun 06, 10:32:07 PM" */
const fmtEST = (ts: string | Date) => {
  const d = new Date(ts);
  const date = d.toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: '2-digit' });
  const time = d.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
  return `${date}, ${time}`;
};
/** Time-only EST, with seconds — e.g. "10:32:07 PM" */
const fmtESTTime = (ts: string | Date) =>
  new Date(ts).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
/** Time-only EST, no seconds — e.g. "10:32 PM" */
const fmtESTShort = (ts: string | Date) =>
  new Date(ts).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', hour12: true });

const formatBytes = (bytes: number) => {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

type Tone = 'brand' | 'success' | 'warn' | 'danger' | 'info' | 'neutral';

const TONE: Record<Tone, { dot: string; pill: string; text: string; bar: string; glow: string }> = {
  brand:   { dot: 'bg-[#a78bfa]',   pill: 'border-[#6a29e1]/40 bg-[#6a29e1]/10',     text: 'text-[#c4b5fd]',   bar: 'bg-[#6a29e1]',     glow: 'shadow-[0_0_8px_rgba(106,41,225,0.4)]'  },
  success: { dot: 'bg-emerald-400', pill: 'border-emerald-500/40 bg-emerald-500/10', text: 'text-emerald-300', bar: 'bg-emerald-500',   glow: 'shadow-[0_0_8px_rgba(52,211,153,0.4)]'  },
  warn:    { dot: 'bg-amber-400',   pill: 'border-amber-500/40 bg-amber-500/10',     text: 'text-amber-300',   bar: 'bg-amber-500',     glow: 'shadow-[0_0_8px_rgba(245,158,11,0.4)]'  },
  danger:  { dot: 'bg-rose-400',    pill: 'border-rose-500/40 bg-rose-500/10',       text: 'text-rose-300',    bar: 'bg-rose-500',      glow: 'shadow-[0_0_8px_rgba(239,68,68,0.4)]'   },
  info:    { dot: 'bg-sky-400',     pill: 'border-sky-500/40 bg-sky-500/10',         text: 'text-sky-300',     bar: 'bg-sky-500',       glow: 'shadow-[0_0_8px_rgba(56,189,248,0.3)]'  },
  neutral: { dot: 'bg-slate-500',   pill: 'border-slate-500/30 bg-slate-500/10',     text: 'text-slate-400',   bar: 'bg-slate-500',     glow: ''                                        },
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
  const showGlow = pulse && (tone === 'danger' || tone === 'success' || tone === 'warn');
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[11px] font-semibold tracking-wide transition-all duration-200 ${t.pill} ${t.text} ${showGlow ? t.glow : ''} ${className}`}>
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

function Tile({
  title,
  value,
  sub,
  tone = 'brand',
  icon,
  index = 0,
}: { title: string; value: React.ReactNode; sub?: React.ReactNode; tone?: Tone; icon?: React.ReactNode; index?: number }) {
  const t = TONE[tone];
  return (
    <div
      className="group relative bg-[var(--bg-card)] border border-[var(--border-ui)] rounded-xl p-5 transition-all duration-200 hover:border-[#6a29e1]/40 hover:shadow-xl hover:shadow-black/30 overflow-hidden cursor-default animate-fade-in-up"
      style={{ animationDelay: `${index * 55}ms` }}
    >
      {/* Top accent line */}
      <div className={`absolute top-0 left-0 right-0 h-[2px] ${t.bar} opacity-70`} />
      {/* Subtle hover bg glow */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#6a29e1]/0 to-transparent opacity-0 group-hover:opacity-[0.04] transition-opacity duration-300 pointer-events-none" />
      <div className="flex items-start justify-between mb-3">
        <span className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-widest">{title}</span>
        {icon && (
          <div className={`flex items-center justify-center w-7 h-7 rounded-lg flex-shrink-0 bg-current/10 ${t.text} opacity-70 group-hover:opacity-100 transition-opacity duration-200`}>
            {icon}
          </div>
        )}
      </div>
      <div className="text-[26px] font-bold text-[var(--text-main)] tabular-nums tracking-tight font-[var(--font-geist-mono)]">{value}</div>
      {sub && <div className="mt-1.5 text-[11px] text-[var(--text-muted)] leading-relaxed">{sub}</div>}
    </div>
  );
}

// ─── orchestrator loading screen ──────────────────────────────────────────
const BOOT_STEPS = [
  'Initializing network collectors…',
  'Establishing secure agent connections…',
  'Loading enforcement policy engine…',
  'Syncing workstation fleet registry…',
  'Aggregating bandwidth telemetry…',
  'Calibrating violation detection…',
  'Mounting surveillance pipeline…',
  'System ready — launching dashboard…',
];

function LoadingScreen() {
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setStep(s => {
        const next = s + 1;
        setProgress(Math.round((next / BOOT_STEPS.length) * 100));
        return next >= BOOT_STEPS.length ? s : next;
      });
    }, 600);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-[#07030f] flex flex-col items-center justify-center overflow-hidden select-none">
      {/* Grid background */}
      <div className="absolute inset-0 bg-grid opacity-20" />

      {/* Ambient purple glow */}
      <div className="absolute w-[600px] h-[600px] rounded-full bg-[#6a29e1]/8 blur-[120px] pointer-events-none" />

      {/* Scan line */}
      <div className="absolute inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-[#6a29e1]/40 to-transparent animate-sweep pointer-events-none" />

      {/* Corner brackets — top-left */}
      <div className="absolute top-6 left-6 w-8 h-8 border-t-2 border-l-2 border-[#6a29e1]/50 rounded-tl-sm" />
      <div className="absolute top-6 right-6 w-8 h-8 border-t-2 border-r-2 border-[#6a29e1]/50 rounded-tr-sm" />
      <div className="absolute bottom-6 left-6 w-8 h-8 border-b-2 border-l-2 border-[#6a29e1]/50 rounded-bl-sm" />
      <div className="absolute bottom-6 right-6 w-8 h-8 border-b-2 border-r-2 border-[#6a29e1]/50 rounded-br-sm" />

      {/* Main content */}
      <div className="relative flex flex-col items-center gap-8">

        {/* Logo + orbit ring */}
        <div className="relative flex items-center justify-center w-24 h-24">
          {/* Orbit ring */}
          <div className="absolute inset-0 rounded-full border border-[#6a29e1]/20" />
          <div className="absolute inset-[-8px] rounded-full border border-dashed border-[#6a29e1]/15" />
          {/* Orbiting dot */}
          <div className="absolute inset-0 flex items-center justify-center animate-orbit">
            <div className="w-2 h-2 rounded-full bg-[#6a29e1] shadow-[0_0_8px_#6a29e1]" />
          </div>
          {/* Logo */}
          <div className="relative z-10 w-16 h-16 rounded-2xl bg-gradient-to-br from-[#6a29e1] to-[#3b2470] flex items-center justify-center shadow-2xl shadow-[#6a29e1]/40 ring-1 ring-[#6a29e1]/60">
            <img src="/logo.jpg" alt="Tarro" className="w-14 h-14 rounded-xl object-cover" />
          </div>
        </div>

        {/* Brand */}
        <div className="text-center space-y-1">
          <div className="text-2xl font-bold text-[#f1f5f9] tracking-tight">Tarro</div>
          <div className="text-[10px] font-bold uppercase tracking-[0.35em] text-[#6a29e1]">Web Monitor</div>
        </div>

        {/* Boot message */}
        <div className="h-4 flex items-center">
          <span className="text-[11px] font-mono text-[#7c85a2] tracking-wide">
            {BOOT_STEPS[step]}
          </span>
        </div>

        {/* Progress track */}
        <div className="w-72 space-y-2">
          <div className="relative h-[3px] bg-[#221650] rounded-full overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 bg-gradient-to-r from-[#6a29e1] to-[#a78bfa] rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
            {/* Shimmer */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-load-bar" />
          </div>
          <div className="flex justify-between text-[9px] font-mono text-[#2d1b5e]">
            <span>BOOT SEQUENCE</span>
            <span>{progress}%</span>
          </div>
        </div>
      </div>

      {/* Bottom system status row */}
      <div className="absolute bottom-10 flex items-center gap-8">
        {[
          { label: 'COLLECTOR API', color: 'bg-emerald-500', delay: '0s' },
          { label: 'POLICY ENGINE', color: 'bg-[#6a29e1]',  delay: '0.3s' },
          { label: 'AGENT REGISTRY', color: 'bg-sky-500',   delay: '0.6s' },
        ].map(({ label, color, delay }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className={`w-1.5 h-1.5 rounded-full ${color} animate-pulse`} style={{ animationDelay: delay }} />
            <span className="text-[9px] font-mono font-bold tracking-[0.15em] text-[#2d1b5e]">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SkeletonTile() {
  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border-ui)] rounded-xl p-5 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-[2px] skeleton" />
      <div className="flex items-start justify-between mb-4">
        <div className="skeleton h-2 w-20 rounded" />
        <div className="skeleton w-7 h-7 rounded-lg" />
      </div>
      <div className="skeleton h-7 w-24 rounded mb-2.5" />
      <div className="skeleton h-2 w-28 rounded" />
    </div>
  );
}

function Panel({ children, className = '', style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`bg-[var(--bg-card)] border border-[var(--border-ui)] rounded-xl overflow-hidden shadow-sm shadow-black/20 ${className}`}
      style={style}
    >
      {children}
    </div>
  );
}

function PanelHeader({
  title,
  accent = 'brand',
  subtitle,
  right,
  icon,
}: { title: string; accent?: Tone; subtitle?: string; right?: React.ReactNode; icon?: React.ReactNode }) {
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

function NavItem({
  active,
  icon,
  label,
  onClick,
}: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`cursor-pointer w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6a29e1]/50 ${
        active
          ? 'bg-gradient-to-r from-[#6a29e1]/20 to-[#6a29e1]/5 text-[var(--text-main)] border border-[#6a29e1]/30 shadow-sm shadow-[#6a29e1]/10'
          : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card-alt)] border border-transparent'
      }`}
    >
      <span className={`shrink-0 transition-colors ${active ? 'text-[#a78bfa]' : ''}`}>{icon}</span>
      <span className="font-medium truncate">{label}</span>
      {active && <ChevronRight size={13} className="ml-auto text-[#a78bfa] opacity-70 shrink-0" />}
    </button>
  );
}

function MobileNav({
  activeTab,
  setActiveTab,
}: {
  activeTab: string;
  setActiveTab: (tab: 'dashboard' | 'machines' | 'enforcement' | 'users') => void;
}) {
  const tabs: { id: 'dashboard' | 'machines' | 'enforcement' | 'users'; icon: React.ReactNode; label: string }[] = [
    { id: 'dashboard',   icon: <LayoutDashboard size={19} />, label: 'Overview' },
    { id: 'machines',    icon: <Activity size={19} />,        label: 'Fleet' },
    { id: 'enforcement', icon: <ShieldCheck size={19} />,     label: 'Enforce' },
    { id: 'users',       icon: <UserCog size={19} />,         label: 'Users' },
  ];
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 flex lg:hidden bg-[var(--bg-sidebar)] border-t border-[var(--border-ui)] z-20"
      aria-label="Mobile navigation"
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            aria-current={isActive ? 'page' : undefined}
            className={`flex-1 flex flex-col items-center justify-center py-3 gap-1 text-[9px] font-bold
                        uppercase tracking-widest cursor-pointer transition-colors duration-200
              ${isActive ? 'text-[#a78bfa]' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
          >
            <span className={`transition-transform duration-200 ${isActive ? 'scale-110' : ''}`}>{tab.icon}</span>
            {tab.label}
          </button>
        );
      })}
    </nav>
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
  const [refreshing, setRefreshing] = useState(false);
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

  async function fetchData(manual = false) {
    if (manual) setRefreshing(true);
    setError(false);
    try {
      const baseUrl = getBaseUrl();
      const fetchOpts = { cache: 'no-store' as RequestCache };
      const [statsRes, logsRes, machinesRes, bwRes] = await Promise.all([
        fetch(`${baseUrl}/api/stats`, fetchOpts),
        fetch(`${baseUrl}/api/logs?limit=50`, fetchOpts),
        fetch(`${baseUrl}/api/machines`, fetchOpts),
        fetch(`${baseUrl}/api/bandwidth-violations?limit=10`, fetchOpts),
      ]);
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
      if (manual) setRefreshing(false);
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
    return <LoadingScreen />;
  }

  return (
    <>
      {/* ─── Skip link ──────────────────────────────────────────────── */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100]
                   focus:px-4 focus:py-2 focus:bg-[#6a29e1] focus:text-white focus:rounded-lg
                   focus:text-sm focus:font-semibold focus:shadow-xl"
      >
        Skip to main content
      </a>
    <div className="min-h-screen bg-[var(--bg-page)] text-[var(--text-main)] transition-colors duration-300">
      {/* ─── sidebar ─────────────────────────────────────────────────── */}
      <aside className="fixed left-0 top-0 h-full w-60 bg-[var(--bg-sidebar)] border-r border-[var(--border-ui)] hidden lg:flex flex-col transition-colors duration-300 z-30">
        {/* Top purple glow line */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#6a29e1]/70 to-transparent" />

        <div className="px-5 py-5 border-b border-[var(--border-ui)] flex items-center gap-3">
          <div className="relative">
            <img src="/logo.jpg" alt="Tarro" className="w-9 h-9 rounded-lg object-cover ring-1 ring-[#6a29e1]/40 shadow-md shadow-[#6a29e1]/20" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-bold tracking-tight text-[var(--text-main)]">Tarro</div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)] font-medium">Web Monitor</div>
          </div>
        </div>

        <div className="px-3 py-4 flex-1 overflow-y-auto">
          <div className="px-2 mb-2.5 text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--text-muted)]/60">Workspace</div>
          <nav className="space-y-0.5">
            <NavItem active={activeTab === 'dashboard'}   onClick={() => setActiveTab('dashboard')}   icon={<LayoutDashboard size={15} />} label="Overview" />
            <NavItem active={activeTab === 'machines'}    onClick={() => setActiveTab('machines')}    icon={<Activity size={15} />}        label="Fleet" />
            <NavItem active={activeTab === 'enforcement'} onClick={() => setActiveTab('enforcement')} icon={<ShieldCheck size={15} />}     label="Enforcement" />
            <NavItem active={activeTab === 'users'}       onClick={() => setActiveTab('users')}       icon={<UserCog size={15} />}         label="Users" />
          </nav>
        </div>

        <div className="px-4 py-3 border-t border-[var(--border-ui)] flex items-center justify-between">
          <span className="text-[10px] text-[var(--text-muted)]/50 font-mono">v1.0.1</span>
          <StatusPill tone={error ? 'danger' : 'success'} label={error ? 'Offline' : 'Live'} pulse={!error} />
        </div>
      </aside>

      {/* ─── main ───────────────────────────────────────────────────── */}
      <main id="main-content" className="lg:ml-60 px-4 sm:px-6 lg:px-8 py-6 pb-24 lg:pb-10">
        {/* topbar */}
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-3 mb-7">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)] uppercase tracking-[0.15em] font-bold mb-1.5">
              <span>Workspace</span>
              <ChevronRight size={11} className="opacity-50" />
              <span className="text-[#a78bfa]">{tabMeta.label}</span>
            </div>
            <h2 className="text-[22px] font-bold text-[var(--text-main)] tracking-tight leading-tight">{tabMeta.title}</h2>
            <p className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">{tabMeta.subtitle}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <StatusPill tone={error ? 'danger' : 'success'} label={error ? 'Collector unreachable' : 'Live · 10s'} pulse={!error} />
            <button
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="cursor-pointer p-2 rounded-lg border border-[var(--border-ui)] bg-[var(--bg-card)] hover:bg-[var(--bg-card-alt)] hover:border-[#6a29e1]/40 transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6a29e1]/50"
            >
              {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
            </button>
            <button
              onClick={() => fetchData(true)}
              disabled={refreshing}
              aria-label="Refresh dashboard data"
              className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border-ui)] bg-[var(--bg-card)] text-xs font-semibold hover:bg-[var(--bg-card-alt)] hover:border-[#6a29e1]/50 transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6a29e1]/50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
              {refreshing ? 'Loading…' : 'Refresh'}
            </button>
          </div>
        </header>

        {error && (
          <div className="mb-6 rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 flex items-center gap-3 text-sm text-rose-200">
            <AlertTriangle size={16} className="shrink-0" />
            <span>Connection error — failed to reach the collector API. Retrying every 10s.</span>
          </div>
        )}

        {/* Tab content — key triggers fade-in on tab switch */}
        <div key={activeTab} className="animate-fade-in-up">
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
          {activeTab === 'machines' && <MachineStatusView machines={machines} onDelete={setMachineToDelete} getBaseUrl={getBaseUrl} />}
          {activeTab === 'enforcement' && <EnforcementView data={enforcement} getBaseUrl={getBaseUrl} onRefresh={fetchData} />}
          {activeTab === 'users' && <UserManagementTab getBaseUrl={getBaseUrl} />}
        </div>

        {/* delete modal */}
        {machineToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
            <div className="bg-[var(--bg-card)] border border-[var(--border-ui)] rounded-2xl p-6 max-w-md w-full shadow-2xl animate-scale-in">
              <div className="flex items-start gap-4 mb-5">
                <div className="flex-shrink-0 p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-xl">
                  <AlertTriangle size={18} className="text-rose-400" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-[15px] font-bold text-[var(--text-main)]">Remove workstation</h2>
                  <p className="text-sm text-[var(--text-muted)] mt-1.5 leading-relaxed">
                    Remove{' '}
                    <code className="font-mono text-[var(--text-main)] bg-[var(--bg-card-alt)] px-1.5 py-0.5 rounded text-xs">
                      {machineToDelete}
                    </code>{' '}
                    from the dashboard? It will reappear on its next heartbeat.
                  </p>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setMachineToDelete(null)}
                  className="cursor-pointer px-4 py-2 text-sm rounded-lg border border-[var(--border-ui)] bg-[var(--bg-card-alt)] hover:bg-[var(--border-ui)] transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteMachine}
                  className="cursor-pointer px-4 py-2 text-sm rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold transition-colors"
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ─── Mobile bottom nav ──────────────────────────────────────── */}
      <MobileNav activeTab={activeTab} setActiveTab={setActiveTab} />

    </div>
    </>
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
        <Tile index={0} title="Total Sessions"    value={(stats?.totalLogs || 0).toLocaleString()}       tone="brand"   icon={<Globe size={13} />} />
        <Tile index={1} title="Policy Violations" value={(stats?.totalViolations || 0).toLocaleString()} tone="danger"  icon={<AlertTriangle size={13} />} sub={`${detectionRatio}% of traffic flagged`} />
        <Tile index={2} title="Active Machines"   value={`${onlineCount} / ${machines.length || stats?.uniqueMachines || 0}`} tone="success" icon={<Monitor size={13} />} sub="Heartbeat within 2 min" />
        <Tile index={3} title="Detection Ratio"   value={`${detectionRatio}%`} tone="info" icon={<TrendingUp size={13} />} />
      </div>

      {/* bandwidth banner */}
      {highBandwidthMachines.length > 0 && (
        <Panel className="border-amber-500/30 glow-warn">
          <PanelHeader
            accent="warn"
            title="High Bandwidth Utilization"
            subtitle={`${highBandwidthMachines.length} workstation${highBandwidthMachines.length === 1 ? '' : 's'} above 10 MB/min`}
            right={<Gauge size={14} className="text-amber-300 animate-pulse" />}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 p-3">
            {highBandwidthMachines.map((m) => (
              <div key={`bw-${m.machine_id}`} className="bg-amber-500/5 border border-amber-500/25 rounded-lg px-4 py-3 hover:bg-amber-500/10 transition-colors duration-150">
                <div className="flex justify-between items-center mb-2">
                  <StatusPill tone="warn" label="Heavy" pulse />
                  <span className="text-[10px] text-[var(--text-muted)] font-[var(--font-geist-mono)]">
                    {fmtESTShort(m.last_seen)}
                  </span>
                </div>
                <div className="text-xl font-bold text-amber-300 tabular-nums font-[var(--font-geist-mono)]">{formatBytes(m.current_bandwidth)}<span className="text-sm font-medium text-amber-400/70">/min</span></div>
                <div className="mt-1.5 flex items-center gap-2 text-[11px] text-[var(--text-muted)] font-[var(--font-geist-mono)]">
                  <span className="truncate">{m.machine_id}</span>
                  <span className="text-[#c4b5fd] shrink-0">{m.username || 'unknown'}</span>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* violation alerts */}
      {recentViolations.length > 0 && (
        <Panel className="border-rose-500/30 glow-danger">
          <PanelHeader
            accent="danger"
            title="Active Violation Alerts"
            subtitle={`${recentViolations.length} most recent · ${logs.filter((l) => l.violation).length} total in feed`}
            right={<AlertTriangle size={14} className="text-rose-300 animate-pulse" />}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 p-3">
            {recentViolations.map((alert) => (
              <div key={alert.id} className="bg-rose-500/5 border border-rose-500/20 rounded-lg px-4 py-3 hover:bg-rose-500/10 transition-colors duration-150">
                <div className="flex justify-between items-center mb-1.5">
                  <CategoryTag category={alert.category} />
                  <span className="text-[10px] text-[var(--text-muted)] font-[var(--font-geist-mono)]">
                    {fmtESTShort(alert.timestamp)}
                  </span>
                </div>
                <div className="text-sm font-bold text-[var(--text-main)] truncate">{alert.domain}</div>
                <div className="mt-1.5 flex items-center gap-2 text-[11px] text-[var(--text-muted)] font-[var(--font-geist-mono)]">
                  <span className="truncate">{alert.machine_id}</span>
                  <span className="text-rose-300 shrink-0">{alert.username || 'unknown'}</span>
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
              <BarChart data={stats?.topDomains || []} margin={{ top: 4, right: 4, bottom: 0, left: -8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-ui)" vertical={false} />
                <XAxis
                  dataKey="domain"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: 'var(--text-muted)', fontWeight: 500 }}
                />
                <YAxis
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: 'var(--text-muted)' }}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(106,41,225,0.06)' }}
                  contentStyle={{
                    backgroundColor: 'var(--bg-card)',
                    border: '1px solid var(--border-ui)',
                    borderRadius: '10px',
                    color: 'var(--text-main)',
                    fontSize: '12px',
                    boxShadow: '0 16px 40px rgba(0,0,0,0.5)',
                    fontWeight: 500,
                  }}
                  itemStyle={{ color: '#a78bfa' }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={44} animationDuration={700} animationEasing="ease-out">
                  {(stats?.topDomains || []).map((_: any, i: number) => (
                    <Cell key={i} fill={i === 0 ? '#6a29e1' : i === 1 ? '#4a1fa1' : '#2e1470'} fillOpacity={i === 0 ? 1 : 0.75} />
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
                      {fmtESTTime(log.timestamp)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </Panel>
      </div>

      {/* bandwidth history */}
      <Panel className="animate-fade-in-up" style={{ animationDelay: '180ms' }}>
        <PanelHeader
          accent="warn"
          title="Recent Bandwidth Violations"
          subtitle="Workstations exceeding the per-minute byte threshold"
        />
        <div className="overflow-x-auto">
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
                  {fmtEST(v.timestamp)}
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
        </div>
      </Panel>
    </div>
  );
}

// ─── fleet tab ────────────────────────────────────────────────────────────
const PAGE_SIZE = 15;

function MachineStatusView({
  machines,
  onDelete,
  getBaseUrl,
}: {
  machines: any[];
  onDelete: (id: string) => void;
  getBaseUrl: () => string;
}) {
  const isOnline = (lastSeen: string) => new Date().getTime() - new Date(lastSeen).getTime() < 120_000;

  const onlineCount  = machines.filter((m) => isOnline(m.last_seen)).length;
  const offlineCount = machines.length - onlineCount;

  /* ── Filter / pagination state ── */
  const [fleetSearch, setFleetSearch]             = useState('');
  const [teamLeads, setTeamLeads]                 = useState<any[]>([]);
  const [selectedTL, setSelectedTL]               = useState<string>('');   // team lead id, '' = all
  const [tlAgents, setTlAgents]                   = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage]             = useState(0);

  /* ── Inspect state ── */
  // Returns today's date in EST (UTC−5) as YYYY-MM-DD
  const todayStr = () => new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [inspectMachine, setInspectMachine]       = useState<any | null>(null);
  const [inspectDetail, setInspectDetail]         = useState<any | null>(null);
  const [inspectLogs, setInspectLogs]             = useState<any[]>([]);
  const [inspectLoading, setInspectLoading]       = useState(false);
  const [inspectLogFilter, setInspectLogFilter]   = useState<'all' | 'violations'>('all');
  const [inspectLogPage, setInspectLogPage]       = useState(0);
  const [inspectHasMore, setInspectHasMore]       = useState(true);
  const [inspectLogsLoading, setInspectLogsLoading] = useState(false);
  const [inspectDate, setInspectDate]             = useState<string>(todayStr());
  const [urlTooltip, setUrlTooltip]               = useState<{ url: string; x: number; y: number } | null>(null);
  const LOG_PAGE_SIZE = 15;

  /* ── Load team leads on mount ── */
  useEffect(() => {
    fetch(`${getBaseUrl()}/api/team-leads`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : [])
      .then(setTeamLeads)
      .catch(() => {});
  }, []);

  /* ── When TL selection changes, rebuild the agent email set & reset page ── */
  useEffect(() => {
    if (!selectedTL) {
      setTlAgents(new Set());
    } else {
      const tl = teamLeads.find(t => String(t.id) === selectedTL);
      setTlAgents(new Set((tl?.agents ?? []) as string[]));
    }
    setCurrentPage(0);
  }, [selectedTL, teamLeads]);

  /* ── Reset page when search changes ── */
  useEffect(() => { setCurrentPage(0); }, [fleetSearch]);

  /* ── Lock body scroll while inspect modal is open ── */
  useEffect(() => {
    document.body.style.overflow = inspectMachine ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [inspectMachine]);

  const openInspect = async (machine: any) => {
    setInspectMachine(machine);
    setInspectDetail(null);
    setInspectLogs([]);
    setInspectLogPage(0);
    setInspectHasMore(false);
    setInspectLogFilter('all');
    setInspectDate(todayStr());
    setInspectLoading(true);
    try {
      const email = encodeURIComponent(machine.username);
      const base  = getBaseUrl();

      // Fetch stats first to get the agent's last active date
      const statsRes = await fetch(`${base}/api/agents/${email}/stats`, { cache: 'no-store' });
      let activeDate = todayStr();
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setInspectDetail(statsData);
        // Use last activity date so the log opens with actual data, not an empty "today"
        if (statsData?.overview?.last_activity) {
          // Convert last_activity UTC timestamp → EST date (UTC−5)
          activeDate = new Date(new Date(statsData.overview.last_activity).getTime() - 5 * 60 * 60 * 1000)
            .toISOString().slice(0, 10);
        }
      }
      setInspectDate(activeDate);

      // Now fetch logs for the resolved active date
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

  // Always replaces the current page (no append — pure page navigation)
  const fetchInspectLogs = async (filter: 'all' | 'violations', page: number, date: string) => {
    if (!inspectMachine) return;
    setInspectLogsLoading(true);
    try {
      const email  = encodeURIComponent(inspectMachine.username);
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

  const handleFilterChange = (f: 'all' | 'violations') => {
    setInspectLogFilter(f);
    setInspectLogPage(0);
    fetchInspectLogs(f, 0, inspectDate);
  };

  const handleDateChange = (d: string) => {
    setInspectDate(d);
    setInspectLogPage(0);
    fetchInspectLogs(inspectLogFilter, 0, d);
  };

  const handleLogPageChange = (newPage: number) => {
    setInspectLogPage(newPage);
    fetchInspectLogs(inspectLogFilter, newPage, inspectDate);
  };

  /* ── Derived lists ── */
  const filtered = machines.filter(m => {
    const matchSearch =
      !fleetSearch ||
      (m.machine_id || '').toLowerCase().includes(fleetSearch.toLowerCase()) ||
      (m.username   || '').toLowerCase().includes(fleetSearch.toLowerCase()) ||
      (m.ip_address || '').toLowerCase().includes(fleetSearch.toLowerCase());
    const matchTL =
      !selectedTL || tlAgents.has(m.username || '');
    return matchSearch && matchTL;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage   = Math.min(currentPage, totalPages - 1);
  const paginated  = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const selectedTLName = teamLeads.find(t => String(t.id) === selectedTL)?.name ?? '';

  return (
    <div className="space-y-3">
      {/* ── KPI tiles ── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <Tile index={0} title="Total Workstations" value={machines.length} tone="brand" icon={<Monitor size={13} />} />
        <Tile index={1} title="Online"  value={onlineCount}  tone="success" sub="Heartbeat within 2 min" />
        <Tile index={2} title="Offline" value={offlineCount} tone="neutral" />
        <Tile
          index={3}
          title="Avg Bandwidth"
          value={machines.length ? formatBytes(machines.reduce((s, m) => s + (m.current_bandwidth || 0), 0) / machines.length) + '/min' : '0 B/min'}
          tone="info"
          icon={<Gauge size={13} />}
        />
      </div>

      {/* ── Fleet table ── */}
      <Panel className="animate-fade-in-up" style={{ animationDelay: '80ms' }}>
        <PanelHeader
          title="Workstation Fleet"
          subtitle={
            selectedTL
              ? `${filtered.length} agent${filtered.length !== 1 ? 's' : ''} under ${selectedTLName}`
              : `${filtered.length} of ${machines.length} workstation${machines.length === 1 ? '' : 's'}`
          }
        />

        {/* ── Filter bar ── */}
        <div className="px-4 py-3 border-b border-[var(--border-ui)] flex flex-wrap items-center gap-2.5">

          {/* Team Lead dropdown */}
          <div className="relative">
            <Users size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
            <select
              value={selectedTL}
              onChange={e => setSelectedTL(e.target.value)}
              className="cursor-pointer appearance-none bg-[var(--bg-page)] border border-[var(--border-ui)] rounded-lg pl-7 pr-7 py-1.5 text-xs text-[var(--text-main)] focus:outline-none focus:border-[#6a29e1]/60 transition-colors min-w-[160px]"
            >
              <option value="">All Team Leaders</option>
              {teamLeads.map(tl => (
                <option key={tl.id} value={String(tl.id)}>
                  {tl.name} ({tl.agents?.length ?? 0})
                </option>
              ))}
            </select>
            <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
          </div>

          {/* Text search */}
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
            <input
              type="text"
              placeholder="Search machine, email, IP…"
              value={fleetSearch}
              onChange={e => setFleetSearch(e.target.value)}
              className="bg-[var(--bg-page)] border border-[var(--border-ui)] rounded-lg pl-7 pr-7 py-1.5 text-xs text-[var(--text-main)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[#6a29e1]/60 transition-colors w-52"
            />
            {fleetSearch && (
              <button
                onClick={() => setFleetSearch('')}
                className="cursor-pointer absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-main)]"
              >
                <X size={11} />
              </button>
            )}
          </div>

          {/* Active filter badges */}
          {selectedTL && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border border-[#6a29e1]/40 bg-[#6a29e1]/10 text-[#c4b5fd]">
              <Users size={9} />
              {selectedTLName}
              <button
                onClick={() => setSelectedTL('')}
                className="cursor-pointer ml-0.5 hover:text-white transition-colors"
                aria-label="Clear team leader filter"
              >
                <X size={9} />
              </button>
            </span>
          )}

          {/* Result count on the right */}
          <span className="ml-auto text-[11px] text-[var(--text-muted)] tabular-nums">
            {filtered.length} result{filtered.length !== 1 ? 's' : ''}
            {totalPages > 1 && ` · page ${safePage + 1} of ${totalPages}`}
          </span>
        </div>

        {/* ── Table ── */}
        <div className="overflow-x-auto">
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
              {paginated.map((m) => {
                const online     = isOnline(m.last_seen);
                const heavy      = m.current_bandwidth > 10 * 1024 * 1024;
                const canInspect = !!(m.username);
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
                      {fmtEST(m.last_seen)}
                    </td>
                    <td className={`${TD} text-right`}>
                      <div className="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                        {canInspect && (
                          <button
                            onClick={() => openInspect(m)}
                            aria-label={`Inspect agent ${m.username}`}
                            className="cursor-pointer flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold border border-[#6a29e1]/40 bg-[#6a29e1]/10 text-[#c4b5fd] hover:bg-[#6a29e1]/25 hover:border-[#6a29e1]/70 transition-all duration-150"
                          >
                            <Search size={11} />
                            Inspect
                          </button>
                        )}
                        <button
                          onClick={() => onDelete(m.machine_id)}
                          aria-label={`Remove workstation ${m.machine_id}`}
                          className="cursor-pointer p-1.5 text-[var(--text-muted)] hover:text-rose-300 hover:bg-rose-500/10 rounded-md transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {paginated.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-xs text-[var(--text-muted)] italic">
                    {fleetSearch || selectedTL
                      ? 'No workstations match the current filters.'
                      : 'No workstations detected yet. Ensure extensions are active.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ── Pagination footer ── */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-[var(--border-ui)] flex items-center justify-between gap-3">
            {/* Prev */}
            <button
              onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
              disabled={safePage === 0}
              className="cursor-pointer flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--border-ui)] bg-[var(--bg-card-alt)] text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-main)] hover:border-[#6a29e1]/40 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150"
            >
              <ChevronLeft size={13} />
              Previous
            </button>

            {/* Page numbers */}
            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => {
                const showPage =
                  i === 0 ||
                  i === totalPages - 1 ||
                  Math.abs(i - safePage) <= 1;
                const showEllipsisBefore = i === safePage - 2 && safePage > 2;
                const showEllipsisAfter  = i === safePage + 2 && safePage < totalPages - 3;
                if (showEllipsisBefore || showEllipsisAfter) {
                  return <span key={i} className="px-1 text-[var(--text-muted)] text-xs">…</span>;
                }
                if (!showPage) return null;
                return (
                  <button
                    key={i}
                    onClick={() => setCurrentPage(i)}
                    className={`cursor-pointer w-7 h-7 rounded-md text-xs font-semibold transition-all duration-150 ${
                      i === safePage
                        ? 'bg-[#6a29e1] text-white shadow-sm shadow-[#6a29e1]/40'
                        : 'border border-[var(--border-ui)] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:border-[#6a29e1]/40'
                    }`}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>

            {/* Next */}
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={safePage === totalPages - 1}
              className="cursor-pointer flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--border-ui)] bg-[var(--bg-card-alt)] text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-main)] hover:border-[#6a29e1]/40 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150"
            >
              Next
              <ChevronRight size={13} />
            </button>
          </div>
        )}
      </Panel>

      {/* ── Inspect Modal — rendered via portal so fixed inset-0 is always relative to the true viewport ── */}
      {inspectMachine && createPortal(
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full sm:max-w-4xl h-[90dvh] sm:h-[90vh] bg-[var(--bg-card)] rounded-t-2xl sm:rounded-2xl border border-[var(--border-ui)] shadow-2xl flex flex-col animate-scale-in">

            {/* Modal header */}
            <div className="shrink-0 px-5 py-4 border-b border-[var(--border-ui)] bg-[var(--bg-card-alt)]/80 flex items-center gap-3">
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#6a29e1]/50 to-transparent" />
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#6a29e1] to-[#3b2470] flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-md">
                {(inspectMachine.username || inspectMachine.machine_id || '?')[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-0.5">
                  <span className="text-sm font-bold text-[var(--text-main)] truncate">{inspectMachine.username || inspectMachine.machine_id}</span>
                  <StatusPill
                    tone={isOnline(inspectMachine.last_seen) ? 'success' : 'neutral'}
                    label={isOnline(inspectMachine.last_seen) ? 'Online' : 'Offline'}
                    pulse={isOnline(inspectMachine.last_seen)}
                  />
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-[var(--text-muted)] font-mono">
                  <span>{inspectMachine.machine_id}</span>
                  {inspectMachine.ip_address && <span>{inspectMachine.ip_address.replace('::ffff:', '')}</span>}
                  {(() => {
                    const tl = teamLeads.find(t => t.agents?.includes(inspectMachine.username));
                    return tl ? <span>TL · <span className="text-[#c4b5fd]">{tl.name}</span></span> : null;
                  })()}
                </div>
              </div>
              <button
                onClick={() => setInspectMachine(null)}
                aria-label="Close inspect panel"
                className="cursor-pointer shrink-0 p-1.5 rounded-md border border-[var(--border-ui)] bg-[var(--bg-card)] hover:bg-[var(--bg-card-alt)] transition-colors text-[var(--text-muted)] hover:text-[var(--text-main)]"
              >
                <X size={14} />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 space-y-4">
              {inspectLoading ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[0,1,2,3].map(i => <SkeletonTile key={i} />)}
                  </div>
                  <div className="skeleton h-[200px] rounded-xl" />
                  <div className="skeleton h-[300px] rounded-xl" />
                </div>
              ) : (
                <>
                  {/* Stat tiles */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {(() => {
                      const total = inspectDetail?.overview?.total_sessions  || 0;
                      const viols = inspectDetail?.overview?.total_violations || 0;
                      const ratio = viols / Math.max(total, 1);
                      return [
                        { title: 'Total Sessions',  value: total.toLocaleString(),        tone: 'brand'   as Tone, icon: <Globe size={13} /> },
                        { title: 'Violations',       value: viols.toLocaleString(),        tone: 'danger'  as Tone, icon: <AlertTriangle size={13} />, sub: `${(ratio*100).toFixed(1)}% of sessions` },
                        { title: 'Violation Ratio',  value: `${(ratio*100).toFixed(1)}%`,  tone: (ratio > 0.3 ? 'danger' : ratio > 0.1 ? 'warn' : 'success') as Tone, icon: <TrendingUp size={13} /> },
                        { title: 'Total Bandwidth',  value: formatBytes(inspectMachine.total_bandwidth || 0), tone: 'info' as Tone, icon: <Gauge size={13} /> },
                      ];
                    })().map((tile, i) => (
                      <div key={i} className="relative bg-[var(--bg-card-alt)] border border-[var(--border-ui)] rounded-xl p-4 overflow-hidden">
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

                  {/* Top domains chart + category breakdown */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-2 bg-[var(--bg-card-alt)] border border-[var(--border-ui)] rounded-xl overflow-hidden">
                      <div className="px-4 py-3 border-b border-[var(--border-ui)] flex items-center gap-2">
                        <span className="w-[3px] h-4 rounded-full bg-[#6a29e1] shrink-0" />
                        <span className="text-xs font-semibold text-[var(--text-main)]">Top Visited Domains</span>
                        <span className="text-[10px] text-[var(--text-muted)] ml-1">— red bars are flagged sites</span>
                      </div>
                      <div className="p-4 h-[210px]">
                        {(inspectDetail?.topDomains || []).length === 0 ? (
                          <div className="h-full flex items-center justify-center text-xs text-[var(--text-muted)] italic">No domain data yet.</div>
                        ) : (
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={inspectDetail.topDomains} layout="vertical" margin={{ left: 8, right: 24, top: 2, bottom: 2 }}>
                              <XAxis type="number" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                              <YAxis type="category" dataKey="domain" stroke="#64748b" fontSize={9} tickLine={false} axisLine={false} width={105} />
                              <Tooltip
                                cursor={{ fill: 'rgba(106,41,225,0.05)' }}
                                contentStyle={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-ui)', borderRadius: '8px', color: 'var(--text-main)', fontSize: '11px' }}
                                itemStyle={{ color: '#a78bfa' }}
                              />
                              <Bar dataKey="count" radius={[0, 3, 3, 0]}>
                                {(inspectDetail?.topDomains || []).map((d: any, i: number) => (
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
                      <div className="p-4 space-y-3">
                        {(inspectDetail?.categoryBreakdown || []).length === 0 ? (
                          <div className="py-8 text-center text-xs text-[var(--text-muted)] italic">No flagged categories.</div>
                        ) : (
                          (inspectDetail.categoryBreakdown as any[]).map((cat: any) => {
                            const info = getCategory(cat.category);
                            const t    = TONE[info.tone];
                            const max  = (inspectDetail.categoryBreakdown as any[])[0]?.count || 1;
                            return (
                              <div key={cat.category}>
                                <div className="flex justify-between mb-1">
                                  <span className={`text-[10px] font-bold uppercase tracking-widest ${t.text}`}>{info.label}</span>
                                  <span className="text-[10px] font-mono text-[var(--text-main)] tabular-nums">{cat.count}</span>
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

                      {/* Violation filter toggle */}
                      <button
                        onClick={() => handleFilterChange('all')}
                        className={`cursor-pointer px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all ${
                          inspectLogFilter === 'all'
                            ? 'bg-[#6a29e1]/20 text-[#c4b5fd] border border-[#6a29e1]/40'
                            : 'text-[var(--text-muted)] hover:text-[var(--text-main)] border border-transparent'
                        }`}
                      >
                        All
                      </button>
                      <button
                        onClick={() => handleFilterChange('violations')}
                        className={`cursor-pointer flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all ${
                          inspectLogFilter === 'violations'
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                            : 'text-[var(--text-muted)] hover:text-[var(--text-main)] border border-transparent'
                        }`}
                      >
                        <Filter size={9} />Violations Only
                      </button>

                      {/* Date picker */}
                      <div className="sm:ml-auto flex items-center gap-1.5 w-full sm:w-auto">
                        <Clock size={11} className="text-[var(--text-muted)] shrink-0" />
                        <input
                          type="date"
                          value={inspectDate}
                          max={todayStr()}
                          onChange={e => e.target.value && handleDateChange(e.target.value)}
                          className="cursor-pointer bg-[var(--bg-page)] border border-[var(--border-ui)] rounded-md px-2 py-1 text-[11px] text-[var(--text-main)] focus:outline-none focus:border-[#6a29e1]/60 transition-colors"
                        />
                        {inspectDate !== todayStr() && (
                          <button
                            onClick={() => handleDateChange(todayStr())}
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
                              <td colSpan={4} className="px-4 py-10 text-center text-xs text-[var(--text-muted)] italic">
                                {inspectLogFilter === 'violations'
                                  ? `No violations on ${inspectDate}.`
                                  : `No browsing activity on ${inspectDate}.`}
                              </td>
                            </tr>
                          ) : (
                            inspectLogs.map((log: any) => (
                              <tr key={log.id} className={`transition-colors ${log.violation ? 'hover:bg-rose-500/5 border-l-2 border-rose-500/40' : 'hover:bg-[var(--bg-card)]/40 border-l-2 border-transparent'}`}>
                                <td className={`${TD} cursor-default`}
                                  onMouseEnter={e => {
                                    if (log.full_url) {
                                      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                      setUrlTooltip({ url: log.full_url, x: r.left, y: r.bottom + 6 });
                                    }
                                  }}
                                  onMouseLeave={() => setUrlTooltip(null)}
                                >
                                  <span className={`font-medium text-sm truncate max-w-[180px] block ${log.violation ? 'text-rose-300' : 'text-[var(--text-main)]'}`}>{log.domain}</span>
                                </td>
                                <td className={TD}>
                                  {log.violation ? <CategoryTag category={log.category} /> : <span className="text-[var(--text-muted)] text-xs">—</span>}
                                </td>
                                <td className={TD}>
                                  <span className="font-mono text-[11px] text-[var(--text-muted)]">{log.machine_id || '—'}</span>
                                </td>
                                <td className={`${TD} font-mono text-[11px] text-[var(--text-muted)] whitespace-nowrap`}>
                                  {fmtEST(log.timestamp)}
                                </td>
                              </tr>
                            ))
                          )}
                          {inspectLogsLoading && Array.from({ length: 5 }).map((_, i) => (
                            <tr key={`sk-${i}`}>
                              {[180, 80, 100, 130].map((w, j) => (
                                <td key={j} className="px-4 py-3"><div className="skeleton h-2.5 rounded" style={{ width: w }} /></td>
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
                          onClick={() => handleLogPageChange(inspectLogPage - 1)}
                          disabled={inspectLogPage === 0 || inspectLogsLoading}
                          className="cursor-pointer flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--border-ui)] bg-[var(--bg-card)] text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-main)] hover:border-[#6a29e1]/40 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150"
                        >
                          <ChevronLeft size={13} />Previous
                        </button>
                        <span className="text-[11px] text-[var(--text-muted)] tabular-nums">
                          Page {inspectLogPage + 1}
                        </span>
                        <button
                          onClick={() => handleLogPageChange(inspectLogPage + 1)}
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
        </div>,
        document.body
      )}

      {/* ── URL tooltip — portal so it escapes overflow-hidden containers ── */}
      {urlTooltip && createPortal(
        <div
          className="fixed z-[9999] pointer-events-none"
          style={{ left: urlTooltip.x, top: urlTooltip.y }}
        >
          <div className="bg-[var(--bg-card)] border border-[var(--border-ui)] rounded-lg px-3 py-2.5 shadow-2xl max-w-[440px] min-w-[200px]">
            <p className="text-[9px] font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-1.5">Full URL</p>
            <p className="text-[11px] text-[var(--text-main)] font-mono break-all leading-relaxed">{urlTooltip.url}</p>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ─── enforcement tab ──────────────────────────────────────────────────────
const BUILTIN_CATEGORIES = ['social', 'gambling', 'streaming', 'ph_shopping', 'adult', 'manual'];

function EnforcementView({ data, getBaseUrl, onRefresh }: { data: any; getBaseUrl: () => string; onRefresh: () => void }) {
  const [domainRaw, setDomainRaw] = useState('');
  const [domainCategory, setDomainCategory] = useState('manual');
  const [domainSaving, setDomainSaving] = useState(false);
  const [domainError, setDomainError] = useState('');
  const [domainResult, setDomainResult] = useState<{ added: number; duplicates: string[] } | null>(null);
  const [newCatName, setNewCatName] = useState('');
  const [catSaving, setCatSaving] = useState(false);
  const [catError, setCatError] = useState('');
  const [toggling, setToggling] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  /* ── Domain drill-down ── */
  const [drillDomain, setDrillDomain]               = useState<string | null>(null);
  const [drillDomainCat, setDrillDomainCat]         = useState('');
  const [drillDomainLogs, setDrillDomainLogs]       = useState<any[]>([]);
  const [drillDomainLoading, setDrillDomainLoading] = useState(false);
  const [drillDomainError, setDrillDomainError]     = useState<string | null>(null);

  /* ── Agent violations drill-down ── */
  const [drillAgent, setDrillAgent]                 = useState<any | null>(null);
  const [drillAgentLogs, setDrillAgentLogs]         = useState<any[]>([]);
  const [drillAgentLoading, setDrillAgentLoading]   = useState(false);
  const [drillAgentPage, setDrillAgentPage]         = useState(0);
  const [drillAgentHasMore, setDrillAgentHasMore]   = useState(false);
  const DRILL_PAGE = 15;

  const [viewCat, setViewCat]                     = useState<string | null>(null);
  const [viewCatDomains, setViewCatDomains]       = useState<string[]>([]);
  const [viewCatTotal, setViewCatTotal]           = useState(0);
  const [viewCatPage, setViewCatPage]             = useState(0);
  const [viewCatLoading, setViewCatLoading]       = useState(false);
  const [viewCatSearch, setViewCatSearch]         = useState('');
  const VIEW_PAGE_SIZE = 100;

  useEffect(() => {
    if (!drillDomain) return;
    setDrillDomainLoading(true);
    setDrillDomainLogs([]);
    setDrillDomainError(null);
    const url = `${getBaseUrl()}/api/logs/domain/${encodeURIComponent(drillDomain)}?limit=500`;
    fetch(url)
      .then(r => {
        if (!r.ok) throw new Error(`Server returned ${r.status} for ${url}`);
        return r.json();
      })
      .then(d => setDrillDomainLogs(Array.isArray(d) ? d : []))
      .catch(e => { console.error('[domain drill]', e); setDrillDomainError(e.message); })
      .finally(() => setDrillDomainLoading(false));
  }, [drillDomain]);

  useEffect(() => {
    if (!drillAgent) return;
    setDrillAgentLoading(true);
    setDrillAgentLogs([]);
    const off = drillAgentPage * DRILL_PAGE;
    fetch(`${getBaseUrl()}/api/agents/${encodeURIComponent(drillAgent.username)}/violations?limit=${DRILL_PAGE + 1}&offset=${off}`)
      .then(r => r.json())
      .then(rows => {
        const arr = Array.isArray(rows) ? rows : [];
        setDrillAgentHasMore(arr.length > DRILL_PAGE);
        setDrillAgentLogs(arr.slice(0, DRILL_PAGE));
      })
      .catch(() => setDrillAgentLogs([]))
      .finally(() => setDrillAgentLoading(false));
  }, [drillAgent, drillAgentPage]);

  useEffect(() => {
    document.body.style.overflow = (drillDomain || drillAgent) ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [drillDomain, drillAgent]);

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
    setDomainResult(null);
    if (!parsedDomains.length) { setDomainError('Enter at least one domain.'); return; }
    setDomainSaving(true);
    try {
      const res = await fetch(`${getBaseUrl()}/api/enforcement/domains`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domains: parsedDomains, category: domainCategory }),
      });
      if (res.ok) {
        const d = await res.json();
        setDomainRaw('');
        setDomainResult({ added: d.added ?? 0, duplicates: d.duplicates ?? [] });
        onRefresh();
      } else {
        const d = await res.json().catch(() => ({}));
        setDomainError(d.error || `Error ${res.status}`);
      }
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

  const fetchViewCatPage = async (cat: string, search: string, page: number) => {
    setViewCatLoading(true);
    const params = new URLSearchParams({
      category: cat,
      limit: String(VIEW_PAGE_SIZE),
      offset: String(page * VIEW_PAGE_SIZE),
      ...(search ? { search } : {}),
    });
    try {
      const res = await fetch(`${getBaseUrl()}/api/enforcement/domains?${params}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setViewCatDomains(data.domains ?? []);
        setViewCatTotal(data.total ?? 0);
      }
    } catch {}
    setViewCatLoading(false);
  };

  const openViewCat = (cat: string) => {
    setViewCat(cat);
    setViewCatSearch('');
    setViewCatPage(0);
    setViewCatDomains([]);
    setViewCatTotal(0);
    fetchViewCatPage(cat, '', 0);
  };

  const removeDomainFromView = async (domain: string) => {
    setRemoving(domain);
    try {
      await fetch(`${getBaseUrl()}/api/enforcement/domains/${encodeURIComponent(domain)}`, { method: 'DELETE' });
      setViewCatDomains(prev => prev.filter(d => d !== domain));
      setViewCatTotal(prev => Math.max(0, prev - 1));
      onRefresh();
    } finally { setRemoving(null); }
  };

  const normalizedViewSearch = viewCatSearch.trim().toLowerCase()
    .replace(/^https?:\/\//, '').replace(/\/.*$/, '');

  const viewCatTotalPages = Math.max(1, Math.ceil(viewCatTotal / VIEW_PAGE_SIZE));

  return (
    <>
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Tile index={0} title="Blocked Domains"   value={totalBlockedDomains.toLocaleString()} tone="brand"   icon={<ShieldCheck size={13} />} />
        <Tile index={1} title="Active Categories" value={enabledCategories.length}              tone="success" icon={<ListChecks size={13} />} />
        <Tile index={2} title="Manual Entries"    value={manualBlacklist.length}                tone="danger"  icon={<AlertTriangle size={13} />} />
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
                onChange={e => { setDomainRaw(e.target.value); setDomainResult(null); }}
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
          {domainResult && (
            <div className="space-y-1.5">
              {domainResult.added > 0 && (
                <p className="flex items-center gap-2 text-xs text-emerald-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                  {domainResult.added} domain{domainResult.added !== 1 ? 's' : ''} added to <span className="font-mono text-[#c4b5fd]">{domainCategory}</span>.
                </p>
              )}
              {domainResult.duplicates.length > 0 && (
                <div>
                  <p className="flex items-center gap-2 text-xs text-amber-300 mb-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                    {domainResult.duplicates.length} domain{domainResult.duplicates.length !== 1 ? 's were' : ' was'} already in <span className="font-mono text-[#c4b5fd]">{domainCategory}</span>:
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {domainResult.duplicates.map(d => (
                      <span key={d} className="px-2 py-0.5 bg-amber-500/10 border border-amber-500/30 rounded text-[11px] font-mono text-amber-300">{d}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
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
                <Clock size={11} /> {fmtESTShort(lastSyncedAt)}
              </span>
            )
          }
        />
        <div className="overflow-x-auto">
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
                      <button
                        onClick={() => openViewCat(cat)}
                        className="cursor-pointer flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md border border-[var(--border-ui)] text-[var(--text-muted)] hover:text-[#c4b5fd] hover:border-[#6a29e1]/40 hover:bg-[#6a29e1]/10 transition-colors"
                        title={`View domains in ${cat}`}
                      >
                        <Eye size={11} />
                        View
                      </button>
                      {cat !== 'manual' && (
                        <button
                          onClick={() => toggleCategory(cat)}
                          disabled={busy}
                          className={`cursor-pointer px-2.5 py-1 text-[11px] font-medium rounded-md border transition-colors disabled:opacity-40 ${
                            isOn
                              ? 'border-rose-500/30 text-rose-300 hover:bg-rose-500/10'
                              : 'border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10'
                          }`}
                        >
                          {busy ? '…' : isOn ? 'Disable' : 'Enable'}
                        </button>
                      )}
                      <button
                        onClick={() => {
                          if (isBuiltin) {
                            setCatError('Built-in categories cannot be deleted.');
                            setTimeout(() => setCatError(''), 3000);
                            return;
                          }
                          deleteCategory(cat);
                        }}
                        disabled={busy}
                        className="cursor-pointer p-1.5 text-[var(--text-muted)] hover:text-rose-300 hover:bg-rose-500/10 rounded-md transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-40"
                        title={isBuiltin ? 'Built-in categories cannot be deleted' : 'Delete category and all its domains'}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        </div>
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
          <div className="overflow-x-auto">
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
                <tr key={d.domain} onClick={() => { setDrillDomain(d.domain); setDrillDomainCat(d.category); }} className="cursor-pointer hover:bg-rose-500/10 transition-colors duration-150 group">
                  <td className={TD}><span className="font-mono text-xs text-[var(--text-main)] group-hover:text-rose-300 transition-colors truncate">{d.domain}</span></td>
                  <td className={TD}><CategoryTag category={d.category} /></td>
                  <td className={`${TD} text-right`}><span className="text-rose-300 font-bold tabular-nums">{d.count}</span></td>
                </tr>
              ))}
              {topOffendingDomains.length === 0 && (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-xs text-[var(--text-muted)] italic">No policy violations recorded.</td></tr>
              )}
            </tbody>
          </table>
          </div>
        </Panel>

        <Panel>
          <PanelHeader accent="brand" title="Top Offending Agents" subtitle="Users with the most flagged events" />
          <div className="overflow-x-auto">
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
                <tr key={u.username} onClick={() => { setDrillAgent(u); setDrillAgentPage(0); }} className="cursor-pointer hover:bg-[#6a29e1]/10 transition-colors duration-150 group">
                  <td className={TD}><span className="text-[#c4b5fd] font-mono text-xs group-hover:text-white transition-colors">{u.username}</span></td>
                  <td className={TD}><span className="font-mono text-xs text-[var(--text-muted)]">{u.machine_id}</span></td>
                  <td className={`${TD} text-right`}><span className="text-rose-300 font-bold tabular-nums">{u.count}</span></td>
                </tr>
              ))}
              {topOffendingUsers.length === 0 && (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-xs text-[var(--text-muted)] italic">No agent violations recorded.</td></tr>
              )}
            </tbody>
          </table>
          </div>
        </Panel>
      </div>

    </div>

    {/* ── Domain drill-down modal ── */}
    {drillDomain && createPortal(
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
        <div className="relative w-full sm:max-w-2xl h-[90dvh] sm:h-[80vh] bg-[var(--bg-card)] rounded-t-2xl sm:rounded-2xl border border-[var(--border-ui)] shadow-2xl flex flex-col animate-scale-in">
          <div className="shrink-0 px-5 py-4 border-b border-[var(--border-ui)] bg-[var(--bg-card-alt)]/80 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-0.5">
                <span className="text-sm font-bold text-[var(--text-main)] font-mono truncate">{drillDomain}</span>
                <CategoryTag category={drillDomainCat} />
              </div>
              <p className="text-[10px] text-[var(--text-muted)]">Agents who accessed this blocked domain</p>
            </div>
            <button onClick={() => setDrillDomain(null)} className="cursor-pointer shrink-0 p-1.5 rounded-md border border-[var(--border-ui)] bg-[var(--bg-card)] hover:bg-[var(--bg-card-alt)] transition-colors text-[var(--text-muted)] hover:text-[var(--text-main)]"><X size={14} /></button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
            {drillDomainLoading ? (
              <div className="p-6 space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="skeleton h-8 rounded" />)}</div>
            ) : drillDomainError ? (
              <div className="p-6 text-center">
                <p className="text-xs text-rose-400 font-mono break-all">{drillDomainError}</p>
                <p className="text-[10px] text-[var(--text-muted)] mt-1">Check the browser console and collector logs for details.</p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[var(--bg-card-alt)] border-b border-[var(--border-ui)] sticky top-0">
                    <th className={TH}>Agent</th>
                    <th className={TH}>Machine</th>
                    <th className={TH}>Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-ui)]">
                  {drillDomainLogs.length === 0 ? (
                    <tr><td colSpan={3} className="px-4 py-10 text-center text-xs text-[var(--text-muted)] italic">No data found for this domain.</td></tr>
                  ) : drillDomainLogs.map((log: any, i: number) => (
                    <tr key={i} className="hover:bg-[var(--bg-card-alt)]/50 transition-colors">
                      <td className={TD}><span className="text-[#c4b5fd] font-mono text-xs">{log.username || log.agent || '—'}</span></td>
                      <td className={TD}><span className="font-mono text-[11px] text-[var(--text-muted)]">{log.machine_id || '—'}</span></td>
                      <td className={`${TD} font-mono text-[11px] text-[var(--text-muted)] whitespace-nowrap`}>{log.timestamp ? fmtEST(log.timestamp) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>,
      document.body
    )}

    {/* ── Agent violations drill-down modal ── */}
    {drillAgent && createPortal(
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
        <div className="relative w-full sm:max-w-2xl h-[90dvh] sm:h-[80vh] bg-[var(--bg-card)] rounded-t-2xl sm:rounded-2xl border border-[var(--border-ui)] shadow-2xl flex flex-col animate-scale-in">
          <div className="shrink-0 px-5 py-4 border-b border-[var(--border-ui)] bg-[var(--bg-card-alt)]/80 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-rose-500 to-rose-700 flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-md">
              {(drillAgent.username || '?')[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-0.5">
                <span className="text-sm font-bold text-[var(--text-main)] truncate">{drillAgent.username}</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30">{drillAgent.count} violations</span>
              </div>
              <p className="text-[10px] text-[var(--text-muted)]">All flagged browsing events</p>
            </div>
            <button onClick={() => setDrillAgent(null)} className="cursor-pointer shrink-0 p-1.5 rounded-md border border-[var(--border-ui)] bg-[var(--bg-card)] hover:bg-[var(--bg-card-alt)] transition-colors text-[var(--text-muted)] hover:text-[var(--text-main)]"><X size={14} /></button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
            {drillAgentLoading ? (
              <div className="p-6 space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="skeleton h-8 rounded" />)}</div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[var(--bg-card-alt)] border-b border-[var(--border-ui)] sticky top-0">
                    <th className={TH}>Domain</th>
                    <th className={TH}>Category</th>
                    <th className={`${TH} whitespace-nowrap`}>Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-ui)]">
                  {drillAgentLogs.length === 0 ? (
                    <tr><td colSpan={3} className="px-4 py-10 text-center text-xs text-[var(--text-muted)] italic">No violations today.</td></tr>
                  ) : drillAgentLogs.map((log: any) => (
                    <tr key={log.id} className="hover:bg-rose-500/5 border-l-2 border-rose-500/30 transition-colors">
                      <td className={TD}><span className="text-rose-300 font-mono text-xs truncate max-w-[200px] block">{log.domain}</span></td>
                      <td className={TD}><CategoryTag category={log.category} /></td>
                      <td className={`${TD} font-mono text-[11px] text-[var(--text-muted)] whitespace-nowrap`}>{fmtEST(log.timestamp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {(drillAgentPage > 0 || drillAgentHasMore) && (
            <div className="shrink-0 px-4 py-3 border-t border-[var(--border-ui)] flex items-center justify-between gap-3">
              <button onClick={() => setDrillAgentPage(p => p - 1)} disabled={drillAgentPage === 0 || drillAgentLoading} className="cursor-pointer flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--border-ui)] bg-[var(--bg-card)] text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-main)] hover:border-[#6a29e1]/40 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                <ChevronLeft size={13} />Previous
              </button>
              <span className="text-[11px] text-[var(--text-muted)] tabular-nums">Page {drillAgentPage + 1}</span>
              <button onClick={() => setDrillAgentPage(p => p + 1)} disabled={!drillAgentHasMore || drillAgentLoading} className="cursor-pointer flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--border-ui)] bg-[var(--bg-card)] text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-main)] hover:border-[#6a29e1]/40 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                Next<ChevronRight size={13} />
              </button>
            </div>
          )}
        </div>
      </div>,
      document.body
    )}
    {/* ── Category domains modal ── */}
    {viewCat && createPortal(
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
        <div className="relative w-full sm:max-w-2xl h-[90dvh] sm:h-[85vh] bg-[var(--bg-card)] rounded-t-2xl sm:rounded-2xl border border-[var(--border-ui)] shadow-2xl flex flex-col animate-scale-in">
          {/* Header */}
          <div className="shrink-0 px-5 py-4 border-b border-[var(--border-ui)] bg-[var(--bg-card-alt)]/80 flex items-center gap-3">
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#6a29e1]/50 to-transparent" />
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-0.5">
                <CategoryTag category={viewCat} />
                <span className="text-[11px] text-[var(--text-muted)]">
                  {viewCatLoading ? '…' : `${viewCatTotal.toLocaleString()} domain${viewCatTotal !== 1 ? 's' : ''}`}
                </span>
              </div>
              <p className="text-[10px] text-[var(--text-muted)]">Blocked domains in this category</p>
            </div>
            <button
              onClick={() => setViewCat(null)}
              className="cursor-pointer shrink-0 p-1.5 rounded-md border border-[var(--border-ui)] bg-[var(--bg-card)] hover:bg-[var(--bg-card-alt)] transition-colors text-[var(--text-muted)] hover:text-[var(--text-main)]"
            >
              <X size={14} />
            </button>
          </div>

          {/* Search bar */}
          <div className="shrink-0 px-4 py-3 border-b border-[var(--border-ui)]">
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
              <input
                autoFocus
                type="text"
                placeholder="Search or check a domain…"
                value={viewCatSearch}
                onChange={e => {
                  const val = e.target.value;
                  setViewCatSearch(val);
                  setViewCatPage(0);
                  fetchViewCatPage(viewCat!, val, 0);
                }}
                className="w-full bg-[var(--bg-page)] border border-[var(--border-ui)] rounded-lg pl-9 pr-9 py-2 text-sm text-[var(--text-main)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[#6a29e1]/60 transition-colors font-mono"
              />
              {viewCatSearch && (
                <button
                  onClick={() => {
                    setViewCatSearch('');
                    setViewCatPage(0);
                    fetchViewCatPage(viewCat!, '', 0);
                  }}
                  className="cursor-pointer absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-main)]"
                >
                  <X size={12} />
                </button>
              )}
            </div>
            {normalizedViewSearch && !viewCatLoading && (
              <p className="mt-2 text-[11px] text-[var(--text-muted)] flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#6a29e1]/60 shrink-0" />
                {viewCatTotal.toLocaleString()} domain{viewCatTotal !== 1 ? 's' : ''} containing{' '}
                <span className="font-mono text-[#c4b5fd]">"{normalizedViewSearch}"</span>
              </p>
            )}
          </div>

          {/* Domain list */}
          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
            {viewCatLoading ? (
              <div className="p-6 space-y-2">
                {[...Array(8)].map((_, i) => <div key={i} className="skeleton h-8 rounded" />)}
              </div>
            ) : viewCatDomains.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-12 text-center px-6">
                <ShieldCheck size={24} className="text-[var(--text-muted)] opacity-30 mb-3" />
                <p className="text-sm text-[var(--text-muted)]">
                  {normalizedViewSearch
                    ? `No domains matching "${normalizedViewSearch}"`
                    : 'No domains in this category yet.'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--border-ui)]">
                {viewCatDomains.map((domain: string) => {
                  const isExact = domain === normalizedViewSearch;
                  return (
                    <div
                      key={domain}
                      className={`flex items-center justify-between px-5 py-2.5 group transition-colors ${isExact ? 'bg-emerald-500/5' : 'hover:bg-[var(--bg-card-alt)]'}`}
                    >
                      <span className={`font-mono text-sm ${isExact ? 'text-emerald-300' : 'text-[var(--text-main)]'}`}>
                        {domain}
                      </span>
                      <button
                        onClick={() => removeDomainFromView(domain)}
                        disabled={removing === domain}
                        className="cursor-pointer opacity-0 group-hover:opacity-100 p-1 text-[var(--text-muted)] hover:text-rose-300 hover:bg-rose-500/10 rounded transition-all disabled:opacity-40"
                        title="Remove from blocklist"
                      >
                        {removing === domain ? <span className="text-[10px] px-1">…</span> : <X size={13} />}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Pagination footer */}
          {!viewCatLoading && viewCatTotal > VIEW_PAGE_SIZE && (
            <div className="shrink-0 px-4 py-3 border-t border-[var(--border-ui)] flex items-center justify-between gap-3">
              <button
                onClick={() => {
                  const p = Math.max(0, viewCatPage - 1);
                  setViewCatPage(p);
                  fetchViewCatPage(viewCat!, viewCatSearch, p);
                }}
                disabled={viewCatPage === 0}
                className="cursor-pointer flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--border-ui)] bg-[var(--bg-card-alt)] text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-main)] hover:border-[#6a29e1]/40 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150"
              >
                <ChevronLeft size={13} /> Previous
              </button>
              <span className="text-[11px] text-[var(--text-muted)] tabular-nums">
                {viewCatPage * VIEW_PAGE_SIZE + 1}–{Math.min((viewCatPage + 1) * VIEW_PAGE_SIZE, viewCatTotal).toLocaleString()} of {viewCatTotal.toLocaleString()}
              </span>
              <button
                onClick={() => {
                  const p = Math.min(viewCatTotalPages - 1, viewCatPage + 1);
                  setViewCatPage(p);
                  fetchViewCatPage(viewCat!, viewCatSearch, p);
                }}
                disabled={viewCatPage >= viewCatTotalPages - 1}
                className="cursor-pointer flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--border-ui)] bg-[var(--bg-card-alt)] text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-main)] hover:border-[#6a29e1]/40 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150"
              >
                Next <ChevronRight size={13} />
              </button>
            </div>
          )}
        </div>
      </div>,
      document.body
    )}

    </>
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
  const [unassignedPage, setUnassignedPage] = useState(0);

  useEffect(() => { setUnassignedPage(0); }, [agents]);

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

  const totalUnassignedPages = Math.max(1, Math.ceil(agents.length / PAGE_SIZE));
  const safeUnassignedPage   = Math.min(unassignedPage, totalUnassignedPages - 1);
  const paginatedAgents      = agents.slice(safeUnassignedPage * PAGE_SIZE, (safeUnassignedPage + 1) * PAGE_SIZE);

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

      <div className="overflow-x-auto">
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
          {paginatedAgents.map(agent => {
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
                  {fmtESTShort(agent.last_seen)}
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
      </div>
      {totalUnassignedPages > 1 && (
        <div className="px-4 py-3 border-t border-[var(--border-ui)] flex items-center justify-between gap-3">
          <button
            onClick={() => setUnassignedPage(p => Math.max(0, p - 1))}
            disabled={safeUnassignedPage === 0}
            className="cursor-pointer flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--border-ui)] bg-[var(--bg-card-alt)] text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-main)] hover:border-[#6a29e1]/40 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150"
          >
            <ChevronLeft size={13} />
            Previous
          </button>
          <div className="flex items-center gap-1">
            {Array.from({ length: totalUnassignedPages }, (_, i) => {
              const showPage = i === 0 || i === totalUnassignedPages - 1 || Math.abs(i - safeUnassignedPage) <= 1;
              const showEllipsisBefore = i === safeUnassignedPage - 2 && safeUnassignedPage > 2;
              const showEllipsisAfter  = i === safeUnassignedPage + 2 && safeUnassignedPage < totalUnassignedPages - 3;
              if (showEllipsisBefore || showEllipsisAfter) return <span key={i} className="px-1 text-[var(--text-muted)] text-xs">…</span>;
              if (!showPage) return null;
              return (
                <button
                  key={i}
                  onClick={() => setUnassignedPage(i)}
                  className={`cursor-pointer w-7 h-7 rounded-md text-xs font-semibold transition-all duration-150 ${
                    i === safeUnassignedPage
                      ? 'bg-[#6a29e1] text-white shadow-sm shadow-[#6a29e1]/40'
                      : 'border border-[var(--border-ui)] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:border-[#6a29e1]/40'
                  }`}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
          <button
            onClick={() => setUnassignedPage(p => Math.min(totalUnassignedPages - 1, p + 1))}
            disabled={safeUnassignedPage === totalUnassignedPages - 1}
            className="cursor-pointer flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--border-ui)] bg-[var(--bg-card-alt)] text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-main)] hover:border-[#6a29e1]/40 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150"
          >
            Next
            <ChevronRight size={13} />
          </button>
        </div>
      )}
    </Panel>
  );
}

// ─── org import ───────────────────────────────────────────────────────────
function OrgImportButton({
  userId,
  existing,
  getBaseUrl,
  onImported,
}: {
  userId: number;
  existing: string[];
  getBaseUrl: () => string;
  onImported: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ tlFullName: string; employees: any[] } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assigning, setAssigning] = useState(false);

  const fetchOrgReports = async () => {
    setLoading(true);
    setError('');
    setResult(null);
    setSelected(new Set());
    try {
      const res = await fetch(`${getBaseUrl()}/api/users/${userId}/org-reports`);
      const data = await res.json();
      if (!res.ok) { setError(data.error || `Error ${res.status}`); return; }
      setResult(data);
      // Pre-select all that are not already assigned
      const newOnes = new Set<string>(data.employees.map((e: any) => e.work_email).filter((e: string) => !existing.includes(e)));
      setSelected(newOnes);
    } catch {
      setError('Could not reach the collector.');
    } finally {
      setLoading(false);
    }
  };

  const open_ = () => { setOpen(true); fetchOrgReports(); };
  const close = () => { setOpen(false); setResult(null); setError(''); };

  const toggleAll = () => {
    if (!result) return;
    const newEmails = result.employees.map((e: any) => e.work_email).filter((e: string) => !existing.includes(e));
    if (selected.size === newEmails.length) setSelected(new Set());
    else setSelected(new Set(newEmails));
  };

  const toggle = (email: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(email) ? next.delete(email) : next.add(email);
      return next;
    });
  };

  const assign = async () => {
    if (!selected.size) return;
    setAssigning(true);
    try {
      await fetch(`${getBaseUrl()}/api/users/${userId}/agents/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails: [...selected] }),
      });
      onImported();
      close();
    } finally {
      setAssigning(false);
    }
  };

  return (
    <>
      <button
        onClick={open_}
        className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-sky-500/30 bg-sky-500/10 text-sky-300 text-xs font-semibold hover:bg-sky-500/20 transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40"
        title="Import direct reports from employee directory"
      >
        <Users size={12} />
        Import from Org
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-[var(--bg-card)] border border-[var(--border-ui)] rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[80vh]">
            {/* Header */}
            <div className="px-6 py-4 border-b border-[var(--border-ui)] flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-base font-bold text-[var(--text-main)] tracking-tight">Import from Org Directory</h3>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  Full-Time employees reporting to this Team Lead in the employee database
                </p>
              </div>
              <button onClick={close} aria-label="Close" className="cursor-pointer p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card-alt)] transition-colors">
                <X size={15} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {loading && (
                <div className="flex items-center justify-center py-16 text-[var(--text-muted)] text-sm gap-2">
                  <RefreshCw size={15} className="animate-spin" /> Querying employee directory…
                </div>
              )}

              {error && (
                <div className="m-5 flex items-start gap-2.5 text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-xl px-4 py-3">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {result && (
                <>
                  {/* Summary bar */}
                  <div className="px-6 py-3 bg-[var(--bg-card-alt)]/60 border-b border-[var(--border-ui)] flex items-center justify-between">
                    <div className="text-xs text-[var(--text-muted)]">
                      Reporting to <span className="text-[var(--text-main)] font-semibold">{result.tlFullName}</span>
                      {' · '}
                      <span className="text-emerald-300 font-semibold">{result.employees.length}</span> Full-Time employee{result.employees.length !== 1 ? 's' : ''} found
                      {existing.length > 0 && ` · ${result.employees.filter(e => existing.includes(e.work_email)).length} already assigned`}
                    </div>
                    {result.employees.some(e => !existing.includes(e.work_email)) && (
                      <button onClick={toggleAll} className="cursor-pointer text-[11px] font-semibold text-[#c4b5fd] hover:text-white transition-colors">
                        {selected.size === result.employees.filter(e => !existing.includes(e.work_email)).length ? 'Deselect all' : 'Select all new'}
                      </button>
                    )}
                  </div>

                  {result.employees.length === 0 ? (
                    <div className="py-12 text-center text-sm text-[var(--text-muted)] italic">
                      No Full-Time employees found reporting to this Team Lead.
                    </div>
                  ) : (
                    <div className="divide-y divide-[var(--border-ui)]">
                      {result.employees.map((emp: any, i: number) => {
                        const alreadyAssigned = existing.includes(emp.work_email);
                        const isSelected = selected.has(emp.work_email);
                        return (
                          <label
                            key={`${emp.work_email}-${i}`}
                            className={`flex items-center gap-4 px-6 py-3 transition-colors ${alreadyAssigned ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-[var(--bg-card-alt)]'}`}
                          >
                            <input
                              type="checkbox"
                              disabled={alreadyAssigned}
                              checked={isSelected || alreadyAssigned}
                              onChange={() => !alreadyAssigned && toggle(emp.work_email)}
                              className="w-4 h-4 rounded accent-[#6a29e1] shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-semibold text-[var(--text-main)]">
                                {emp.first_name} {emp.last_name}
                                {alreadyAssigned && <span className="ml-2 text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Already assigned</span>}
                              </div>
                              <div className="text-xs text-[var(--text-muted)] font-mono mt-0.5">{emp.work_email}</div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="text-xs text-[var(--text-muted)]">{emp.job_title}</div>
                              <div className="text-[11px] text-[var(--text-muted)]/70">{emp.department}</div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            {result && result.employees.length > 0 && (
              <div className="px-6 py-4 border-t border-[var(--border-ui)] flex items-center justify-between gap-3 shrink-0 bg-[var(--bg-card-alt)]/30">
                <span className="text-xs text-[var(--text-muted)]">
                  {selected.size} employee{selected.size !== 1 ? 's' : ''} selected to assign
                </span>
                <div className="flex gap-2">
                  <button onClick={close} className="cursor-pointer px-3 py-1.5 text-sm rounded-lg border border-[var(--border-ui)] bg-[var(--bg-card-alt)] hover:bg-[var(--border-ui)] transition-colors">
                    Cancel
                  </button>
                  <button
                    onClick={assign}
                    disabled={assigning || selected.size === 0}
                    className="cursor-pointer px-4 py-1.5 text-sm rounded-lg bg-[#6a29e1] hover:bg-[#7c3aed] disabled:opacity-40 text-white font-semibold transition-colors shadow-lg shadow-[#6a29e1]/20"
                  >
                    {assigning ? 'Assigning…' : `Assign ${selected.size} agent${selected.size !== 1 ? 's' : ''}`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
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
  const [usersPage, setUsersPage] = useState(0);

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

  const totalUserPages = Math.max(1, Math.ceil(users.length / PAGE_SIZE));
  const safeUserPage   = Math.min(usersPage, totalUserPages - 1);
  const paginatedUsers = users.slice(safeUserPage * PAGE_SIZE, (safeUserPage + 1) * PAGE_SIZE);

  return (
    <div className="space-y-4">
      {/* summary tiles */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <Tile index={0} title="Total Portal Users" value={users.length}                                   tone="brand"   icon={<Users size={13} />} />
        <Tile index={1} title="Team Leads"          value={users.filter(u => u.role === 'team_lead').length} tone="info" />
        <Tile index={2} title="Managers"            value={users.filter(u => u.role === 'manager').length}   tone="warn" />
        <Tile index={3} title="Directors"           value={users.filter(u => u.role === 'director').length}  tone="brand" />
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
        <div className="overflow-x-auto">
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
            {paginatedUsers.map(user => (
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
                    {new Date(user.created_at).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: '2-digit', year: 'numeric' })}
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
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                      {user.role === 'team_lead' ? (
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Assigned Agents</p>
                            <OrgImportButton
                              userId={user.id}
                              existing={userAgents[user.id] || []}
                              getBaseUrl={getBaseUrl}
                              onImported={async () => { await refreshAgents(user.id); fetchUsers(); }}
                            />
                          </div>
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
                        </div>
                        <button
                          onClick={() => setExpandedUser(null)}
                          className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border-ui)] bg-[var(--bg-card)] text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-main)] hover:border-[#6a29e1]/40 transition-all duration-150 shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6a29e1]/50"
                        >
                          <X size={12} /> Done
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
        </div>
        {totalUserPages > 1 && (
          <div className="px-4 py-3 border-t border-[var(--border-ui)] flex items-center justify-between gap-3">
            <button
              onClick={() => setUsersPage(p => Math.max(0, p - 1))}
              disabled={safeUserPage === 0}
              className="cursor-pointer flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--border-ui)] bg-[var(--bg-card-alt)] text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-main)] hover:border-[#6a29e1]/40 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150"
            >
              <ChevronLeft size={13} />
              Previous
            </button>
            <div className="flex items-center gap-1">
              {Array.from({ length: totalUserPages }, (_, i) => {
                const showPage = i === 0 || i === totalUserPages - 1 || Math.abs(i - safeUserPage) <= 1;
                const showEllipsisBefore = i === safeUserPage - 2 && safeUserPage > 2;
                const showEllipsisAfter  = i === safeUserPage + 2 && safeUserPage < totalUserPages - 3;
                if (showEllipsisBefore || showEllipsisAfter) return <span key={i} className="px-1 text-[var(--text-muted)] text-xs">…</span>;
                if (!showPage) return null;
                return (
                  <button
                    key={i}
                    onClick={() => setUsersPage(i)}
                    className={`cursor-pointer w-7 h-7 rounded-md text-xs font-semibold transition-all duration-150 ${
                      i === safeUserPage
                        ? 'bg-[#6a29e1] text-white shadow-sm shadow-[#6a29e1]/40'
                        : 'border border-[var(--border-ui)] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:border-[#6a29e1]/40'
                    }`}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => setUsersPage(p => Math.min(totalUserPages - 1, p + 1))}
              disabled={safeUserPage === totalUserPages - 1}
              className="cursor-pointer flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--border-ui)] bg-[var(--bg-card-alt)] text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-main)] hover:border-[#6a29e1]/40 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150"
            >
              Next
              <ChevronRight size={13} />
            </button>
          </div>
        )}
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
