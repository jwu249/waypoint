import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import TripMapThumbnail from '../components/TripMapThumbnail';

const AVATAR_COLORS = ['#7C3AED', '#0D9488', '#2563EB', '#D97706', '#DC2626', '#059669', '#2C1A0E'];
const hashColor = (str) => {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
};

const STATUS_LABELS = { draft: 'Draft', upcoming: 'Upcoming', current: 'Current', past: 'Past' };

function formatDateRange(start, end) {
  if (!start) return null;
  const fmt = (d, showYear = false) =>
    new Date(d).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', ...(showYear ? { year: 'numeric' } : {}),
    });
  if (!end) return fmt(start, true);
  const s = new Date(start), e = new Date(end);
  if (s.getFullYear() !== e.getFullYear()) return `${fmt(start, true)} – ${fmt(end, true)}`;
  return `${fmt(start)} – ${fmt(end, true)}`;
}


function TripCard({ trip, stopCoords }) {
  const navigate = useNavigate();
  const collab   = trip.collaborators || [];

  return (
    <div className="trip-card" onClick={() => navigate(`/trip/${trip.id}`)}>
      <div className="trip-thumb">
        <TripMapThumbnail stops={stopCoords} />
      </div>
      <div className="trip-card-body">
        <div className="trip-card-top">
          <h3 className="trip-name">{trip.name}</h3>
          <span className={`status-badge status-${trip.status}`}>
            {trip.isShared && trip.status !== 'draft'
              ? `${STATUS_LABELS[trip.status] ?? trip.status} · shared`
              : STATUS_LABELS[trip.status] ?? trip.status}
          </span>
        </div>
        {trip.start_date && (
          <p className="trip-date">{formatDateRange(trip.start_date, trip.end_date)}</p>
        )}
        <div className="trip-card-meta">
          <div className="trip-card-stops">
            <span>{trip.stop_count} stop{trip.stop_count !== 1 ? 's' : ''}</span>
            {trip.status === 'draft' && <span className="trip-draft-tag">· draft</span>}
          </div>
          {collab.length > 0 && (
            <div className="trip-collaborators">
              {collab.slice(0, 3).map((c) => (
                <div
                  key={c.user_id}
                  className="collab-avatar"
                  style={{ background: hashColor(c.user_id) }}
                  title={c.email || c.user_id}
                >
                  {(c.email || c.user_id)[0].toUpperCase()}
                </div>
              ))}
              {collab.length > 3 && (
                <div className="collab-overflow">+{collab.length - 3}</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const FILTERS = ['all', 'current', 'upcoming', 'past', 'shared'];
const FILTER_LABELS = { all: 'All', current: 'Current', upcoming: 'Upcoming', past: 'Past', shared: 'Shared' };

export default function Library() {
  const { user } = useAuth();
  const navigate  = useNavigate();
  const [trips, setTrips]         = useState([]);
  const [coordMap, setCoordMap]   = useState({});
  const [collabMap, setCollabMap] = useState({});
  const [sharedTrips, setSharedTrips] = useState([]);
  const [filter, setFilter]       = useState('all');
  const [sideFilter, setSideFilter] = useState('all');
  const [loading, setLoading]     = useState(true);

  useEffect(() => { fetchAll(); }, [user]);

  async function fetchAll() {
    try {
      /* My trips — filter by user_id if set, otherwise show all (dev mode with open RLS) */
      let q = supabase.from('trips').select('*, stops(count)').order('created_at', { ascending: false });
      if (user?.id) q = q.or(`user_id.eq.${user.id},user_id.is.null`);
      const { data: tripData } = await q;

      const myTrips = (tripData ?? []).map((t) => ({
        ...t,
        stop_count: t.stops?.[0]?.count ?? 0,
      }));
      setTrips(myTrips);

      /* Stop coordinates for thumbnails */
      if (myTrips.length > 0) {
        const ids = myTrips.map((t) => t.id);
        const { data: coords } = await supabase
          .from('stops')
          .select('trip_id, lat, lng, position')
          .in('trip_id', ids)
          .not('lat', 'is', null)
          .order('position');

        const cm = {};
        (coords || []).forEach((s) => {
          if (!cm[s.trip_id]) cm[s.trip_id] = [];
          cm[s.trip_id].push(s);
        });
        setCoordMap(cm);

        /* Collaborators */
        const { data: collabs } = await supabase
          .from('trip_collaborators')
          .select('trip_id, user_id')
          .in('trip_id', ids);

        const cbMap = {};
        (collabs || []).forEach((c) => {
          if (!cbMap[c.trip_id]) cbMap[c.trip_id] = [];
          cbMap[c.trip_id].push(c);
        });
        setCollabMap(cbMap);
      }

      /* Trips shared with me (via collaborators) */
      if (user?.id) {
        const { data: myCollab } = await supabase
          .from('trip_collaborators')
          .select('trip_id')
          .eq('user_id', user.id);

        if (myCollab?.length > 0) {
          const sharedIds = myCollab.map((c) => c.trip_id);
          const { data: sharedData } = await supabase
            .from('trips')
            .select('*, stops(count)')
            .in('id', sharedIds);

          setSharedTrips(
            (sharedData ?? []).map((t) => ({
              ...t,
              stop_count: t.stops?.[0]?.count ?? 0,
              isShared: true,
            }))
          );
        }
      }
    } catch {
      /* silently fall back */
    } finally {
      setLoading(false);
    }
  }

  const allWithShared = [...trips, ...sharedTrips];

  const counts = {
    all:      trips.length,
    current:  trips.filter((t) => t.status === 'current').length,
    upcoming: trips.filter((t) => t.status === 'upcoming').length,
    past:     trips.filter((t) => t.status === 'past').length,
    shared:   sharedTrips.length,
  };

  const activeFilter = filter !== 'all' ? filter : sideFilter !== 'all' ? sideFilter : 'all';

  const displayed = allWithShared.filter((t) => {
    if (activeFilter === 'shared') return t.isShared;
    if (activeFilter === 'all')    return true;
    return t.status === activeFilter;
  });

  const recentTrips = [...trips].slice(0, 4);

  function setActiveFilter(f) {
    setFilter(f);
    setSideFilter(f);
  }

  return (
    <div className="library-layout">
      {/* ── Sidebar ── */}
      <aside className="library-sidebar">
        <div className="lib-section">
          <span className="lib-section-label">My Trips</span>
          {FILTERS.slice(0, -1).concat(['draft']).map((f) => {
            const label = f === 'all' ? 'All trips' : f === 'draft' ? 'Drafts' : FILTER_LABELS[f];
            const count = f === 'draft'
              ? trips.filter((t) => t.status === 'draft').length
              : f === 'all' ? trips.length : counts[f] ?? 0;
            return (
              <button
                key={f}
                className={`lib-nav-item ${sideFilter === f && filter === f ? 'active' : ''}`}
                onClick={() => setActiveFilter(f)}
              >
                {label}
                <span className="lib-count">{count}</span>
              </button>
            );
          })}
        </div>

        {recentTrips.length > 0 && (
          <div className="lib-section">
            <span className="lib-section-label">Recent</span>
            {recentTrips.map((t) => (
              <Link key={t.id} to={`/trip/${t.id}`} className="lib-recent-item">
                {t.name}
              </Link>
            ))}
          </div>
        )}

        {sharedTrips.length > 0 && (
          <div className="lib-section">
            <span className="lib-section-label">Shared with me</span>
            {sharedTrips.map((t) => (
              <Link key={t.id} to={`/trip/${t.id}`} className="lib-shared-item">
                <div
                  className="lib-shared-avatar"
                  style={{ background: hashColor(t.id) }}
                >
                  {t.name[0].toUpperCase()}
                </div>
                {t.name}
              </Link>
            ))}
          </div>
        )}
      </aside>

      {/* ── Main content ── */}
      <main className="library-main">
        <div className="lib-header">
          <div>
            <h1 className="lib-title">
              {activeFilter === 'all' ? 'All trips'
                : activeFilter === 'shared' ? 'Shared with me'
                : activeFilter === 'draft'  ? 'Drafts'
                : FILTER_LABELS[activeFilter] + ' trips'}
            </h1>
            <p className="lib-subtitle">
              {trips.length} trips
              {counts.current  > 0 ? ` · ${counts.current} current` : ''}
              {counts.upcoming > 0 ? ` · ${counts.upcoming} upcoming` : ''}
              {sharedTrips.length > 0 ? ` · ${sharedTrips.length} shared` : ''}
            </p>
          </div>
          <Link to="/new" className="btn-primary btn-sm">+ New trip</Link>
        </div>

        <div className="filter-tabs">
          {FILTERS.map((f) => (
            <button
              key={f}
              className={`filter-tab ${activeFilter === f ? 'active' : ''}`}
              onClick={() => setActiveFilter(f)}
            >
              {FILTER_LABELS[f]}
              {counts[f] > 0 && ` · ${counts[f]}`}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="loading-state">Loading your trips…</div>
        ) : displayed.length === 0 ? (
          <div className="empty-state">
            <div style={{ fontSize: 40, marginBottom: 16 }}>🗺️</div>
            <h3>No trips here</h3>
            <p>
              {activeFilter !== 'all'
                ? 'Try a different filter.'
                : "Start planning your first adventure!"}
            </p>
            {activeFilter === 'all' && (
              <Link to="/new" className="btn-primary">Plan a Trip</Link>
            )}
          </div>
        ) : (
          <div className="trips-grid">
            {displayed.map((trip) => (
              <TripCard
                key={trip.id}
                trip={{ ...trip, collaborators: collabMap[trip.id] || [] }}
                stopCoords={coordMap[trip.id] || []}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
