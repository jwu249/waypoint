import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useNav } from '../context/NavContext';
import { supabase } from '../lib/supabase';
import { formatDateRange, hashColor, normalizeTripStatus, totalKm } from '../lib/tripPresentation';

const RANGE_OPTIONS = [
  { id: '7d', label: 'Last 7 days' },
  { id: '30d', label: 'Last 30 days' },
  { id: 'all', label: 'All time' },
];

const SIDEBAR_GROUPS = [
  { id: 'all', label: 'All trips' },
  { id: 'current', label: 'Current' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'past', label: 'Past' },
  { id: 'draft', label: 'Drafts' },
];

const INTEREST_OPTIONS = [
  { label: 'Food & dining', tone: 'earth' },
  { label: 'Cafés', tone: 'bay' },
  { label: 'Culture & history', tone: 'blue' },
  { label: 'Outdoors & nature', tone: 'vinnie' },
  { label: 'Nightlife', tone: 'earth' },
  { label: 'Shopping', tone: 'neutral' },
  { label: 'Art & museums', tone: 'blue' },
  { label: 'Local markets', tone: 'bay' },
  { label: 'Hidden gems', tone: 'vinnie' },
  { label: 'Family-friendly', tone: 'neutral' },
  { label: 'Wellness & spa', tone: 'blue' },
  { label: 'Adventure', tone: 'earth' },
];

const MOCK_AI_OVERVIEW = {
  total: 1284,
  successRate: 96.2,
  averageLatency: 127,
};

const MOCK_AI_BREAKDOWN = [
  { kind: 'parse', tone: 'earth', total: 842, successRate: 97.1, averageLatency: 182 },
  { kind: 'suggest', tone: 'bay', total: 312, successRate: 94.8, averageLatency: 94 },
  { kind: 'explore', tone: 'blue', total: 130, successRate: 95.4, averageLatency: 71 },
];

const MOCK_AI_LOGS = [
  {
    id: 'req_9u6sr855',
    kind: 'parse',
    ok: true,
    latencyMs: 172,
    inputLength: 387,
    createdAt: '2026-05-04T14:32:08-05:00',
  },
  {
    id: 'req_g6mb2cdy',
    kind: 'suggest',
    ok: true,
    latencyMs: 88,
    inputLength: 42,
    createdAt: '2026-05-04T14:31:50-05:00',
  },
  {
    id: 'req_rihqy2we',
    kind: 'parse',
    ok: true,
    latencyMs: 201,
    inputLength: 512,
    createdAt: '2026-05-04T14:30:22-05:00',
  },
  {
    id: 'req_avksse8r',
    kind: 'explore',
    ok: true,
    latencyMs: 64,
    inputLength: 18,
    createdAt: '2026-05-04T14:29:11-05:00',
  },
  {
    id: 'req_j852itfo',
    kind: 'parse',
    ok: false,
    latencyMs: 2840,
    inputLength: 1240,
    createdAt: '2026-05-04T14:27:48-05:00',
  },
  {
    id: 'req_fyfcm6wl',
    kind: 'suggest',
    ok: true,
    latencyMs: 103,
    inputLength: 55,
    createdAt: '2026-05-04T14:26:03-05:00',
  },
  {
    id: 'req_okj3owtn',
    kind: 'parse',
    ok: true,
    latencyMs: 158,
    inputLength: 298,
    createdAt: '2026-05-04T14:24:37-05:00',
  },
  {
    id: 'req_8209piwt',
    kind: 'explore',
    ok: true,
    latencyMs: 69,
    inputLength: 24,
    createdAt: '2026-05-04T14:22:19-05:00',
  },
];

const TABLE_PAGE_SIZE = 8;

const FULL_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const TIME_FORMATTER = new Intl.DateTimeFormat('en-US', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

function toDate(value) {
  if (!value) return null;
  const next = new Date(value);
  return Number.isNaN(next.getTime()) ? null : next;
}

function getRangeCutoff(range) {
  if (range === 'all') return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - (range === '7d' ? 6 : 29));
  return cutoff;
}

function isInRange(value, cutoff) {
  if (!cutoff) return true;
  const date = toDate(value);
  if (!date) return false;
  return date >= cutoff;
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatAverage(value) {
  if (!Number.isFinite(value)) return '0.0';
  return value.toFixed(1);
}

function formatRate(value) {
  if (!Number.isFinite(value)) return '0.0%';
  return `${value.toFixed(1)}%`;
}

function formatLatency(value) {
  if (!Number.isFinite(value) || value <= 0) return '—';
  return `${Math.round(value)} ms`;
}

function formatDelta(value) {
  return `+${formatNumber(Math.max(0, value))} this week`;
}

function formatTripSpanNote(value) {
  if (!Number.isFinite(value) || value <= 0) return 'Trip dates not set yet';
  const rounded = Number(value.toFixed(1));
  return `≈ ${formatAverage(rounded)} ${rounded === 1 ? 'day' : 'days'} each`;
}

function analyticsTripStatus(trip) {
  if (trip?.status === 'draft') return 'draft';
  return normalizeTripStatus(trip);
}

function parseTripInterests(value) {
  if (!value || typeof value !== 'string') return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function escapeCsvCell(value) {
  const text = String(value ?? '');
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

function buildTripsCsv(trips, stopCountByTrip, collaboratorCountByTrip) {
  const header = [
    'Trip',
    'Destination',
    'Status',
    'Stops',
    'Collaborators',
    'Dates',
    'Created',
  ];

  const rows = trips.map((trip) => {
    const createdAt = toDate(trip.created_at);

    return [
      trip.name || 'Untitled trip',
      trip.destination || '',
      analyticsTripStatus(trip),
      stopCountByTrip[trip.id] ?? 0,
      collaboratorCountByTrip[trip.id] ?? 0,
      formatDateRange(trip.start_date, trip.end_date) || '',
      createdAt ? FULL_DATE_FORMATTER.format(createdAt) : '',
    ];
  });

  return [header, ...rows]
    .map((row) => row.map((value) => escapeCsvCell(value)).join(','))
    .join('\n');
}

function downloadCsv(filename, content) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

function requestTypeTone(kind) {
  if (kind === 'parse') return 'earth';
  if (kind === 'suggest') return 'bay';
  return 'blue';
}

export default function Analytics() {
  const { user } = useAuth();
  const { setTripName, setTripHref, setOnShare } = useNav();
  const [range, setRange] = useState('30d');
  const [requestFilter, setRequestFilter] = useState('all');
  const [requestPage, setRequestPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [trips, setTrips] = useState([]);
  const [stops, setStops] = useState([]);
  const [collaborators, setCollaborators] = useState([]);

  useEffect(() => {
    setTripName('');
    setTripHref('');
    setOnShare(null);

    return () => {
      setTripName('');
      setTripHref('');
      setOnShare(null);
    };
  }, [setOnShare, setTripHref, setTripName]);

  useEffect(() => {
    let ignore = false;

    async function loadAnalytics() {
      setLoading(true);
      setError('');

      try {
        const [
          { data: tripData, error: tripError },
          { data: stopData, error: stopError },
          { data: collaboratorData, error: collaboratorError },
        ] = await Promise.all([
          supabase.from('trips').select('*').order('created_at', { ascending: false }),
          supabase.from('stops').select('*'),
          supabase.from('trip_collaborators').select('*'),
        ]);

        if (tripError) throw tripError;
        if (stopError) throw stopError;
        if (collaboratorError) throw collaboratorError;
        if (ignore) return;

        setTrips(tripData ?? []);
        setStops(stopData ?? []);
        setCollaborators(collaboratorData ?? []);
      } catch (loadError) {
        if (ignore) return;
        setError(loadError.message || 'Unable to load analytics right now.');
        setTrips([]);
        setStops([]);
        setCollaborators([]);
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    loadAnalytics();

    return () => {
      ignore = true;
    };
  }, []);

  const cutoff = getRangeCutoff(range);
  const weekCutoff = getRangeCutoff('7d');
  const ownedTrips = trips.filter((trip) => !user?.id || trip.user_id === user.id || trip.user_id == null);
  const sharedTripIds = new Set(
    user?.id
      ? collaborators
          .filter((item) => item.user_id === user.id)
          .map((item) => item.trip_id)
      : []
  );
  const sharedTrips = trips.filter(
    (trip) => sharedTripIds.has(trip.id) && (!user?.id || trip.user_id !== user.id)
  );
  const recentTrips = [...ownedTrips]
    .sort((left, right) => new Date(right.created_at) - new Date(left.created_at))
    .slice(0, 4);
  const sidebarCounts = {
    all: ownedTrips.length,
    current: ownedTrips.filter((trip) => analyticsTripStatus(trip) === 'current').length,
    upcoming: ownedTrips.filter((trip) => analyticsTripStatus(trip) === 'upcoming').length,
    past: ownedTrips.filter((trip) => analyticsTripStatus(trip) === 'past').length,
    draft: ownedTrips.filter((trip) => analyticsTripStatus(trip) === 'draft').length,
  };

  const filteredTrips = trips.filter((trip) => isInRange(trip.created_at, cutoff));
  const filteredTripIds = new Set(filteredTrips.map((trip) => trip.id));
  const filteredStops = stops.filter((stop) => filteredTripIds.has(stop.trip_id));
  const filteredCollaborators = collaborators.filter((item) => filteredTripIds.has(item.trip_id));
  const aiLogsForDisplay = MOCK_AI_LOGS;

  const stopGroups = {};
  filteredStops.forEach((stop) => {
    if (!stopGroups[stop.trip_id]) stopGroups[stop.trip_id] = [];
    stopGroups[stop.trip_id].push(stop);
  });

  const stopCountByTrip = {};
  const collaboratorCountByTrip = {};
  const statusCounts = { current: 0, upcoming: 0, past: 0, draft: 0 };
  const interestCounts = Object.fromEntries(
    INTEREST_OPTIONS.map((interest) => [
      interest.label,
      { label: interest.label, tone: interest.tone, count: 0 },
    ])
  );
  const uniqueContributors = new Set();

  filteredTrips.forEach((trip) => {
    const status = analyticsTripStatus(trip);
    statusCounts[status] += 1;

    parseTripInterests(trip.interests).forEach((interest) => {
      if (!interestCounts[interest]) {
        interestCounts[interest] = { label: interest, tone: 'neutral', count: 0 };
      }
      interestCounts[interest].count += 1;
    });

    if (trip.user_id) uniqueContributors.add(trip.user_id);
  });

  filteredCollaborators.forEach((item) => {
    collaboratorCountByTrip[item.trip_id] = (collaboratorCountByTrip[item.trip_id] ?? 0) + 1;
    if (item.user_id) uniqueContributors.add(item.user_id);
  });

  let totalDistanceKm = 0;
  let mappedTripCount = 0;

  Object.entries(stopGroups).forEach(([tripId, tripStops]) => {
    const orderedStops = [...tripStops].sort((left, right) => {
      const dayDiff = (left.day ?? 1) - (right.day ?? 1);
      if (dayDiff !== 0) return dayDiff;
      return (left.position ?? 0) - (right.position ?? 0);
    });

    stopCountByTrip[tripId] = orderedStops.length;

    const mappedStops = orderedStops.filter((stop) => stop.lat && stop.lng);
    if (mappedStops.length > 1) {
      totalDistanceKm += totalKm(mappedStops);
      mappedTripCount += 1;
    }

  });

  let spanTotalDays = 0;
  let spanTripCount = 0;
  filteredTrips.forEach((trip) => {
    const start = toDate(trip.start_date ? `${trip.start_date}T00:00:00` : null);
    const end = toDate(trip.end_date ? `${trip.end_date}T00:00:00` : null);
    if (!start || !end) return;

    const diff = Math.round((end - start) / 86400000) + 1;
    if (diff > 0) {
      spanTotalDays += diff;
      spanTripCount += 1;
    }
  });

  const sharedTripCount = Object.keys(collaboratorCountByTrip).length;
  const avgStopsPerTrip = filteredTrips.length > 0 ? filteredStops.length / filteredTrips.length : 0;
  const avgTripSpan = spanTripCount > 0 ? spanTotalDays / spanTripCount : 0;
  const totalUsers = uniqueContributors.size;
  const aiSuccessRate = MOCK_AI_OVERVIEW.successRate;
  const aiAverageLatency = MOCK_AI_OVERVIEW.averageLatency;
  const aiBreakdown = MOCK_AI_BREAKDOWN;

  const recentAiLogs = [...aiLogsForDisplay].sort(
    (left, right) => new Date(right.createdAt) - new Date(left.createdAt)
  );
  const visibleAiLogs =
    requestFilter === 'errors'
      ? recentAiLogs.filter((entry) => !entry.ok)
      : recentAiLogs;
  const pageCount = Math.max(1, Math.ceil(visibleAiLogs.length / TABLE_PAGE_SIZE));
  const currentPage = Math.min(requestPage, pageCount - 1);
  const pagedAiLogs = visibleAiLogs.slice(
    currentPage * TABLE_PAGE_SIZE,
    currentPage * TABLE_PAGE_SIZE + TABLE_PAGE_SIZE
  );
  const showingCount = currentPage * TABLE_PAGE_SIZE + pagedAiLogs.length;

  const tripsCreatedThisWeek = trips.filter((trip) => isInRange(trip.created_at, weekCutoff)).length;
  const stopsCreatedThisWeek = stops.filter((stop) => isInRange(stop.created_at, weekCutoff)).length;
  const activeUsersThisWeek = new Set();
  trips.forEach((trip) => {
    if (trip.user_id && isInRange(trip.created_at, weekCutoff)) {
      activeUsersThisWeek.add(trip.user_id);
    }
  });
  collaborators.forEach((item) => {
    if (item.user_id && isInRange(item.created_at, weekCutoff)) {
      activeUsersThisWeek.add(item.user_id);
    }
  });

  const statusRows = [
    { key: 'current', label: 'Current', count: statusCounts.current },
    { key: 'upcoming', label: 'Upcoming', count: statusCounts.upcoming },
    { key: 'past', label: 'Past', count: statusCounts.past },
    { key: 'draft', label: 'Drafts', count: statusCounts.draft },
  ];
  const interestRows = Object.values(interestCounts)
    .filter((interest) => interest.count > 0)
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
    .slice(0, 6);
  const interestTotal = interestRows.reduce((sum, interest) => sum + interest.count, 0);
  const donutRadius = 54;
  const donutCircumference = 2 * Math.PI * donutRadius;
  const interestSegments = interestRows.reduce(
    (result, interest, index) => {
      const share = interestTotal > 0 ? (interest.count / interestTotal) * 100 : 0;
      const dashLength = interestTotal > 0 ? (interest.count / interestTotal) * donutCircumference : 0;
      const item = {
        ...interest,
        share,
        dashLength,
        dashOffset: result.offset,
        animationDelay: 220 + index * 70,
        chartToneClass: `analytics-chart-tone-${index % 6}`,
      };

      return {
        items: [...result.items, item],
        offset: result.offset + dashLength,
      };
    },
    { items: [], offset: 0 }
  ).items;

  const statCards = [
    {
      label: 'Total trips created',
      value: formatNumber(filteredTrips.length),
      note: formatDelta(tripsCreatedThisWeek),
    },
    {
      label: 'Total stops planned',
      value: formatNumber(filteredStops.length),
      note:
        stopsCreatedThisWeek > 0
          ? formatDelta(stopsCreatedThisWeek)
          : mappedTripCount > 0
            ? `${formatNumber(totalDistanceKm)} km mapped`
            : 'No mapped routes yet',
    },
    {
      label: 'Avg. stops per trip',
      value: formatAverage(avgStopsPerTrip),
      note: formatTripSpanNote(avgTripSpan),
    },
    {
      label: 'Total users',
      value: formatNumber(totalUsers),
      note:
        activeUsersThisWeek.size > 0
          ? formatDelta(activeUsersThisWeek.size)
          : `${formatNumber(sharedTripCount)} shared trips`,
    },
  ];

  const rangeWindowLabel =
    range === '7d' ? 'last 7 days' : range === '30d' ? 'last 30 days' : 'all time';
  const rangeSummary = `Usage across the app · ${rangeWindowLabel}`;

  function handleExport() {
    const csv = buildTripsCsv(filteredTrips, stopCountByTrip, collaboratorCountByTrip);
    const suffix = range === 'all' ? 'all-time' : range;
    downloadCsv(`waypoint-analytics-${suffix}.csv`, csv);
  }

  if (loading) {
    return (
      <div className="shell-page library-page analytics-page">
        <aside className="shell-sidebar" />
        <main className="shell-main analytics-main">
          <div className="loading-state">Loading analytics…</div>
        </main>
      </div>
    );
  }

  return (
    <div className="shell-page library-page analytics-page">
      <aside className="shell-sidebar">
        <div className="sidebar-group">
          <div className="sidebar-label">My Trips</div>
          {SIDEBAR_GROUPS.map((item) => (
            <Link key={item.id} to="/trips" className="sidebar-item">
              <span className="sidebar-item-dot">·</span>
              <span className="sidebar-item-label">{item.label}</span>
              <span className="sidebar-item-count">{sidebarCounts[item.id] ?? 0}</span>
            </Link>
          ))}
        </div>

        {recentTrips.length > 0 && (
          <div className="sidebar-group">
            <div className="sidebar-label">Recent</div>
            {recentTrips.map((trip) => (
              <Link key={trip.id} to={`/trip/${trip.id}`} className="sidebar-link-row">
                <span className="sidebar-item-dot">·</span>
                <span>{trip.name}</span>
              </Link>
            ))}
          </div>
        )}

        {sharedTrips.length > 0 && (
          <div className="sidebar-group">
            <div className="sidebar-label">Shared with me</div>
            {sharedTrips.slice(0, 4).map((trip) => (
              <Link key={trip.id} to={`/trip/${trip.id}`} className="sidebar-shared-row">
                <span
                  className="sidebar-shared-avatar"
                  style={{ background: hashColor(trip.id) }}
                >
                  {trip.name?.[0]?.toUpperCase() || 'T'}
                </span>
                <span>{trip.name}</span>
              </Link>
            ))}
          </div>
        )}
      </aside>

      <main className="shell-main analytics-main">
        <div className="page-header analytics-header">
          <div>
            <h1 className="page-title">Analytics</h1>
            <p className="page-subtitle">{rangeSummary}</p>
          </div>

          <div className="analytics-header-actions">
            <div className="analytics-range-group" role="tablist" aria-label="Analytics range">
              {RANGE_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  className={`analytics-range-button ${range === option.id ? 'active' : ''}`}
                  onClick={() => {
                    setRange(option.id);
                    setRequestPage(0);
                  }}
                  aria-pressed={range === option.id}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <button className="shell-btn shell-btn-secondary" onClick={handleExport}>
              Export CSV
            </button>
          </div>
        </div>

        {error && <div className="banner banner-error analytics-banner">{error}</div>}

        <section className="analytics-section">
          <div className="sidebar-label">Overview</div>
          <div className="analytics-stat-grid">
            {statCards.map((card) => (
              <article key={card.label} className="analytics-stat-card">
                <div className="analytics-stat-label">{card.label}</div>
                <div className="analytics-stat-value">{card.value}</div>
                <div className="analytics-stat-note">{card.note}</div>
              </article>
            ))}
          </div>
        </section>

        <section className="analytics-section analytics-panel-grid">
          <article className="panel-card analytics-panel analytics-panel-wide">
            <div className="panel-header-row analytics-panel-header">
              <div>
                <h2 className="section-title">Trip composition</h2>
                <p className="section-copy">Status and interest breakdown for the selected range.</p>
              </div>
            </div>

            {filteredTrips.length === 0 && filteredStops.length === 0 ? (
              <div className="empty-inline">
                <p>Create a few trips and stops to unlock planning mix analytics.</p>
              </div>
            ) : (
              <div className="analytics-mix-grid">
                <div className="analytics-subpanel">
                  <div className="analytics-subpanel-title">Trip status</div>
                  <div className="analytics-segmented-bar">
                    {statusRows.map((status) => {
                      const width = filteredTrips.length > 0 ? (status.count / filteredTrips.length) * 100 : 0;
                      return (
                        <div
                          key={status.key}
                          className={`analytics-segment analytics-segment-${status.key}`}
                          style={{ width: `${width}%` }}
                          title={`${status.label}: ${status.count}`}
                        />
                      );
                    })}
                  </div>

                  <div className="analytics-status-list">
                    {statusRows.map((status) => {
                      const share = filteredTrips.length > 0 ? (status.count / filteredTrips.length) * 100 : 0;
                      return (
                        <div key={status.key} className="analytics-status-row">
                          <div className="analytics-status-label">
                            <span className={`analytics-status-dot analytics-status-dot-${status.key}`} />
                            <span>{status.label}</span>
                          </div>
                          <div className="analytics-status-metrics">
                            <span className="analytics-table-mono">{formatNumber(status.count)}</span>
                            <span>{formatRate(share)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="analytics-subpanel">
                  <div className="analytics-subpanel-title">Interests</div>
                  {interestRows.length === 0 ? (
                    <div className="analytics-mini-empty">No saved interests yet.</div>
                  ) : (
                    <div className="analytics-category-chart-layout">
                      <div className="analytics-category-donut-wrap" aria-hidden="true">
                        <svg viewBox="0 0 140 140" className="analytics-category-donut-svg">
                          <circle
                            className="analytics-donut-track"
                            cx="70"
                            cy="70"
                            r={donutRadius}
                          />
                          {interestSegments.map((interest) => (
                            <circle
                              key={interest.label}
                              className={`analytics-donut-segment ${interest.chartToneClass}`}
                              cx="70"
                              cy="70"
                              r={donutRadius}
                              style={{
                                strokeDasharray: `${interest.dashLength} ${donutCircumference}`,
                                strokeDashoffset: `${-interest.dashOffset}`,
                                animationDelay: `${interest.animationDelay}ms`,
                              }}
                            />
                          ))}
                        </svg>
                      </div>

                      <div className="analytics-category-list analytics-category-list-chart">
                        {interestSegments.map((interest) => {
                          const share = interest.share;
                        return (
                          <div key={interest.label} className="analytics-category-row">
                            <div className="analytics-category-topline">
                              <div className="analytics-category-label-group">
                                <span
                                  className={`analytics-donut-dot ${interest.chartToneClass}`}
                                />
                                <span className="analytics-category-legend-label">{interest.label}</span>
                                <span className="analytics-category-share">{formatRate(share)}</span>
                              </div>
                            </div>
                          </div>
                        );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </article>

          <article className="panel-card analytics-panel">
            <div className="panel-header-row analytics-panel-header">
              <div>
                <h2 className="section-title">AI requests</h2>
                <p className="section-copy">All AI calls · {rangeWindowLabel}</p>
              </div>
            </div>

            <div className="analytics-ai-total-list">
              <div className="analytics-ai-total-row">
                <span className="analytics-ai-total-label">Total AI requests</span>
                <span className="analytics-ai-total-value">
                  {formatNumber(MOCK_AI_OVERVIEW.total)}
                </span>
              </div>
              <div className="analytics-ai-total-row">
                <span className="analytics-ai-total-label">Success rate</span>
                <span className="analytics-ai-total-value">{formatRate(aiSuccessRate)}</span>
              </div>
              <div className="analytics-ai-total-row">
                <span className="analytics-ai-total-label">Avg. latency</span>
                <span className="analytics-ai-total-value">{formatLatency(aiAverageLatency)}</span>
              </div>
            </div>

            <div className="analytics-ai-breakdown-head sidebar-label">By request type</div>
            <div className="analytics-ai-breakdown-list">
              {aiBreakdown.map((entry) => (
                <div key={entry.kind} className="analytics-ai-breakdown-row">
                  <span className={`tag tag-${entry.tone} analytics-request-chip`}>{entry.kind}</span>
                  <div className="analytics-ai-breakdown-metrics">
                    <span className="analytics-table-mono">{formatNumber(entry.total)}</span>
                    <span>{formatRate(entry.successRate)} ok</span>
                    <span>{formatLatency(entry.averageLatency)}</span>
                  </div>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="analytics-section">
          <article className="panel-card analytics-panel analytics-table-panel">
            <div className="panel-header-row analytics-panel-header analytics-table-header">
              <div>
                <h2 className="section-title">Recent AI requests</h2>
              </div>
              <div className="analytics-table-actions">
                <button
                  className={`analytics-table-filter ${requestFilter === 'all' ? 'active' : ''}`}
                  onClick={() => {
                    setRequestFilter('all');
                    setRequestPage(0);
                  }}
                >
                  All
                </button>
                <button
                  className={`analytics-table-filter ${requestFilter === 'errors' ? 'active' : ''}`}
                  onClick={() => {
                    setRequestFilter('errors');
                    setRequestPage(0);
                  }}
                >
                  Errors only
                </button>
              </div>
            </div>

            <div className="analytics-table-wrap">
              <div className="analytics-table analytics-table-head">
                <div>Time</div>
                <div>Type</div>
                <div>Status</div>
                <div>Latency</div>
                <div>Input len.</div>
                <div>ID</div>
              </div>

              {pagedAiLogs.length === 0 ? (
                <div className="empty-inline analytics-empty-inline">
                  <p>No AI request logs yet.</p>
                  <p>Run trip parsing or explore suggestions to start filling this table.</p>
                </div>
              ) : (
                pagedAiLogs.map((entry) => (
                  <div key={entry.id} className="analytics-table analytics-table-row">
                    <div className="analytics-table-mono">
                      {toDate(entry.createdAt) ? TIME_FORMATTER.format(toDate(entry.createdAt)) : '—'}
                    </div>
                    <div>
                      <span className={`tag tag-${requestTypeTone(entry.kind)} analytics-request-chip`}>
                        {entry.kind}
                      </span>
                    </div>
                    <div>
                      <span className={`analytics-request-status ${entry.ok ? 'ok' : 'error'}`}>
                        <span className="analytics-request-status-dot" />
                        <span>{entry.ok ? 'success' : 'error'}</span>
                      </span>
                    </div>
                    <div className="analytics-table-mono">{formatLatency(entry.latencyMs)}</div>
                    <div className="analytics-table-mono">{formatNumber(entry.inputLength)} chars</div>
                    <div className="analytics-table-mono analytics-request-id">{entry.id}</div>
                  </div>
                ))
              )}
            </div>

            <div className="analytics-table-footer">
              <span className="panel-hint">
                Showing {showingCount} of {formatNumber(visibleAiLogs.length)}
              </span>
              <div className="analytics-table-pagination">
                <button
                  className="analytics-table-page"
                  onClick={() => setRequestPage((page) => Math.max(0, page - 1))}
                  disabled={currentPage === 0}
                >
                  ← Prev
                </button>
                <button
                  className="analytics-table-page analytics-table-page-primary"
                  onClick={() => setRequestPage((page) => Math.min(pageCount - 1, page + 1))}
                  disabled={currentPage >= pageCount - 1}
                >
                  Next →
                </button>
              </div>
            </div>
          </article>
        </section>
      </main>
    </div>
  );
}
