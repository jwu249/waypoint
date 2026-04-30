import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

function AutoBounds({ stops }) {
  const map = useMap();
  useEffect(() => {
    const pts = stops.filter((s) => s.lat && s.lng);
    if (!pts.length) return;
    if (pts.length === 1) {
      map.setView([pts[0].lat, pts[0].lng], 13);
    } else {
      try {
        map.fitBounds(
          L.latLngBounds(pts.map((s) => [s.lat, s.lng])),
          { padding: [10, 10] }
        );
      } catch {}
    }
  }, [stops, map]);
  return null;
}

function thumbPin(n) {
  return L.divIcon({
    html: `<div style="width:20px;height:20px;background:#1A1410;color:white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.25);">${n}</div>`,
    className: '',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

export default function TripMapThumbnail({ stops }) {
  const pts = (stops || []).filter((s) => s.lat && s.lng);

  if (pts.length === 0) {
    return (
      <div style={{ height: '100%', width: '100%', background: 'linear-gradient(145deg,#ECE8DF,#DDD9CE)', position: 'relative' }}>
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'linear-gradient(rgba(180,170,155,.3) 1px,transparent 1px),linear-gradient(90deg,rgba(180,170,155,.3) 1px,transparent 1px)',
          backgroundSize: '28px 28px',
        }} />
        <span style={{ position: 'absolute', bottom: 4, right: 6, fontSize: 9, color: 'rgba(0,0,0,.3)' }}>
          © OpenStreetMap
        </span>
      </div>
    );
  }

  const center = pts.length === 1
    ? [pts[0].lat, pts[0].lng]
    : [
        pts.reduce((s, p) => s + p.lat, 0) / pts.length,
        pts.reduce((s, p) => s + p.lng, 0) / pts.length,
      ];

  return (
    <MapContainer
      center={center}
      zoom={12}
      style={{ height: '130px', width: '100%' }}
      zoomControl={false}
      scrollWheelZoom={false}
      dragging={false}
      touchZoom={false}
      doubleClickZoom={false}
      keyboard={false}
      attributionControl={false}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        attribution='© OpenStreetMap © CARTO'
      />
      <AutoBounds stops={pts} />
      {pts.slice(0, 5).map((stop, i) => (
        <Marker
          key={i}
          position={[stop.lat, stop.lng]}
          icon={thumbPin(i + 1)}
        />
      ))}
    </MapContainer>
  );
}
