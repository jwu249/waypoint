import { useEffect, useState } from 'react';
import CategoryIcon from '../components/CategoryIcon';
import TripMapThumbnail from '../components/TripMapThumbnail';
import { useNav } from '../context/NavContext';
import {
  EXPLORE_CATEGORIES,
  fetchExploreSuggestions,
  localPlacesForDestination,
} from '../lib/exploreSuggestions';
import { getCategoryMeta } from '../lib/tripPresentation';

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

export default function Explore() {
  const { setTripName, setTripHref, setOnShare } = useNav();

  const [places, setPlaces] = useState([]);
  const [activePlace, setActivePlace] = useState(null);
  const [activeCategory, setActiveCategory] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  async function runSearch(destination, category = activeCategory, options = {}) {
    const { resetActive = false } = options;
    const cleanDestination = destination.trim();
    if (!cleanDestination) return;

    setLoading(true);

    try {
      const nextPlaces = await fetchExploreSuggestions({
        destination: cleanDestination,
        category: category || '',
        stops: [],
      });

      setPlaces(nextPlaces);
      setActivePlace((current) => {
        if (resetActive || current === null) return null;
        return nextPlaces[current] ? current : null;
      });
      setHasLoadedOnce(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => () => {
    setTripName('');
    setTripHref('');
    setOnShare(null);
  }, [setOnShare, setTripHref, setTripName]);

  useEffect(() => {
    const query = search.trim();
    if (query.length < 2) {
      setPlaces([]);
      setActivePlace(null);
      setLoading(false);
      setHasLoadedOnce(false);
      return undefined;
    }

    const timer = window.setTimeout(() => {
      runSearch(query, activeCategory);
    }, 180);

    return () => {
      window.clearTimeout(timer);
    };
  }, [activeCategory, search]);

  function selectCategory(category) {
    const next = activeCategory === category ? null : category;
    setActiveCategory(next);
    const destination = search.trim();
    if (!destination) return;
    runSearch(destination, next);
  }

  function handleSearch(event) {
    if (event.key !== 'Enter') return;

    if (search.trim()) {
      runSearch(search.trim(), activeCategory);
    }
  }

  const searchTerm = search.trim().toLowerCase();
  const filteredPlaces = places.filter((place) => {
    if (!searchTerm) return true;
    return (
      place.name.toLowerCase().includes(searchTerm) ||
      (place.address || '').toLowerCase().includes(searchTerm)
    );
  });

  function runGeneralSearch(destination, category = activeCategory) {
    setSearch(destination);
    setActiveCategory(category || null);
    runSearch(destination, category || null, { resetActive: true });
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

          <div className="explore-general-searchbar">
            <input
              className="form-input form-input-lg"
              placeholder="Search a city, country, or vibe…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={handleSearch}
            />
            <div className="chip-row">
              {EXPLORE_CATEGORIES.map((category) => (
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
