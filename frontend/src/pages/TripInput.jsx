import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import BrandMark from '../components/BrandMark';
import CategoryIcon from '../components/CategoryIcon';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { createNumberedPin, deriveTripStatus } from '../lib/tripPresentation';

const REVEAL_INTERVAL_MS = 350;
const INTEREST_OPTIONS = [
  { id: 'Food & dining', icon: 'food' },
  { id: 'Cafés', icon: 'coffee' },
  { id: 'Culture & history', icon: 'temple' },
  { id: 'Outdoors & nature', icon: 'walk' },
  { id: 'Nightlife', icon: 'food' },
  { id: 'Shopping', icon: 'market' },
  { id: 'Art & museums', icon: 'market' },
  { id: 'Local markets', icon: 'market' },
  { id: 'Hidden gems', icon: 'route' },
  { id: 'Family-friendly', icon: 'stay' },
  { id: 'Wellness & spa', icon: 'stay' },
  { id: 'Adventure', icon: 'walk' },
];

function inferCurrencyFromDestination(destination) {
  const value = destination.trim().toLowerCase();

  if (!value) return 'USD';
  if (value.includes('japan')) return 'JPY';
  if (value.includes('united kingdom') || value.includes('england') || value.includes('scotland')) return 'GBP';
  if (
    value.includes('france') ||
    value.includes('germany') ||
    value.includes('italy') ||
    value.includes('spain') ||
    value.includes('netherlands') ||
    value.includes('portugal') ||
    value.includes('belgium') ||
    value.includes('austria') ||
    value.includes('greece') ||
    value.includes('ireland') ||
    value.includes('finland')
  ) return 'EUR';
  if (value.includes('canada')) return 'CAD';
  if (value.includes('australia')) return 'AUD';
  if (value.includes('singapore')) return 'SGD';
  if (value.includes('indonesia')) return 'IDR';
  if (value.includes('thailand')) return 'THB';
  if (value.includes('south korea') || value.includes('korea')) return 'KRW';
  if (value.includes('china')) return 'CNY';
  if (value.includes('india')) return 'INR';
  if (value.includes('switzerland')) return 'CHF';
  if (value.includes('mexico')) return 'MXN';
  if (value.includes('united states') || value.includes('usa')) return 'USD';

  return 'USD';
}

function buildFallbackStops({ destination, interests, rawText, tripName }) {
  const lines = rawText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const noteStops = lines.slice(0, 6).map((line, index) => ({
    name: line.length > 42 ? `${line.slice(0, 42)}…` : line,
    address: destination || null,
    day: Math.floor(index / 3) + 1,
    notes: line,
    category: 'other',
    lat: null,
    lng: null,
    stop_time: null,
    duration_minutes: null,
  }));

  if (noteStops.length > 0) return noteStops;

  return [
    {
      name: `${tripName || destination || 'Trip'} overview`,
      address: destination || null,
      day: 1,
      notes: [
        interests.length > 0 ? `Focus areas: ${interests.join(', ')}` : null,
      ].filter(Boolean).join(' · ') || 'Generated preview placeholder.',
      category: 'other',
      lat: null,
      lng: null,
      stop_time: null,
      duration_minutes: null,
    },
  ];
}

async function persistTrip({
  budget,
  destination,
  endDate,
  interests,
  navigate,
  rawText,
  startDate,
  stops,
  supabaseClient,
  travelers,
  tripName,
  userId,
}) {
  const name = tripName.trim() || destination.trim() || 'My Trip';

  const { data: trip, error: tripError } = await supabaseClient
    .from('trips')
    .insert({
      name,
      destination: destination.trim() || null,
      raw_input: rawText || null,
      status: deriveTripStatus(startDate, endDate),
      start_date: startDate || null,
      end_date: endDate || null,
      travelers: travelers || null,
      budget: budget || null,
      interests: interests.length > 0 ? interests.join(', ') : null,
      user_id: userId ?? null,
    })
    .select()
    .single();

  if (tripError) throw tripError;

  if (stops.length > 0) {
    const { error: stopsError } = await supabaseClient.from('stops').insert(
      stops
        .filter((stop) => stop.name?.trim())
        .map((stop, index) => ({
          trip_id: trip.id,
          name: stop.name.trim(),
          address: stop.address?.trim() || null,
          day: stop.day || 1,
          position: index,
          notes: stop.notes?.trim() || null,
          category: stop.category || 'other',
          lat: stop.lat ?? null,
          lng: stop.lng ?? null,
          stop_time: stop.stop_time ?? null,
          duration_minutes: stop.duration_minutes ?? null,
        }))
    );

    if (stopsError) throw stopsError;
  }

  navigate(`/trip/${trip.id}`);
}

function MapAutoFit({ stops }) {
  const map = useMap();

  useEffect(() => {
    const points = stops.filter((stop) => stop.lat && stop.lng);
    if (!points.length) return;

    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 13);
      return;
    }

    map.fitBounds(
      points.map((stop) => [stop.lat, stop.lng]),
      { padding: [50, 50] }
    );
  }, [map, stops]);

  return null;
}

export default function TripInput() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const destinationAbortRef = useRef(null);
  const destinationBlurRef = useRef(null);
  const destinationSelectionRef = useRef('');

  const [rawText, setRawText] = useState('');
  const [tripName, setTripName] = useState('');
  const [destination, setDestination] = useState('');
  const [destinationMatches, setDestinationMatches] = useState([]);
  const [destinationOpen, setDestinationOpen] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [travelers, setTravelers] = useState('');
  const [budget, setBudget] = useState('');
  const [flights, setFlights] = useState([
    { outbound: '', outboundArrives: '', returnFlight: '', returnDeparts: '' },
  ]);
  const [hotels, setHotels] = useState([
    { name: '', address: '', checkIn: '', checkOut: '' },
  ]);
  const [interests, setInterests] = useState([]);

  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState('');
  const [allStops, setAllStops] = useState([]);
  const [revealed, setRevealed] = useState(0);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [openOptionalSection, setOpenOptionalSection] = useState('');

  const revealRef = useRef(null);
  const autoSaveTriggeredRef = useRef(false);
  const visibleStops = allStops.slice(0, revealed);
  const estimatedStops = Math.max(0, Math.round(rawText.trim().length / 34));
  const missingRequired = {
    tripName: !tripName.trim(),
    destination: !destination.trim(),
    startDate: !startDate.trim(),
    endDate: !endDate.trim(),
  };
  const budgetCurrency = inferCurrencyFromDestination(destination);
  useEffect(() => {
    if (allStops.length === 0 || revealed >= allStops.length) return undefined;

    revealRef.current = setInterval(() => {
      setRevealed((value) => {
        if (value >= allStops.length) {
          clearInterval(revealRef.current);
          return value;
        }
        return value + 1;
      });
    }, REVEAL_INTERVAL_MS);

    return () => clearInterval(revealRef.current);
  }, [allStops, revealed]);

  useEffect(() => {
    const query = destination.trim();

    if (destinationSelectionRef.current && destinationSelectionRef.current === query) {
      destinationSelectionRef.current = '';
      setDestinationMatches([]);
      setDestinationOpen(false);
      return undefined;
    }

    if (destinationAbortRef.current) {
      destinationAbortRef.current.abort();
    }

    if (query.length < 2) {
      setDestinationMatches([]);
      setDestinationOpen(false);
      return undefined;
    }

    const controller = new AbortController();
    destinationAbortRef.current = controller;

    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/destinations?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        const data = await response.json();

        if (controller.signal.aborted) return;

        const matches = (data.destinations ?? []).filter((item) => item.label !== destination);
        setDestinationMatches(matches);
        setDestinationOpen(matches.length > 0);
      } catch (fetchError) {
        if (fetchError.name === 'AbortError') return;
        setDestinationMatches([]);
        setDestinationOpen(false);
      }
    }, 180);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [destination]);

  function toggleInterest(interest) {
    setInterests((current) =>
      current.includes(interest)
        ? current.filter((value) => value !== interest)
        : [...current, interest]
    );
  }

  function toggleSection(section) {
    setOpenOptionalSection((current) => (current === section ? '' : section));
  }

  async function handleCreate() {
    setSubmitted(true);

    if (!tripName.trim() || !destination.trim() || !startDate.trim() || !endDate.trim()) {
      return;
    }

    setError('');
    setParsing(true);
    setSaving(false);
    setAllStops([]);
    setRevealed(0);
    autoSaveTriggeredRef.current = false;

    try {
      const response = await fetch('/api/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: rawText || `${tripName} in ${destination} from ${startDate} to ${endDate}.`,
          name: tripName || destination || 'My Trip',
          destination: destination || '',
        }),
      });

      if (!response.ok) {
        throw new Error(`Server error ${response.status}`);
      }

      const data = await response.json();
      if (data.error) throw new Error(data.error);

      const stops = data.stops ?? [];
      setAllStops(stops);

      if (stops.length === 0) {
        autoSaveTriggeredRef.current = true;
        await handleSave([]);
      }
    } catch (requestError) {
      const fallbackStops = buildFallbackStops({
        destination,
        interests,
        rawText,
        tripName,
      });
      setAllStops(fallbackStops);
    }
  }

  async function handleSave(stops) {
    setSaving(true);

    try {
      await persistTrip({
        budget: budget ? `${budgetCurrency} ${budget}` : '',
        destination,
        endDate,
        interests,
        navigate,
        rawText,
        startDate,
        stops,
        supabaseClient: supabase,
        travelers,
        tripName,
        userId: user?.id,
      });
    } catch (saveError) {
      setError(`Failed to save: ${saveError.message}`);
      setParsing(false);
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!(allStops.length > 0 && revealed >= allStops.length)) return;
    if (autoSaveTriggeredRef.current) return undefined;

    const timer = window.setTimeout(() => {
      autoSaveTriggeredRef.current = true;
      handleSave(allStops);
    }, 420);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    allStops.length,
    revealed,
  ]);

  const estSeconds =
    allStops.length > 0
      ? Math.max(0, Math.ceil(((allStops.length - revealed) * REVEAL_INTERVAL_MS) / 1000))
      : null;

  if (parsing) {
    const previewRows =
      allStops.length > 0
        ? allStops
        : [
            { name: 'Finding your first stop', address: 'queued' },
            { name: 'Reading day breakdown', address: 'queued' },
            { name: 'Geocoding map pins', address: 'queued' },
          ];

    return (
      <div className="parse-shell">
        <div className="parse-topbar">
          <div className="brand">
            <BrandMark size={24} />
            <span>Waypoint</span>
          </div>
          <button
            className="shell-btn shell-btn-ghost shell-btn-sm"
            onClick={() => {
              setParsing(false);
              setAllStops([]);
              setRevealed(0);
              clearInterval(revealRef.current);
            }}
          >
            Cancel
          </button>
        </div>

        <div className="parse-layout">
          <section className="parse-panel parse-panel-left">
            <div className="parse-kicker">
              <span className="parse-spinner" />
              <span>{saving ? 'Opening itinerary' : 'Building itinerary'}</span>
            </div>
            <h1 className="page-title parse-title">
              {saving
                ? 'Opening itinerary…'
                : revealed < allStops.length || allStops.length === 0
                ? 'Finding stops…'
                : 'All stops placed'}
            </h1>
            <p className="page-subtitle">
              {saving
                ? 'Saving your trip and taking you into the itinerary.'
                : 'Reading your notes, geocoding each place, and drawing the route.'}
            </p>

            <div className="parse-progress">
              <div
                className="parse-progress-fill"
                style={{
                  width:
                    allStops.length > 0
                      ? `${Math.max(14, (revealed / allStops.length) * 100)}%`
                      : '28%',
                }}
              />
            </div>
            <div className="parse-progress-meta">
              <span>
                {allStops.length > 0
                  ? `${revealed} of ${allStops.length} stops placed`
                  : 'Parsing your notes'}
              </span>
              {saving
                ? <span>almost there</span>
                : estSeconds !== null && revealed < allStops.length && <span>est. {estSeconds}s remaining</span>}
            </div>

            <div className="parse-stop-list">
              {previewRows.map((stop, index) => {
                const state =
                  allStops.length === 0
                    ? index === 0
                      ? 'active'
                      : 'pending'
                    : index < revealed
                      ? 'done'
                      : index === revealed
                        ? 'active'
                        : 'pending';

                return (
                  <div key={`${stop.name}-${index}`} className={`parse-stop-row ${state}`}>
                    <div className={`parse-stop-state ${state}`}>
                      {state === 'done' ? '✓' : state === 'active' ? '' : ''}
                    </div>
                    <div className="parse-stop-copy">
                      <div className="parse-stop-name">{stop.name}</div>
                      <div className="parse-stop-sub">
                        {state === 'done'
                          ? stop.lat
                            ? `${stop.address || 'geocoded'} · placed on map`
                            : 'found from notes'
                          : state === 'active'
                            ? 'geocoding…'
                            : 'queued'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="parse-panel parse-panel-map">
            <div className="parse-map-label">
              <span className="sidebar-label">Live preview</span>
              <span className="parse-map-caption">pins appear as each stop is found</span>
            </div>

            <div className="parse-map-frame">
              {visibleStops.some((stop) => stop.lat && stop.lng) ? (
                <MapContainer center={[20, 0]} zoom={2} zoomControl={false} className="full-map">
                  <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  />
                  <MapAutoFit stops={visibleStops} />
                  {visibleStops.map((stop, index) =>
                    stop.lat && stop.lng ? (
                      <Marker
                        key={`${stop.name}-${index}`}
                        position={[stop.lat, stop.lng]}
                        icon={createNumberedPin(index + 1)}
                      />
                    ) : null
                  )}
                </MapContainer>
              ) : (
                <div className="map-empty">
                  {allStops.length === 0 ? 'Parsing your notes…' : 'Waiting for coordinates…'}
                </div>
              )}

              <div className="parse-map-toast">geocoding your route…</div>
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="input-page">
      <div className="input-grid">
        <section className="input-column input-column-wide">
          <div className="section-head">
            <h1 className="section-title">Describe your trip</h1>
            <p className="section-copy">
              Paste notes, emails, or a rough paragraph. Any format works.
            </p>
          </div>

          {error && <div className="banner banner-error">{error}</div>}

          <div className="panel-card notes-card">
            <textarea
              className="notes-field"
              placeholder={`3 days in Kyoto mid-April.
day 1 — fushimi inari early, ramen lunch, gion walk after dinner.
day 2 — arashiyama bamboo + tenryu-ji, evening kaiseki near pontocho.
day 3 — kinkaku-ji, nishiki market, train to osaka 6pm.

need to fit a coffee at % arabica somewhere.`}
              value={rawText}
              onChange={(event) => setRawText(event.target.value)}
              autoFocus
            />

            <div className="notes-footer">
              <span>{rawText.length} characters</span>
              <span>·</span>
              <span>est. {estimatedStops || 0} stops</span>
              <div className="notes-footer-actions">
                <span className="tag tag-outline">Paste email</span>
                <span className="tag tag-outline">Upload .txt</span>
              </div>
            </div>
          </div>
        </section>

        <section className="input-column input-column-side">
          <div className="input-side-header">
            <div className="section-head">
              <h2 className="section-title">Trip details</h2>
              <p className="section-copy">Helps us structure your itinerary.</p>
            </div>
          </div>

          <div className="input-side-scroll">
            <div className="panel-card form-panel accordion-panel open">
              <div className="accordion-header accordion-header-static">
                <div className="panel-title">Basics</div>
              </div>
              <div className="accordion-body">
                <div className="form-stack">
                  <label className="form-label">
                    <span className="form-label-text">Trip name <span className="required-mark">*</span></span>
                    <input
                    required
                    className={`form-input ${submitted && missingRequired.tripName ? 'is-invalid' : ''}`}
                    value={tripName}
                      onChange={(event) => {
                        setTripName(event.target.value);
                        if (error) setError('');
                      }}
                    />
                  </label>
                  <label className="form-label destination-field">
                    <span className="form-label-text">Destination <span className="required-mark">*</span></span>
                    <input
                    required
                    className={`form-input ${submitted && missingRequired.destination ? 'is-invalid' : ''}`}
                    value={destination}
                    onChange={(event) => {
                      setDestination(event.target.value);
                      if (error) setError('');
                    }}
                    onFocus={() => {
                      if (destinationBlurRef.current) {
                        window.clearTimeout(destinationBlurRef.current);
                      }
                      setDestinationOpen(destinationMatches.length > 0);
                    }}
                    onBlur={() => {
                      destinationBlurRef.current = window.setTimeout(() => {
                        setDestinationOpen(false);
                      }, 120);
                    }}
                    />
                    {destinationOpen && destinationMatches.length > 0 && (
                      <div className="destination-menu">
                        {destinationMatches.map((match) => (
                          <button
                            key={match.label}
                            className="destination-option"
                            onMouseDown={(event) => {
                              event.preventDefault();
                              if (destinationBlurRef.current) {
                                window.clearTimeout(destinationBlurRef.current);
                              }
                              destinationSelectionRef.current = match.label;
                              setDestination(match.label);
                              setDestinationMatches([]);
                              setDestinationOpen(false);
                            }}
                          >
                            {match.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </label>
                  <div className="form-grid two-up">
                    <label className="form-label">
                      <span className="form-label-text">Start date <span className="required-mark">*</span></span>
                      <input
                        required
                        className={`form-input ${submitted && missingRequired.startDate ? 'is-invalid' : ''}`}
                        type="date"
                        value={startDate}
                        onChange={(event) => {
                          setStartDate(event.target.value);
                          if (error) setError('');
                        }}
                      />
                    </label>
                    <label className="form-label">
                      <span className="form-label-text">End date <span className="required-mark">*</span></span>
                      <input
                        required
                        className={`form-input ${submitted && missingRequired.endDate ? 'is-invalid' : ''}`}
                        type="date"
                        value={endDate}
                        onChange={(event) => {
                          setEndDate(event.target.value);
                          if (error) setError('');
                        }}
                      />
                    </label>
                  </div>
                  <div className="form-grid two-up">
                    <label className="form-label">
                      Travelers
                      <input
                        className="form-input"
                        value={travelers}
                        onChange={(event) => setTravelers(event.target.value)}
                      />
                    </label>
                    <label className="form-label">
                      Budget
                      <div className="budget-row">
                        <div className="form-input budget-currency-fixed">{budgetCurrency}</div>
                        <input
                          className="form-input"
                          value={budget}
                          onChange={(event) => setBudget(event.target.value)}
                        />
                      </div>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <div className={`panel-card form-panel accordion-panel ${openOptionalSection === 'flights' ? 'open' : ''}`}>
              <button className="accordion-header" onClick={() => toggleSection('flights')}>
                <div className="panel-title">Flights</div>
                <div className="accordion-header-meta">
                  <span className="panel-hint">optional</span>
                </div>
              </button>
              <div className="accordion-body">
                <div className="form-stack">
                  {flights.map((flight, index) => (
                    <div key={`flight-${index}`} className="form-stack">
                      {flights.length > 1 && (
                        <div className="repeat-item-top">
                          <span className="panel-hint">Flight {index + 1}</span>
                          <button
                            className="text-action danger-text"
                            onClick={() =>
                              setFlights((current) => current.filter((_, itemIndex) => itemIndex !== index))
                            }
                          >
                            Delete
                          </button>
                        </div>
                      )}
                      <div className="form-grid flight-grid">
                        <label className="form-label">
                          Outbound
                          <input
                            className="form-input"
                            value={flight.outbound}
                            onChange={(event) =>
                              setFlights((current) =>
                                current.map((item, itemIndex) =>
                                  itemIndex === index ? { ...item, outbound: event.target.value } : item
                                )
                              )
                            }
                          />
                        </label>
                        <label className="form-label">
                          Arrives
                          <input
                            className="form-input"
                            type="datetime-local"
                            value={flight.outboundArrives}
                            onChange={(event) =>
                              setFlights((current) =>
                                current.map((item, itemIndex) =>
                                  itemIndex === index ? { ...item, outboundArrives: event.target.value } : item
                                )
                              )
                            }
                          />
                        </label>
                      </div>
                      <div className="form-grid flight-grid">
                        <label className="form-label">
                          Return
                          <input
                            className="form-input"
                            value={flight.returnFlight}
                            onChange={(event) =>
                              setFlights((current) =>
                                current.map((item, itemIndex) =>
                                  itemIndex === index ? { ...item, returnFlight: event.target.value } : item
                                )
                              )
                            }
                          />
                        </label>
                        <label className="form-label">
                          Departs
                          <input
                            className="form-input"
                            type="datetime-local"
                            value={flight.returnDeparts}
                            onChange={(event) =>
                              setFlights((current) =>
                                current.map((item, itemIndex) =>
                                  itemIndex === index ? { ...item, returnDeparts: event.target.value } : item
                                )
                              )
                            }
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                  <button
                    className="text-action"
                    onClick={() =>
                      setFlights((current) => [
                        ...current,
                        { outbound: '', outboundArrives: '', returnFlight: '', returnDeparts: '' },
                      ])
                    }
                  >
                    + add another flight
                  </button>
                </div>
              </div>
            </div>

            <div className={`panel-card form-panel accordion-panel ${openOptionalSection === 'accommodation' ? 'open' : ''}`}>
              <button className="accordion-header" onClick={() => toggleSection('accommodation')}>
                <div className="panel-title">Accommodation</div>
                <div className="accordion-header-meta">
                  <span className="panel-hint">optional</span>
                </div>
              </button>
              <div className="accordion-body">
                <div className="form-stack">
                  {hotels.map((hotel, index) => (
                    <div key={`hotel-${index}`} className="form-stack">
                      {hotels.length > 1 && index > 0 && (
                        <div className="repeat-item-top">
                          <span className="panel-hint">Stay {index + 1}</span>
                          <button
                            className="text-action danger-text"
                            onClick={() =>
                              setHotels((current) => current.filter((_, itemIndex) => itemIndex !== index))
                            }
                          >
                            Delete
                          </button>
                        </div>
                      )}
                      <label className="form-label">
                        Hotel / Airbnb
                        <input
                          className="form-input"
                          value={hotel.name}
                          onChange={(event) =>
                            setHotels((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, name: event.target.value } : item
                              )
                            )
                          }
                        />
                      </label>
                      <label className="form-label">
                        Address
                        <input
                          className="form-input"
                          value={hotel.address}
                          onChange={(event) =>
                            setHotels((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, address: event.target.value } : item
                              )
                            )
                          }
                        />
                      </label>
                      <div className="form-grid two-up">
                        <label className="form-label">
                          Check-in
                          <input
                            className="form-input"
                            type="date"
                            value={hotel.checkIn}
                            onChange={(event) =>
                              setHotels((current) =>
                                current.map((item, itemIndex) =>
                                  itemIndex === index ? { ...item, checkIn: event.target.value } : item
                                )
                              )
                            }
                          />
                        </label>
                        <label className="form-label">
                          Check-out
                          <input
                            className="form-input"
                            type="date"
                            value={hotel.checkOut}
                            onChange={(event) =>
                              setHotels((current) =>
                                current.map((item, itemIndex) =>
                                  itemIndex === index ? { ...item, checkOut: event.target.value } : item
                                )
                              )
                            }
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                  <button
                    className="text-action"
                    onClick={() =>
                      setHotels((current) => [
                        ...current,
                        { name: '', address: '', checkIn: '', checkOut: '' },
                      ])
                    }
                  >
                    + add another
                  </button>
                </div>
              </div>
            </div>

            <div className={`panel-card accordion-panel ${openOptionalSection === 'interests' ? 'open' : ''}`}>
              <button className="accordion-header" onClick={() => toggleSection('interests')}>
                <div className="panel-title">Interests</div>
                <div className="accordion-header-meta">
                  <span className="panel-hint">optional</span>
                </div>
              </button>
              <div className="accordion-body">
                <div className="interest-row">
                  {INTEREST_OPTIONS.map((interest) => {
                    const active = interests.includes(interest.id);
                    return (
                      <button
                        key={interest.id}
                        className={`tag interest-tag ${active ? 'active' : 'tag-outline'}`}
                        onClick={() => toggleInterest(interest.id)}
                      >
                        <CategoryIcon kind={interest.icon} size={12} />
                        <span>{interest.id}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

          </div>
        </section>
      </div>

      <div className="input-footer">
        <p className="input-footer-copy">
          We&apos;ll parse your notes into structured stops with AI.
        </p>
        <div className="input-footer-actions">
          <button className="shell-btn shell-btn-ghost" onClick={() => window.history.back()}>
            Cancel
          </button>
          <button
            className="shell-btn"
            onClick={handleCreate}
            disabled={saving}
          >
            Create itinerary →
          </button>
        </div>
      </div>
    </div>
  );
}
