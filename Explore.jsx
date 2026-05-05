import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import CategoryIcon from '../components/CategoryIcon';
import TripMapThumbnail from '../components/TripMapThumbnail';
import { useNav } from '../context/NavContext';
import { supabase } from '../lib/supabase';
import { createNumberedPin, createSuggestPin, getCategoryMeta } from '../lib/tripPresentation';

const CATEGORIES = [
  { id: 'food', label: 'Food', icon: 'food', tone: 'bay' },
  { id: 'temples', label: 'Temples', icon: 'temple', tone: 'blue' },
  { id: 'walks', label: 'Walks', icon: 'walk', tone: 'vinnie' },
  { id: 'markets', label: 'Markets', icon: 'market', tone: 'neutral' },
  { id: 'coffee', label: 'Coffee', icon: 'coffee', tone: 'outline' },
];

const LOCAL_EXPLORE_SEEDS = {
  tokyo: [
    { name: 'Senso-ji', address: 'Asakusa, Tokyo, Japan', category: 'attraction', description: 'Historic temple complex with Nakamise shopping street.', rating: 4.7, price: 'Free', hours: 'Open daily', lat: 35.7148, lng: 139.7967 },
    { name: 'Koffee Mameya', address: 'Omotesando, Tokyo, Japan', category: 'restaurant', description: 'Specialty coffee counter with tasting-led service.', rating: 4.6, price: '$$', hours: 'Open 11:00 – 18:00', lat: 35.6671, lng: 139.7055 },
    { name: 'Ameyoko Market', address: 'Ueno, Tokyo, Japan', category: 'other', description: 'Bustling local market for street food and snacks.', rating: 4.4, price: '$', hours: 'Best daytime', lat: 35.709, lng: 139.7745 },
    { name: 'Meiji Jingu', address: 'Shibuya, Tokyo, Japan', category: 'attraction', description: 'Forest shrine and cultural landmark near Harajuku.', rating: 4.7, price: 'Free', hours: 'Open daily', lat: 35.6764, lng: 139.6993 },
    { name: 'Yoyogi Park Walk', address: 'Shibuya, Tokyo, Japan', category: 'activity', description: 'Easy outdoor loop for a lighter pace afternoon.', rating: 4.5, price: 'Free', hours: 'Open daily', lat: 35.6728, lng: 139.6949 },
  ],
  kyoto: [
    { name: 'Kiyomizu-dera', address: 'Higashiyama, Kyoto, Japan', category: 'attraction', description: 'Iconic hillside temple with broad city views.', rating: 4.7, price: '¥500', hours: 'Open 6:00 – 18:00', lat: 34.9949, lng: 135.785 },
    { name: '% Arabica Higashiyama', address: 'Higashiyama, Kyoto, Japan', category: 'restaurant', description: 'Minimal coffee stop near the old temple streets.', rating: 4.6, price: '$$', hours: 'Open 8:00 – 18:00', lat: 34.9963, lng: 135.7816 },
    { name: 'Nishiki Market', address: 'Nakagyo, Kyoto, Japan', category: 'other', description: 'Covered market lane for snacks, sweets, and Kyoto specialties.', rating: 4.4, price: '$', hours: 'Best daytime', lat: 35.005, lng: 135.764 },
    { name: 'Philosopher’s Path', address: 'Sakyo, Kyoto, Japan', category: 'activity', description: 'Gentle canal-side walk lined with shrines and small cafés.', rating: 4.5, price: 'Free', hours: 'Open daily', lat: 35.0269, lng: 135.7982 },
    { name: 'Yasaka Shrine', address: 'Gion, Kyoto, Japan', category: 'attraction', description: 'Central shrine that fits well with an evening Gion walk.', rating: 4.6, price: 'Free', hours: 'Open daily', lat: 35.0037, lng: 135.7788 },
  ],
  osaka: [
    { name: 'Kuromon Market', address: 'Namba, Osaka, Japan', category: 'other', description: 'Lively market for seafood, skewers, and quick bites.', rating: 4.4, price: '$', hours: 'Best daytime', lat: 34.6654, lng: 135.5063 },
    { name: 'Osaka Castle Park', address: 'Chuo, Osaka, Japan', category: 'activity', description: 'Castle grounds with an easy walk and seasonal views.', rating: 4.6, price: 'Free', hours: 'Open daily', lat: 34.6873, lng: 135.5262 },
    { name: 'Shitenno-ji', address: 'Tennoji, Osaka, Japan', category: 'attraction', description: 'Historic Buddhist temple with a calmer atmosphere.', rating: 4.5, price: '¥300', hours: 'Open 8:30 – 16:30', lat: 34.6533, lng: 135.5163 },
    { name: 'LiLo Coffee Roasters', address: 'Shinsaibashi, Osaka, Japan', category: 'restaurant', description: 'Specialty coffee stop with a strong bean selection.', rating: 4.6, price: '$$', hours: 'Open 11:00 – 19:00', lat: 34.6708, lng: 135.4995 },
    { name: 'Hozenji Yokocho', address: 'Namba, Osaka, Japan', category: 'activity', description: 'Lantern-lit alley that works well for an evening walk.', rating: 4.5, price: 'Free', hours: 'Evening-friendly', lat: 34.6687, lng: 135.5023 },
  ],
  generic: [
    { name: 'Old Town Landmark', address: 'Central district', category: 'attraction', description: 'A cultural stop that usually works well for a first-day anchor.', rating: 4.5, price: 'Free', hours: 'Open daily', lat: null, lng: null },
    { name: 'Central Market', address: 'Market district', category: 'other', description: 'Good for browsing local snacks and small souvenirs.', rating: 4.3, price: '$', hours: 'Best daytime', lat: null, lng: null },
    { name: 'Signature Coffee Stop', address: 'City center', category: 'restaurant', description: 'Easy café break to slot between bigger stops.', rating: 4.5, price: '$$', hours: 'Open daily', lat: null, lng: null },
    { name: 'Scenic Walk', address: 'Waterfront or park area', category: 'activity', description: 'Low-pressure outdoor route for a relaxed afternoon.', rating: 4.4, price: 'Free', hours: 'Open daily', lat: null, lng: null },
  ],
};

const GENERAL_FEATURED = {
  title: 'Kyoto in spring',
  sub: '7 days · culture, food, temples',
  by: 'Curated by Waypoint',
  desc: 'Cherry blossoms, early shrine visits, market snacks, and slower evening walks through Gion.',
  destination: 'Kyoto, Japan',
  chips: [
    { label: 'Culture', icon: 'temple', tone: 'blue' },
    { label: 'Food', icon: 'food', tone: 'bay' },
    { label: 'Outdoors', icon: 'walk', tone: 'vinnie' },
  ],
  stops: [
    { name: 'Kiyomizu-dera', lat: 34.9949, lng: 135.785 },
    { name: 'Yasaka Shrine', lat: 35.0037, lng: 135.7788 },
    { name: 'Nishiki Market', lat: 35.005, lng: 135.764 },
    { name: 'Philosopher’s Path', lat: 35.0269, lng: 135.7982 },
    { name: '% Arabica Higashiyama', lat: 34.9963, lng: 135.7816 },
  ],
};

const GENERAL_TRENDING = [
  { title: 'Lisbon long weekend', tag: 'Trending', tone: 'bay', meta: '3 days · 9 stops', destination: 'Lisbon, Portugal' },
  { title: 'Iceland ring road', tag: 'Popular', tone: 'blue', meta: '7 days · 8 stops', destination: 'Reykjavik, Iceland' },
  { title: 'Tokyo cherry blossoms', tag: 'Trending', tone: 'vinnie', meta: '5 days · 14 stops', destination: 'Tokyo, Japan' },
  { title: 'Mexico City food crawl', tag: 'New', tone: 'bay', meta: '4 days · 9 stops', destination: 'Mexico City, Mexico' },
  { title: 'Barcelona weekend', tag: 'Popular', tone: 'blue', meta: '3 days · 11 stops', destination: 'Barcelona, Spain' },
  { title: 'Bali island hop', tag: 'New', tone: 'vinnie', meta: '8 days · 12 stops', destination: 'Bali, Indonesia' },
];

function localPlacesForDestination(destination, category, currentStops = []) {
  const key = destination.toLowerCase();
  const base =
    key.includes('tokyo') ? LOCAL_EXPLORE_SEEDS.tokyo
      : key.includes('kyoto') ? LOCAL_EXPLORE_SEEDS.kyoto
        : key.includes('osaka') ? LOCAL_EXPLORE_SEEDS.osaka
          : LOCAL_EXPLORE_SEEDS.generic;

  const existing = new Set((currentStops || []).map((stop) => stop.name?.toLowerCase()).filter(Boolean));
  const categoryMap = {
    food: ['restaurant'],
    coffee: ['restaurant'],
    temples: ['attraction'],
    walks: ['activity'],
    markets: ['other'],
  };

  return base
    .filter((place) => !existing.has(place.name.toLowerCase()))
    .filter((place) => {
      if (!category) return true;
      return categoryMap[category]?.includes(place.category);
    });
}

function MapFit({ points }) {
  const map = useMap();

  useEffect(() => {
    const markers = points.filter((point) => point.lat && point.lng);
    if (!markers.length) return;

    if (markers.length === 1) {
      map.setView([markers[0].lat, markers[0].lng], 13);
      return;
    }

    map.fitBounds(
      markers.map((point) => [point.lat, point.lng]),
      { padding: [60, 60] }
    );
  }, [map, points]);

  return null;
}

function MapFocus({ place }) {
  const map = useMap();

  useEffect(() => {
    if (!place?.lat || !place?.lng) return;
    map.setView([place.lat, place.lng], 14, { animate: true });
  }, [map, place]);

  return null;
}

export default function Explore() {
  const [params] = useSearchParams();
  const tripId = params.get('tripId');
  const { setTripName, setTripHref, setOnShare } = useNav();

  const [trip, setTrip] = useState(null);
  const [tripStops, setTripStops] = useState([]);
  const [places, setPlaces] = useState([]);
  const [added, setAdded] = useState(new Set());
  const [activePlace, setActivePlace] = useState(null);
  const [activeCategory, setActiveCategory] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [mapLayer, setMapLayer] = useState('both');
  const [selectedDay, setSelectedDay] = useState(1);
  const requestIdRef = useRef(0);

  // Stable identity: every caller passes `stops` explicitly, so we don't depend on
  // tripStops here. Including tripStops would re-create this callback whenever
  // setTripStops([]) ran, which then re-fired the loadTripContext effect (which
  // calls setTripStops([]) again) — an infinite render loop that left other routes
  // looking "stuck" until a full reload.
  const fetchSuggestions = useCallback(async (destination, category, stops) => {
    if (!destination) return;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const nextStops = stops || [];
    setLoading(true);

    try {
      const response = await fetch('/api/explore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination,
          category: category || '',
          stops: nextStops.map((stop) => ({ name: stop.name })),
        }),
      });

      const data = response.ok ? await response.json() : null;
      const nextPlaces = data?.places?.length
        ? data.places
        : localPlacesForDestination(destination, category, nextStops);
      if (requestId !== requestIdRef.current) return;
      setPlaces(nextPlaces);
      setActivePlace((current) => {
        if (current === null) return null;
        return nextPlaces[current] ? current : null;
      });
      setHasLoadedOnce(true);
    } catch {
      const fallbackPlaces = localPlacesForDestination(destination, category, nextStops);
      if (requestId !== requestIdRef.current) return;
      setPlaces(fallbackPlaces);
      setActivePlace((current) => {
        if (current === null) return null;
        return fallbackPlaces[current] ? current : null;
      });
      setHasLoadedOnce(true);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    let ignore = false;

    async function loadTripContext() {
      if (!tripId) {
        setTrip(null);
        setTripStops([]);
        setTripName('');
        setTripHref('');
        setOnShare(null);
        return;
      }

      const [{ data: tripData }, { data: stopsData }] = await Promise.all([
        supabase.from('trips').select('*').eq('id', tripId).single(),
        supabase.from('stops').select('*').eq('trip_id', tripId).order('day').order('position'),
      ]);

      if (ignore) return;

      setTrip(tripData);
      setTripStops(stopsData ?? []);
      setTripName(tripData?.name || '');
      setTripHref(tripData?.id ? `/trip/${tripData.id}` : '');
      setOnShare(null);
      setAdded(new Set((stopsData ?? []).map((stop) => stop.name)));

      if (tripData?.destination) {
        await fetchSuggestions(tripData.destination, null, stopsData ?? []);
      }
    }

    loadTripContext();

    return () => {
      ignore = true;
    };
  }, [tripId, fetchSuggestions, setOnShare, setTripHref, setTripName]);

  useEffect(() => () => {
    setTripName('');
    setTripHref('');
    setOnShare(null);
  }, [setOnShare, setTripHref, setTripName]);

  useEffect(() => {
    if (trip) return undefined;
    const query = search.trim();
    if (query.length < 2) {
      setPlaces([]);
      setActivePlace(null);
      setLoading(false);
      setHasLoadedOnce(false);
      return undefined;
    }

    const timer = window.setTimeout(() => {
      fetchSuggestions(query, activeCategory, []);
    }, 180);

    return () => {
      window.clearTimeout(timer);
    };
  }, [activeCategory, fetchSuggestions, search, trip]);

  useEffect(() => {
    if (tripStops.length === 0) {
      setSelectedDay(1);
      return;
    }
    const maxDay = Math.max(...tripStops.map((stop) => stop.day ?? 1));
    setSelectedDay(maxDay);
  }, [tripStops]);

  function selectCategory(category) {
    const next = activeCategory === category ? null : category;
    setActiveCategory(next);
    const destination = trip?.destination || search;
    if (destination) fetchSuggestions(destination, next, tripStops);
  }

  function handleSearch(event) {
    if (event.key !== 'Enter') return;

    if (trip) {
      fetchSuggestions(trip.destination, activeCategory, tripStops);
      return;
    }

    if (search.trim()) {
      fetchSuggestions(search.trim(), activeCategory, []);
    }
  }

  async function addToTrip(place, day = selectedDay) {
    if (!tripId || added.has(place.name)) return;

    const { error } = await supabase.from('stops').insert({
      trip_id: tripId,
      name: place.name,
      address: place.address ?? null,
      lat: place.lat ?? null,
      lng: place.lng ?? null,
      notes: place.description ?? null,
      category: place.category ?? 'other',
      day,
      position: tripStops.length,
    });

    if (!error) {
      setAdded((current) => new Set([...current, place.name]));
      const { data } = await supabase
        .from('stops')
        .select('*')
        .eq('trip_id', tripId)
        .order('position');

      if (data) setTripStops(data);
    }
  }

  const searchTerm = search.trim().toLowerCase();
  const filteredPlaces = trip
    ? places.filter((place) => {
        if (!searchTerm) return true;
        return (
          place.name.toLowerCase().includes(searchTerm) ||
          (place.address || '').toLowerCase().includes(searchTerm)
        );
      })
    : places.filter((place) => {
        if (!searchTerm) return true;
        return (
          place.name.toLowerCase().includes(searchTerm) ||
          (place.address || '').toLowerCase().includes(searchTerm)
        );
      });

  const mapPoints = [
    ...(mapLayer !== 'suggested' ? tripStops : []),
    ...(mapLayer !== 'stops' ? filteredPlaces : []),
  ].filter((point) => point.lat && point.lng);

  const activeObject = activePlace !== null ? filteredPlaces[activePlace] : null;
  const tripDays = tripStops.length > 0
    ? [...new Set(tripStops.map((stop) => stop.day ?? 1))].sort((a, b) => a - b)
    : [1];

  function runGeneralSearch(destination, category = activeCategory) {
    setSearch(destination);
    setActiveCategory(category || null);
    fetchSuggestions(destination, category || null, []);
  }

  if (!trip) {
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

            <div className="explore-general-searchbar">
              <input
                className="form-input form-input-lg"
                placeholder="Search a city, country, or vibe…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={handleSearch}
              />
              <div className="chip-row">
                {CATEGORIES.map((category) => (
                  <button
                    key={category.id}
                    className={`tag ${
                      activeCategory === category.id ? `tag-${category.tone}` : 'tag-outline'
                    }`}
                    onClick={() => selectCategory(category.id)}
                  >
                    <CategoryIcon kind={category.icon} size={11} />
                    <span>{category.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </section>

          {hasLoadedOnce && (
            <section className="explore-general-section">
              <div className="explore-general-section-head">
                <div className="section-title-row">
                  <h2 className="section-title">Search results</h2>
                  <span className="panel-hint">{filteredPlaces.length} places</span>
                </div>
              </div>

              {!hasLoadedOnce && loading ? null : filteredPlaces.length === 0 ? (
                <div className="empty-inline">
                  <p>No places found yet.</p>
                  <p>Try another destination or theme.</p>
                </div>
              ) : (
                <div className="explore-general-results">
                  {filteredPlaces.map((place, index) => {
                    const category = getCategoryMeta(place.category);
                    return (
                      <article
                        key={`${place.name}-${index}`}
                        className={`explore-card ${activePlace === index ? 'active' : ''}`}
                        onClick={() => setActivePlace(activePlace === index ? null : index)}
                      >
                        <div className="explore-card-icon">
                          <CategoryIcon kind={category.icon} size={18} />
                        </div>
                        <div className="explore-card-copy">
                          <div className="explore-card-name">{place.name}</div>
                          <div className="explore-card-sub">{place.address}</div>
                          <div className="explore-card-meta">
                            {place.rating && <span>★ {place.rating}</span>}
                            {place.price && <span>{place.price}</span>}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          <section className="explore-general-hero">
            <div className="explore-general-hero-map">
              <TripMapThumbnail stops={GENERAL_FEATURED.stops} />
              <span className="tag tag-earth explore-general-featured-tag">Featured this week</span>
            </div>
            <div className="explore-general-hero-copy">
              <div className="sidebar-label">{GENERAL_FEATURED.by}</div>
              <h2 className="explore-general-hero-title">{GENERAL_FEATURED.title}</h2>
              <div className="explore-general-hero-meta">{GENERAL_FEATURED.sub}</div>
              <p className="section-copy">{GENERAL_FEATURED.desc}</p>
              <div className="chip-row">
                {GENERAL_FEATURED.chips.map((chip) => (
                  <span key={chip.label} className={`tag tag-${chip.tone}`}>
                    <CategoryIcon kind={chip.icon} size={11} />
                    <span>{chip.label}</span>
                  </span>
                ))}
              </div>
              <div className="explore-general-hero-actions">
                <button
                  className="shell-btn"
                  onClick={() => runGeneralSearch(GENERAL_FEATURED.destination)}
                >
                  Use as starting point →
                </button>
                <button
                  className="shell-btn shell-btn-secondary"
                  onClick={() => runGeneralSearch(GENERAL_FEATURED.destination)}
                >
                  Preview
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
                    <span className={`tag tag-${idea.tone} explore-trip-idea-tag`}>{idea.tag}</span>
                  </div>
                  <div className="trip-card-body">
                    <div className="trip-card-title">{idea.title}</div>
                    <div className="trip-card-date">{idea.meta}</div>
                    <div className="explore-trip-idea-actions">
                      <button
                        className="shell-btn shell-btn-secondary shell-btn-sm"
                        onClick={() => runGeneralSearch(idea.destination)}
                      >
                        Preview
                      </button>
                      <button
                        className="shell-btn shell-btn-sm"
                        onClick={() => runGeneralSearch(idea.destination)}
                      >
                        + Use as trip
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="shell-page explore-page">
      <aside className="detail-rail">
        <div className="section-head">
          <h1 className="section-title">Explore places</h1>
          <p className="section-copy">
            {trip
              ? 'Find stops near your trip. Click a place to preview, then add.'
              : 'Search a destination to discover places.'}
          </p>
        </div>

        <input
          className="form-input form-input-lg"
          placeholder={trip ? `Search ${trip.destination || 'places'}…` : 'Search a destination…'}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={handleSearch}
        />

        <div className="chip-row">
          {CATEGORIES.map((category) => (
            <button
              key={category.id}
              className={`tag ${
                activeCategory === category.id ? `tag-${category.tone}` : 'tag-outline'
              }`}
              onClick={() => selectCategory(category.id)}
            >
              <CategoryIcon kind={category.icon} size={11} />
              <span>{category.label}</span>
            </button>
          ))}
        </div>

        {!hasLoadedOnce && loading ? (
          <div className="loading-state">Finding places…</div>
        ) : filteredPlaces.length === 0 ? (
          <div className="empty-inline">
            <p>
              {trip
                ? 'Select a category or refine your search to explore nearby places.'
                : 'Enter a destination and press Enter to explore.'}
            </p>
          </div>
        ) : (
          <>
            <div className="sidebar-label">Suggested · {filteredPlaces.length}</div>
            <div className="explore-list">
              {filteredPlaces.map((place, index) => {
                const category = getCategoryMeta(place.category);

                return (
                  <article
                    key={`${place.name}-${index}`}
                    className={`explore-card ${activePlace === index ? 'active' : ''}`}
                    onClick={() => setActivePlace(activePlace === index ? null : index)}
                  >
                    <div className="explore-card-icon">
                      <CategoryIcon kind={category.icon} size={18} />
                    </div>

                    <div className="explore-card-copy">
                      <div className="explore-card-name">{place.name}</div>
                      <div className="explore-card-sub">{place.address}</div>
                      <div className="explore-card-meta">
                        {place.rating && <span>★ {place.rating}</span>}
                        {place.price && <span>{place.price}</span>}
                      </div>
                    </div>

                    {tripId && (
                      <button
                        className={`shell-btn shell-btn-sm ${added.has(place.name) ? 'is-added' : ''}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          addToTrip(place);
                        }}
                        disabled={added.has(place.name)}
                      >
                        {added.has(place.name) ? 'Added ✓' : '+ Add'}
                      </button>
                    )}
                  </article>
                );
              })}
            </div>
          </>
        )}
      </aside>

      <section className="map-stage">
        {mapPoints.length > 0 ? (
            <MapContainer center={[20, 0]} zoom={3} className="full-map">
              <TileLayer
              url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
              attribution="© OpenStreetMap © CARTO"
            />
            <MapFit points={mapPoints} />
            <MapFocus place={activeObject} />

            {mapLayer !== 'suggested' &&
              tripStops.map((stop, index) =>
                stop.lat && stop.lng ? (
                  <Marker
                    key={stop.id}
                    position={[stop.lat, stop.lng]}
                    icon={createNumberedPin(index + 1)}
                  />
                ) : null
              )}

            {mapLayer !== 'stops' &&
              filteredPlaces.map((place, index) =>
                place.lat && place.lng ? (
                  <Marker
                    key={`${place.name}-${index}`}
                    position={[place.lat, place.lng]}
                    icon={createSuggestPin('◎', activePlace === index)}
                    eventHandlers={{ click: () => setActivePlace(index) }}
                  />
                ) : null
              )}
          </MapContainer>
        ) : (
          <div className="map-empty">Search for a destination to see places on the map.</div>
        )}

        {(tripStops.length > 0 || filteredPlaces.length > 0) && (
          <div className="map-legend-card">
            <div className="legend-row">
              <span className="legend-dot solid" />
              <span>Your stops</span>
            </div>
            <div className="legend-row">
              <span className="legend-dot outline" />
              <span>Suggested</span>
            </div>
          </div>
        )}

        {(tripStops.length > 0 || filteredPlaces.length > 0) && (
          <div className="map-toggle">
            {[
              { id: 'both', label: 'Both' },
              { id: 'stops', label: '● Your stops' },
              { id: 'suggested', label: '◎ Suggested' },
            ].map((option) => (
              <button
                key={option.id}
                className={`map-toggle-button ${mapLayer === option.id ? 'active' : ''}`}
                onClick={() => setMapLayer(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}

        {activeObject && (
          <div className="map-detail-card explore-detail-card">
            <div className="map-detail-media" />
            <div className="map-detail-body">
              <div className="map-detail-top">
                <div>
                  <div className="map-detail-name">{activeObject.name}</div>
                  <div className="map-detail-sub">{activeObject.address}</div>
                </div>
                <button
                  className="shell-btn shell-btn-ghost shell-btn-sm"
                  onClick={() => setActivePlace(null)}
                >
                  ×
                </button>
              </div>

              <div className="chip-row">
                {activeObject.category && (
                  <span className={`tag tag-${getCategoryMeta(activeObject.category).tone}`}>
                    <CategoryIcon kind={getCategoryMeta(activeObject.category).icon} size={11} />
                    <span>{getCategoryMeta(activeObject.category).label}</span>
                  </span>
                )}
                {activeObject.rating && <span className="tag tag-outline">★ {activeObject.rating}</span>}
                {activeObject.price && <span className="tag tag-outline">{activeObject.price}</span>}
              </div>

              {activeObject.description && (
                <p className="map-detail-notes">{activeObject.description}</p>
              )}
              {activeObject.hours && <div className="map-detail-sub">{activeObject.hours}</div>}

              {tripId && (
                <div className="map-detail-actions">
                  <div className="chip-row explore-day-row">
                    {tripDays.map((day) => (
                      <button
                        key={day}
                        className={`tag ${selectedDay === day ? 'tag-earth' : 'tag-outline'}`}
                        onClick={() => setSelectedDay(day)}
                      >
                        Day {day}
                      </button>
                    ))}
                  </div>
                  <button
                    className="shell-btn shell-btn-sm"
                    onClick={() => addToTrip(activeObject, selectedDay)}
                    disabled={added.has(activeObject.name)}
                  >
                    {added.has(activeObject.name) ? 'Added ✓' : `+ Add to Day ${selectedDay}`}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
