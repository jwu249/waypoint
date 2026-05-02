import L from 'leaflet';

export const STATUS_LABELS = {
  draft: 'Future',
  upcoming: 'Future',
  current: 'Current',
  past: 'Past',
};

function toDateOnly(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function deriveTripStatus(startDate, endDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const start = toDateOnly(startDate);
  const end = toDateOnly(endDate);

  if (start && start > today) return 'upcoming';
  if (end && end < today) return 'past';
  return 'current';
}

export function normalizeTripStatus(trip) {
  if (!trip) return 'current';
  if (trip.status === 'current' || trip.status === 'past' || trip.status === 'upcoming') {
    return trip.status;
  }
  return deriveTripStatus(trip.start_date, trip.end_date);
}

export const CATEGORY_META = {
  restaurant: { label: 'Food', tone: 'bay', icon: 'food' },
  attraction: { label: 'Sight', tone: 'blue', icon: 'temple' },
  hotel: { label: 'Stay', tone: 'blue', icon: 'stay' },
  activity: { label: 'Activity', tone: 'vinnie', icon: 'walk' },
  transport: { label: 'Transit', tone: 'neutral', icon: 'route' },
  other: { label: 'Other', tone: 'neutral', icon: 'other' },
};

const AVATAR_COLORS = ['#D7D4B1', '#FCE6B7', '#D8EBF9', '#E8DED2', '#F4F1E2'];

export function getCategoryMeta(category) {
  return CATEGORY_META[category] ?? CATEGORY_META.other;
}

export function categoryLabel(category) {
  return getCategoryMeta(category).label;
}

export function formatDateRange(start, end) {
  if (!start) return null;

  const format = (value, includeYear = false) =>
    new Date(value).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      ...(includeYear ? { year: 'numeric' } : {}),
    });

  if (!end) return format(start, true);

  const startDate = new Date(start);
  const endDate = new Date(end);

  if (startDate.getFullYear() !== endDate.getFullYear()) {
    return `${format(start, true)} – ${format(end, true)}`;
  }

  return `${format(start)} – ${format(end, true)}`;
}

export function getDayDate(startDate, day) {
  if (!startDate) return null;
  const next = new Date(startDate);
  next.setDate(next.getDate() + (day - 1));
  return next.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function haversine(lat1, lng1, lat2, lng2) {
  const radiusKm = 6371;
  const degreesToRadians = Math.PI / 180;
  const deltaLat = (lat2 - lat1) * degreesToRadians;
  const deltaLng = (lng2 - lng1) * degreesToRadians;
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1 * degreesToRadians) *
      Math.cos(lat2 * degreesToRadians) *
      Math.sin(deltaLng / 2) ** 2;
  return radiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function totalKm(stops) {
  let distance = 0;
  for (let index = 1; index < stops.length; index += 1) {
    const previous = stops[index - 1];
    const current = stops[index];
    if (previous.lat && previous.lng && current.lat && current.lng) {
      distance += haversine(previous.lat, previous.lng, current.lat, current.lng);
    }
  }
  return Math.round(distance);
}

export function initials(value = '') {
  const cleaned = value.trim();
  if (!cleaned) return 'U';
  return cleaned[0].toUpperCase();
}

export function hashColor(value = '') {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = value.charCodeAt(index) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function createNumberedPin(number, options = {}) {
  const { active = false, outline = false, compact = false } = options;
  const size = compact ? 20 : 26;
  const fontSize = compact ? 9 : 11;

  return L.divIcon({
    html: `<div class="waypoint-map-pin${active ? ' active' : ''}${outline ? ' outline' : ''}${compact ? ' compact' : ''}" style="width:${size}px;height:${size}px;font-size:${fontSize}px;">${number}</div>`,
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, compact ? -12 : -16],
  });
}

export function createSuggestPin(label = '◎', active = false) {
  return L.divIcon({
    html: `<div class="waypoint-map-pin outline suggest${active ? ' active' : ''}">${label}</div>`,
    className: '',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}
