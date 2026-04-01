import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useSearchCitizens } from '../api/hooks';
import Pagination from '../components/Pagination';

function Search() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('name') || '');
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const searchTerm = searchParams.get('name') || '';
  const { data, isLoading } = useSearchCitizens(searchTerm, limit, offset);

  useEffect(() => {
    setOffset(0);
  }, [searchTerm]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim().length >= 2) {
      setSearchParams({ name: query.trim() });
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-primary mb-6">Search Citizens</h1>

      <form onSubmit={handleSubmit} className="mb-6">
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Enter player name (min 2 characters)..."
            className="flex-1 px-4 py-2 bg-surface border rounded-lg text-primary placeholder:text-tertiary focus:outline-none focus:ring-2 focus:ring-accent"
            autoFocus
          />
          <button
            type="submit"
            disabled={query.trim().length < 2}
            className="px-6 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium"
          >
            Search
          </button>
        </div>
      </form>

      {isLoading && <div className="text-secondary">Searching...</div>}

      {data && searchTerm && (
        <>
          <div className="text-sm text-secondary mb-4">
            {data.total} result{data.total !== 1 ? 's' : ''} for "{searchTerm}"
          </div>

          {data.results.length > 0 ? (
            <div className="bg-surface rounded-lg border shadow-card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-secondary bg-surface-secondary">
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium text-right">Level</th>
                    <th className="px-4 py-3 font-medium">Country</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.results.map((citizen) => (
                    <tr key={citizen.citizen_id} className="border-b border-surface-secondary hover:bg-surface-hover transition-colors">
                      <td className="px-4 py-3">
                        <Link to={`/citizens/${citizen.citizen_id}`} className="text-accent hover:text-accent-hover font-medium">
                          {citizen.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-right text-primary">{citizen.level}</td>
                      <td className="px-4 py-3 text-secondary">{citizen.citizenship_country_name}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          citizen.status === 'alive'
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : citizen.status === 'banned'
                            ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                            : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                        }`}>
                          {citizen.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-4 py-2">
                <Pagination total={data.total} limit={limit} offset={offset} onPageChange={setOffset} />
              </div>
            </div>
          ) : (
            <div className="text-secondary">No citizens found matching "{searchTerm}"</div>
          )}
        </>
      )}
    </div>
  );
}

export default Search;
