import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const STATUSES = ['all', 'draft', 'planned', 'shared', 'done'];
const STATUS_LABELS = { draft: 'Draft', planned: 'Planned', shared: 'Shared', done: 'Done' };

function TripCard({ trip }) {
  const navigate = useNavigate();
  const stopCount = trip.stop_count ?? 0;

  const formatDate = (d) =>
    d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null;

  return (
    <div className="trip-card" onClick={() => navigate(`/trip/${trip.id}`)}>
      <div className={`trip-card-bar status-${trip.status}`} />
      <div className="trip-card-body">
        <div className="trip-card-top">
          <h3 className="trip-name">{trip.name}</h3>
          <span className={`status-badge status-${trip.status}`}>
            {STATUS_LABELS[trip.status] ?? trip.status}
          </span>
        </div>
        {trip.destination && (
          <p className="trip-destination">📍 {trip.destination}</p>
        )}
        <div className="trip-card-meta">
          <span>
            {formatDate(trip.start_date)
              ? `${formatDate(trip.start_date)}${trip.end_date ? ` – ${new Date(trip.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}`
              : 'Dates TBD'}
          </span>
          <span>{stopCount} stop{stopCount !== 1 ? 's' : ''}</span>
        </div>
      </div>
    </div>
  );
}

export default function Library() {
  const [trips, setTrips] = useState([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTrips();
  }, []);

  async function fetchTrips() {
    try {
      const { data, error } = await supabase
        .from('trips')
        .select('*, stops(count)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTrips(
        (data ?? []).map((t) => ({
          ...t,
          stop_count: t.stops?.[0]?.count ?? 0,
        }))
      );
    } catch {
      setTrips([]);
    } finally {
      setLoading(false);
    }
  }

  const filtered = trips.filter(
    (t) =>
      (filter === 'all' || t.status === filter) &&
      t.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="page library-page">
      <div className="library-header">
        <div>
          <h1 className="page-title">My Trips</h1>
          <p className="page-subtitle">
            {trips.length} trip{trips.length !== 1 ? 's' : ''} saved
          </p>
        </div>
        <Link to="/new" className="btn-primary">
          + New Trip
        </Link>
      </div>

      <div className="library-controls">
        <input
          className="search-input"
          type="text"
          placeholder="Search trips..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="filter-tabs">
          {STATUSES.map((s) => (
            <button
              key={s}
              className={`filter-tab ${filter === s ? 'active' : ''}`}
              onClick={() => setFilter(s)}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="loading-state">Loading your trips...</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🗺️</div>
          <h3>No trips here</h3>
          <p>
            {search || filter !== 'all'
              ? 'Try adjusting your search or filter.'
              : 'Start planning your first adventure!'}
          </p>
          {!search && filter === 'all' && (
            <Link to="/new" className="btn-primary">
              Plan a Trip
            </Link>
          )}
        </div>
      ) : (
        <div className="trips-grid">
          {filtered.map((trip) => (
            <TripCard key={trip.id} trip={trip} />
          ))}
        </div>
      )}
    </div>
  );
}
