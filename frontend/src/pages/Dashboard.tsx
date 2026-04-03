import { useStats, useCountries } from '../api/hooks';
import { formatNumber, getFlagUrl } from '../utils/formatters';
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
        <StatCard label="Not Found" value={formatNumber(stats.total_not_found)} color="text-secondary" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {statusData.length > 0 && (
          <div className="bg-surface rounded-lg border shadow-card p-4">
            <h2 className="text-lg font-semibold text-primary mb-4">Account Status Distribution</h2>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
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
            <ResponsiveContainer width="100%" height={Math.max(300, topCountries.length * 32)}>
              <BarChart data={topCountries} layout="vertical" margin={{ left: 80 }}>
                <XAxis type="number" tick={{ fill: 'var(--color-text-secondary)', fontSize: 12 }} />
                <YAxis
                  type="category"
                  dataKey="citizenship_country_name"
                  width={95}
                  tick={(props: { x: number; y: number; payload: { value: string } }) => {
                    const { x, y, payload } = props;
                    const flagUrl = getFlagUrl(payload.value);
                    return (
                      <g transform={`translate(${x},${y})`}>
                        {flagUrl && <image href={flagUrl} x={-95} y={-8} width={20} height={14} />}
                        <text x={-70} y={0} dy={4} fill="var(--color-text-secondary)" fontSize={12} textAnchor="start">
                          {payload.value}
                        </text>
                      </g>
                    );
                  }}
                />
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
