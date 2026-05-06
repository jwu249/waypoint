// These fallback seeds exist only to keep the UI usable when `/api/explore`
// is unavailable. Backend integration can replace the returned list without
// changing the component contract.
export const EXPLORE_CATEGORIES = [
  { id: 'food', label: 'Food', icon: 'food', tone: 'bay' },
  { id: 'temples', label: 'Temples', icon: 'temple', tone: 'blue' },
  { id: 'walks', label: 'Walks', icon: 'walk', tone: 'vinnie' },
  { id: 'markets', label: 'Markets', icon: 'market', tone: 'neutral' },
  { id: 'coffee', label: 'Coffee', icon: 'coffee', tone: 'outline' },
];

const EXPLORE_FALLBACK_SEEDS = {
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

export function localPlacesForDestination(destination, category, currentStops = []) {
  const key = (destination || '').toLowerCase();
  const base =
    key.includes('tokyo') ? EXPLORE_FALLBACK_SEEDS.tokyo
      : key.includes('kyoto') ? EXPLORE_FALLBACK_SEEDS.kyoto
        : key.includes('osaka') ? EXPLORE_FALLBACK_SEEDS.osaka
          : EXPLORE_FALLBACK_SEEDS.generic;

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

export async function fetchExploreSuggestions({ destination, category = '', stops = [] }) {
  if (!destination) return [];

  try {
    const response = await fetch('/api/explore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        destination,
        category,
        stops: stops.map((stop) => ({ name: stop.name })),
      }),
    });

    const data = response.ok ? await response.json() : null;
    if (data?.places?.length) {
      return data.places;
    }
  } catch {
    // Fall through to the local fallback list.
  }

  return localPlacesForDestination(destination, category, stops);
}
