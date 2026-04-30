import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { supabase } from '../lib/supabase';

function createPinIcon(n, active = false) {
  return L.divIcon({
    html: `<div class="map-pin${active ? ' active' : ''}">${n}</div>`,
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
  });
}

function MapFit({ stops }) {
  const map = useMap();
  useEffect(() => {
    const pts = stops.filter((s) => s.lat && s.lng);
    if (pts.length === 0) return;
    if (pts.length === 1) {
      map.setView([pts[0].lat, pts[0].lng], 14);
    } else {
      map.fitBounds(L.latLngBounds(pts.map((s) => [s.lat, s.lng])), { padding: [48, 48] });
    }
  }, [stops, map]);
  return null;
}

function EditStopForm({ stop, onChange, onSave, onCancel }) {
  return (
    <div className="edit-stop-form" onClick={(e) => e.stopPropagation()}>
      <input
        className="form-input form-input-sm"
        value={stop.name}
        onChange={(e) => onChange({ ...stop, name: e.target.value })}
        placeholder="Stop name"
        autoFocus
      />
      <input
        className="form-input form-input-sm"
        value={stop.address ?? ''}
        onChange={(e) => onChange({ ...stop, address: e.target.value })}
        placeholder="Address"
      />
      <input
        className="form-input form-input-sm"
        value={stop.notes ?? ''}
        onChange={(e) => onChange({ ...stop, notes: e.target.value })}
        placeholder="Notes"
      />
      <div className="edit-stop-actions">
        <button className="btn-primary btn-sm" onClick={onSave}>
          Save
        </button>
        <button className="btn-secondary btn-sm" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

const STATUS_OPTIONS = ['draft', 'planned', 'shared', 'done'];

export default function Itinerary() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [trip, setTrip] = useState(null);
  const [stops, setStops] = useState([]);
  const [activeDay, setActiveDay] = useState(1);
  const [activeStop, setActiveStop] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reprompt, setReprompt] = useState('');
  const [reprompting, setReprompting] = useState(false);
  const [editingStop, setEditingStop] = useState(null);

  useEffect(() => {
    fetchData();
  }, [id]);

  async function fetchData() {
    const [{ data: tripData }, { data: stopsData }] = await Promise.all([
      supabase.from('trips').select('*').eq('id', id).single(),
      supabase
        .from('stops')
        .select('*')
        .eq('trip_id', id)
        .order('day')
        .order('position'),
    ]);
    setTrip(tripData);
    const loaded = stopsData ?? [];
    setStops(loaded);
    if (loaded.length > 0) setActiveDay(loaded[0].day ?? 1);
    setLoading(false);
  }

  async function updateStatus(status) {
    await supabase.from('trips').update({ status }).eq('id', id);
    setTrip((t) => ({ ...t, status }));
  }

  async function deleteStop(stopId) {
    await supabase.from('stops').delete().eq('id', stopId);
    setStops((prev) => prev.filter((s) => s.id !== stopId));
    if (activeStop === stopId) setActiveStop(null);
  }

  async function saveEdit(stop) {
    const { data, error } = await supabase
      .from('stops')
      .update({ name: stop.name, address: stop.address, notes: stop.notes, day: stop.day })
      .eq('id', stop.id)
      .select()
      .single();
    if (!error && data) setStops((prev) => prev.map((s) => (s.id === stop.id ? data : s)));
    setEditingStop(null);
  }

  async function handleReprompt() {
    if (!reprompt.trim()) return;
    setReprompting(true);
    try {
      const res = await fetch('/api/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: reprompt, stops, tripName: trip?.name }),
      });
      const data = await res.json();
      if (data.stops?.length > 0) {
        const { data: newStops } = await supabase
          .from('stops')
          .insert(
            data.stops.map((s, i) => ({
              trip_id: id,
              name: s.name,
              address: s.address ?? null,
              day: s.day ?? activeDay,
              position: stops.length + i,
              notes: s.notes ?? null,
              category: s.category ?? 'other',
              lat: s.lat ?? null,
              lng: s.lng ?? null,
            }))
          )
          .select();
        if (newStops) setStops((prev) => [...prev, ...newStops]);
      }
    } catch {
      /* silently fail */
    } finally {
      setReprompting(false);
      setReprompt('');
    }
  }

  const days = [...new Set(stops.map((s) => s.day ?? 1))].sort((a, b) => a - b);
  const dayStops = stops.filter((s) => (s.day ?? 1) === activeDay);

  if (loading) return <div className="loading-state">Loading itinerary...</div>;

  if (!trip) {
    return (
      <div className="empty-state" style={{ paddingTop: 80 }}>
        <div className="empty-icon">⚠️</div>
        <h3>Trip not found</h3>
        <p>This trip may have been deleted or doesn't exist.</p>
        <Link to="/" className="btn-primary" style={{ marginTop: 16 }}>
          Back to My Trips
        </Link>
      </div>
    );
  }

  return (
    <div className="itinerary-layout">
      {/* ── Sidebar ── */}
      <aside className="itinerary-sidebar">
        <div className="sidebar-header">
          <Link to="/" className="back-link">← My Trips</Link>
          <h2 className="trip-title">{trip.name}</h2>
          {trip.destination && <p className="trip-dest">📍 {trip.destination}</p>}
          <select
            className="status-select"
            value={trip.status}
            onChange={(e) => updateStatus(e.target.value)}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </div>

        {/* Re-prompt bar */}
        <div className="reprompt-bar">
          <input
            className="reprompt-input"
            placeholder='e.g. "Add a coffee stop on Day 1"'
            value={reprompt}
            onChange={(e) => setReprompt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleReprompt()}
          />
          <button
            className="btn-primary btn-sm"
            onClick={handleReprompt}
            disabled={reprompting || !reprompt.trim()}
            title="Re-prompt with AI"
          >
            {reprompting ? '…' : '✨'}
          </button>
        </div>

        {/* Day tabs */}
        {days.length > 0 && (
          <div className="day-tabs">
            {days.map((day) => (
              <button
                key={day}
                className={`day-tab ${activeDay === day ? 'active' : ''}`}
                onClick={() => setActiveDay(day)}
              >
                Day {day}
              </button>
            ))}
          </div>
        )}

        {/* Stop list */}
        <div className="stops-sidebar-list">
          {stops.length === 0 && (
            <div className="sidebar-empty">
              <p>No stops added yet.</p>
              <p>Use the AI prompt above or go back to edit the trip.</p>
            </div>
          )}

          {dayStops.length === 0 && stops.length > 0 && (
            <div className="sidebar-empty">
              <p>No stops on Day {activeDay}.</p>
            </div>
          )}

          {dayStops.map((stop) => {
            const globalIdx = stops.indexOf(stop);
            return (
              <div
                key={stop.id}
                className={`stop-card ${activeStop === stop.id ? 'active' : ''}`}
                onClick={() => setActiveStop(stop.id === activeStop ? null : stop.id)}
              >
                <div className="stop-num-badge">{globalIdx + 1}</div>
                <div className="stop-card-content">
                  {editingStop?.id === stop.id ? (
                    <EditStopForm
                      stop={editingStop}
                      onChange={setEditingStop}
                      onSave={() => saveEdit(editingStop)}
                      onCancel={() => setEditingStop(null)}
                    />
                  ) : (
                    <>
                      <p className="stop-name">{stop.name}</p>
                      {stop.address && <p className="stop-address">{stop.address}</p>}
                      {stop.notes && <p className="stop-notes">{stop.notes}</p>}
                      <div className="stop-actions">
                        <button
                          className="btn-text"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingStop({ ...stop });
                          }}
                        >
                          Edit
                        </button>
                        <button
                          className="btn-text danger"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteStop(stop.id);
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </aside>

      {/* ── Map ── */}
      <div className="itinerary-map">
        {stops.some((s) => s.lat && s.lng) ? (
          <MapContainer
            center={[37.7749, -122.4194]}
            zoom={12}
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            />
            <MapFit stops={stops} />
            {stops.map((stop, i) =>
              stop.lat && stop.lng ? (
                <Marker
                  key={stop.id}
                  position={[stop.lat, stop.lng]}
                  icon={createPinIcon(i + 1, activeStop === stop.id)}
                  eventHandlers={{ click: () => setActiveStop(stop.id) }}
                >
                  <Popup>
                    <strong>{stop.name}</strong>
                    {stop.address && (
                      <>
                        <br />
                        <span style={{ color: '#6B7280', fontSize: 12 }}>{stop.address}</span>
                      </>
                    )}
                    {stop.notes && (
                      <>
                        <br />
                        <em style={{ fontSize: 12 }}>{stop.notes}</em>
                      </>
                    )}
                  </Popup>
                </Marker>
              ) : null
            )}
          </MapContainer>
        ) : (
          <div className="map-placeholder">
            <div className="map-placeholder-inner">
              <div style={{ fontSize: 40, marginBottom: 16 }}>🗺️</div>
              <h3>Map coming soon</h3>
              <p>
                Stop locations will appear here once coordinates are added.
                <br />
                AI-parsed stops from well-known places include coordinates automatically.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
