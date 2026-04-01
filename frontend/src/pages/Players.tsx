import { useState } from 'react';
import { Link } from 'react-router-dom';
import { usePlayers } from '../api/hooks';
import { formatNumber } from '../utils/formatters';
import Pagination from '../components/Pagination';

type Status = 'all' | 'alive' | 'dead' | 'banned';
type SortKey = 'id' | 'name' | 'level' | 'xp' | 'strength';

const TABS: { key: Status; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'alive', label: 'Alive' },
  { key: 'dead', label: 'Dead' },
  { key: 'banned', label: 'Banned' },
];

const COLUMNS: { key: SortKey; label: string; align?: 'right' }[] = [
  { key: 'id', label: 'ID', align: 'right' },
  { key: 'name', label: 'Name' },
  { key: 'level', label: 'Level', align: 'right' },
  { key: 'xp', label: 'Experience', align: 'right' },
  { key: 'strength', label: 'Strength', align: 'right' },
];

function Players() {
  const [status, setStatus] = useState<Status>('all');
  const [sort, setSort] = useState<SortKey>('id');
  const [order, setOrder] = useState<'asc' | 'desc'>('asc');
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const { data, isLoading } = usePlayers(status, sort, order, limit, offset);

  const handleSort = (col: SortKey) => {
    if (sort === col) {
      setOrder((o) => (o === 'desc' ? 'asc' : 'desc'));
    } else {
      setSort(col);
      setOrder('desc');
    }
    setOffset(0);
  };

  const handleTabChange = (tab: Status) => {
    setStatus(tab);
    setOffset(0);
  };

  const sortIcon = (col: SortKey) => {
    if (sort !== col) return <span className="ml-1 text-tertiary opacity-40">↕</span>;
    return <span className="ml-1">{order === 'desc' ? '↓' : '↑'}</span>;
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-primary mb-6">Players</h1>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => handleTabChange(tab.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              status === tab.key
                ? 'border-accent text-accent'
                : 'border-transparent text-secondary hover:text-primary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="bg-surface rounded-lg border shadow-card">
        {isLoading ? (
          <div className="p-8 text-center text-secondary">Loading...</div>
        ) : !data?.results.length ? (
          <div className="p-8 text-center text-secondary">No players found.</div>
        ) : (
          <>
            <div className="px-4 py-2 text-xs text-secondary border-b">
              {formatNumber(data.total)} players
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-secondary">
                  {COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      className={`px-4 py-3 font-medium cursor-pointer hover:text-primary select-none ${col.align === 'right' ? 'text-right' : 'text-left'}`}
                    >
                      {col.label}{sortIcon(col.key)}
                    </th>
                  ))}
                  <th className="px-4 py-3 font-medium text-left">Country</th>
                </tr>
              </thead>
              <tbody>
                {data.results.map((p) => (
                  <tr key={p.citizen_id} className="border-b border-surface-secondary hover:bg-surface-hover">
                    <td className="px-4 py-2 text-right text-secondary">{p.citizen_id}</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <span
                          title={p.status}
                          className={`w-2 h-2 rounded-full flex-shrink-0 ${
                            p.status === 'alive' ? 'bg-green-500' :
                            p.status === 'banned' ? 'bg-red-500' : 'bg-gray-400'
                          }`}
                        />
                        <Link to={`/citizens/${p.citizen_id}`} className="text-accent hover:underline font-medium">
                          {p.name ?? '—'}
                        </Link>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right">{formatNumber(p.level)}</td>
                    <td className="px-4 py-2 text-right">{formatNumber(p.xp)}</td>
                    <td className="px-4 py-2 text-right">{formatNumber(p.strength)}</td>
                    <td className="px-4 py-2 text-secondary">{p.citizenship_country_name ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4">
              <Pagination total={data.total} limit={limit} offset={offset} onPageChange={setOffset} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default Players;
