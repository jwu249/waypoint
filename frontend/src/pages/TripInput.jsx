import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

function createParsePin(n) {
  return L.divIcon({
    html: `<div class="map-pin">${n}</div>`,
    className: '',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

function MapAutoFit({ stops }) {
  const map = useMap();
  useEffect(() => {
    const pts = stops.filter((s) => s.lat && s.lng);
    if (pts.length === 0) return;
    if (pts.length === 1) {
      map.setView([pts[0].lat, pts[0].lng], 13);
    } else {
      map.fitBounds(L.latLngBounds(pts.map((s) => [s.lat, s.lng])), { padding: [40, 40] });
    }
  }, [stops, map]);
  return null;
}

function AccordionSection({ title, optional, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="accordion-section">
      <div className="accordion-header" onClick={() => setOpen((v) => !v)}>
        <span className="accordion-title">
          {title}
          {optional && <span className="accordion-optional">optional</span>}
        </span>
        <span className={`accordion-chevron ${open ? 'open' : ''}`}>▾</span>
      </div>
      {open && <div className="accordion-body">{children}</div>}
    </div>
  );
}

const REVEAL_INTERVAL_MS = 350;

export default function TripInput() {
  const navigate   = useNavigate();
  const { user }   = useAuth();

  /* Form fields */
  const [rawText,      setRawText]      = useState('');
  const [tripName,     setTripName]     = useState('');
  const [destination,  setDestination]  = useState('');
  const [startDate,    setStartDate]    = useState('');
  const [endDate,      setEndDate]      = useState('');
  const [travelers,    setTravelers]    = useState('');
  const [budget,       setBudget]       = useState('');
  const [flights,      setFlights]      = useState([{ outbound: '', outboundArrives: '', returnFlight: '', returnDeparts: '' }]);
  const [hotels,       setHotels]       = useState([{ name: '', address: '', checkIn: '', checkOut: '' }]);

  /* Parsing state */
  const [parsing,     setParsing]     = useState(false);
  const [error,       setError]       = useState('');
  const [allStops,    setAllStops]    = useState([]);
  const [revealed,    setRevealed]    = useState(0);
  const [saving,      setSaving]      = useState(false);

  const revealRef = useRef(null);

  const visibleStops = allStops.slice(0, revealed);

  /* Once we have all stops, reveal them one-by-one */
  useEffect(() => {
    if (allStops.length === 0 || revealed >= allStops.length) return;
    revealRef.current = setInterval(() => {
      setRevealed((v) => {
        if (v >= allStops.length) {
          clearInterval(revealRef.current);
          return v;
        }
        return v + 1;
      });
    }, REVEAL_INTERVAL_MS);
    return () => clearInterval(revealRef.current);
  }, [allStops]);

  /* Auto-save once all stops revealed */
  useEffect(() => {
    if (allStops.length > 0 && revealed >= allStops.length) {
      handleSave(allStops);
    }
  }, [revealed, allStops]);

  async function handleCreate() {
    if (!rawText.trim() && !tripName.trim()) {
      setError('Please describe your trip or enter a trip name.');
      return;
    }
    setError('');
    setParsing(true);
    setAllStops([]);
    setRevealed(0);

    try {
      const res = await fetch('/api/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text:        rawText || `Trip to ${destination || 'unknown destination'}`,
          name:        tripName || destination || 'My Trip',
          destination: destination || '',
        }),
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const stops = data.stops ?? [];
      setAllStops(stops);
      if (stops.length === 0) {
        /* Nothing to show — save directly */
        await handleSave([]);
      }
    } catch (err) {
      setError(err.message || 'Failed to parse. Is the Flask server running?');
      setParsing(false);
    }
  }

  async function handleSave(stops) {
    setSaving(true);
    try {
      const name = tripName.trim() || destination.trim() || 'My Trip';

      const { data: trip, error: tripErr } = await supabase
        .from('trips')
        .insert({
          name,
          destination: destination.trim() || null,
          raw_input:   rawText || null,
          status:      'draft',
          start_date:  startDate || null,
          end_date:    endDate   || null,
          travelers:   travelers || null,
          budget:      budget    || null,
          user_id:     user?.id  ?? null,
        })
        .select()
        .single();

      if (tripErr) throw tripErr;

      if (stops.length > 0) {
        const { error: stopsErr } = await supabase.from('stops').insert(
          stops
            .filter((s) => s.name?.trim())
            .map((s, i) => ({
              trip_id:          trip.id,
              name:             s.name.trim(),
              address:          s.address?.trim() || null,
              day:              s.day || 1,
              position:         i,
              notes:            s.notes?.trim() || null,
              category:         s.category || 'other',
              lat:              s.lat  ?? null,
              lng:              s.lng  ?? null,
              stop_time:        s.stop_time ?? null,
              duration_minutes: s.duration_minutes ?? null,
            }))
        );
        if (stopsErr) throw stopsErr;
      }

      navigate(`/trip/${trip.id}`);
    } catch (err) {
      setError(`Failed to save: ${err.message}`);
      setParsing(false);
      setSaving(false);
    }
  }

  const estSeconds = allStops.length > 0
    ? Math.max(0, Math.ceil((allStops.length - revealed) * REVEAL_INTERVAL_MS / 1000))
    : null;

  /* ── Parsing Overlay ── */
  if (parsing) {
    return (
      <div className="parse-overlay">
        <div className="parse-overlay-nav">
          <div className="parse-overlay-brand">
            <div className="nav-brand-circle">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
              </svg>
            </div>
            Waypoint
          </div>
          <button
            className="btn-ghost"
            onClick={() => { setParsing(false); setAllStops([]); setRevealed(0); clearInterval(revealRef.current); }}
          >
            Cancel
          </button>
        </div>

        <div className="parse-overlay-body">
          {/* Left: progress */}
          <div className="parse-left">
            <div className="parse-building-label">
              <div className="parse-pulse-dot" />
              Building Itinerary
            </div>
            <h2 className="parse-heading">
              {revealed < allStops.length || allStops.length === 0 ? 'Finding stops…' : 'All stops placed!'}
            </h2>
            <p className="parse-sub">
              Reading your notes, geocoding each place, and drawing the route.
            </p>

            {allStops.length > 0 && (
              <>
                <div className="parse-progress-bar">
                  <div
                    className="parse-progress-fill"
                    style={{ width: `${(revealed / allStops.length) * 100}%` }}
                  />
                </div>
                <div className="parse-progress-meta">
                  <span>{revealed} of {allStops.length} stops placed</span>
                  {estSeconds !== null && revealed < allStops.length && (
                    <span>est. {estSeconds}s remaining</span>
                  )}
                </div>
              </>
            )}

            {allStops.length === 0 && (
              <div className="parse-progress-bar">
                <div className="parse-progress-fill" style={{ width: '30%', animation: 'none' }} />
              </div>
            )}

            <div className="parse-stop-list">
              {allStops.map((stop, i) => {
                const state = i < revealed ? 'done' : i === revealed ? 'placing' : 'queued';
                return (
                  <div key={i} className="parse-stop-item">
                    <div className={`parse-stop-icon ${state}`}>
                      {state === 'done' ? '✓' : state === 'placing' ? '◌' : ''}
                    </div>
                    <div>
                      <div className="parse-stop-name">{stop.name}</div>
                      <div className="parse-stop-sub">
                        {state === 'done'
                          ? stop.lat
                            ? `${stop.address || 'geocoded'} · placed on map`
                            : `found from notes`
                          : state === 'placing'
                          ? 'geocoding…'
                          : 'queued'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: live map */}
          <div className="parse-right">
            <div className="parse-preview-label">
              <div className="parse-preview-title">Live Preview</div>
              <div className="parse-preview-sub">pins appear as each stop is found</div>
            </div>
            {visibleStops.some((s) => s.lat && s.lng) ? (
              <MapContainer
                center={[20, 0]}
                zoom={2}
                style={{ height: '100%', width: '100%' }}
                zoomControl={false}
              >
                <TileLayer
                  url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                  attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/">CARTO</a>'
                />
                <MapAutoFit stops={visibleStops} />
                {visibleStops.map((stop, i) =>
                  stop.lat && stop.lng ? (
                    <Marker
                      key={i}
                      position={[stop.lat, stop.lng]}
                      icon={createParsePin(i + 1)}
                    />
                  ) : null
                )}
              </MapContainer>
            ) : (
              <div style={{ height: '100%', background: '#E8E4DA', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                {allStops.length === 0 ? 'Parsing your notes…' : 'Waiting for coordinates…'}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ── Main Input Form ── */
  return (
    <div className="input-page">
      <div className="input-layout">
        {/* Left: raw notes */}
        <div className="input-left">
          <h2 className="input-section-title">Describe your trip</h2>
          <p className="input-section-sub">
            Paste notes, emails, or a rough paragraph — any format works.
          </p>
          {error && <div className="error-banner">{error}</div>}
          <textarea
            className="notes-textarea"
            placeholder={`3 days in Kyoto mid-April.
day 1 — fushimi inari early, ramen lunch, gion walk after dinner.
day 2 — arashiyama bamboo + tenryu-ji, evening kaiseki near pontocho.
day 3 — kinkaku-ji, nishiki market, train to osaka 6pm.

need to fit a coffee at % arabica somewhere.`}
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            autoFocus
          />
        </div>

        {/* Right: structured details */}
        <div className="input-right">
          <h2 className="input-section-title">Trip details</h2>
          <p className="input-section-sub">Optional — helps us structure your itinerary.</p>

          <AccordionSection title="Basics" defaultOpen>
            <div className="form-group">
              <label>Trip name</label>
              <input
                className="form-input"
                placeholder="e.g. Kyoto Spring Trip"
                value={tripName}
                onChange={(e) => setTripName(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Destination</label>
              <input
                className="form-input"
                placeholder="e.g. Kyoto, Japan"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
              />
            </div>
            <div className="form-row cols-2">
              <div className="form-group">
                <label>Start date</label>
                <input className="form-input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="form-group">
                <label>End date</label>
                <input className="form-input" type="date" value={endDate}   onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>
            <div className="form-row cols-2">
              <div className="form-group">
                <label>Travelers</label>
                <input className="form-input" placeholder="e.g. 2 adults" value={travelers} onChange={(e) => setTravelers(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Budget</label>
                <input className="form-input" placeholder="e.g. ¥150,000" value={budget} onChange={(e) => setBudget(e.target.value)} />
              </div>
            </div>
          </AccordionSection>

          <AccordionSection title="Flights" optional>
            {flights.map((f, i) => (
              <div key={i}>
                <div className="form-row cols-2" style={{ marginBottom: 8 }}>
                  <div className="form-group">
                    <label>Outbound</label>
                    <input className="form-input" placeholder="e.g. JL 005 · SFO→KIX" value={f.outbound} onChange={(e) => setFlights((prev) => prev.map((x, j) => j === i ? { ...x, outbound: e.target.value } : x))} />
                  </div>
                  <div className="form-group">
                    <label>Arrives</label>
                    <input className="form-input" type="datetime-local" value={f.outboundArrives} onChange={(e) => setFlights((prev) => prev.map((x, j) => j === i ? { ...x, outboundArrives: e.target.value } : x))} />
                  </div>
                </div>
                <div className="form-row cols-2">
                  <div className="form-group">
                    <label>Return</label>
                    <input className="form-input" placeholder="e.g. JL 002 · KIX→SFO" value={f.returnFlight} onChange={(e) => setFlights((prev) => prev.map((x, j) => j === i ? { ...x, returnFlight: e.target.value } : x))} />
                  </div>
                  <div className="form-group">
                    <label>Departs</label>
                    <input className="form-input" type="datetime-local" value={f.returnDeparts} onChange={(e) => setFlights((prev) => prev.map((x, j) => j === i ? { ...x, returnDeparts: e.target.value } : x))} />
                  </div>
                </div>
              </div>
            ))}
            <button className="add-another-btn" onClick={() => setFlights((v) => [...v, { outbound: '', outboundArrives: '', returnFlight: '', returnDeparts: '' }])}>
              + add another flight
            </button>
          </AccordionSection>

          <AccordionSection title="Accommodation" optional>
            {hotels.map((h, i) => (
              <div key={i}>
                <div className="form-group" style={{ marginBottom: 8 }}>
                  <label>Hotel / Airbnb</label>
                  <input className="form-input" placeholder="e.g. Hotel Granvia Kyoto" value={h.name} onChange={(e) => setHotels((prev) => prev.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
                </div>
                <div className="form-group" style={{ marginBottom: 8 }}>
                  <label>Address</label>
                  <input className="form-input" placeholder="Neighborhood or street" value={h.address} onChange={(e) => setHotels((prev) => prev.map((x, j) => j === i ? { ...x, address: e.target.value } : x))} />
                </div>
                <div className="form-row cols-2">
                  <div className="form-group">
                    <label>Check-in</label>
                    <input className="form-input" type="date" value={h.checkIn} onChange={(e) => setHotels((prev) => prev.map((x, j) => j === i ? { ...x, checkIn: e.target.value } : x))} />
                  </div>
                  <div className="form-group">
                    <label>Check-out</label>
                    <input className="form-input" type="date" value={h.checkOut} onChange={(e) => setHotels((prev) => prev.map((x, j) => j === i ? { ...x, checkOut: e.target.value } : x))} />
                  </div>
                </div>
              </div>
            ))}
            <button className="add-another-btn" onClick={() => setHotels((v) => [...v, { name: '', address: '', checkIn: '', checkOut: '' }])}>
              + add another
            </button>
          </AccordionSection>
        </div>
      </div>

      {/* Footer */}
      <div className="input-footer">
        <p className="input-footer-hint">We&apos;ll parse your notes into structured stops with AI.</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-secondary btn-sm" onClick={() => window.history.back()}>
            Cancel
          </button>
          <button
            className="btn-primary btn-sm"
            onClick={handleCreate}
            disabled={saving || (!rawText.trim() && !tripName.trim() && !destination.trim())}
          >
            Create Itinerary →
          </button>
        </div>
      </div>
    </div>
  );
}
