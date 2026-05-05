import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import BrandMark from './BrandMark';

export default function Navbar({ tripName, tripHref }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const tripId = tripHref?.startsWith('/trip/') ? tripHref.slice('/trip/'.length) : '';
  const exploreHref = tripId ? `/explore?tripId=${tripId}` : '/explore';

  const initial = (
    user?.user_metadata?.display_name?.[0] ||
    user?.email?.[0] ||
    'U'
  ).toUpperCase();

  const isTrip = pathname.startsWith('/trip/');
  const isNew = pathname === '/new';
  const isExplore = pathname === '/explore';
  const isAnalytics = pathname === '/analytics';

  const crumb = isTrip
    ? (tripName || 'Trip')
    : isNew
      ? 'New trip'
      : isExplore && tripName
        ? tripName
        : null;

  async function signOut() {
    setDropdownOpen(false);
    await supabase.auth.signOut();
  }

  return (
    <nav className="topbar">
      <div className="topbar-left">
        <button
          className="brand brand-button"
          onClick={() => navigate('/', { state: { replay: Date.now() } })}
        >
          <BrandMark size={24} />
          <span>Waypoint</span>
        </button>

        <div className="topbar-nav">
          <Link to="/trips" className={`topbar-link ${pathname === '/trips' ? 'active' : ''}`}>
            Trips
          </Link>
          <Link to="/analytics" className={`topbar-link ${isAnalytics ? 'active' : ''}`}>
            Analytics
          </Link>
          <Link to={exploreHref} className={`topbar-link ${isExplore ? 'active' : ''}`}>
            Explore
          </Link>
        </div>

        {crumb && (
          <div className="topbar-crumb">
            <span>/</span>
            {tripHref ? (
              <Link to={tripHref} className="topbar-crumb-link">
                {crumb}
              </Link>
            ) : (
              <span>{crumb}</span>
            )}
          </div>
        )}
      </div>

      <div className="topbar-right">
        <div className="avatar-menu">
          <button
            className="avatar-button"
            onClick={() => setDropdownOpen((value) => !value)}
            title={user?.email}
          >
            {initial}
          </button>

          {dropdownOpen && (
            <>
              <button
                className="menu-backdrop"
                onClick={() => setDropdownOpen(false)}
                aria-label="Close account menu"
              />
              <div className="account-menu">
                <div className="account-menu-text">{user?.email}</div>
                <div className="account-menu-divider" />
                <button className="account-menu-action danger" onClick={signOut}>
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
