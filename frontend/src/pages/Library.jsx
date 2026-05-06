import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import TripMapThumbnail from '../components/TripMapThumbnail';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { hashColor, formatDateRange, normalizeTripStatus, STATUS_LABELS } from '../lib/tripPresentation';

const FILTERS = ['all', 'current', 'upcoming', 'past'];
const FILTER_LABELS = {
  all: 'All',
  current: 'Current',
  upcoming: 'Future',
  past: 'Past',
};

function AvatarStack({ collaborators }) {
  if (!collaborators.length) return null;

  return (
    <div className="avatar-stack">
      {collaborators.slice(0, 3).map((collaborator) => {
        const label = collaborator.email || collaborator.user_id;
        return (
          <div
            key={collaborator.user_id}
            className="avatar-stack-item"
            style={{ background: hashColor(collaborator.user_id) }}
            title={label}
          >
            {label[0].toUpperCase()}
          </div>
        );
      })}
      {collaborators.length > 3 && (
        <div className="avatar-stack-item overflow">+{collaborators.length - 3}</div>
      )}
    </div>
  );
}

function TripCard({ trip, stopCoords }) {
  const navigate = useNavigate();
  const collaborators = trip.collaborators || [];
  const normalizedStatus = normalizeTripStatus(trip);
  const statusLabel = STATUS_LABELS[normalizedStatus] ?? normalizedStatus;

  return (
    <article className="trip-card" onClick={() => navigate(`/trip/${trip.id}`)}>
      <div className="trip-card-map">
        <TripMapThumbnail stops={stopCoords} />
      </div>

      <div className="trip-card-body">
        <div className="trip-card-header">
          <div>
            <h3 className="trip-card-title">{trip.name}</h3>
            <p className="trip-card-date">
              {formatDateRange(trip.start_date, trip.end_date) || trip.destination || 'Dates not set'}
            </p>
          </div>
          <span className={`status-pill status-pill-${normalizedStatus}`}>
            {trip.isShared ? `${statusLabel} · shared` : statusLabel}
          </span>
        </div>

        <div className="trip-card-footer">
          <div className="trip-card-meta">
            <span>{trip.stop_count} stop{trip.stop_count !== 1 ? 's' : ''}</span>
          </div>
          <AvatarStack collaborators={collaborators} />
        </div>
      </div>
    </article>
  );
}

export default function Library() {
  const { user } = useAuth();
  const [trips, setTrips] = useState([]);
  const [coordMap, setCoordMap] = useState({});
  const [collabMap, setCollabMap] = useState({});
  const [sharedTrips, setSharedTrips] = useState([]);
  const [filter, setFilter] = useState('all');
  const [sideFilter, setSideFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;

    async function loadLibrary() {
      setLoading(true);

      try {
        let query = supabase
          .from('trips')
          .select('*, stops(count)')
          .order('created_at', { ascending: false });

        if (user?.id) {
          query = query.or(`user_id.eq.${user.id},user_id.is.null`);
        }

        const { data: tripData } = await query;
        if (ignore) return;

        const myTrips = (tripData ?? []).map((trip) => ({
          ...trip,
          stop_count: trip.stops?.[0]?.count ?? 0,
        }));

        setTrips(myTrips);

        if (myTrips.length > 0) {
          const ids = myTrips.map((trip) => trip.id);

          const { data: coords } = await supabase
            .from('stops')
            .select('trip_id, lat, lng, position')
            .in('trip_id', ids)
            .not('lat', 'is', null)
            .order('position');
          if (ignore) return;

          const nextCoordMap = {};
          (coords || []).forEach((stop) => {
            if (!nextCoordMap[stop.trip_id]) nextCoordMap[stop.trip_id] = [];
            nextCoordMap[stop.trip_id].push(stop);
          });
          setCoordMap(nextCoordMap);

          const { data: collabs } = await supabase
            .from('trip_collaborators')
            .select('trip_id, user_id')
            .in('trip_id', ids);
          if (ignore) return;

          const nextCollabMap = {};
          (collabs || []).forEach((collaborator) => {
            if (!nextCollabMap[collaborator.trip_id]) nextCollabMap[collaborator.trip_id] = [];
            nextCollabMap[collaborator.trip_id].push(collaborator);
          });
          setCollabMap(nextCollabMap);
        } else {
          setCoordMap({});
          setCollabMap({});
        }

        if (user?.id) {
          const { data: myCollab } = await supabase
            .from('trip_collaborators')
            .select('trip_id')
            .eq('user_id', user.id);
          if (ignore) return;

          if (myCollab?.length > 0) {
            const sharedIds = myCollab.map((collab) => collab.trip_id);
            const { data: sharedData } = await supabase
              .from('trips')
              .select('*, stops(count)')
              .in('id', sharedIds);
            if (ignore) return;

            setSharedTrips(
              (sharedData ?? []).map((trip) => ({
                ...trip,
                stop_count: trip.stops?.[0]?.count ?? 0,
                isShared: true,
              }))
            );
          } else {
            setSharedTrips([]);
          }
        }
      } catch {
        if (ignore) return;
        setTrips([]);
        setSharedTrips([]);
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    loadLibrary();

    return () => {
      ignore = true;
    };
  }, [user]);

  const allWithShared = [...trips, ...sharedTrips];
  const counts = {
    all: trips.length,
    current: trips.filter((trip) => normalizeTripStatus(trip) === 'current').length,
    upcoming: trips.filter((trip) => normalizeTripStatus(trip) === 'upcoming').length,
    past: trips.filter((trip) => normalizeTripStatus(trip) === 'past').length,
  };

  const activeFilter = filter !== 'all' ? filter : sideFilter !== 'all' ? sideFilter : 'all';
  const displayedTrips = allWithShared.filter((trip) => {
    if (activeFilter === 'shared') return trip.isShared;
    if (activeFilter === 'all') return true;
    return normalizeTripStatus(trip) === activeFilter;
  });

  const recentTrips = [...trips].slice(0, 4);

  function setActiveFilter(nextFilter) {
    setFilter(nextFilter);
    setSideFilter(nextFilter);
  }

  return (
    <div className="shell-page library-page">
      <aside className="shell-sidebar">
        <div className="sidebar-group">
          <div className="sidebar-label">My Trips</div>
          {['all', 'current', 'upcoming', 'past'].map((value) => {
            const label =
              value === 'all'
                ? 'All trips'
                : FILTER_LABELS[value];

            const count = counts[value] ?? 0;

            return (
              <button
                key={value}
                className={`sidebar-item ${sideFilter === value && filter === value ? 'active' : ''}`}
                onClick={() => setActiveFilter(value)}
              >
                <span className="sidebar-item-dot">·</span>
                <span className="sidebar-item-label">{label}</span>
                <span className="sidebar-item-count">{count}</span>
              </button>
            );
          })}
        </div>

        {recentTrips.length > 0 && (
          <div className="sidebar-group">
            <div className="sidebar-label">Recent</div>
            {recentTrips.map((trip) => (
              <Link key={trip.id} to={`/trip/${trip.id}`} className="sidebar-link-row">
                <span className="sidebar-item-dot">·</span>
                <span>{trip.name}</span>
              </Link>
            ))}
          </div>
        )}

        {sharedTrips.length > 0 && (
          <div className="sidebar-group">
            <div className="sidebar-label">Shared with me</div>
            {sharedTrips.map((trip) => (
              <Link key={trip.id} to={`/trip/${trip.id}`} className="sidebar-shared-row">
                <span
                  className="sidebar-shared-avatar"
                  style={{ background: hashColor(trip.id) }}
                >
                  {trip.name[0].toUpperCase()}
                </span>
                <span>{trip.name}</span>
              </Link>
            ))}
          </div>
        )}
      </aside>

      <main className="shell-main">
        <div className="page-header">
          <div>
            <h1 className="page-title">
              {activeFilter === 'all'
                ? 'All trips'
                : `${FILTER_LABELS[activeFilter]} trips`}
            </h1>
            <p className="page-subtitle">
              {trips.length} trips
              {counts.current > 0 ? ` · ${counts.current} current` : ''}
              {counts.upcoming > 0 ? ` · ${counts.upcoming} future` : ''}
            </p>
          </div>
          <Link to="/new" className="shell-btn">
            + New trip
          </Link>
        </div>

        <div className="page-tabs">
          {FILTERS.map((value) => (
            <button
              key={value}
              className={`page-tab ${activeFilter === value ? 'active' : ''}`}
              onClick={() => setActiveFilter(value)}
            >
              {FILTER_LABELS[value]}
              {counts[value] > 0 ? ` · ${counts[value]}` : ''}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="loading-state">Loading your trips…</div>
        ) : displayedTrips.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">·</div>
            <h3>No trips here</h3>
            <p>
              {activeFilter === 'all'
                ? 'Start planning your first adventure.'
                : 'Try a different filter.'}
            </p>
            {activeFilter === 'all' && (
              <Link to="/new" className="shell-btn">
                Plan a Trip
              </Link>
            )}
          </div>
        ) : (
          <div className="trip-grid">
            {displayedTrips.map((trip) => (
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
