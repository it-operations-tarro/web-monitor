'use client';

import { useEffect, useState } from 'react';
import { 
  Activity, 
  AlertTriangle, 
  Monitor, 
  Globe, 
  Clock, 
  Search,
  RefreshCw,
  LayoutDashboard,
  Sun,
  Moon,
  Trash2
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';
import { format } from 'date-fns';

const formatBytes = (bytes: number) => {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const getCategoryInfo = (cat: string) => {
  switch (cat) {
    case 'social': return { label: 'Social Media', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' };
    case 'gambling': return { label: 'Gambling', color: 'bg-red-500/20 text-red-400 border-red-500/30' };
    case 'streaming': return { label: 'Streaming', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' };
    case 'ph_shopping': return { label: 'PH Shopping', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' };
    case 'manual': return { label: 'Policy Block', color: 'bg-slate-500/20 text-slate-400 border-slate-500/30' };
    default: return { label: cat || 'Policy Block', color: 'bg-slate-500/20 text-slate-400 border-slate-500/30' };
  }
};

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'machines'>('dashboard');
  const [stats, setStats] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [machines, setMachines] = useState<any[]>([]);
  const [bwViolations, setBwViolations] = useState<any[]>([]);
  const [machineToDelete, setMachineToDelete] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  // Theme Sync
  useEffect(() => {
    const saved = localStorage.getItem('tarro-theme') as 'light' | 'dark';
    if (saved) {
      setTheme(saved);
      document.documentElement.classList.toggle('light', saved === 'light');
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem('tarro-theme', newTheme);
    document.documentElement.classList.toggle('light', newTheme === 'light');
  };

  async function fetchData() {
    setError(false);
    try {
      const hostname = window.location.hostname;
      const baseUrl = `http://${hostname}:4448`; 
      
      // 1. Define strict cache-busting options
      const fetchOpts = { cache: 'no-store' as RequestCache };
      
      // 2. Apply it to every single fetch call
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
    } catch (e) {
      setError(true);
    } finally {
      setLoading(false);
    }
}

  async function handleDeleteMachine() {
    if (!machineToDelete) return;
    try {
      const hostname = window.location.hostname;
      const res = await fetch(`http://${hostname}:3001/api/machines/${encodeURIComponent(machineToDelete)}`, {
        method: 'DELETE'
      });
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
    const interval = setInterval(fetchData, 10000); // Auto refresh every 10s
    return () => clearInterval(interval);
  }, []);

  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center min-vh-100 bg-slate-950 text-white h-screen">
        <RefreshCw className="animate-spin mr-2" /> Loading Monitor...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-page)] text-[var(--text-main)] transition-colors duration-300">
      {/* Sidebar - Desktop */}
      <aside className="fixed left-0 top-0 h-full w-64 bg-[var(--bg-sidebar)] border-r border-[var(--border-ui)] p-6 hidden lg:block transition-colors duration-300">
        <div className="flex items-center gap-3 mb-10">
          <img src="/logo.jpg" alt="Tarro Logo" className="w-9 h-9 rounded-full object-cover" />
          <span className="font-bold text-xl tracking-tight text-[var(--text-main)]">Tarro Web Monitor</span>
        </div>
        
        <nav className="space-y-2">
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`w-full flex items-center gap-3 p-3 rounded-xl font-medium transition-all group ${activeTab === 'dashboard' ? 'text-[#a78bfa] bg-[#6a29e1]/10 border-l-4 border-[#6a29e1]' : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card-alt)]'}`}
          >
            <LayoutDashboard size={20} className="transition-transform duration-300 group-hover:scale-110 group-hover:text-[var(--tarro-purple)]" /> Dashboard
          </button>
          <button 
            onClick={() => setActiveTab('machines')}
            className={`w-full flex items-center gap-3 p-3 rounded-xl font-medium transition-all group ${activeTab === 'machines' ? 'text-[#a78bfa] bg-[#6a29e1]/10 border-l-4 border-[#6a29e1]' : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card-alt)]'}`}
          >
            <Activity size={20} className="transition-transform duration-300 group-hover:scale-110 group-hover:text-[var(--tarro-purple)]" /> Machine Status
          </button>
          <a href="#" className="flex items-center gap-3 text-[var(--text-muted)] hover:text-[var(--text-main)] p-3 transition-colors group">
            <AlertTriangle size={20} className="transition-transform duration-300 group-hover:scale-110 group-hover:text-[var(--tarro-purple)]" /> Enforcement
          </a>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="lg:ml-64 p-6 lg:p-10">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-10">
          <div>
            <h2 className="text-3xl font-bold text-[var(--text-main)] mb-1">
              {activeTab === 'dashboard' ? 'Network Activity Overview' : 'Workstation Fleet Status'}
            </h2>
            <p className="text-[var(--text-muted)]">
              {activeTab === 'dashboard' ? 'Real-time surveillance monitoring from Central Server' : 'Real-time connectivity and agent status'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={toggleTheme}
              className="p-2 bg-[var(--bg-card-alt)] hover:bg-[var(--border-ui)] rounded-lg transition-all duration-200 border border-[var(--border-ui)] hover:scale-105 active:scale-95 shadow-sm"
              title="Toggle Theme"
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button 
              onClick={fetchData}
              className="flex items-center gap-2 bg-[var(--bg-card-alt)] hover:bg-[var(--border-ui)] px-4 py-2 rounded-lg transition-all duration-200 border border-[var(--border-ui)] hover:scale-105 active:scale-95 shadow-sm"
            >
              <RefreshCw size={16} /> Force Refresh
            </button>
          </div>
        </header>

        {error && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-500 p-4 rounded-xl mb-8 flex items-center gap-3">
            <AlertTriangle /> Connection Error: Failed to reach the Collector API on the Central Server.
          </div>
        )}

        {activeTab === 'dashboard' ? (
          <>
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-10">
              <StatCard 
                title="Total Sessions" 
                value={stats?.totalLogs || 0} 
                icon={<Globe className="text-[#a78bfa]" />} 
                color="brand"
              />
              <StatCard 
                title="Policy Violations" 
                value={stats?.totalViolations || 0} 
                icon={<AlertTriangle className="text-red-400" />} 
                color="red"
              />
              <StatCard 
                title="Active Machines" 
                value={stats?.uniqueMachines || 0} 
                icon={<Monitor className="text-[#34d399]" />} 
                color="teal"
              />
              <StatCard 
                title="Detection Ratio" 
                value={`${stats?.totalLogs ? ((stats.totalViolations / stats.totalLogs) * 100).toFixed(1) : 0}%`} 
                icon={<Activity className="text-[#34d399]" />} 
                color="teal"
              />
            </div>

            {/* High Bandwidth Alert Section */}
            {(() => {
              const highBandwidthMachines = machines.filter(m => {
                const diff = new Date().getTime() - new Date(m.last_seen).getTime();
                return diff < 120000 && m.current_bandwidth > 10 * 1024 * 1024;
              });

              return highBandwidthMachines.length > 0 && (
                <div className="mb-6 animate-in fade-in slide-in-from-top-4 duration-500">
                  <div className="bg-orange-500/10 border border-orange-500/30 rounded-2xl p-6 backdrop-blur-md">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 bg-orange-500 rounded-lg">
                        <Activity size={20} className="text-white animate-pulse" />
                      </div>
                      <h3 className="text-xl font-bold text-[var(--text-main)]">High Bandwidth Utilization</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {highBandwidthMachines.map(m => (
                        <div key={`bw-${m.machine_id}`} className="bg-slate-950/50 border border-orange-500/20 rounded-xl p-4 flex flex-col gap-2 relative overflow-hidden group">
                          <div className="flex justify-between items-start">
                            <span className="text-orange-400 font-bold text-xs uppercase">Warning: Heavy Traffic</span>
                            <span className="text-[10px] text-slate-500">{format(new Date(m.last_seen), 'HH:mm')}</span>
                          </div>
                          <div className="text-2xl font-bold text-white">{formatBytes(m.current_bandwidth)}/min</div>
                          <div className="flex flex-col gap-1 mt-1 border-t border-slate-800 pt-2">
                            <div className="flex items-center gap-2">
                              <Monitor size={12} className="text-slate-500" />
                              <span className="text-xs text-slate-300">{m.machine_id}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Activity size={12} className="text-slate-500" />
                              <span className="text-xs text-blue-400 font-medium truncate">{m.username || 'unknown_agent'}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Violation Alerts Section */}
            {logs.some(l => l.violation) && (
              <div className="mb-10 animate-in fade-in slide-in-from-top-4 duration-500">
                <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-6 backdrop-blur-md">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-red-500 rounded-lg">
                      <AlertTriangle size={20} className="text-white" />
                    </div>
                    <h3 className="text-xl font-bold text-[var(--text-main)]">Active Violation Alerts</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {logs.filter(l => l.violation).slice(0, 3).map(alert => (
                      <div key={alert.id} className="bg-slate-950/50 border border-red-500/20 rounded-xl p-4 flex flex-col gap-2 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                          <Globe size={40} className="text-red-500" />
                        </div>
                        <div className="flex justify-between items-start">
                          <div className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getCategoryInfo(alert.category).color}`}>
                            {getCategoryInfo(alert.category).label}
                          </div>
                          <span className="text-[10px] text-slate-500">{format(new Date(alert.timestamp), 'HH:mm')}</span>
                        </div>
                        <div className="text-lg font-bold text-white truncate">{alert.domain}</div>
                        <div className="flex flex-col gap-1 mt-1 border-t border-slate-800 pt-2">
                          <div className="flex items-center gap-2">
                            <Monitor size={12} className="text-slate-500" />
                            <span className="text-xs text-slate-300">{alert.machine_id}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Activity size={12} className="text-slate-500" />
                            <span className="text-xs text-blue-400 font-medium truncate">{alert.username || 'unknown_agent'}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
              {/* Charts */}
              <div className="xl:col-span-2 bg-[var(--bg-card)] rounded-2xl border border-[var(--border-ui)] p-6 transition-colors duration-300">
                <h3 className="text-xl font-bold text-[var(--text-main)] mb-6">Top Domain Traffic</h3>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats?.topDomains || []}>
                      <XAxis dataKey="domain" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff' }}
                        itemStyle={{ color: '#a78bfa' }}
                      />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                        {stats?.topDomains?.map((entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={index === 0 ? '#6a29e1' : '#1e293b'} stroke="#6a29e1" strokeWidth={index === 0 ? 0 : 1} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Activity Feed */}
              <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-ui)] p-6 transition-colors duration-300">
                <h3 className="text-xl font-bold text-[var(--text-main)] mb-6">Live Activity Stream</h3>
                <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                  {logs.map((log, i) => (
                    <div key={log.id} className={`flex gap-4 p-3 rounded-xl border transition-all duration-300 group hover:scale-[1.01] hover:shadow-lg ${log.violation ? 'bg-red-500/10 border-red-500/30' : 'bg-[var(--bg-card-alt)] border-[var(--border-ui)] hover:border-[var(--tarro-purple)]'}`}>
                      <div className={`mt-1 shrink-0 w-2 h-2 rounded-full ${log.violation ? 'bg-red-500 animate-pulse' : 'bg-[#6a29e1]'}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start mb-1">
                          <p className="text-sm font-medium text-[var(--text-main)] truncate group-hover:text-[var(--tarro-purple)] transition-colors">{log.domain}</p>
                          {log.violation && (
                            <span className={`ml-2 px-2 py-0.5 rounded-[4px] text-[8px] font-black uppercase border shrink-0 ${getCategoryInfo(log.category).color}`}>
                              {getCategoryInfo(log.category).label}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-col gap-1 mt-1">
                          <span className="text-[10px] text-[var(--text-muted)] flex items-center gap-1">
                            <Monitor size={10} className="text-[var(--text-muted)]" /> {log.machine_id}
                          </span>
                          <span className={`text-[10px] ${log.violation ? 'text-red-400' : 'text-[#a78bfa]'} flex items-center gap-1 font-mono italic`}>
                            {log.username || 'unknown_agent'}
                          </span>
                          <span className="text-[10px] text-[var(--text-muted)] flex items-center gap-1">
                            <Clock size={10} /> {format(new Date(log.timestamp), 'HH:mm:ss')}
                          </span>
                        </div>
                      </div>
                      {log.violation && (
                        <div className="flex flex-col items-end gap-1">
                          <span className="px-2 py-0.5 bg-red-500/20 text-red-500 text-[10px] font-bold rounded border border-red-500/40 self-start">
                            ALERT
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Bandwidth History Section */}
            <div className="mt-10 bg-[var(--bg-card)] rounded-2xl border border-[var(--border-ui)] overflow-hidden transition-colors duration-300">
              <div className="p-6 border-b border-[var(--border-ui)] bg-[var(--bg-card-alt)]">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-orange-500 rounded-lg">
                    <Activity size={20} className="text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-[var(--text-main)]">Recent Bandwidth Violations</h3>
                </div>
              </div>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[var(--bg-card-alt)] border-b border-[var(--border-ui)]">
                    <th className="p-4 text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">Time</th>
                    <th className="p-4 text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">Machine</th>
                    <th className="p-4 text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">Agent</th>
                    <th className="p-4 text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider text-right">Data Consumed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-ui)]">
                  {bwViolations.map((v) => (
                    <tr key={v.id} className="hover:bg-orange-500/5 transition-colors duration-200">
                      <td className="p-4 text-sm text-[var(--text-muted)]">
                        {format(new Date(v.timestamp), 'MMM dd, HH:mm:ss')}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <Monitor size={14} className="text-slate-500" />
                          <span className="text-sm font-bold text-[var(--text-main)]">{v.machine_id}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="text-sm text-[#a78bfa] font-medium">{v.username || 'unknown'}</span>
                      </td>
                      <td className="p-4 text-right">
                        <span className="text-sm font-bold text-orange-400">
                          {formatBytes(v.bytes)}/min
                        </span>
                      </td>
                    </tr>
                  ))}
                  {bwViolations.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-slate-500 italic">
                        No historical violations found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

          </>
        ) : (
          <MachineStatusView machines={machines} onDelete={setMachineToDelete} />
        )}

        {/* Delete Confirmation Modal */}
        {machineToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-[var(--bg-card)] border border-[var(--border-ui)] rounded-2xl p-8 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-200">
              <div className="flex items-center gap-4 mb-6">
                <div className="p-3 bg-red-500/10 rounded-xl">
                  <AlertTriangle size={24} className="text-red-500" />
                </div>
                <h3 className="text-xl font-bold text-[var(--text-main)]">Confirm Deletion</h3>
              </div>
              <p className="text-[var(--text-muted)] mb-8">
                Are you sure you want to remove <span className="text-white font-bold">{machineToDelete}</span>? 
                This machine will disappear from the dashboard until its next heartbeat.
              </p>
              <div className="flex gap-4">
                <button 
                  onClick={() => setMachineToDelete(null)}
                  className="flex-1 px-4 py-3 bg-[var(--bg-card-alt)] hover:bg-[var(--border-ui)] text-[var(--text-main)] font-bold rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleDeleteMachine}
                  className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-lg shadow-red-900/20 transition-all"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function MachineStatusView({ machines, onDelete }: { machines: any[], onDelete: (id: string) => void }) {
  const isOnline = (lastSeen: string) => {
    const diff = new Date().getTime() - new Date(lastSeen).getTime();
    return diff < 120000; // 2 minutes (heartbeat is 1 min)
  };

  return (
    <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-ui)] overflow-hidden transition-colors duration-300">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-[var(--bg-card-alt)] border-b border-[var(--border-ui)]">
            <th className="p-4 text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">Status</th>
            <th className="p-4 text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">Machine ID</th>
            <th className="p-4 text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">Current Agent</th>
            <th className="p-4 text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">IP Address</th>
            <th className="p-4 text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">Recent Bandwidth</th>
            <th className="p-4 text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">Last Activity</th>
            <th className="p-4 text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border-ui)]">
          {machines.map((m) => (
            <tr key={m.machine_id} className="hover:bg-[var(--bg-card-alt)] transition-colors duration-200">
              <td className="p-4">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${isOnline(m.last_seen) ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-slate-600'}`} />
                  <span className={`text-xs font-medium ${isOnline(m.last_seen) ? 'text-emerald-400' : 'text-slate-500'}`}>
                    {isOnline(m.last_seen) ? 'Online' : 'Offline'}
                  </span>
                </div>
              </td>
              <td className="p-4">
                <div className="flex items-center gap-2">
                  <Monitor size={14} className="text-slate-500" />
                  <span className="text-sm font-bold text-white">{m.machine_id}</span>
                </div>
              </td>
              <td className="p-4">
                <span className="text-sm text-[#a78bfa] font-medium">{m.username || 'unknown'}</span>
              </td>
              <td className="p-4">
                <span className="text-xs text-slate-400 font-mono">{m.ip_address?.replace('::ffff:', '') || 'N/A'}</span>
              </td>
              <td className="p-4">
                <span className={`text-sm font-medium ${m.current_bandwidth > 10 * 1024 * 1024 ? 'text-orange-400' : 'text-[var(--text-main)]'}`}>
                  {formatBytes(m.current_bandwidth)}/min
                </span>
              </td>
              <td className="p-4 text-sm text-[var(--text-muted)]">
                {format(new Date(m.last_seen), 'MMM dd, HH:mm:ss')}
              </td>
              <td className="p-4 text-right">
                <button 
                  onClick={() => onDelete(m.machine_id)}
                  className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all duration-200"
                  title="Remove Workstation"
                >
                  <Trash2 size={16} />
                </button>
              </td>
            </tr>
          ))}
          {machines.length === 0 && (
            <tr>
              <td colSpan={7} className="p-10 text-center text-slate-500 italic">
                No workstations detected yet. Ensure extensions are active.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function StatCard({ title, value, icon, color }: { title: string, value: string | number, icon: any, color: string }) {
  const colors: Record<string, string> = {
    brand: 'bg-[#6a29e1]/5 border-[#6a29e1]/20',
    red: 'bg-red-400/5 border-red-400/20',
    teal: 'bg-[#34d399]/5 border-[#34d399]/20',
    emerald: 'bg-emerald-400/5 border-emerald-400/20',
  };

  return (
    <div className={`p-6 rounded-2xl border backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-[var(--tarro-purple-dim)] cursor-default ${colors[color]}`}>
      <div className="flex items-center justify-between mb-4">
        <span className="text-[var(--text-muted)] text-sm font-medium uppercase tracking-wider">{title}</span>
        <div className="p-2 bg-[var(--bg-card-alt)] rounded-lg border border-[var(--border-ui)]">
          {icon}
        </div>
      </div>
      <div className="text-3xl font-bold text-[var(--text-main)] tracking-tight">{value}</div>
    </div>
  );
}
