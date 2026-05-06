// The preferred path is the local backend `/api/place-search`.
// Photon is kept as a client-side fallback so add-stop remains functional
// during handoff before backend search is fully dependable.
function categoryFromProps(props = {}) {
  const osmValue = (props.osm_value || '').toLowerCase();
  const osmKey = (props.osm_key || '').toLowerCase();

  if (['restaurant', 'cafe', 'bar', 'fast_food', 'bakery', 'pub'].includes(osmValue)) {
    return 'restaurant';
  }
  if (['hotel', 'hostel', 'guest_house'].includes(osmValue)) {
    return 'hotel';
  }
  if (['bus_stop', 'station', 'tram_stop', 'ferry_terminal'].includes(osmValue)) {
    return 'transport';
  }
  if (['museum', 'gallery', 'cinema', 'park', 'viewpoint'].includes(osmValue)) {
    return 'activity';
  }
  if (['tourism', 'historic', 'leisure', 'amenity', 'shop', 'building'].includes(osmKey)) {
    return 'attraction';
  }
  return 'other';
}

function composeFeatureAddress(props = {}) {
  const street = props.street;
  const houseNumber = props.housenumber;
  const locality = props.city || props.district || props.county || props.state;
  const country = props.country;

  return [
    [houseNumber, street].filter(Boolean).join(' ').trim() || null,
    locality,
    country,
  ]
    .filter(Boolean)
    .join(', ');
}

function placeFromFeature(feature, fallbackName = '', fallbackAddress = '') {
  const props = feature?.properties || {};
  const coords = feature?.geometry?.coordinates || [null, null];
  const category = categoryFromProps(props);
  const rating = category === 'attraction' ? 4.7 : 4.5;
  const name =
    props.name ||
    [props.housenumber, props.street].filter(Boolean).join(' ').trim() ||
    props.street ||
    props.district ||
    props.city ||
    fallbackName ||
    'Untitled stop';

  return {
    name,
    address: composeFeatureAddress(props) || fallbackAddress || null,
    category,
    description: props.osm_value || props.type || '',
    rating,
    lat: coords[1] ?? null,
    lng: coords[0] ?? null,
  };
}

async function fetchJsonWithTimeout(url, { signal, timeoutMs = 1800 } = {}) {
  let timeoutId = null;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error(`Timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    const response = await Promise.race([
      fetch(url, {
        signal,
        headers: {
          Accept: 'application/json',
        },
      }),
      timeoutPromise,
    ]);

    if (!response.ok) {
      throw new Error(`Request failed with ${response.status}`);
    }

    return await response.json();
  } finally {
    if (timeoutId) {
      window.clearTimeout(timeoutId);
    }
  }
}

function dedupePlaces(places = []) {
  const seen = new Set();
  return places.filter((place) => {
    const key = `${place.name || ''}|${place.address || ''}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function searchPlacesViaPhoton(query, destination, signal) {
  const params = new URLSearchParams({
    q: [query, destination].filter(Boolean).join(', '),
    limit: '5',
    lang: 'en',
  });

  const data = await fetchJsonWithTimeout(`https://photon.komoot.io/api/?${params.toString()}`, {
    signal,
    timeoutMs: 2400,
  });

  return dedupePlaces(
    (data?.features || []).map((feature) =>
      placeFromFeature(feature, query, destination)
    )
  );
}

export async function searchPlaces(query, destination = '', signal) {
  const cleanQuery = (query || '').trim();
  if (!cleanQuery) return [];

  try {
    const params = new URLSearchParams({
      q: cleanQuery,
      destination: destination || '',
    });

    const data = await fetchJsonWithTimeout(`/api/place-search?${params.toString()}`, {
      signal,
      timeoutMs: 1500,
    });

    const places = dedupePlaces(data?.places || []);
    if (places.length > 0) {
      return places;
    }
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw error;
    }
  }

  try {
    return await searchPlacesViaPhoton(cleanQuery, destination, signal);
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw error;
    }
    return [];
  }
}
