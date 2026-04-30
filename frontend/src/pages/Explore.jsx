import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

const CATEGORIES = [
  { id: 'food',    label: 'Food',    icon: '🍜' },
  { id: 'temples', label: 'Temples', icon: '⛩️' },
  { id: 'walks',   label: 'Walks',   icon: '🚶' },
  { id: 'markets', label: 'Markets', icon: '🏪' },
  { id: 'coffee',  label: 'Coffee',  icon: '☕' },
];

function createStopPin(n) {
  return L.divIcon({
    html: `<div class="map-pin">${n}</div>`,
    className: '',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

function createSuggestPin() {
  return L.divIcon({
    html: `<div class="map-pin-suggest">◎</div>`,
    className: '',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

function MapFit({ points }) {
  const map = useMap();
  useEffect(() => {
    const pts = points.filter((p) => p.lat && p.lng);
    if (!pts.length) return;
    if (pts.length === 1) {
      map.setView([pts[0].lat, pts[0].lng], 13);
    } else {
      map.fitBounds(L.latLngBounds(pts.map((p) => [p.lat, p.lng])), { padding: [60, 60] });
    }
  }, [points, map]);
  return null;
}

export default function Explore() {
  const { user } = useAuth();
  const [params]  = useSearchParams();
  const tripId    = params.get('tripId');

  const [trip,        setTrip]        = useState(null);
  const [tripStops,   setTripStops]   = useState([]);
  const [places,      setPlaces]      = useState([]);
  const [added,       setAdded]       = useState(new Set());
  const [activePlace, setActivePlace] = useState(null);
  const [activeCategory, setActiveCategory] = useState(null);
  const [search,      setSearch]      = useState('');
  const [loading,     setLoading]     = useState(false);
  const [mapLayer,    setMapLayer]    = useState('both');

  useEffect(() => {
    if (tripId) fetchTripContext(tripId);
  }, [tripId]);

  async function fetchTripContext(id) {
    const [{ data: tripData }, { data: stopsData }] = await Promise.all([
      supabase.from('trips').select('*').eq('id', id).single(),
      supabase.from('stops').select('*').eq('trip_id', id).order('day').order('position'),
    ]);
    setTrip(tripData);
    setTripStops(stopsData ?? []);
    if (tripData?.destination) {
      fetchSuggestions(tripData.destination, null, stopsData ?? []);
    }
  }

  const fetchSuggestions = useCallback(async (destination, category, stops) => {
    if (!destination) return;
    setLoading(true);
    try {
      const res = await fetch('/api/explore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination,
          category: category || '',
          stops: (stops || tripStops).map((s) => ({ name: s.name })),
        }),
      });
      const data = await res.json();
      setPlaces(data.places ?? []);
    } catch {
      setPlaces([]);
    } finally {
      setLoading(false);
    }
  }, [tripStops]);

  function selectCategory(cat) {
    const next = activeCategory === cat ? null : cat;
    setActiveCategory(next);
    const dest = trip?.destination || search;
    if (dest) fetchSuggestions(dest, next, tripStops);
  }

  function handleSearch(e) {
    if (e.key === 'Enter' && search.trim()) {
      fetchSuggestions(search.trim(), activeCategory, []);
    }
  }

  async function addToTrip(place) {
    if (!tripId || added.has(place.name)) return;
    const { error } = await supabase.from('stops').insert({
      trip_id:  tripId,
      name:     place.name,
      address:  place.address ?? null,
      lat:      place.lat ?? null,
      lng:      place.lng ?? null,
      notes:    place.description ?? null,
      category: place.category ?? 'other',
      day:      1,
      position: tripStops.length,
    });
    if (!error) {
      setAdded((v) => new Set([...v, place.name]));
      const { data } = await supabase.from('stops').select('*').eq('trip_id', tripId).order('position');
      if (data) setTripStops(data);
    }
  }

  const filteredPlaces = places.filter((p) =>
    !search || p.name.toLowerCase().includes(search.toLowerCase())
  );

  const mapPoints = [
    ...(mapLayer !== 'suggested' ? tripStops : []),
    ...(mapLayer !== 'stops' ? filteredPlaces : []),
  ].filter((p) => p.lat && p.lng);

  const activeObj = activePlace !== null ? filteredPlaces[activePlace] : null;

  return (
    <div className="explore-layout">
      {/* ── Sidebar ── */}
      <aside className="explore-sidebar">
        <div className="explore-header">
          <h2 className="explore-title">Explore places</h2>
          <p className="explore-sub">
            {trip
              ? `Find stops near your trip — click a place to preview, then add.`
              : 'Search a destination to discover places.'}
          </p>
          <input
            className="explore-search"
            placeholder={trip ? `Search ${trip.destination || 'places'}…` : 'Search a destination…'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleSearch}
          />
        </div>

        <div className="explore-filters">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              className={`explore-pill ${activeCategory === c.id ? 'active' : ''}`}
              onClick={() => selectCategory(c.id)}
            >
              {c.icon} {c.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="loading-state" style={{ padding: '40px 16px' }}>
            Finding places…
          </div>
        ) : filteredPlaces.length === 0 ? (
          <div className="empty-state" style={{ padding: '40px 16px' }}>
            <p>
              {trip
                ? 'Select a category or search to discover places.'
                : 'Enter a destination and press Enter to explore.'}
            </p>
          </div>
        ) : (
          <>
            <span className="explore-section-label">Suggested · {filteredPlaces.length}</span>
            <div className="explore-list">
              {filteredPlaces.map((place, i) => (
                <div
                  key={i}
                  className={`explore-place-card ${activePlace === i ? 'active' : ''}`}
                  onClick={() => setActivePlace(activePlace === i ? null : i)}
                >
                  <div className="explore-place-icon">{place.category === 'restaurant' ? '🍜' : place.category === 'attraction' ? '🏛️' : place.category === 'hotel' ? '🏨' : '📍'}</div>
                  <div className="explore-place-info">
                    <div className="explore-place-name">{place.name}</div>
                    <div className="explore-place-sub">{place.address}</div>
                    <div className="explore-place-meta">
                      {place.rating && <span className="explore-place-rating">★ {place.rating}</span>}
                      {place.price  && <span>{place.price}</span>}
                    </div>
                  </div>
                  {tripId && (
                    <button
                      className={`explore-add-btn ${added.has(place.name) ? 'added' : ''}`}
                      onClick={(e) => { e.stopPropagation(); addToTrip(place); }}
                      disabled={added.has(place.name)}
                    >
                      {added.has(place.name) ? 'Added ✓' : '+ Add'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </aside>

      {/* ── Map ── */}
      <div className="explore-map">
        {mapPoints.length > 0 ? (
          <MapContainer
            center={[20, 0]}
            zoom={3}
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
              attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/">CARTO</a>'
            />
            <MapFit points={mapPoints} />

            {mapLayer !== 'suggested' && tripStops.map((stop, i) =>
              stop.lat && stop.lng ? (
                <Marker
                  key={stop.id}
                  position={[stop.lat, stop.lng]}
                  icon={createStopPin(i + 1)}
                />
              ) : null
            )}

            {mapLayer !== 'stops' && filteredPlaces.map((place, i) =>
              place.lat && place.lng ? (
                <Marker
                  key={i}
                  position={[place.lat, place.lng]}
                  icon={createSuggestPin()}
                  eventHandlers={{ click: () => setActivePlace(i) }}
                />
              ) : null
            )}
          </MapContainer>
        ) : (
          <div style={{ height: '100%', background: '#E8E4DA', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            Search for a destination to see places on the map
          </div>
        )}

        {/* Toggle */}
        {(tripStops.length > 0 || filteredPlaces.length > 0) && (
          <div className="explore-map-toggle">
            {[{ id: 'both', label: 'Both' }, { id: 'stops', label: '● Your stops' }, { id: 'suggested', label: '◎ Suggested' }].map((opt) => (
              <button
                key={opt.id}
                className={`map-toggle-btn ${mapLayer === opt.id ? 'active' : ''}`}
                onClick={() => setMapLayer(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}

        {/* Place popover */}
        {activeObj && (
          <div className="explore-popover">
            <div className="explore-popover-header">
              <button className="explore-popover-close" onClick={() => setActivePlace(null)}>×</button>
              <div className="explore-popover-name">{activeObj.name}</div>
              <div className="explore-popover-sub">{activeObj.address}</div>
            </div>
            <div className="explore-popover-body">
              <div className="explore-popover-tags">
                {activeObj.category && (
                  <span className={`cat-tag cat-${activeObj.category}`}>
                    {activeObj.category}
                  </span>
                )}
                {activeObj.rating && (
                  <span style={{ fontSize: 12, color: '#D97706', fontWeight: 600 }}>★ {activeObj.rating}</span>
                )}
                {activeObj.price && (
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{activeObj.price}</span>
                )}
              </div>
              {activeObj.description && (
                <div className="explore-popover-desc">{activeObj.description}</div>
              )}
              {activeObj.hours && (
                <div className="explore-popover-meta">{activeObj.hours}</div>
              )}
            </div>
            {tripId && (
              <div className="explore-popover-footer">
                <button
                  className="explore-popover-add"
                  onClick={() => addToTrip(activeObj)}
                  disabled={added.has(activeObj.name)}
                >
                  {added.has(activeObj.name) ? 'Added ✓' : `+ Add to ${trip?.name ?? 'trip'}`}
                </button>
                <button className="explore-popover-save">Save</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
