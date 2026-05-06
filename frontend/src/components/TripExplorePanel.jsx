import { useEffect, useRef, useState } from 'react';
import CategoryIcon from './CategoryIcon';
import { fetchExploreSuggestions } from '../lib/exploreSuggestions';
import { getCategoryMeta } from '../lib/tripPresentation';

export default function TripExplorePanel({ trip, stops, dayOptions, onAddPlace }) {
  const [places, setPlaces] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [selectedDay, setSelectedDay] = useState(dayOptions[0] ?? 1);
  const [addingPlaceName, setAddingPlaceName] = useState('');
  const [error, setError] = useState('');
  const requestIdRef = useRef(0);

  useEffect(() => {
    const highestDay = stops.length > 0
      ? Math.max(...stops.map((stop) => stop.day ?? 1))
      : dayOptions[0] ?? 1;
    const nextDay = dayOptions.includes(highestDay) ? highestDay : (dayOptions[0] ?? 1);
    setSelectedDay((current) => (dayOptions.includes(current) ? current : nextDay));
  }, [dayOptions, stops]);

  useEffect(() => {
    if (!trip?.destination) return undefined;

    let cancelled = false;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);

    fetchExploreSuggestions({
      destination: trip.destination,
      stops,
    })
      .then((nextPlaces) => {
        if (cancelled || requestId !== requestIdRef.current) return;
        setPlaces(nextPlaces);
        setHasLoadedOnce(true);
      })
      .catch(() => {
        if (cancelled || requestId !== requestIdRef.current) return;
        setPlaces([]);
        setHasLoadedOnce(true);
      })
      .finally(() => {
        if (!cancelled && requestId === requestIdRef.current) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [stops, trip?.destination]);

  const addedNames = new Set(stops.map((stop) => stop.name?.toLowerCase()).filter(Boolean));

  async function handleAdd(place) {
    if (!onAddPlace || addedNames.has(place.name.toLowerCase())) return;

    setAddingPlaceName(place.name);
    setError('');

    try {
      await onAddPlace(place, selectedDay);
    } catch (addError) {
      setError(addError.message || 'Unable to add that place right now.');
    } finally {
      setAddingPlaceName('');
    }
  }

  return (
    <section className="panel-card trip-explore-panel">
      <div className="trip-explore-head">
        <div>
          <div className="sidebar-label">Explore nearby</div>
          <div className="panel-title trip-explore-title">Recommendations</div>
        </div>
      </div>

      <div className="trip-explore-toolbar">
        <span className="panel-hint">Add to:</span>
        <div className="chip-row">
          {dayOptions.map((day) => (
            <button
              key={day}
              className={`tag ${selectedDay === day ? 'tag-earth' : 'tag-outline'}`}
              onClick={() => setSelectedDay(day)}
            >
              Day {day}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="banner banner-error">{error}</div>}

      {!hasLoadedOnce && loading ? (
        <div className="loading-state trip-explore-loading">Finding places…</div>
      ) : places.length === 0 ? (
        <div className="empty-inline trip-explore-empty">
          <p>
            {loading ? 'Finding places near your trip…' : 'No recommendations yet.'}
          </p>
        </div>
      ) : (
        <>
          <div className="sidebar-label">Suggested · {places.length}</div>
          <div className="explore-list trip-explore-list">
            {places.map((place, index) => {
              const category = getCategoryMeta(place.category);
              const isAdded = addedNames.has(place.name.toLowerCase());
              const isAdding = addingPlaceName === place.name;

              return (
                <article key={`${place.name}-${index}`} className="explore-card trip-explore-card">
                  <div className="explore-card-icon">
                    <CategoryIcon kind={category.icon} size={18} />
                  </div>

                  <div className="explore-card-copy trip-explore-card-copy">
                    <div className="trip-explore-card-top">
                      <div className="explore-card-name">{place.name}</div>
                      <button
                        className={`shell-btn shell-btn-sm ${isAdded ? 'is-added' : ''}`}
                        onClick={() => handleAdd(place)}
                        disabled={isAdded || isAdding}
                      >
                        {isAdded ? 'Added ✓' : isAdding ? 'Adding…' : '+ Add'}
                      </button>
                    </div>
                    <div className="explore-card-sub">{place.address}</div>
                    <div className="explore-card-meta">
                      {place.rating && <span>★ {place.rating}</span>}
                      {place.price && <span>{place.price}</span>}
                      {place.hours && <span>{place.hours}</span>}
                    </div>
                    {place.description && (
                      <p className="trip-explore-description">{place.description}</p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
