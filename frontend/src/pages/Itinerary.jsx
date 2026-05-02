import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import CategoryIcon from '../components/CategoryIcon';
import { supabase } from '../lib/supabase';
import { useNav } from '../context/NavContext';
import {
  categoryLabel,
  createNumberedPin,
  getCategoryMeta,
  getDayDate,
  totalKm,
} from '../lib/tripPresentation';

function MapFit({ stops }) {
  const map = useMap();
  const previousKey = useRef('');

  useEffect(() => {
    const points = stops.filter((stop) => stop.lat && stop.lng);
    if (!points.length) return;

    const nextKey = points.map((stop) => `${stop.lat},${stop.lng}`).join('|');
    if (nextKey === previousKey.current) return;
    previousKey.current = nextKey;

    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 14);
      return;
    }

    map.fitBounds(
      points.map((stop) => [stop.lat, stop.lng]),
      { padding: [64, 64] }
    );
  }, [map, stops]);

  return null;
}

function ShareModal({ tripId, onClose }) {
  const [email, setEmail] = useState('');
  const [collaborators, setCollaborators] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase
      .from('trip_collaborators')
      .select('*')
      .eq('trip_id', tripId)
      .then(({ data }) => setCollaborators(data ?? []));
  }, [tripId]);

  async function invite() {
    if (!email.trim()) return;
    setLoading(true);
    setError('');

    try {
      const { error: inviteError } = await supabase.from('trip_collaborators').insert({
        trip_id: tripId,
        user_id: email.trim(),
        role: 'editor',
      });

      if (inviteError) throw inviteError;

      setEmail('');
      const { data } = await supabase
        .from('trip_collaborators')
        .select('*')
        .eq('trip_id', tripId);
      setCollaborators(data ?? []);
    } catch (inviteFailure) {
      setError(inviteFailure.message);
    } finally {
      setLoading(false);
    }
  }

  async function remove(collaboratorId) {
    await supabase.from('trip_collaborators').delete().eq('id', collaboratorId);
    setCollaborators((current) =>
      current.filter((collaborator) => collaborator.id !== collaboratorId)
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="panel-header-row">
          <div>
            <div className="panel-title">Share trip</div>
            <p className="section-copy">Invite collaborators by email or user ID.</p>
          </div>
          <button className="shell-btn shell-btn-ghost shell-btn-sm" onClick={onClose}>
            Close
          </button>
        </div>

        {error && <div className="banner banner-error">{error}</div>}

        <div className="share-row">
          <input
            className="form-input"
            placeholder="Email or user ID"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && invite()}
          />
          <button className="shell-btn shell-btn-sm" onClick={invite} disabled={loading}>
            Invite
          </button>
        </div>

        {collaborators.length > 0 && (
          <div className="share-list">
            {collaborators.map((collaborator) => (
              <div key={collaborator.id} className="share-item">
                <div className="share-avatar">{collaborator.user_id[0].toUpperCase()}</div>
                <div className="share-copy">
                  <div className="share-name">{collaborator.user_id}</div>
                  <div className="share-role">{collaborator.role}</div>
                </div>
                <button
                  className="shell-btn shell-btn-ghost shell-btn-sm danger"
                  onClick={() => remove(collaborator.id)}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function parseStopTimeRange(value) {
  const text = (value || '').trim();
  if (!text) return { start: '', end: '' };

  const fromToMatch = text.match(/from\s+(.+?)\s+to\s+(.+)/i);
  if (fromToMatch) {
    return { start: fromToMatch[1].trim(), end: fromToMatch[2].trim() };
  }

  const separatorMatch = text.split(/\s*[–-]\s*/);
  if (separatorMatch.length === 2) {
    return { start: separatorMatch[0].trim(), end: separatorMatch[1].trim() };
  }

  return { start: text, end: '' };
}

function formatStopTimeRange(start, end) {
  const cleanStart = (start || '').trim();
  const cleanEnd = (end || '').trim();
  if (!cleanStart && !cleanEnd) return null;
  if (!cleanStart) return cleanEnd;
  if (!cleanEnd) return cleanStart;
  return `${cleanStart} - ${cleanEnd}`;
}

function EditStopForm({ stop, onChange, onSave, onCancel }) {
  return (
    <div className="edit-stop-form" onClick={(event) => event.stopPropagation()}>
      <div className="edit-stop-static">
        <div className="edit-stop-static-name">{stop.name}</div>
        {stop.address && <div className="edit-stop-static-address">{stop.address}</div>}
      </div>
      <div className="edit-stop-field">
        <div className="edit-stop-label">Time</div>
        <div className="form-grid two-up">
          <input
            className="form-input"
            type="time"
            value={stop.stopTimeStart ?? ''}
            onChange={(event) => onChange({ ...stop, stopTimeStart: event.target.value })}
            autoFocus
          />
          <input
            className="form-input"
            type="time"
            value={stop.stopTimeEnd ?? ''}
            onChange={(event) => onChange({ ...stop, stopTimeEnd: event.target.value })}
          />
        </div>
      </div>
      <div className="edit-stop-field">
        <div className="edit-stop-label">Notes</div>
        <textarea
          className="notes-field notes-field-inline"
          value={stop.notes ?? ''}
          onChange={(event) => onChange({ ...stop, notes: event.target.value })}
          placeholder="Add notes"
        />
      </div>
      <div className="edit-stop-actions">
        <button className="shell-btn shell-btn-sm" onClick={onSave}>
          Save
        </button>
        <button className="shell-btn shell-btn-ghost shell-btn-sm" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function Itinerary() {
  const { id } = useParams();
  const { setTripName, setTripHref, setOnShare } = useNav();
  const markerRefs = useRef({});
  const composerAbortRef = useRef(null);

  const [trip, setTrip] = useState(null);
  const [stops, setStops] = useState([]);
  const [activeStop, setActiveStop] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editingStop, setEditingStop] = useState(null);
  const [expandedDays, setExpandedDays] = useState(new Set());
  const [shareOpen, setShareOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerText, setComposerText] = useState('');
  const [composerDay, setComposerDay] = useState(1);
  const [composerLoading, setComposerLoading] = useState(false);
  const [composerError, setComposerError] = useState('');
  const [composerResults, setComposerResults] = useState([]);
  const [composerSelected, setComposerSelected] = useState(0);
  const [composerSearching, setComposerSearching] = useState(false);
  const [draggingStopId, setDraggingStopId] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);

  useEffect(() => {
    let ignore = false;

    async function loadTrip() {
      setLoading(true);

      const [{ data: tripData }, { data: stopsData }] = await Promise.all([
        supabase.from('trips').select('*').eq('id', id).single(),
        supabase.from('stops').select('*').eq('trip_id', id).order('day').order('position'),
      ]);

      if (ignore) return;

      setTrip(tripData);

      if (tripData?.name) {
        setTripName(tripData.name);
        setTripHref(`/trip/${tripData.id}`);
        setOnShare(() => () => setShareOpen(true));
      }

      const loadedStops = stopsData ?? [];
      setStops(loadedStops);

      if (loadedStops.length > 0) {
        const days = [...new Set(loadedStops.map((stop) => stop.day ?? 1))].sort((a, b) => a - b);
        setExpandedDays(new Set([days[0]]));
        setComposerDay(days[0]);
      } else {
        setExpandedDays(new Set());
        setComposerDay(1);
      }

      setLoading(false);
    }

    loadTrip();

    return () => {
      ignore = true;
    };
  }, [id, setOnShare, setTripHref, setTripName]);

  useEffect(() => () => {
    setTripName('');
    setTripHref('');
    setOnShare(null);
  }, [setOnShare, setTripHref, setTripName]);

  useEffect(() => {
    Object.entries(markerRefs.current).forEach(([stopId, marker]) => {
      if (!marker) return;

      if (String(stopId) === String(activeStop)) {
        marker.openPopup();
      } else {
        marker.closePopup();
      }
    });
  }, [activeStop]);

  useEffect(() => {
    return () => {
      Object.values(markerRefs.current).forEach((marker) => {
        marker?.closePopup();
      });
    };
  }, []);

  useEffect(() => {
    if (!composerOpen) {
      setComposerResults([]);
      setComposerSelected(0);
      setComposerSearching(false);
      if (composerAbortRef.current) {
        composerAbortRef.current.abort();
      }
      return undefined;
    }

    const query = composerText.trim();
    if (!query) {
      setComposerResults([]);
      setComposerSelected(0);
      setComposerSearching(false);
      if (composerAbortRef.current) {
        composerAbortRef.current.abort();
      }
      return undefined;
    }

    if (composerAbortRef.current) {
      composerAbortRef.current.abort();
    }

    const controller = new AbortController();
    composerAbortRef.current = controller;
    setComposerSearching(true);

    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/place-search?q=${encodeURIComponent(query)}&destination=${encodeURIComponent(trip?.destination || '')}`,
          { signal: controller.signal }
        );
        const data = await response.json();
        if (controller.signal.aborted) return;
        setComposerResults(data.places ?? []);
        setComposerSelected(0);
      } catch (fetchError) {
        if (fetchError.name === 'AbortError') return;
        setComposerResults([]);
      } finally {
        if (!controller.signal.aborted) {
          setComposerSearching(false);
        }
      }
    }, 200);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [composerOpen, composerText, trip?.destination]);

  async function deleteStop(stopId) {
    await supabase.from('stops').delete().eq('id', stopId);
    setStops((current) => current.filter((stop) => stop.id !== stopId));
    if (activeStop === stopId) setActiveStop(null);
  }

  async function saveEdit(stop) {
    const { data, error } = await supabase
      .from('stops')
      .update({
        notes: stop.notes,
        stop_time: formatStopTimeRange(stop.stopTimeStart, stop.stopTimeEnd),
      })
      .eq('id', stop.id)
      .select()
      .single();

    if (!error && data) {
      setStops((current) => current.map((item) => (item.id === stop.id ? data : item)));
    }

    setEditingStop(null);
  }

  async function handleAddStop() {
    if (!composerText.trim()) return;
    setComposerLoading(true);
    setComposerError('');

    try {
      const chosenPlace = composerResults[composerSelected] ?? null;
      const stopToInsert = chosenPlace
        ? {
            name: chosenPlace.name,
            address: chosenPlace.address ?? null,
            day: composerDay,
            notes: chosenPlace.description || null,
            category: chosenPlace.category ?? 'other',
            lat: chosenPlace.lat ?? null,
            lng: chosenPlace.lng ?? null,
            stop_time: null,
            duration_minutes: null,
          }
        : {
            name: composerText.trim(),
            address: trip?.destination ?? null,
            day: composerDay,
            notes: null,
            category: 'other',
            lat: null,
            lng: null,
            stop_time: null,
            duration_minutes: null,
          };

      await insertStop(stopToInsert);

      setComposerText('');
      setComposerOpen(false);
      setComposerResults([]);
      setComposerSelected(0);
    } catch (requestError) {
      setComposerError(requestError.message || 'Unable to add a stop right now.');
    } finally {
      setComposerLoading(false);
    }
  }

  async function insertStop(stopToInsert) {
    const nextPosition = stops.length;
    const { data: newStop, error } = await supabase
      .from('stops')
      .insert({
        trip_id: id,
        name: stopToInsert.name,
        address: stopToInsert.address,
        day: stopToInsert.day,
        position: nextPosition,
        notes: stopToInsert.notes,
        category: stopToInsert.category,
        lat: stopToInsert.lat,
        lng: stopToInsert.lng,
        stop_time: stopToInsert.stop_time,
        duration_minutes: stopToInsert.duration_minutes,
      })
      .select()
      .single();

    if (error) throw error;

    if (newStop) {
      setStops((current) => [...current, newStop]);
      setExpandedDays((current) => new Set([...current, composerDay]));
    }
  }

  async function moveStop(stopId, targetDay, targetIndex) {
    const movingStop = stops.find((stop) => stop.id === stopId);
    if (!movingStop) return;

    const previousStops = stops;
    const dayOrder = [...new Set([...stops.map((stop) => stop.day ?? 1), targetDay])].sort((a, b) => a - b);
    const sourceDayStops = stops.filter((stop) => (stop.day ?? 1) === (movingStop.day ?? 1));
    const sourceIndex = sourceDayStops.findIndex((stop) => stop.id === stopId);
    const remainingStops = stops.filter((stop) => stop.id !== stopId);

    let normalizedTargetIndex = targetIndex;
    if ((movingStop.day ?? 1) === targetDay && sourceIndex > -1 && sourceIndex < targetIndex) {
      normalizedTargetIndex -= 1;
    }

    const nextStops = [];

    dayOrder.forEach((day) => {
      const dayStops = remainingStops
        .filter((stop) => (stop.day ?? 1) === day)
        .sort((left, right) => (left.position ?? 0) - (right.position ?? 0));

      if (day === targetDay) {
        const insertAt = Math.max(0, Math.min(normalizedTargetIndex, dayStops.length));
        dayStops.splice(insertAt, 0, { ...movingStop, day: targetDay });
      }

      dayStops.forEach((stop, index) => {
        nextStops.push({
          ...stop,
          day,
          position: index,
        });
      });
    });

    setStops(nextStops);
    setExpandedDays((current) => new Set([...current, targetDay]));
    if (editingStop?.id === stopId) {
      setEditingStop((current) => (current ? { ...current, day: targetDay } : current));
    }

    try {
      await Promise.all(
        nextStops.map((stop) =>
          supabase
            .from('stops')
            .update({ day: stop.day, position: stop.position })
            .eq('id', stop.id)
        )
      );
    } catch {
      setStops(previousStops);
    } finally {
      setDraggingStopId(null);
      setDropTarget(null);
    }
  }

  function beginDrag(stopId) {
    setDraggingStopId(stopId);
    setDropTarget(null);
    if (activeStop === stopId) {
      setActiveStop(null);
    }
  }

  function allowDrop(event, day, index) {
    event.preventDefault();
    if (!draggingStopId) return;
    setDropTarget({ day, index });
  }

  function allowDropOnCard(event, day, index) {
    event.preventDefault();
    if (!draggingStopId) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const offset = event.clientY - bounds.top;
    const targetIndex = offset > bounds.height / 2 ? index + 1 : index;
    setDropTarget({ day, index: targetIndex });
  }

  function handleDrop(event, day, index) {
    event.preventDefault();
    if (!draggingStopId) return;
    moveStop(draggingStopId, day, index);
  }

  function toggleDay(day) {
    setExpandedDays((current) => {
      const next = new Set(current);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  }

  const days = [...new Set(stops.map((stop) => stop.day ?? 1))].sort((a, b) => a - b);
  const visibleDays = days.length > 0 ? days : [1];
  const activeStopObject = stops.find((stop) => stop.id === activeStop);

  if (loading) return <div className="loading-state">Loading itinerary…</div>;

  if (!trip) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">!</div>
        <h3>Trip not found</h3>
        <p>This trip may have been deleted.</p>
        <Link to="/trips" className="shell-btn">
          Back to Trips
        </Link>
      </div>
    );
  }

  const globalIndex = (stop) => stops.indexOf(stop) + 1;
  const activeIndex = activeStopObject ? stops.indexOf(activeStopObject) : -1;

  function goToPreviousStop() {
    if (activeIndex > 0) setActiveStop(stops[activeIndex - 1].id);
  }

  function goToNextStop() {
    if (activeIndex > -1 && activeIndex < stops.length - 1) {
      setActiveStop(stops[activeIndex + 1].id);
    }
  }

  return (
    <>
      {shareOpen && <ShareModal tripId={id} onClose={() => setShareOpen(false)} />}

      <div className="shell-page itinerary-page">
        <aside className="detail-rail">
          <div className="detail-rail-header">
            <div className="detail-rail-titleblock">
              <h1 className="section-title">Itinerary</h1>
              <p className="detail-rail-meta">
                {stops.length} stop{stops.length !== 1 ? 's' : ''}
                {stops.some((stop) => stop.lat && stop.lng) ? ` · ${totalKm(stops)} km` : ''}
                {trip.start_date ? ` · ${new Date(trip.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
                {trip.end_date ? ` – ${new Date(trip.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
              </p>
            </div>
            <div className="detail-rail-actions">
              <button
                className={`shell-btn shell-btn-sm itinerary-add-btn ${composerOpen ? 'is-active' : ''}`}
                onClick={() => {
                  setComposerOpen((current) => !current);
                  setComposerDay(visibleDays[0]);
                }}
              >
                + Add stop
              </button>
            </div>
          </div>

          {composerOpen && (
            <div className="panel-card add-stop-panel">
              <div className="panel-header-row">
                <div className="panel-title">Add a stop</div>
                <button
                  className="composer-close"
                  onClick={() => setComposerOpen(false)}
                >
                  esc to close
                </button>
              </div>

              <input
                className="form-input composer-input"
                value={composerText}
                onChange={(event) => setComposerText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    setComposerSelected((current) =>
                      Math.min(current + 1, Math.max(composerResults.length - 1, 0))
                    );
                  } else if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    setComposerSelected((current) => Math.max(current - 1, 0));
                  } else if (event.key === 'Enter') {
                    handleAddStop();
                  } else if (event.key === 'Escape') {
                    setComposerOpen(false);
                  }
                }}
              />

              {composerText.trim() !== '' && (
                <div className="composer-suggestions">
                  {composerSearching ? (
                    <div className="composer-suggestion muted">Searching…</div>
                  ) : composerResults.length > 0 ? (
                    composerResults.map((place, index) => {
                      const category = getCategoryMeta(place.category);
                      return (
                        <button
                          key={`${place.name}-${place.address}-${index}`}
                          className={`composer-suggestion ${composerSelected === index ? 'active' : ''}`}
                          onMouseDown={(event) => {
                            event.preventDefault();
                            setComposerSelected(index);
                          }}
                          onClick={async () => {
                            setComposerSelected(index);
                            setComposerLoading(true);
                            setComposerError('');
                            try {
                              await insertStop({
                                name: place.name,
                                address: place.address ?? null,
                                day: composerDay,
                                notes: place.description || null,
                                category: place.category ?? 'other',
                                lat: place.lat ?? null,
                                lng: place.lng ?? null,
                                stop_time: null,
                                duration_minutes: null,
                              });
                              setComposerText('');
                              setComposerOpen(false);
                              setComposerResults([]);
                              setComposerSelected(0);
                            } catch (requestError) {
                              setComposerError(requestError.message || 'Unable to add a stop right now.');
                            } finally {
                              setComposerLoading(false);
                            }
                          }}
                        >
                          <CategoryIcon kind={category.icon} size={14} />
                          <div className="composer-suggestion-copy">
                            <div className="composer-suggestion-name">{place.name}</div>
                            <div className="composer-suggestion-meta">
                              {place.address}
                              {place.rating ? ` · ★ ${place.rating}` : ''}
                            </div>
                          </div>
                          {composerSelected === index && <span className="composer-suggestion-enter">↵</span>}
                        </button>
                      );
                    })
                  ) : (
                    <>
                      <div className="composer-suggestion active">
                        <CategoryIcon kind="other" size={14} />
                        <div className="composer-suggestion-copy">
                          <div className="composer-suggestion-name">{composerText.trim()}</div>
                          <div className="composer-suggestion-meta">Add as a custom stop</div>
                        </div>
                        <span className="composer-suggestion-enter">↵</span>
                      </div>
                    </>
                  )}
                </div>
              )}

              <div className="chip-row">
                <span className="panel-hint">Add to:</span>
                {visibleDays.map((day) => (
                  <button
                    key={day}
                    className={`tag ${composerDay === day ? 'tag-earth' : 'tag-outline'}`}
                    onClick={() => setComposerDay(day)}
                  >
                    Day {day}
                  </button>
                ))}
              </div>

              {composerError && <div className="banner banner-error">{composerError}</div>}

              <div className="composer-footer">
                <span className="panel-hint">Or drop a pin on the map →</span>
                <button
                  className="shell-btn shell-btn-sm"
                  onClick={handleAddStop}
                  disabled={composerLoading || !composerText.trim()}
                >
                  {composerLoading ? 'Adding…' : 'Add with AI'}
                </button>
              </div>
            </div>
          )}

          <div className="day-list">
            {stops.length === 0 && (
              <div className="empty-inline">
                <p>No stops yet.</p>
                <p>Start with the add stop panel above.</p>
              </div>
            )}

            {visibleDays.map((day) => {
              const dayStops = stops.filter((stop) => (stop.day ?? 1) === day);
              const isOpen = expandedDays.has(day) || dayStops.length === 0;
              const dayDistance = totalKm(dayStops);
              const dayDate = getDayDate(trip.start_date, day);

              return (
                <section key={day} className="day-group">
                  <button
                    className={`day-header ${
                      draggingStopId && dropTarget?.day === day && dropTarget?.index === dayStops.length
                        ? 'drag-over'
                        : ''
                    }`}
                    onClick={() => toggleDay(day)}
                    onDragOver={(event) => allowDrop(event, day, dayStops.length)}
                    onDrop={(event) => handleDrop(event, day, dayStops.length)}
                  >
                    <div className="day-header-left">
                      <span className="day-label">Day {day}</span>
                      {dayDate && <span className="day-date">{dayDate}</span>}
                    </div>
                    <div className="day-header-right">
                      <span className="day-meta">
                        {dayStops.length} stop{dayStops.length !== 1 ? 's' : ''}
                        {dayDistance > 0 ? ` · ${dayDistance} km` : ''}
                      </span>
                      <span className={`day-chevron ${isOpen ? 'open' : ''}`}>▾</span>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="day-body">
                      {draggingStopId && (
                        <div
                          className={`stop-dropzone ${
                            dropTarget?.day === day && dropTarget?.index === 0 ? 'active' : ''
                          }`}
                          onDragOver={(event) => allowDrop(event, day, 0)}
                          onDrop={(event) => handleDrop(event, day, 0)}
                        />
                      )}

                      {dayStops.map((stop, index) => {
                        const category = getCategoryMeta(stop.category);
                        return (
                          <div key={stop.id}>
                            <article
                              className={`stop-card ${activeStop === stop.id ? 'active' : ''} ${
                                draggingStopId === stop.id ? 'dragging' : ''
                              }`}
                              onClick={() => setActiveStop(stop.id === activeStop ? null : stop.id)}
                              draggable={editingStop?.id !== stop.id}
                              onDragStart={(event) => {
                                event.dataTransfer.effectAllowed = 'move';
                                event.dataTransfer.setData('text/plain', String(stop.id));
                                beginDrag(stop.id);
                              }}
                              onDragEnd={() => {
                                setDraggingStopId(null);
                                setDropTarget(null);
                              }}
                              onDragOver={(event) => allowDropOnCard(event, day, index)}
                              onDrop={(event) => {
                                if (!dropTarget) return;
                                handleDrop(event, dropTarget.day, dropTarget.index);
                              }}
                            >
                              <div className="stop-index">{globalIndex(stop)}</div>

                              <div className="stop-copy">
                                {editingStop?.id === stop.id ? (
                                  <EditStopForm
                                    stop={editingStop}
                                    onChange={setEditingStop}
                                    onSave={() => saveEdit(editingStop)}
                                    onCancel={() => setEditingStop(null)}
                                  />
                                ) : (
                                  <>
                                    <div className="stop-topline">
                                      <div className="stop-name">{stop.name}</div>
                                      {stop.stop_time && <div className="stop-time">{stop.stop_time}</div>}
                                    </div>
                                    {stop.address && <div className="stop-subtitle">{stop.address}</div>}
                                    {stop.notes && <div className="stop-notes">{stop.notes}</div>}
                                    {stop.category && stop.category !== 'other' && (
                                      <span className={`tag tag-${category.tone}`}>
                                        <CategoryIcon kind={category.icon} size={11} />
                                        <span>{categoryLabel(stop.category)}</span>
                                      </span>
                                    )}
                                  </>
                                )}
                              </div>

                              {editingStop?.id !== stop.id && (
                                <button
                                className="stop-menu"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  const { start, end } = parseStopTimeRange(stop.stop_time);
                                  setEditingStop({
                                    ...stop,
                                    stopTimeStart: start,
                                    stopTimeEnd: end,
                                  });
                                }}
                                title="Edit stop"
                              >
                                  ⋯
                                </button>
                              )}
                            </article>

                            {draggingStopId && (
                              <div
                                className={`stop-dropzone ${
                                  dropTarget?.day === day && dropTarget?.index === index + 1 ? 'active' : ''
                                }`}
                                onDragOver={(event) => allowDrop(event, day, index + 1)}
                                onDrop={(event) => handleDrop(event, day, index + 1)}
                              />
                            )}
                          </div>
                        );
                      })}

                      <button
                        className="empty-dropzone"
                        onClick={() => {
                          setComposerOpen(true);
                          setComposerDay(day);
                        }}
                      >
                        + Add stop
                      </button>
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </aside>

        <section className="map-stage">
          {stops.some((stop) => stop.lat && stop.lng) ? (
            <MapContainer center={[37.7749, -122.4194]} zoom={12} className="full-map">
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                attribution="© OpenStreetMap © CARTO"
              />
              <MapFit stops={stops} />
              {stops.map((stop, index) =>
                stop.lat && stop.lng ? (
                  <Marker
                    key={stop.id}
                    ref={(instance) => {
                      if (instance) markerRefs.current[stop.id] = instance;
                      else delete markerRefs.current[stop.id];
                    }}
                    position={[stop.lat, stop.lng]}
                    icon={createNumberedPin(index + 1, { active: activeStop === stop.id })}
                    eventHandlers={{
                      click: () => setActiveStop(stop.id),
                      popupclose: () => {
                        setActiveStop((current) => (current === stop.id ? null : current));
                      },
                    }}
                  >
                    <Popup
                      className="stop-detail-popup"
                      closeButton={false}
                      autoPan
                      autoClose={false}
                      closeOnClick={false}
                      offset={[0, -18]}
                    >
                      <div className="stop-popup-card">
                        <div className="stop-popup-media" />
                        <div className="stop-popup-body">
                          <div className="stop-popup-top">
                            <div>
                              <div className="stop-popup-kicker">
                                Stop {globalIndex(stop)} · Day {stop.day ?? 1}
                              </div>
                              <div className="stop-popup-title">{stop.name}</div>
                              {stop.address && (
                                <div className="stop-popup-subtitle">{stop.address}</div>
                              )}
                            </div>
                            <button
                              className="shell-btn shell-btn-ghost shell-btn-sm stop-popup-close"
                              onClick={() => setActiveStop(null)}
                            >
                              ×
                            </button>
                          </div>

                          <div className="chip-row stop-popup-chips">
                            {stop.category && stop.category !== 'other' && (
                              <span className={`tag tag-${getCategoryMeta(stop.category).tone}`}>
                                <CategoryIcon kind={getCategoryMeta(stop.category).icon} size={11} />
                                <span>{categoryLabel(stop.category)}</span>
                              </span>
                            )}
                            {stop.stop_time && (
                              <span className="tag tag-outline">
                                {stop.stop_time}
                                {stop.duration_minutes
                                  ? ` · ~${Math.round(stop.duration_minutes / 60)}h`
                                  : ''}
                              </span>
                            )}
                          </div>

                          {stop.notes && <p className="stop-popup-notes">{stop.notes}</p>}

                          <div className="stop-popup-actions">
                            <button
                              className="shell-btn shell-btn-sm shell-btn-secondary"
                              onClick={() => {
                                const { start, end } = parseStopTimeRange(stop.stop_time);
                                setEditingStop({
                                  ...stop,
                                  stopTimeStart: start,
                                  stopTimeEnd: end,
                                });
                                setActiveStop(null);
                              }}
                            >
                              Edit
                            </button>
                            <button
                              className="shell-btn shell-btn-ghost shell-btn-sm"
                              onClick={goToPreviousStop}
                              disabled={activeIndex <= 0}
                            >
                              ◀
                            </button>
                            <button
                              className="shell-btn shell-btn-ghost shell-btn-sm"
                              onClick={goToNextStop}
                              disabled={activeIndex >= stops.length - 1}
                            >
                              ▶
                            </button>
                            <button
                              className="shell-btn shell-btn-ghost shell-btn-sm danger"
                              onClick={() => deleteStop(stop.id)}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                ) : null
              )}
            </MapContainer>
          ) : (
            <div className="map-empty">
              Stop locations appear here once coordinates are added.
            </div>
          )}

          {composerOpen && (
            <div className="map-hint-card">
              <CategoryIcon
                kind={getCategoryMeta(composerResults[composerSelected]?.category ?? 'attraction').icon}
                size={14}
                color="var(--mother-earth)"
              />
              <span>
                {(composerResults[composerSelected]?.name || composerText || 'Kiyomizu-dera')}
                {' · '}
                tap map to place
              </span>
            </div>
          )}

        </section>
      </div>
    </>
  );
}
