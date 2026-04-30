import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

export default function Navbar({ tripName, onShare }) {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const initial = (
    user?.user_metadata?.display_name?.[0] ||
    user?.email?.[0] ||
    'U'
  ).toUpperCase();

  const isTrip    = pathname.startsWith('/trip/');
  const isNew     = pathname === '/new';
  const isExplore = pathname === '/explore';

  const crumb = isTrip ? (tripName || 'Trip') : isNew ? 'New trip' : null;

  async function signOut() {
    setDropdownOpen(false);
    await supabase.auth.signOut();
  }

  return (
    <nav className="navbar">
      <div className="nav-inner">
        <div className="nav-left">
          <Link to="/" className="nav-brand">
            <div className="nav-brand-circle">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
              </svg>
            </div>
            Waypoint
          </Link>

          <div className="nav-links">
            <Link to="/"        className={`nav-link ${pathname === '/' ? 'active' : ''}`}>Trips</Link>
            <Link to="/explore" className={`nav-link ${isExplore ? 'active' : ''}`}>Explore</Link>
          </div>

          {crumb && (
            <>
              <span className="nav-sep">/</span>
              <span className="nav-crumb">{crumb}</span>
            </>
          )}
        </div>

        <div className="nav-right">
          {(isTrip || isNew) && (
            <button className="nav-share-btn" onClick={onShare}>Share</button>
          )}
          {isTrip && (
            <button className="btn-primary btn-sm">Save</button>
          )}
          <div style={{ position: 'relative' }}>
            <div
              className="user-avatar"
              onClick={() => setDropdownOpen((v) => !v)}
              title={user?.email}
            >
              {initial}
            </div>
            {dropdownOpen && (
              <>
                <div
                  style={{ position: 'fixed', inset: 0, zIndex: 199 }}
                  onClick={() => setDropdownOpen(false)}
                />
                <div className="user-dropdown">
                  <div
                    className="user-dropdown-item"
                    style={{ color: 'var(--text-muted)', cursor: 'default', fontSize: 12 }}
                  >
                    {user?.email}
                  </div>
                  <div className="user-dropdown-divider" />
                  <button className="user-dropdown-item danger" onClick={signOut}>
                    Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
