import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import CountriesList from './pages/CountriesList';
import CountryDetail from './pages/CountryDetail';
import Search from './pages/Search';
import CitizenProfile from './pages/CitizenProfile';
import Players from './pages/Players';
import ScanManagement from './pages/ScanManagement';

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
          <Route path="players" element={<Players />} />
          <Route path="scan" element={<ScanManagement />} />
          <Route path="*" element={<div className="text-secondary p-8">Page not found</div>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
