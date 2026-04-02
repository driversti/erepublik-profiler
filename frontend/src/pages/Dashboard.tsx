import { useStats, useCountries } from '../api/hooks';
import { formatNumber, formatDateTime } from '../utils/formatters';
import StatCard from '../components/StatCard';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const STATUS_COLORS = ['#16A34A', '#DC2626', '#CA8A04', '#999999'];

function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useStats();
  const { data: countries, isLoading: countriesLoading } = useCountries();
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

    </div>
  );
}

export default Dashboard;
