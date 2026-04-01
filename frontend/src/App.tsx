import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import CountriesList from './pages/CountriesList';
import CountryDetail from './pages/CountryDetail';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="countries" element={<CountriesList />} />
          <Route path="countries/:id" element={<CountryDetail />} />
          <Route path="*" element={<div className="text-secondary">Page not found</div>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
