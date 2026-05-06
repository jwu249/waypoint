import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import AIChatPanel from '../components/AIChatPanel';
import CategoryIcon from '../components/CategoryIcon';
import TripExplorePanel from '../components/TripExplorePanel';
import { searchPlaces } from '../lib/placeSearch';
import { supabase } from '../lib/supabase';
import { useNav } from '../context/NavContext';
import {
  categoryLabel,
  createNumberedPin,
  formatDateRange,
  getCategoryMeta,
  getDayDate,
  getTripDayCount,
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

function sortStopsByDayAndPosition(items) {
  return [...items].sort((left, right) => {
    const dayDelta = (left.day ?? 1) - (right.day ?? 1);
    if (dayDelta !== 0) return dayDelta;

    const positionDelta = (left.position ?? 0) - (right.position ?? 0);
    if (positionDelta !== 0) return positionDelta;

    return String(left.id ?? '').localeCompare(String(right.id ?? ''));
  });
}

const STOP_REORDER_FLIP_MS = 320;
const STOP_REORDER_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';

function captureStopCardRects(refsMap) {
  const rects = {};
  Object.entries(refsMap.current).forEach(([id, el]) => {
    if (el) rects[id] = el.getBoundingClientRect();
  });
  return rects;
}

function runStopReorderFlip(refsMap, firstRects) {
  if (typeof window === 'undefined') return;

  const moves = [];
  Object.entries(refsMap.current).forEach(([id, el]) => {
    if (!el) return;
    const first = firstRects[id];
    if (!first) return;
    const last = el.getBoundingClientRect();
    const dx = first.left - last.left;
    const dy = first.top - last.top;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
    moves.push({ id, el, dx, dy });
  });

  if (!moves.length) return;

  let cleared = false;
  const clearMotionState = () => {
    if (cleared) return;
    cleared = true;
    moves.forEach(({ el }) => {
      el.style.transform = '';
      el.classList.remove('stop-card-reordering');
      el.classList.remove('stop-card-reordering-active');
    });
  };

  moves.forEach(({ id, el }) => {
    el.getAnimations().forEach((animation) => animation.cancel());
    el.classList.add('stop-card-reordering');
    if (String(id) === String(firstRects.movingStopId)) {
      el.classList.add('stop-card-reordering-active');
    }
  });

  const animations = moves.map(({ el, dx, dy }) =>
    el.animate(
      [
        { transform: `translate(${dx}px, ${dy}px)` },
        { transform: 'translate(0, 0)' },
      ],
      {
        duration: STOP_REORDER_FLIP_MS,
        easing: STOP_REORDER_EASING,
        fill: 'both',
      }
    )
  );

  Promise.allSettled(animations.map((animation) => animation.finished)).then(() => {
    clearMotionState();
  });

  window.setTimeout(clearMotionState, STOP_REORDER_FLIP_MS + 120);
}

function normalizeDateDraft(trip) {
  return {
    startDate: trip?.start_date || '',
    endDate: trip?.end_date || '',
  };
}

function addDaysToIsoDate(value, daysToAdd) {
  if (!value) return '';
  const next = new Date(`${value}T00:00:00`);
  if (Number.isNaN(next.getTime())) return '';
  next.setDate(next.getDate() + daysToAdd);
  return next.toISOString().slice(0, 10);
}

function EditStopForm({ stop, onChange, onSave, onCancel, onDelete }) {
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
        <button className="shell-btn shell-btn-ghost shell-btn-sm danger" onClick={onDelete}>
          Delete
        </button>
      </div>
    </div>
  );
}

function ItineraryDateEditor({
  open,
  dateDraft,
  dateError,
  dateSaving,
  onChange,
  onSave,
  onCancel,
}) {
  if (!open) return null;

  return (
    <div className="detail-rail-date-editor">
      <div className="form-grid two-up detail-rail-date-grid">
        <label className="form-label">
          <span className="form-label-text">Start</span>
          <input
            className="form-input"
            type="date"
            value={dateDraft.startDate}
            onChange={(event) => onChange('startDate', event.target.value)}
          />
        </label>
        <label className="form-label">
          <span className="form-label-text">End</span>
          <input
            className="form-input"
            type="date"
            value={dateDraft.endDate}
            min={dateDraft.startDate || undefined}
            onChange={(event) => onChange('endDate', event.target.value)}
          />
        </label>
      </div>

      {dateError && <div className="banner banner-error">{dateError}</div>}

      <div className="detail-rail-date-actions">
        <button
          className="shell-btn shell-btn-sm"
          onClick={onSave}
          disabled={dateSaving}
        >
          {dateSaving ? 'Saving…' : 'Save dates'}
        </button>
        <button
          className="shell-btn shell-btn-ghost shell-btn-sm"
          onClick={onCancel}
          disabled={dateSaving}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function AddStopComposer({
  open,
  panelRef,
  inputRef,
  composerText,
  composerResults,
  composerSelected,
  composerSearching,
  composerDay,
  composerError,
  composerLoading,
  visibleDays,
  onTextChange,
  onSelectIndex,
  onChoosePlace,
  onSetDay,
  onClose,
  onSubmit,
}) {
  if (!open) return null;

  return (
    <div ref={panelRef} className="panel-card add-stop-panel">
      <div className="panel-header-row">
        <div className="panel-title">Add a stop</div>
        <button className="composer-close" onClick={onClose}>
          esc to close
        </button>
      </div>

      <input
        ref={inputRef}
        className="form-input composer-input"
        value={composerText}
        onChange={(event) => onTextChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            onSelectIndex(Math.min(composerSelected + 1, Math.max(composerResults.length - 1, 0)));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            onSelectIndex(Math.max(composerSelected - 1, 0));
          } else if (event.key === 'Enter') {
            onSubmit();
          } else if (event.key === 'Escape') {
            onClose();
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
                    onSelectIndex(index);
                  }}
                  onClick={() => onChoosePlace(place)}
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
            <div className="composer-suggestion active">
              <CategoryIcon kind="other" size={14} />
              <div className="composer-suggestion-copy">
                <div className="composer-suggestion-name">{composerText.trim()}</div>
                <div className="composer-suggestion-meta">Add as a custom stop</div>
              </div>
              <span className="composer-suggestion-enter">↵</span>
            </div>
          )}
        </div>
      )}

      <div className="chip-row">
        <span className="panel-hint">Add to:</span>
        {visibleDays.map((day) => (
          <button
            key={day}
            className={`tag ${composerDay === day ? 'tag-earth' : 'tag-outline'}`}
            onClick={() => onSetDay(day)}
          >
            Day {day}
          </button>
        ))}
      </div>

      {composerError && <div className="banner banner-error">{composerError}</div>}

      <div className="composer-footer">
        <div className="composer-footer-actions">
          <button
            className="shell-btn shell-btn-sm"
            onClick={onSubmit}
            disabled={composerLoading || composerSearching || !composerText.trim()}
          >
            {composerLoading ? 'Adding…' : 'Add stop'}
          </button>
        </div>
      </div>
    </div>
  );
}

function buildStopInsertPayload({
  place = null,
  name = '',
  day = 1,
  destination = '',
}) {
  if (place) {
    return {
      name: place.name,
      address: place.address ?? null,
      day,
      notes: null,
      category: place.category ?? 'other',
      lat: place.lat ?? null,
      lng: place.lng ?? null,
      stop_time: null,
      duration_minutes: null,
    };
  }

  return {
    name: name.trim(),
    address: destination || null,
    day,
    notes: null,
    category: 'other',
    lat: null,
    lng: null,
    stop_time: null,
    duration_minutes: null,
  };
}

export default function Itinerary() {
  const { id } = useParams();
  const { setTripName, setTripHref, setOnShare } = useNav();
  const markerRefs = useRef({});
  const stopCardRefs = useRef({});
  const reorderFlipFirstRectsRef = useRef(null);
  const composerAbortRef = useRef(null);
  const composerPanelRef = useRef(null);
  const composerInputRef = useRef(null);

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
  const [composerChosenPlace, setComposerChosenPlace] = useState(null);
  const [dateEditorOpen, setDateEditorOpen] = useState(false);
  const [dateDraft, setDateDraft] = useState({ startDate: '', endDate: '' });
  const [dateSaving, setDateSaving] = useState(false);
  const [dateError, setDateError] = useState('');
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [optimizeSummary, setOptimizeSummary] = useState('');
  const highestStopDay = stops.reduce((max, stop) => Math.max(max, stop.day ?? 1), 1);
  const tripDayCount = getTripDayCount(trip?.start_date, trip?.end_date);
  const visibleDayCount = Math.max(tripDayCount ?? 0, highestStopDay, 1);
  const visibleDays = Array.from({ length: visibleDayCount }, (_, index) => index + 1);
  const visibleDayKey = visibleDays.join('|');
  const tripDateRange = formatDateRange(trip?.start_date, trip?.end_date);
  const activeStopObject = stops.find((stop) => stop.id === activeStop);
  const showInteractiveMap = stops.some((stop) => stop.lat && stop.lng);

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

      const loadedStops = sortStopsByDayAndPosition(stopsData ?? []);
      setStops(loadedStops);

      if (loadedStops.length > 0) {
        const days = [...new Set(loadedStops.map((stop) => stop.day ?? 1))].sort((a, b) => a - b);
        setExpandedDays(new Set([days[0]]));
        setComposerDay(days[0]);
      } else {
        setExpandedDays(new Set([1]));
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
    setDateDraft(normalizeDateDraft(trip));
  }, [trip?.start_date, trip?.end_date]);

  useEffect(() => {
    const allowedDays = new Set(visibleDays);

    setExpandedDays((current) => {
      const next = [...current].filter((day) => allowedDays.has(day));
      const same =
        next.length === current.size && next.every((day) => current.has(day));
      return same ? current : new Set(next);
    });

    setComposerDay((current) => (allowedDays.has(current) ? current : visibleDays[0]));
  }, [visibleDayKey]);

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

  useLayoutEffect(() => {
    const firstRects = reorderFlipFirstRectsRef.current;
    reorderFlipFirstRectsRef.current = null;
    if (!firstRects) return;
    runStopReorderFlip(stopCardRefs, firstRects);
  }, [stops]);

  useEffect(() => {
    const currentMarkers = markerRefs.current;

    return () => {
      Object.values(currentMarkers).forEach((marker) => {
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

    if (composerChosenPlace && query === (composerChosenPlace.name || '').trim()) {
      setComposerResults([composerChosenPlace]);
      setComposerSelected(0);
      setComposerSearching(false);
      if (composerAbortRef.current) {
        composerAbortRef.current.abort();
        composerAbortRef.current = null;
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
        const places = await searchPlaces(query, trip?.destination || '', controller.signal);
        if (controller.signal.aborted) return;
        setComposerResults(places);
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
  }, [composerChosenPlace, composerOpen, composerText, trip?.destination]);

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

  function scrollComposerIntoView() {
    window.requestAnimationFrame(() => {
      composerPanelRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
      composerInputRef.current?.focus();
    });
  }

  function openComposer(day = 1) {
    setComposerDay(day);
    setComposerError('');
    setComposerResults([]);
    setComposerSelected(0);
    setComposerSearching(false);
    setComposerChosenPlace(null);
    setComposerOpen(true);
    scrollComposerIntoView();
  }

  function closeComposer() {
    if (composerAbortRef.current) {
      composerAbortRef.current.abort();
      composerAbortRef.current = null;
    }

    setComposerOpen(false);
    setComposerText('');
    setComposerResults([]);
    setComposerSelected(0);
    setComposerSearching(false);
    setComposerChosenPlace(null);
    setComposerError('');
  }

  function openDateEditor() {
    setDateDraft(normalizeDateDraft(trip));
    setDateError('');
    setDateEditorOpen(true);
  }

  function closeDateEditor() {
    setDateDraft(normalizeDateDraft(trip));
    setDateError('');
    setDateEditorOpen(false);
  }

  function updateDateDraft(field, value) {
    setDateDraft((current) => ({
      ...current,
      [field]: value,
    }));
    setDateError('');
  }

  async function saveTripDates() {
    const startDate = dateDraft.startDate;
    const endDate = dateDraft.endDate;

    if (!startDate || !endDate) {
      setDateError('Set both a start and end date before saving.');
      return;
    }

    if (endDate < startDate) {
      setDateError('End date cannot be earlier than the start date.');
      return;
    }

    const minimumEndDate = addDaysToIsoDate(startDate, highestStopDay - 1);
    if (minimumEndDate && endDate < minimumEndDate) {
      setDateError(`End date must be at least ${minimumEndDate} to cover Day ${highestStopDay}.`);
      return;
    }

    setDateSaving(true);
    setDateError('');

    try {
      const { data, error } = await supabase
        .from('trips')
        .update({
          start_date: startDate,
          end_date: endDate,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      if (data) {
        setTrip(data);
      } else {
        setTrip((current) => ({
          ...current,
          start_date: startDate,
          end_date: endDate,
        }));
      }

      setDateEditorOpen(false);
    } catch (saveError) {
      setDateError(saveError.message || 'Unable to save trip dates right now.');
    } finally {
      setDateSaving(false);
    }
  }

  async function handleAddStop() {
    if (composerSearching || !composerText.trim()) return;
    setComposerLoading(true);
    setComposerError('');

    try {
      const chosenPlace = composerChosenPlace ?? composerResults[composerSelected] ?? null;
      const stopToInsert = buildStopInsertPayload({
        place: chosenPlace,
        name: composerText,
        day: composerDay,
        destination: trip?.destination || '',
      });

      await insertStop(stopToInsert);

      closeComposer();
    } catch (requestError) {
      setComposerError(requestError.message || 'Unable to add a stop right now.');
    } finally {
      setComposerLoading(false);
    }
  }

  async function insertStop(stopToInsert) {
    const targetDay = stopToInsert.day ?? composerDay;
    const nextPosition = stops.filter((stop) => (stop.day ?? 1) === targetDay).length;
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
      setStops((current) => sortStopsByDayAndPosition([...current, newStop]));
      setExpandedDays((current) => new Set([...current, targetDay]));
    }
  }

  async function addSuggestedPlace(place, day) {
    await insertStop(buildStopInsertPayload({ place, day }));
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

    reorderFlipFirstRectsRef.current = {
      ...captureStopCardRects(stopCardRefs),
      movingStopId: stopId,
    };
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
    }
  }

  function shiftStop(stopId, direction) {
    const stop = stops.find((item) => item.id === stopId);
    if (!stop) return;

    const day = stop.day ?? 1;
    const dayStops = stops
      .filter((item) => (item.day ?? 1) === day)
      .sort((left, right) => (left.position ?? 0) - (right.position ?? 0));
    const indexInDay = dayStops.findIndex((item) => item.id === stopId);
    if (indexInDay === -1) return;

    if (direction === 'up') {
      if (indexInDay > 0) {
        moveStop(stopId, day, indexInDay - 1);
      } else if (day > 1) {
        const previousDayStops = stops.filter((item) => (item.day ?? 1) === day - 1);
        moveStop(stopId, day - 1, previousDayStops.length);
      }
      return;
    }

    if (indexInDay < dayStops.length - 1) {
      moveStop(stopId, day, indexInDay + 2);
    } else if (day < visibleDayCount) {
      moveStop(stopId, day + 1, 0);
    }
  }

  function toggleDay(day) {
    setExpandedDays((current) => {
      const next = new Set(current);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  }

  async function handleCopilotActions(actions) {
    for (const action of actions) {
      if (action.type === 'add' && action.stop) {
        try {
          await insertStop({
            name: action.stop.name,
            address: action.stop.address ?? null,
            day: action.stop.day ?? 1,
            notes: action.stop.notes ?? null,
            category: action.stop.category ?? 'other',
            lat: action.stop.lat ?? null,
            lng: action.stop.lng ?? null,
            stop_time: action.stop.stop_time ?? null,
            duration_minutes: action.stop.duration_minutes ?? null,
          });
        } catch { /* ignore individual failures */ }
      } else if (action.type === 'remove' && action.name) {
        const match = stops.find((s) => s.name.toLowerCase() === action.name.toLowerCase());
        if (match) await deleteStop(match.id);
      } else if (action.type === 'edit' && action.name && action.updates) {
        const match = stops.find((s) => s.name.toLowerCase() === action.name.toLowerCase());
        if (match) {
          const updates = {};
          if (action.updates.notes !== undefined) updates.notes = action.updates.notes;
          if (action.updates.stop_time !== undefined) updates.stop_time = action.updates.stop_time;
          if (action.updates.day !== undefined) updates.day = action.updates.day;
          if (Object.keys(updates).length > 0) {
            const { data } = await supabase
              .from('stops')
              .update(updates)
              .eq('id', match.id)
              .select()
              .single();
            if (data) {
              setStops((current) => sortStopsByDayAndPosition(
                current.map((item) => (item.id === match.id ? data : item))
              ));
            }
          }
        }
      }
    }
  }

  async function handleOptimize() {
    if (optimizing || stops.length < 2) return;
    setOptimizing(true);
    setOptimizeSummary('');

    try {
      const response = await fetch('/api/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination: trip?.destination || '',
          tripName: trip?.name || '',
          startDate: trip?.start_date || '',
          endDate: trip?.end_date || '',
          stops: stops.map((s) => ({
            id: s.id, name: s.name, day: s.day, category: s.category,
            address: s.address, lat: s.lat, lng: s.lng,
            stop_time: s.stop_time, duration_minutes: s.duration_minutes,
            notes: s.notes, position: s.position,
          })),
        }),
      });

      const data = await response.json();
      const optimized = data.stops || [];

      if (optimized.length > 0) {
        const updates = optimized.map((opt, idx) => ({
          id: opt.id,
          day: opt.day ?? 1,
          position: opt.position ?? idx,
          stop_time: opt.stop_time ?? null,
        }));

        await Promise.all(
          updates.filter((u) => u.id).map((u) =>
            supabase.from('stops').update({
              day: u.day, position: u.position, stop_time: u.stop_time,
            }).eq('id', u.id)
          )
        );

        const idToUpdate = {};
        updates.forEach((u) => { if (u.id) idToUpdate[u.id] = u; });
        setStops((current) => sortStopsByDayAndPosition(
          current.map((s) => {
            const u = idToUpdate[s.id];
            return u ? { ...s, day: u.day, position: u.position, stop_time: u.stop_time } : s;
          })
        ));

        const allDays = [...new Set(updates.map((u) => u.day))];
        setExpandedDays(new Set(allDays));
      }

      setOptimizeSummary(data.summary || 'Itinerary optimized.');
      setTimeout(() => setOptimizeSummary(''), 6000);
    } catch {
      setOptimizeSummary('Optimization failed. Please try again.');
      setTimeout(() => setOptimizeSummary(''), 4000);
    } finally {
      setOptimizing(false);
    }
  }

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
              <div className="detail-rail-meta-row">
                <div className="detail-rail-meta">
                  <span>
                    {stops.length} stop{stops.length !== 1 ? 's' : ''}
                  </span>
                  {stops.some((stop) => stop.lat && stop.lng) && <span>· {totalKm(stops)} km</span>}
                  <span>·</span>
                  <button
                    className={`detail-rail-date-trigger ${dateEditorOpen ? 'is-active' : ''}`}
                    onClick={dateEditorOpen ? closeDateEditor : openDateEditor}
                  >
                    {tripDateRange || 'Set dates'}
                  </button>
                </div>
              </div>

              <ItineraryDateEditor
                open={dateEditorOpen}
                dateDraft={dateDraft}
                dateError={dateError}
                dateSaving={dateSaving}
                onChange={updateDateDraft}
                onSave={saveTripDates}
                onCancel={closeDateEditor}
              />
            </div>
            <div className="detail-rail-actions">
              <button
                className={`shell-btn shell-btn-sm itinerary-add-btn ${composerOpen ? 'is-active' : ''}`}
                onClick={() => openComposer(visibleDays[0])}
              >
                + Add stop
              </button>
              <button
                className={`shell-btn shell-btn-sm shell-btn-secondary ${optimizing ? 'is-active' : ''}`}
                onClick={handleOptimize}
                disabled={optimizing || stops.length < 2}
                title="Optimize stop order by proximity and timing"
              >
                {optimizing ? 'Optimizing…' : '⚡ Optimize'}
              </button>
              <button
                className={`shell-btn shell-btn-sm shell-btn-secondary ${copilotOpen ? 'is-active' : ''}`}
                onClick={() => setCopilotOpen((v) => !v)}
              >
                ✦ AI Copilot
              </button>
            </div>
          </div>

          {optimizeSummary && (
            <div className="banner banner-warning optimize-banner">{optimizeSummary}</div>
          )}

          {copilotOpen && (
            <AIChatPanel
              trip={trip}
              stops={stops}
              onApplyActions={handleCopilotActions}
              onClose={() => setCopilotOpen(false)}
            />
          )}

          <div className="day-list">
            <AddStopComposer
              open={composerOpen}
              panelRef={composerPanelRef}
              inputRef={composerInputRef}
              composerText={composerText}
              composerResults={composerResults}
              composerSelected={composerSelected}
              composerSearching={composerSearching}
              composerDay={composerDay}
              composerError={composerError}
              composerLoading={composerLoading}
              visibleDays={visibleDays}
              onTextChange={(value) => {
                setComposerText(value);
                setComposerChosenPlace(null);
              }}
              onSelectIndex={setComposerSelected}
              onChoosePlace={(place) => {
                setComposerChosenPlace(place);
                setComposerText(place.name);
                setComposerResults([place]);
                setComposerSelected(0);
              }}
              onSetDay={setComposerDay}
              onClose={closeComposer}
              onSubmit={handleAddStop}
            />

            {stops.length === 0 && (
              <div className="empty-inline">
                <p>No stops yet.</p>
                <p>Start with the add stop button above.</p>
              </div>
            )}

            {visibleDays.map((day) => {
              const dayStops = stops.filter((stop) => (stop.day ?? 1) === day);
              const isOpen = expandedDays.has(day);
              const dayDistance = totalKm(dayStops);
              const dayDate = getDayDate(trip.start_date, day);

              return (
                <section key={day} className="day-group">
                  <button className="day-header" onClick={() => toggleDay(day)}>
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
                      {dayStops.map((stop, index) => {
                        const category = getCategoryMeta(stop.category);
                        const isFirstOverall = day === 1 && index === 0;
                        const isLastOverall =
                          day === visibleDayCount && index === dayStops.length - 1;
                        const isEditing = editingStop?.id === stop.id;

                        return (
                          <article
                            key={stop.id}
                            ref={(node) => {
                              if (node) stopCardRefs.current[stop.id] = node;
                              else delete stopCardRefs.current[stop.id];
                            }}
                            className={`stop-card ${activeStop === stop.id ? 'active' : ''}`}
                            onClick={() => setActiveStop(stop.id === activeStop ? null : stop.id)}
                          >
                            <div className="stop-position">
                              <div className="stop-index">{globalIndex(stop)}</div>
                              {!isEditing && (
                                <div className="stop-reorder">
                                  <button
                                    type="button"
                                    className="stop-reorder-btn"
                                    aria-label="Move stop up"
                                    title="Move up"
                                    disabled={isFirstOverall}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      shiftStop(stop.id, 'up');
                                    }}
                                  >
                                    ↑
                                  </button>
                                  <button
                                    type="button"
                                    className="stop-reorder-btn"
                                    aria-label="Move stop down"
                                    title="Move down"
                                    disabled={isLastOverall}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      shiftStop(stop.id, 'down');
                                    }}
                                  >
                                    ↓
                                  </button>
                                </div>
                              )}
                            </div>

                            <div className="stop-copy">
                              {isEditing ? (
                                <EditStopForm
                                  stop={editingStop}
                                  onChange={setEditingStop}
                                  onSave={() => saveEdit(editingStop)}
                                  onCancel={() => setEditingStop(null)}
                                  onDelete={async () => {
                                    await deleteStop(editingStop.id);
                                    setEditingStop(null);
                                  }}
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

                            {!isEditing && (
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
                        );
                      })}

                      <button
                        className="empty-dropzone"
                        onClick={() => {
                          openComposer(day);
                        }}
                      >
                        + Add stop
                      </button>
                    </div>
                  )}
                </section>
              );
            })}

            <TripExplorePanel
              trip={trip}
              stops={stops}
              dayOptions={visibleDays}
              onAddPlace={addSuggestedPlace}
            />
          </div>
        </aside>

        <section className="map-stage">
          {showInteractiveMap ? (
            <MapContainer center={[20, 0]} zoom={12} className="full-map">
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
                      click: () => {
                        if (composerOpen) return;
                        setActiveStop(stop.id);
                      },
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

        </section>
      </div>
    </>
  );
}
