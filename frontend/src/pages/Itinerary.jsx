import { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useNav } from '../context/NavContext';

/* ── Helpers ── */
const CAT_LABELS = {
  restaurant: 'Food', attraction: 'Sight', hotel: 'Hotel',
  activity: 'Activity', transport: 'Transport', other: 'Other',
};
const CAT_CLASS = {
  restaurant: 'cat-food', attraction: 'cat-attraction',
  hotel: 'cat-hotel', activity: 'cat-activity',
  transport: 'cat-transport', other: 'cat-other',
};

function catLabel(c) { return CAT_LABELS[c] ?? c; }
function catClass(c) { return CAT_CLASS[c] ?? 'cat-other'; }

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371, d2r = Math.PI / 180;
  const dLat = (lat2 - lat1) * d2r, dLng = (lng2 - lng1) * d2r;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * d2r) * Math.cos(lat2 * d2r) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function totalKm(stops) {
  let d = 0;
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1], b = stops[i];
    if (a.lat && a.lng && b.lat && b.lng) d += haversine(a.lat, a.lng, b.lat, b.lng);
  }
  return Math.round(d);
}

function getDayDate(startDate, day) {
  if (!startDate) return null;
  const d = new Date(startDate);
  d.setDate(d.getDate() + (day - 1));
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function createPinIcon(n, active = false) {
  return L.divIcon({
    html: `<div class="map-pin${active ? ' active' : ''}">${n}</div>`,
    className: '',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -16],
  });
}

function MapFit({ stops }) {
  const map = useMap();
  const prev = useRef('');
  useEffect(() => {
    const pts = stops.filter((s) => s.lat && s.lng);
    if (!pts.length) return;
    const key = pts.map((s) => `${s.lat},${s.lng}`).join('|');
    if (key === prev.current) return;
    prev.current = key;
    if (pts.length === 1) {
      map.setView([pts[0].lat, pts[0].lng], 14);
    } else {
      map.fitBounds(L.latLngBounds(pts.map((s) => [s.lat, s.lng])), { padding: [60, 60] });
    }
  }, [stops, map]);
  return null;
}

/* ── Share Modal ── */
function ShareModal({ tripId, onClose }) {
  const [email, setEmail]       = useState('');
  const [collabs, setCollabs]   = useState([]);
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  useEffect(() => {
    supabase.from('trip_collaborators').select('*').eq('trip_id', tripId)
      .then(({ data }) => setCollabs(data ?? []));
  }, [tripId]);

  async function invite() {
    if (!email.trim()) return;
    setLoading(true);
    setError('');
    try {
      const { error: err } = await supabase.from('trip_collaborators').insert({
        trip_id: tripId,
        user_id: email.trim(),
        role: 'editor',
      });
      if (err) throw err;
      setEmail('');
      const { data } = await supabase.from('trip_collaborators').select('*').eq('trip_id', tripId);
      setCollabs(data ?? []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function remove(id) {
    await supabase.from('trip_collaborators').delete().eq('id', id);
    setCollabs((v) => v.filter((c) => c.id !== id));
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Share trip</h2>
        <p className="modal-sub">Invite collaborators by user ID or email.</p>

        {error && <div className="error-banner">{error}</div>}

        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="form-input"
            placeholder="Email or user ID"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && invite()}
          />
          <button className="btn-primary btn-sm" onClick={invite} disabled={loading}>
            Invite
          </button>
        </div>

        {collabs.length > 0 && (
          <div className="collab-list">
            {collabs.map((c) => (
              <div key={c.id} className="collab-item">
                <div className="collab-item-avatar" style={{ background: '#7C3AED' }}>
                  {c.user_id[0].toUpperCase()}
                </div>
                <div className="collab-item-info">
                  <div className="collab-item-name">{c.user_id}</div>
                  <div className="collab-item-role">{c.role}</div>
                </div>
                <button className="btn-icon danger" onClick={() => remove(c.id)}>×</button>
              </div>
            ))}
          </div>
        )}

        <div className="modal-footer">
          <button className="btn-secondary btn-sm" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

/* ── Edit Stop Form ── */
function EditStopForm({ stop, onChange, onSave, onCancel }) {
  return (
    <div className="edit-stop-form" onClick={(e) => e.stopPropagation()}>
      <input
        className="form-input"
        style={{ fontSize: 12, padding: '6px 10px' }}
        value={stop.name}
        onChange={(e) => onChange({ ...stop, name: e.target.value })}
        placeholder="Stop name"
        autoFocus
      />
      <input
        className="form-input"
        style={{ fontSize: 12, padding: '6px 10px' }}
        value={stop.address ?? ''}
        onChange={(e) => onChange({ ...stop, address: e.target.value })}
        placeholder="Address"
      />
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          className="form-input"
          style={{ fontSize: 12, padding: '6px 10px', maxWidth: 80 }}
          value={stop.stop_time ?? ''}
          onChange={(e) => onChange({ ...stop, stop_time: e.target.value })}
          placeholder="Time"
        />
        <input
          className="form-input"
          style={{ fontSize: 12, padding: '6px 10px' }}
          value={stop.notes ?? ''}
          onChange={(e) => onChange({ ...stop, notes: e.target.value })}
          placeholder="Notes"
        />
      </div>
      <div className="edit-stop-actions">
        <button className="btn-primary btn-sm" onClick={onSave}>Save</button>
        <button className="btn-secondary btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

const STATUS_OPTIONS = ['draft', 'upcoming', 'current', 'past'];

export default function Itinerary() {
  const { id }     = useParams();
  const navigate   = useNavigate();
  const { user }   = useAuth();
  const { setTripName, setOnShare } = useNav();

  const [trip,        setTrip]        = useState(null);
  const [stops,       setStops]       = useState([]);
  const [activeStop,  setActiveStop]  = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [reprompt,    setReprompt]    = useState('');
  const [reprompting, setReprompting] = useState(false);
  const [editingStop, setEditingStop] = useState(null);
  const [expandedDays, setExpandedDays] = useState(new Set());
  const [shareOpen,   setShareOpen]   = useState(false);

  useEffect(() => { fetchData(); }, [id]);

  async function fetchData() {
    const [{ data: tripData }, { data: stopsData }] = await Promise.all([
      supabase.from('trips').select('*').eq('id', id).single(),
      supabase.from('stops').select('*').eq('trip_id', id).order('day').order('position'),
    ]);
    setTrip(tripData);
    if (tripData?.name) {
      setTripName(tripData.name);
      setOnShare(() => () => setShareOpen(true));
    }
    const loaded = stopsData ?? [];
    setStops(loaded);
    /* Expand first day by default */
    if (loaded.length > 0) {
      const days = [...new Set(loaded.map((s) => s.day ?? 1))].sort((a, b) => a - b);
      setExpandedDays(new Set([days[0]]));
    }
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
      .update({ name: stop.name, address: stop.address, notes: stop.notes, stop_time: stop.stop_time, day: stop.day })
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
        body: JSON.stringify({ prompt: reprompt, stops, tripName: trip?.name, destination: trip?.destination }),
      });
      const data = await res.json();
      if (data.stops?.length > 0) {
        const { data: newStops } = await supabase.from('stops').insert(
          data.stops.map((s, i) => ({
            trip_id:          id,
            name:             s.name,
            address:          s.address ?? null,
            day:              s.day ?? 1,
            position:         stops.length + i,
            notes:            s.notes ?? null,
            category:         s.category ?? 'other',
            lat:              s.lat ?? null,
            lng:              s.lng ?? null,
            stop_time:        s.stop_time ?? null,
            duration_minutes: s.duration_minutes ?? null,
          }))
        ).select();
        if (newStops) setStops((prev) => [...prev, ...newStops]);
      }
    } catch { /* silently fail */ }
    finally { setReprompting(false); setReprompt(''); }
  }

  function toggleDay(day) {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      next.has(day) ? next.delete(day) : next.add(day);
      return next;
    });
  }

  const days = [...new Set(stops.map((s) => s.day ?? 1))].sort((a, b) => a - b);
  const activeStopObj = stops.find((s) => s.id === activeStop);

  if (loading) return <div className="loading-state">Loading itinerary…</div>;
  if (!trip) {
    return (
      <div className="empty-state" style={{ paddingTop: 80 }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
        <h3>Trip not found</h3>
        <p>This trip may have been deleted.</p>
        <Link to="/" className="btn-primary" style={{ marginTop: 16 }}>Back to My Trips</Link>
      </div>
    );
  }

  const globalIdx = (stop) => stops.indexOf(stop) + 1;

  return (
    <>
      {shareOpen && <ShareModal tripId={id} onClose={() => setShareOpen(false)} />}

      <div className="itinerary-layout">
        {/* ── Sidebar ── */}
        <aside className="itinerary-sidebar">
          <div className="itin-sidebar-header">
            <div className="itin-header-row">
              <div>
                <h2 className="itin-title">Itinerary</h2>
                <p className="itin-meta">
                  {stops.length} stop{stops.length !== 1 ? 's' : ''}
                  {stops.some((s) => s.lat && s.lng) ? ` · ${totalKm(stops)} km` : ''}
                  {trip.start_date ? ` · ${new Date(trip.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
                  {trip.end_date   ? ` – ${new Date(trip.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
                </p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                <button className="itin-add-btn" onClick={() => setReprompt('Add a stop')}>
                  + Add stop
                </button>
                <select
                  style={{ fontSize: 11, padding: '3px 6px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--surface)', color: 'var(--text-muted)' }}
                  value={trip.status}
                  onChange={(e) => updateStatus(e.target.value)}
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Day accordion */}
          <div className="itin-sidebar-body">
            {stops.length === 0 && (
              <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-muted)', fontSize: 13 }}>
                <p>No stops yet.</p>
                <p>Use the AI bar below to add some!</p>
              </div>
            )}

            {days.map((day) => {
              const dayStops  = stops.filter((s) => (s.day ?? 1) === day);
              const isOpen    = expandedDays.has(day);
              const km        = totalKm(dayStops);
              const dayDate   = getDayDate(trip.start_date, day);

              return (
                <div key={day} className="day-section">
                  <div
                    className="day-section-header"
                    onClick={() => toggleDay(day)}
                  >
                    <div className="day-section-left">
                      <span className="day-section-day">Day {day}</span>
                      {dayDate && <span className="day-section-date">{dayDate}</span>}
                    </div>
                    <div className="day-section-right">
                      <span className="day-section-meta">
                        {dayStops.length} stop{dayStops.length !== 1 ? 's' : ''}
                        {km > 0 ? ` · ${km} km` : ''}
                      </span>
                      {!isOpen && <span style={{ fontSize: 11, color: 'var(--text-light)' }}>collapsed</span>}
                      <span className={`day-section-chevron ${isOpen ? 'open' : ''}`}>▾</span>
                    </div>
                  </div>

                  {isOpen && (
                    <div className="day-section-body">
                      {dayStops.map((stop) => {
                        const n = globalIdx(stop);
                        return (
                          <div
                            key={stop.id}
                            className={`itin-stop ${activeStop === stop.id ? 'active' : ''}`}
                            onClick={() => setActiveStop(stop.id === activeStop ? null : stop.id)}
                          >
                            <div className="itin-stop-num">{n}</div>
                            <div className="itin-stop-content">
                              {editingStop?.id === stop.id ? (
                                <EditStopForm
                                  stop={editingStop}
                                  onChange={setEditingStop}
                                  onSave={() => saveEdit(editingStop)}
                                  onCancel={() => setEditingStop(null)}
                                />
                              ) : (
                                <>
                                  <div className="itin-stop-name-row">
                                    <span className="itin-stop-name">{stop.name}</span>
                                    {stop.stop_time && <span className="itin-stop-time">{stop.stop_time}</span>}
                                  </div>
                                  {stop.address && (
                                    <div className="itin-stop-address">{stop.address}</div>
                                  )}
                                  {stop.notes && (
                                    <div className="itin-stop-notes">{stop.notes}</div>
                                  )}
                                  {stop.category && stop.category !== 'other' && (
                                    <span className={`cat-tag ${catClass(stop.category)}`}>
                                      {catLabel(stop.category)}
                                    </span>
                                  )}
                                </>
                              )}
                            </div>
                            {editingStop?.id !== stop.id && (
                              <button
                                className="itin-stop-menu"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingStop({ ...stop });
                                }}
                                title="Edit stop"
                              >
                                ···
                              </button>
                            )}
                          </div>
                        );
                      })}

                      <button
                        className="day-add-stop"
                        onClick={(e) => {
                          e.stopPropagation();
                          setReprompt(`Add a stop to Day ${day}`);
                        }}
                      >
                        + Add stop
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Reprompt bar */}
          <div className="itin-reprompt">
            <input
              className="itin-reprompt-input"
              placeholder='e.g. "Add a coffee stop on Day 1"'
              value={reprompt}
              onChange={(e) => setReprompt(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleReprompt()}
            />
            <button
              className="btn-primary btn-sm"
              onClick={handleReprompt}
              disabled={reprompting || !reprompt.trim()}
              title="AI suggest"
            >
              {reprompting ? '…' : '✨'}
            </button>
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
                url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/">CARTO</a>'
              />
              <MapFit stops={stops} />
              {stops.map((stop, i) =>
                stop.lat && stop.lng ? (
                  <Marker
                    key={stop.id}
                    position={[stop.lat, stop.lng]}
                    icon={createPinIcon(i + 1, activeStop === stop.id)}
                    eventHandlers={{ click: () => setActiveStop(stop.id === activeStop ? null : stop.id) }}
                  >
                    <Popup>
                      <strong>{stop.name}</strong>
                      {stop.address && <><br /><span style={{ color: '#6B7280', fontSize: 12 }}>{stop.address}</span></>}
                    </Popup>
                  </Marker>
                ) : null
              )}
            </MapContainer>
          ) : (
            <div style={{ height: '100%', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>
                <div style={{ fontSize: 40, marginBottom: 16 }}>🗺️</div>
                <h3 style={{ fontSize: 16, color: 'var(--text-2)', marginBottom: 8 }}>Map coming soon</h3>
                <p style={{ fontSize: 13, lineHeight: 1.7 }}>
                  Stop locations appear here once coordinates are added.<br />
                  AI-parsed stops from well-known places include coordinates.
                </p>
              </div>
            </div>
          )}

          {/* Map popover for active stop */}
          {activeStopObj && (
            <div className="map-popover-wrap">
              <div className="map-popover">
                <div className="map-popover-inner">
                  <div className="map-popover-label">
                    <span>Stop {globalIdx(activeStopObj)} · Day {activeStopObj.day ?? 1}</span>
                    <button className="map-popover-close" onClick={() => setActiveStop(null)}>×</button>
                  </div>
                  <div className="map-popover-name">{activeStopObj.name}</div>
                  {activeStopObj.address && (
                    <div className="map-popover-addr">{activeStopObj.address}</div>
                  )}
                  <div className="map-popover-tags">
                    {activeStopObj.category && activeStopObj.category !== 'other' && (
                      <span className={`cat-tag ${catClass(activeStopObj.category)}`}>
                        {catLabel(activeStopObj.category)}
                      </span>
                    )}
                    {activeStopObj.stop_time && (
                      <span className="map-popover-time">
                        {activeStopObj.stop_time}
                        {activeStopObj.duration_minutes
                          ? ` · ${Math.round(activeStopObj.duration_minutes / 60)}h`
                          : ''}
                      </span>
                    )}
                  </div>
                  {activeStopObj.notes && (
                    <div className="map-popover-notes">{activeStopObj.notes}</div>
                  )}
                </div>
                <div className="map-popover-footer">
                  <button
                    className="btn-secondary btn-sm"
                    onClick={() => { setEditingStop({ ...activeStopObj }); setActiveStop(null); }}
                  >
                    Edit
                  </button>
                  <button
                    className="btn-text danger"
                    style={{ fontSize: 13 }}
                    onClick={() => deleteStop(activeStopObj.id)}
                  >
                    Delete
                  </button>
                  <div className="map-popover-nav">
                    <button
                      className="map-popover-nav-btn"
                      onClick={() => {
                        const i = stops.indexOf(activeStopObj);
                        if (i > 0) setActiveStop(stops[i - 1].id);
                      }}
                    >◀</button>
                    <button
                      className="map-popover-nav-btn"
                      onClick={() => {
                        const i = stops.indexOf(activeStopObj);
                        if (i < stops.length - 1) setActiveStop(stops[i + 1].id);
                      }}
                    >▶</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
