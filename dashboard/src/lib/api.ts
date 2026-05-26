export async function getStats() {
  const res = await fetch('http://localhost:3000/api/stats', { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch stats');
  return res.json();
}

export async function getLogs(limit = 100) {
  const res = await fetch(`http://localhost:3000/api/logs?limit=${limit}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch logs');
  return res.json();
}
