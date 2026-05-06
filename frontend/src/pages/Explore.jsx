import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TripMapThumbnail from '../components/TripMapThumbnail';
import { useAuth } from '../context/AuthContext';
import { useNav } from '../context/NavContext';
import { supabase } from '../lib/supabase';
import { localPlacesForDestination } from '../lib/exploreSuggestions';
import { deriveTripStatus } from '../lib/tripPresentation';

const GENERAL_FEATURED = {
  title: 'Kyoto in spring',
  sub: '7 days · culture, food, temples',
  by: 'Curated by Waypoint',
  desc: 'Cherry blossoms, early shrine visits, market snacks, and slower evening walks through Gion.',
  destination: 'Kyoto, Japan',
  stops: [
    { name: 'Kiyomizu-dera', lat: 34.9949, lng: 135.785 },
    { name: 'Yasaka Shrine', lat: 35.0037, lng: 135.7788 },
    { name: 'Nishiki Market', lat: 35.005, lng: 135.764 },
    { name: 'Philosopher’s Path', lat: 35.0269, lng: 135.7982 },
    { name: '% Arabica Higashiyama', lat: 34.9963, lng: 135.7816 },
  ],
};

const GENERAL_TRENDING = [
  { title: 'Lisbon long weekend', meta: '3 days · 9 stops', destination: 'Lisbon, Portugal' },
  { title: 'Iceland ring road', meta: '7 days · 8 stops', destination: 'Reykjavik, Iceland' },
  { title: 'Tokyo cherry blossoms', meta: '5 days · 14 stops', destination: 'Tokyo, Japan' },
  { title: 'Mexico City food crawl', meta: '4 days · 9 stops', destination: 'Mexico City, Mexico' },
  { title: 'Barcelona weekend', meta: '3 days · 11 stops', destination: 'Barcelona, Spain' },
  { title: 'Bali island hop', meta: '8 days · 12 stops', destination: 'Bali, Indonesia' },
];

function extractDayCount(meta, fallback = 1) {
  const match = (meta || '').match(/(\d+)\s+days?/i);
  const value = Number.parseInt(match?.[1] || '', 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function addDays(baseDate, dayOffset) {
  const next = new Date(baseDate);
  next.setDate(next.getDate() + dayOffset);
  return next.toISOString().slice(0, 10);
}

export default function Explore() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { setTripName, setTripHref, setOnShare } = useNav();
  const [pendingIdea, setPendingIdea] = useState(null);
  const [dateDraft, setDateDraft] = useState({ startDate: '', endDate: '' });
  const [creatingTrip, setCreatingTrip] = useState(false);

  useEffect(() => () => {
    setTripName('');
    setTripHref('');
    setOnShare(null);
  }, [setOnShare, setTripHref, setTripName]);

  const pendingIdeaDayCount = pendingIdea
    ? extractDayCount(pendingIdea.meta || pendingIdea.sub, 1)
    : 1;

  async function createTripFromIdea({
    destination,
    title,
    description = '',
    meta = '',
    startDateIso,
    endDateIso,
    stops = [],
  }) {
    const name = title || destination || 'New Trip';
    const dayCount = extractDayCount(meta, 1);
    const seededStops = (stops || [])
      .filter((stop) => stop.name)
      .map((stop, index) => ({
        name: stop.name.trim(),
        address: stop.address?.trim() || null,
        day: Math.min(dayCount, Math.floor(index / 3) + 1),
        position: index,
        notes: null,
        category: stop.category || 'other',
        lat: stop.lat ?? null,
        lng: stop.lng ?? null,
        stop_time: null,
        duration_minutes: null,
      }));

    const { data: trip, error: tripError } = await supabase
      .from('trips')
      .insert({
        name,
        destination: destination?.trim() || null,
        raw_input: description || null,
        status: deriveTripStatus(startDateIso, endDateIso),
        start_date: startDateIso,
        end_date: endDateIso,
        user_id: user?.id ?? null,
      })
      .select()
      .single();

    if (tripError) throw tripError;

    if (seededStops.length > 0) {
      const { error: stopsError } = await supabase.from('stops').insert(
        seededStops.map((stop) => ({
          ...stop,
          trip_id: trip.id,
        }))
      );

      if (stopsError) throw stopsError;
    }

    navigate(`/trip/${trip.id}`);
  }

  function openIdeaDatePrompt(idea) {
    setPendingIdea(idea);
    setDateDraft({
      startDate: '',
      endDate: '',
    });
  }

  function closeIdeaDatePrompt() {
    if (creatingTrip) return;
    setPendingIdea(null);
    setDateDraft({ startDate: '', endDate: '' });
  }

  async function submitIdeaTrip() {
    if (!pendingIdea || !dateDraft.startDate || !dateDraft.endDate) return;
    setCreatingTrip(true);

    try {
      await createTripFromIdea({
        destination: pendingIdea.destination,
        title: pendingIdea.title,
        description: pendingIdea.description || `${pendingIdea.title} · ${pendingIdea.meta || pendingIdea.sub || ''}`,
        meta: pendingIdea.meta || pendingIdea.sub || '',
        startDateIso: dateDraft.startDate,
        endDateIso: dateDraft.endDate,
        stops: localPlacesForDestination(pendingIdea.destination, null, []),
      });
    } finally {
      setCreatingTrip(false);
    }
  }

  return (
    <div className="explore-general-page">
      <div className="explore-general-shell">
        <section className="explore-general-header">
          <div className="section-head">
            <div className="sidebar-label">Explore</div>
            <h1 className="page-title">Where to next?</h1>
            <p className="page-subtitle">
              Curated trip ideas, popular destinations, and themed itineraries to kick off your next plan.
            </p>
          </div>
        </section>

        <section className="explore-general-hero">
          <div className="explore-general-hero-map">
            <TripMapThumbnail stops={GENERAL_FEATURED.stops} />
          </div>
          <div className="explore-general-hero-copy">
            <div className="sidebar-label">{GENERAL_FEATURED.by}</div>
            <h2 className="explore-general-hero-title">{GENERAL_FEATURED.title}</h2>
            <div className="explore-general-hero-meta">{GENERAL_FEATURED.sub}</div>
            <p className="section-copy">{GENERAL_FEATURED.desc}</p>
            <div className="explore-general-hero-actions">
              <button
                className="shell-btn"
                onClick={() =>
                  openIdeaDatePrompt({
                    destination: GENERAL_FEATURED.destination,
                    title: GENERAL_FEATURED.title,
                    description: GENERAL_FEATURED.desc,
                    meta: GENERAL_FEATURED.sub,
                  })
                }
              >
                Use as trip
              </button>
            </div>
          </div>
        </section>

        <section className="explore-general-section">
          <div className="explore-general-section-head">
            <div className="section-title-row">
              <h2 className="section-title">Popular trip ideas</h2>
            </div>
          </div>
          <div className="explore-trip-idea-grid">
            {GENERAL_TRENDING.map((idea) => (
              <article key={idea.title} className="trip-card explore-trip-idea-card">
                <div className="trip-card-map">
                  <TripMapThumbnail stops={localPlacesForDestination(idea.destination, null, []).slice(0, 3)} />
                </div>
                <div className="trip-card-body">
                  <div className="trip-card-title">{idea.title}</div>
                  <div className="trip-card-date">{idea.meta}</div>
                  <div className="explore-trip-idea-actions">
                    <button
                      className="shell-btn shell-btn-sm"
                      onClick={() => openIdeaDatePrompt(idea)}
                    >
                      Use as trip
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>

      {pendingIdea && (
        <div className="modal-overlay" onClick={closeIdeaDatePrompt}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="panel-title">{pendingIdea.title}</div>
            <div className="panel-hint">
              Pick a start date. This template stays fixed at {pendingIdeaDayCount} day{pendingIdeaDayCount !== 1 ? 's' : ''}.
            </div>
            <div className="detail-rail-date-editor">
              <div className="detail-rail-date-field">
                <label>Start</label>
                <input
                  type="date"
                  className="form-input"
                  value={dateDraft.startDate}
                  onChange={(event) =>
                    setDateDraft({
                      startDate: event.target.value,
                      endDate: event.target.value
                        ? addDays(event.target.value, Math.max(pendingIdeaDayCount - 1, 0))
                        : '',
                    })
                  }
                />
              </div>
              <div className="detail-rail-date-field">
                <label>End</label>
                <input
                  type="date"
                  className="form-input"
                  value={dateDraft.endDate}
                  readOnly
                  disabled
                />
              </div>
            </div>
            <div className="explore-general-cta">
              <button className="shell-btn shell-btn-secondary" onClick={closeIdeaDatePrompt} disabled={creatingTrip}>
                Cancel
              </button>
              <button
                className="shell-btn"
                onClick={submitIdeaTrip}
                disabled={creatingTrip || !dateDraft.startDate || !dateDraft.endDate}
              >
                {creatingTrip ? 'Creating…' : 'Create trip'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
