import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useCountryStats, useCountryCitizens } from '../api/hooks';
import { formatNumber } from '../utils/formatters';
import StatCard from '../components/StatCard';
import Pagination from '../components/Pagination';

type SortField = 'level' | 'strength' | 'ground_rank_points' | 'air_rank_points';

function CountryDetail() {
  const { id } = useParams<{ id: string }>();
  const countryId = parseInt(id || '0', 10);
  const [sort, setSort] = useState<SortField>('level');
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const { data: stats, isLoading: statsLoading } = useCountryStats(countryId);
  const { data: citizens, isLoading: citizensLoading } = useCountryCitizens(countryId, sort, limit, offset);

  if (statsLoading) return <div className="text-secondary">Loading...</div>;
  if (!stats) return <div className="text-secondary">Country not found</div>;

  const sortOptions: { value: SortField; label: string }[] = [
    { value: 'level', label: 'Level' },
    { value: 'strength', label: 'Strength' },
    { value: 'ground_rank_points', label: 'Ground Rank' },
    { value: 'air_rank_points', label: 'Air Rank' },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-primary mb-6">Country #{countryId}</h1>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        <StatCard label="Active Players" value={formatNumber(stats.alive_count)} color="text-semantic-green" />
        <StatCard label="Avg Level" value={formatNumber(stats.avg_level)} />
        <StatCard label="Avg Strength" value={formatNumber(stats.avg_strength)} />
      </div>

      <div className="bg-surface rounded-lg border shadow-card p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-primary">Citizens</h2>
          <div className="flex gap-1">
            {sortOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => { setSort(opt.value); setOffset(0); }}
                className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
                  sort === opt.value
                    ? 'bg-accent text-white'
                    : 'bg-surface-secondary text-secondary hover:bg-surface-hover'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {citizensLoading ? (
          <div className="text-secondary py-4">Loading...</div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-secondary">
                  <th className="pb-2 font-medium">Player</th>
                  <th className="pb-2 font-medium text-right">Level</th>
                  <th className="pb-2 font-medium text-right">Strength</th>
                  <th className="pb-2 font-medium text-right">Ground Rank</th>
                  <th className="pb-2 font-medium text-right">Air Rank</th>
                </tr>
              </thead>
              <tbody>
                {(citizens?.results || []).map((c) => (
                  <tr key={c.citizen_id} className="border-b border-surface-secondary hover:bg-surface-hover">
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          c.status === 'alive' ? 'bg-green-500' :
                          c.status === 'banned' ? 'bg-red-500' :
                          'bg-black dark:bg-gray-400'
                        }`} />
                        <Link to={`/citizens/${c.citizen_id}`} className="text-accent hover:text-accent-hover font-medium">
                          {c.name}
                        </Link>
                      </div>
                    </td>
                    <td className="py-2 text-right text-primary">{c.level}</td>
                    <td className="py-2 text-right text-primary">{formatNumber(c.strength)}</td>
                    <td className="py-2 text-right text-secondary">{c.ground_rank_name}</td>
                    <td className="py-2 text-right text-secondary">{c.air_rank_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {citizens && (
              <Pagination total={citizens.total} limit={limit} offset={offset} onPageChange={setOffset} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default CountryDetail;
