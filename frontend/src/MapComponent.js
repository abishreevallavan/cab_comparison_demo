import React, { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Polyline, Marker, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Fix default marker icons in many bundlers
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow
});

function FitToBounds({ points }) {
  const map = useMap();

  useEffect(() => {
    if (!points || points.length === 0) return;
    const bounds = L.latLngBounds(points.map((p) => L.latLng(p[0], p[1])));
    const t = setTimeout(() => {
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 14 });
    }, 100);
    return () => clearTimeout(t);
  }, [map, points]);

  return null;
}

function MapComponent({ pickup, drop, routeGeoJson }) {
  const routeLatLngs = useMemo(() => {
    const coords = routeGeoJson?.coordinates;
    if (Array.isArray(coords) && coords.length > 0) {
      // OSRM GeoJSON: coordinates are [lon, lat]
      return coords.map((c) => {
        const lon = typeof c[0] === "number" ? c[0] : parseFloat(c[0]);
        const lat = typeof c[1] === "number" ? c[1] : parseFloat(c[1]);
        return [lat, lon];
      });
    }
    // Fallback: straight line between pickup and drop
    if (pickup?.lat != null && pickup?.lon != null && drop?.lat != null && drop?.lon != null) {
      return [[pickup.lat, pickup.lon], [drop.lat, drop.lon]];
    }
    return null;
  }, [routeGeoJson, pickup, drop]);

  const fitPoints = useMemo(() => {
    const pts = [];
    if (pickup?.lat && pickup?.lon) pts.push([pickup.lat, pickup.lon]);
    if (drop?.lat && drop?.lon) pts.push([drop.lat, drop.lon]);
    if (routeLatLngs?.length) {
      // Add a couple points from route too for better fit
      pts.push(routeLatLngs[0], routeLatLngs[Math.max(0, routeLatLngs.length - 1)]);
    }
    return pts;
  }, [pickup, drop, routeLatLngs]);

  return (
    <MapContainer
      center={[13.0827, 80.2707]}
      zoom={12}
      style={{ height: "420px", marginTop: "16px", borderRadius: "16px", overflow: "hidden" }}
    >
      <TileLayer
        attribution="© OpenStreetMap contributors"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {fitPoints?.length ? <FitToBounds points={fitPoints} /> : null}

      {pickup?.lat && pickup?.lon && <Marker position={[pickup.lat, pickup.lon]} />}
      {drop?.lat && drop?.lon && <Marker position={[drop.lat, drop.lon]} />}

      {routeLatLngs?.length ? (
        <Polyline
          positions={routeLatLngs}
          pathOptions={{ color: "#2F6BFF", weight: 6, opacity: 0.9 }}
        />
      ) : null}
    </MapContainer>
  );
}

export default MapComponent;
