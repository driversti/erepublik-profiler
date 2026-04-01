import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import CountriesList from './pages/CountriesList';
import CountryDetail from './pages/CountryDetail';
import Search from './pages/Search';
import CitizenProfile from './pages/CitizenProfile';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="countries" element={<CountriesList />} />
          <Route path="countries/:id" element={<CountryDetail />} />
          <Route path="search" element={<Search />} />
          <Route path="citizens/:id" element={<CitizenProfile />} />
          <Route path="*" element={<div className="text-secondary p-8">Page not found</div>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
