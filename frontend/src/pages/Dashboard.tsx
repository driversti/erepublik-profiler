import { useStats, useCountries, useScans } from '../api/hooks';
import { formatNumber, formatDateTime } from '../utils/formatters';
import StatCard from '../components/StatCard';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const STATUS_COLORS = ['#16A34A', '#DC2626', '#CA8A04', '#999999'];

function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useStats();
  const { data: countries, isLoading: countriesLoading } = useCountries();
  const { data: scans } = useScans();

  if (statsLoading) {
    return <div className="text-secondary">Loading...</div>;
  }

  if (!stats) {
    return <div className="text-secondary">No scan data available. Run a scan first.</div>;
  }

  const statusData = [
    { name: 'Alive', value: stats.total_alive },
    { name: 'Dead', value: stats.total_dead },
    { name: 'Banned', value: stats.total_banned },
    { name: 'Not Found', value: stats.total_not_found },
  ].filter((d) => d.value > 0);

  const topCountries = (countries || []).slice(0, 10);

  return (
    <div>
      <h1 className="text-2xl font-bold text-primary mb-6">Dashboard</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Alive Players" value={formatNumber(stats.total_alive)} color="text-semantic-green" />
        <StatCard label="Dead Accounts" value={formatNumber(stats.total_dead)} color="text-semantic-red" />
        <StatCard label="Banned" value={formatNumber(stats.total_banned)} color="text-semantic-gold" />
        <StatCard
          label="Last Scan"
          value={stats.last_scan?.scan_type || '—'}
          subtitle={formatDateTime(stats.last_scan?.finished_at || stats.last_scan?.started_at || null)}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {statusData.length > 0 && (
          <div className="bg-surface rounded-lg border shadow-card p-4">
            <h2 className="text-lg font-semibold text-primary mb-4">Account Status Distribution</h2>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {statusData.map((_, i) => (
                    <Cell key={i} fill={STATUS_COLORS[i % STATUS_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => formatNumber(value)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {!countriesLoading && topCountries.length > 0 && (
          <div className="bg-surface rounded-lg border shadow-card p-4">
            <h2 className="text-lg font-semibold text-primary mb-4">Top Countries by Active Players</h2>
            <ResponsiveContainer width="100%" height={Math.max(300, topCountries.length * 28)}>
              <BarChart data={topCountries} layout="vertical" margin={{ left: 80 }}>
                <XAxis type="number" tick={{ fill: 'var(--color-text-secondary)', fontSize: 12 }} />
                <YAxis type="category" dataKey="citizenship_country_name" tick={{ fill: 'var(--color-text-secondary)', fontSize: 12 }} width={75} />
                <Tooltip formatter={(value: number) => formatNumber(value)} />
                <Bar dataKey="alive_count" fill="var(--color-accent)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {scans && scans.length > 0 && (
        <div className="mt-8 bg-surface rounded-lg border shadow-card p-4">
          <h2 className="text-lg font-semibold text-primary mb-4">Recent Scans</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-secondary">
                <th className="pb-2 font-medium">ID</th>
                <th className="pb-2 font-medium">Type</th>
                <th className="pb-2 font-medium">Started</th>
                <th className="pb-2 font-medium">Finished</th>
                <th className="pb-2 font-medium text-right">Scanned</th>
                <th className="pb-2 font-medium text-right">Found</th>
              </tr>
            </thead>
            <tbody>
              {scans.slice(0, 10).map((scan) => (
                <tr key={scan.id} className="border-b border-surface-secondary">
                  <td className="py-2 text-primary">{scan.id}</td>
                  <td className="py-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${scan.scan_type === 'full' ? 'bg-accent-light text-accent' : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'}`}>
                      {scan.scan_type}
                    </span>
                  </td>
                  <td className="py-2 text-secondary">{formatDateTime(scan.started_at)}</td>
                  <td className="py-2 text-secondary">{formatDateTime(scan.finished_at)}</td>
                  <td className="py-2 text-primary text-right">{formatNumber(scan.total_scanned)}</td>
                  <td className="py-2 text-primary text-right">{formatNumber(scan.total_found)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default Dashboard;
