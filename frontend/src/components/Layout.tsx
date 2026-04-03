import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';

function SunIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  );
}

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-2 rounded-md text-sm font-medium transition-colors ${
    isActive
      ? 'text-accent bg-accent-light'
      : 'text-secondary hover:text-primary hover:bg-surface-hover'
  }`;

const mobileNavLinkClass = ({ isActive }: { isActive: boolean }) =>
  `block px-3 py-2.5 rounded-md text-base font-medium transition-colors ${
    isActive
      ? 'text-accent bg-accent-light'
      : 'text-secondary hover:text-primary hover:bg-surface-hover'
  }`;

function Layout() {
  const { theme, toggleTheme } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Close mobile menu on navigation
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim().length >= 2) {
      navigate(`/search?name=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery('');
      setMobileMenuOpen(false);
    }
  };

  return (
    <div className="min-h-screen bg-page">
      <nav className="sticky top-0 z-50 bg-nav border-b border-nav backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-1">
              <NavLink to="/" className="text-lg font-bold text-primary mr-4">
                Profiler
              </NavLink>
              <div className="hidden md:flex items-center gap-1">
                <NavLink to="/" className={navLinkClass} end>
                  Dashboard
                </NavLink>
                <NavLink to="/countries" className={navLinkClass}>
                  Countries
                </NavLink>
                <NavLink to="/players" className={navLinkClass}>
                  Players
                </NavLink>
                <NavLink to="/search" className={navLinkClass}>
                  Search
                </NavLink>
                <NavLink to="/scan" className={navLinkClass}>
                  Scan
                </NavLink>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <form onSubmit={handleSearch} className="hidden sm:flex items-center">
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search player..."
                    className="w-48 pl-8 pr-3 py-1.5 text-sm bg-surface-secondary border border rounded-md focus:outline-none focus:ring-1 focus:ring-accent text-primary placeholder:text-tertiary"
                  />
                  <div className="absolute left-2 top-1/2 -translate-y-1/2 text-tertiary">
                    <SearchIcon />
                  </div>
                </div>
              </form>
              <button
                onClick={toggleTheme}
                className="p-2 rounded-md text-secondary hover:text-primary hover:bg-surface-hover transition-colors"
                title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
              >
                {theme === 'light' ? <MoonIcon /> : <SunIcon />}
              </button>
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-2 rounded-md text-secondary hover:text-primary hover:bg-surface-hover transition-colors"
                aria-label="Toggle menu"
              >
                {mobileMenuOpen ? <CloseIcon /> : <MenuIcon />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-nav">
            <div className="px-4 py-3 space-y-1">
              <NavLink to="/" className={mobileNavLinkClass} end>
                Dashboard
              </NavLink>
              <NavLink to="/countries" className={mobileNavLinkClass}>
                Countries
              </NavLink>
              <NavLink to="/players" className={mobileNavLinkClass}>
                Players
              </NavLink>
              <NavLink to="/search" className={mobileNavLinkClass}>
                Search
              </NavLink>
              <NavLink to="/scan" className={mobileNavLinkClass}>
                Scan
              </NavLink>
              <form onSubmit={handleSearch} className="sm:hidden pt-2">
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search player..."
                    className="w-full pl-8 pr-3 py-2 text-sm bg-surface-secondary border rounded-md focus:outline-none focus:ring-1 focus:ring-accent text-primary placeholder:text-tertiary"
                  />
                  <div className="absolute left-2 top-1/2 -translate-y-1/2 text-tertiary">
                    <SearchIcon />
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Outlet />
      </main>

      <footer className="border-t border mt-8 py-6 text-center text-sm text-tertiary">
        Profiler — eRepublik Player Analytics
      </footer>
    </div>
  );
}

export default Layout;
