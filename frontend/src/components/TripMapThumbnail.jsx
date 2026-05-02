import { useEffect } from 'react';
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { createNumberedPin } from '../lib/tripPresentation';

function AutoBounds({ stops }) {
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
      { padding: [16, 16] }
    );
  }, [map, stops]);

  return null;
}

export default function TripMapThumbnail({ stops }) {
  const points = (stops || []).filter((stop) => stop.lat && stop.lng);

  if (points.length === 0) {
    return (
      <div className="thumb-map thumb-map-empty">
        <div className="thumb-map-grid" />
        <span className="thumb-map-attrib">© OpenStreetMap</span>
      </div>
    );
  }

  const center =
    points.length === 1
      ? [points[0].lat, points[0].lng]
      : [
          points.reduce((sum, stop) => sum + stop.lat, 0) / points.length,
          points.reduce((sum, stop) => sum + stop.lng, 0) / points.length,
        ];

  return (
    <div className="thumb-map">
      <MapContainer
        center={center}
        zoom={12}
        zoomControl={false}
        scrollWheelZoom={false}
        dragging={false}
        touchZoom={false}
        doubleClickZoom={false}
        keyboard={false}
        attributionControl={false}
        className="thumb-map-canvas"
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="© OpenStreetMap contributors"
        />
        <AutoBounds stops={points} />
        {points.slice(0, 5).map((stop, index) => (
          <Marker
            key={`${stop.lat}-${stop.lng}-${index}`}
            position={[stop.lat, stop.lng]}
            icon={createNumberedPin(index + 1, { compact: true })}
          />
        ))}
      </MapContainer>
      <span className="thumb-map-attrib">© OpenStreetMap</span>
    </div>
  );
}
