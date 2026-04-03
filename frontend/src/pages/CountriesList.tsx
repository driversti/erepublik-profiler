import { Link } from 'react-router-dom';
import { useCountries } from '../api/hooks';
import { formatNumber } from '../utils/formatters';
import CountryFlag from '../components/CountryFlag';

function CountriesList() {
  const { data: countries, isLoading } = useCountries();

  if (isLoading) return <div className="text-secondary">Loading...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-primary mb-6">Countries</h1>
      <div className="bg-surface rounded-lg border shadow-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-secondary bg-surface-secondary">
              <th className="px-4 py-3 font-medium">#</th>
              <th className="px-4 py-3 font-medium">Country</th>
              <th className="px-4 py-3 font-medium text-right">Active Players</th>
            </tr>
          </thead>
          <tbody>
            {(countries || []).map((country, i) => (
              <tr key={country.citizenship_country_id} className="border-b border-surface-secondary hover:bg-surface-hover transition-colors">
                <td className="px-4 py-3 text-tertiary">{i + 1}</td>
                <td className="px-4 py-3">
                  <Link
                    to={`/countries/${country.citizenship_country_id}`}
                    className="text-accent hover:text-accent-hover font-medium flex items-center gap-2"
                  >
                    <CountryFlag name={country.citizenship_country_name} />
                    {country.citizenship_country_name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-right text-primary font-medium">
                  {formatNumber(country.alive_count)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default CountriesList;
