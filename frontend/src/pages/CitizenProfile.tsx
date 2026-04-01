import { useParams, Link } from 'react-router-dom';
import { useCitizen, useCitizenHistory, useCitizenAchievements } from '../api/hooks';
import { formatNumber, formatDate, formatCompact } from '../utils/formatters';
import StatCard from '../components/StatCard';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

function CitizenProfile() {
  const { id } = useParams<{ id: string }>();
  const citizenId = parseInt(id || '0', 10);

  const { data: citizen, isLoading } = useCitizen(citizenId);
  const { data: history } = useCitizenHistory(citizenId);
  const { data: achievements } = useCitizenAchievements(citizenId);

  if (isLoading) return <div className="text-secondary">Loading...</div>;
  if (!citizen || !citizen.name) return <div className="text-secondary">Citizen not found</div>;

  const levelHistory = (history || [])
    .filter((h) => h.level !== null)
    .map((h) => ({
      date: new Date(h.scanned_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      level: h.level,
    }));

  const strengthHistory = (history || [])
    .filter((h) => h.strength !== null)
    .map((h) => ({
      date: new Date(h.scanned_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      strength: h.strength,
    }));

  const statusColor = citizen.status === 'alive'
    ? 'text-semantic-green'
    : citizen.status === 'banned'
    ? 'text-semantic-gold'
    : 'text-semantic-red';

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        {citizen.avatar_url && (
          <img src={citizen.avatar_url} alt={citizen.name} className="w-16 h-16 rounded-full border-2 border" />
        )}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-primary">{citizen.name} <span className="text-secondary text-lg font-normal">#{citizenId}</span></h1>
            <a
              href={`https://www.erepublik.com/en/citizen/profile/${citizenId}`}
              target="_blank"
              rel="noopener noreferrer"
              title="View on eRepublik"
            >
              <img src="https://www.erepublik.com/favicon.ico" alt="eRepublik" className="w-4 h-4" />
            </a>
            <a
              href={`https://erepublik.tools/en/society/citizen/${citizenId}`}
              target="_blank"
              rel="noopener noreferrer"
              title="View on eRepublik Tools"
            >
              <img src="https://erepublik.tools/assets/img/favicon.png" alt="eRepublik Tools" className="w-4 h-4" />
            </a>
          </div>
          <div className="flex items-center gap-3 text-sm text-secondary">
            <span className={`font-medium ${statusColor}`}>{citizen.status}</span>
            <span>·</span>
            <span>Level {citizen.level}</span>
            {citizen.citizenship_country_name && (
              <>
                <span>·</span>
                <Link
                  to={`/countries/${citizen.citizenship_country_id}`}
                  className="text-accent hover:text-accent-hover"
                >
                  {citizen.citizenship_country_name}
                </Link>
              </>
            )}
            <span>·</span>
            <span>Registered {formatDate(citizen.created_at)}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="XP" value={formatCompact(citizen.xp)} />
        <StatCard label="Strength" value={formatNumber(citizen.strength)} />
        <StatCard label="Division" value={citizen.division ?? '—'} />
        <StatCard label="Friends" value={formatNumber(citizen.friend_count)} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-surface rounded-lg border shadow-card p-4">
          <h2 className="text-sm font-semibold text-secondary mb-3">GROUND COMBAT</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-secondary">Rank</span><span className="text-primary font-medium">{citizen.ground_rank_name || '—'}</span></div>
            <div className="flex justify-between"><span className="text-secondary">Rank Points</span><span className="text-primary">{formatCompact(citizen.ground_rank_points)}</span></div>
            <div className="flex justify-between"><span className="text-secondary">Best Damage</span><span className="text-primary">{formatCompact(citizen.best_damage)}</span></div>
          </div>
        </div>

        <div className="bg-surface rounded-lg border shadow-card p-4">
          <h2 className="text-sm font-semibold text-secondary mb-3">AIR COMBAT</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-secondary">Rank</span><span className="text-primary font-medium">{citizen.air_rank_name || '—'}</span></div>
            <div className="flex justify-between"><span className="text-secondary">Rank Points</span><span className="text-primary">{formatCompact(citizen.air_rank_points)}</span></div>
            <div className="flex justify-between"><span className="text-secondary">Perception</span><span className="text-primary">{formatNumber(citizen.air_perception)}</span></div>
          </div>
        </div>
      </div>

      {citizen.party_name && (
        <div className="bg-surface rounded-lg border shadow-card p-4 mb-6">
          <h2 className="text-sm font-semibold text-secondary mb-3">AFFILIATIONS</h2>
          <div className="space-y-2 text-sm">
            {citizen.party_name && <div className="flex justify-between"><span className="text-secondary">Party</span><span className="text-primary">{citizen.party_name} {citizen.is_party_president ? '(President)' : ''}</span></div>}
            {citizen.military_unit_name && <div className="flex justify-between"><span className="text-secondary">Military Unit</span><span className="text-primary">{citizen.military_unit_name}</span></div>}
            {citizen.newspaper_name && <div className="flex justify-between"><span className="text-secondary">Newspaper</span><span className="text-primary">{citizen.newspaper_name}</span></div>}
          </div>
          <div className="flex gap-2 mt-3">
            {citizen.is_president === 1 && <span className="px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">President</span>}
            {citizen.is_congressman === 1 && <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">Congress</span>}
            {citizen.is_dictator === 1 && <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">Dictator</span>}
          </div>
        </div>
      )}

      {achievements && achievements.length > 0 && (
        <div className="bg-surface rounded-lg border shadow-card p-4 mb-6">
          <h2 className="text-sm font-semibold text-secondary mb-3">ACHIEVEMENTS</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {achievements.map((a) => (
              <div key={a.medal_type} className="flex justify-between items-center text-sm py-1">
                <span className="text-secondary">{a.medal_type}</span>
                <span className="text-primary font-medium">{a.count}x</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {levelHistory.length > 1 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-surface rounded-lg border shadow-card p-4">
            <h2 className="text-sm font-semibold text-secondary mb-3">LEVEL OVER TIME</h2>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={levelHistory}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="date" tick={{ fill: 'var(--color-text-secondary)', fontSize: 12 }} />
                <YAxis tick={{ fill: 'var(--color-text-secondary)', fontSize: 12 }} />
                <Tooltip />
                <Line type="monotone" dataKey="level" stroke="var(--color-accent)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {strengthHistory.length > 1 && (
            <div className="bg-surface rounded-lg border shadow-card p-4">
              <h2 className="text-sm font-semibold text-secondary mb-3">STRENGTH OVER TIME</h2>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={strengthHistory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="date" tick={{ fill: 'var(--color-text-secondary)', fontSize: 12 }} />
                  <YAxis tick={{ fill: 'var(--color-text-secondary)', fontSize: 12 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="strength" stroke="var(--color-green)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default CitizenProfile;
