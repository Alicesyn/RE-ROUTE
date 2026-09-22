import React, { useEffect, useMemo, useRef } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useRouteStore } from "../../store/useRouteStore";

// Fix for default marker icons in react-leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

// Cache custom div icons to prevent DOM thrashing
const iconCache = new Map<string, L.DivIcon>();
const getStopIcon = (color: string, number: number): L.DivIcon => {
  const key = `${color}_${number}`;
  if (!iconCache.has(key)) {
    iconCache.set(
      key,
      L.divIcon({
        className: "custom-div-icon",
        html: `<div style="background-color: ${color}; color: white; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; border-radius: 50%; border: 2px solid white; font-weight: bold; font-size: 12px; box-shadow: 0 2px 5px rgba(0,0,0,0.3);">${number}</div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      }),
    );
  }
  return iconCache.get(key)!;
};

const isValidCoord = (val: any): val is number => {
  return typeof val === "number" && !isNaN(val) && isFinite(val);
};

// A component to auto-fit map bounds only when coordinates actually change
const MapBounds: React.FC<{ places: any[]; hotels: any[] }> = React.memo(
  ({ places, hotels }) => {
    const map = useMap();
    const prevPointsSignatureRef = useRef<string>("");

    const validPlaces = useMemo(
      () => (places || []).filter((p) => p && isValidCoord(p.lat) && isValidCoord(p.lng)),
      [places]
    );
    const validHotels = useMemo(
      () => (hotels || []).filter((h) => h && isValidCoord(h.lat) && isValidCoord(h.lng)),
      [hotels]
    );

    const pointsSignature = useMemo(() => {
      const pStr = validPlaces
        .map((p) => `${Number(p.lat).toFixed(4)},${Number(p.lng).toFixed(4)}`)
        .join(";");
      const hStr = validHotels
        .map((h) => `${Number(h.lat).toFixed(4)},${Number(h.lng).toFixed(4)}`)
        .join(";");
      return `${pStr}|${hStr}`;
    }, [validPlaces, validHotels]);

    useEffect(() => {
      if (prevPointsSignatureRef.current === pointsSignature) return;
      prevPointsSignatureRef.current = pointsSignature;

      const points: [number, number][] = [
        ...validPlaces.map((p) => [p.lat, p.lng] as [number, number]),
        ...validHotels.map((h) => [h.lat, h.lng] as [number, number]),
      ];

      if (points.length > 0) {
        try {
          const bounds = L.latLngBounds(points);
          if (bounds.isValid()) {
            map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
          }
        } catch (err) {
          console.warn("Failed to fit map bounds:", err);
        }
      }
    }, [pointsSignature, validPlaces, validHotels, map]);

    useEffect(() => {
      map.invalidateSize();
      const t1 = setTimeout(() => map.invalidateSize(), 150);
      const t2 = setTimeout(() => map.invalidateSize(), 500);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }, [map]);

    return null;
  },
);

// Colors for different days
const ROUTE_COLORS = ["#14b8a6", "#f59e0b", "#ec4899", "#8b5cf6", "#3b82f6"];

export const MapView: React.FC = React.memo(() => {
  const places = useRouteStore((s) => s.places);
  const hotels = useRouteStore((s) => s.hotels);
  const optimizedRoutes = useRouteStore((s) => s.optimizedRoutes);

  const activePlaces = useMemo(
    () => (places || []).filter((p) => p && !p.isDisabled && isValidCoord(p.lat) && isValidCoord(p.lng)),
    [places]
  );

  // If no places, show NYC by default
  const defaultCenter: [number, number] = useMemo(() => {
    if (activePlaces.length > 0) {
      return [activePlaces[0].lat, activePlaces[0].lng];
    }
    const anyValid = (places || []).filter((p) => p && isValidCoord(p.lat) && isValidCoord(p.lng));
    if (anyValid.length > 0) {
      return [anyValid[0].lat, anyValid[0].lng];
    }
    return [35.6762, 139.6503]; // Default Tokyo coordinates
  }, [places, activePlaces]);

  return (
    <div className="h-full w-full relative z-0">
      <MapContainer
        center={defaultCenter}
        zoom={12}
        className="h-full w-full"
        zoomControl={false}
      >
        <TileLayer
          attribution='Tiles &copy; Esri &mdash; Source: Esri, DeLorme, NAVTEQ, USGS, Intermap, iPC, METI, TomTom'
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"
        />

        <MapBounds places={activePlaces.length > 0 ? activePlaces : places} hotels={hotels} />

        {/* Draw Markers for Unoptimized Places (Active only) */}
        {optimizedRoutes.length === 0 &&
          activePlaces.map((place) => (
            <Marker key={place.id} position={[place.lat, place.lng]}>
              <Popup>
                <div className="font-sans">
                  <h3 className="font-bold text-sm">
                    {place.name}
                    {place.romanizedName && place.romanizedName.toLowerCase() !== place.name.toLowerCase() && (
                      <span className="text-xs font-normal text-gray-500 italic block">
                        ({place.romanizedName})
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-gray-500">{place.address}</p>
                  {place.priceEstimate && (
                    <div className="mt-1">
                      <span className="inline-block text-[11px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {place.priceEstimate}
                      </span>
                    </div>
                  )}
                  {place.highlight?.text && (
                    <div className="mt-1 pt-1 border-t border-gray-100 text-[11px] text-amber-800 font-medium">
                      <span className="font-bold text-amber-700 uppercase tracking-tight mr-1">
                        {place.highlight.label}:
                      </span>
                      {place.highlight.text}
                    </div>
                  )}
                </div>
              </Popup>
            </Marker>
          ))}

        {/* Draw Optimized Routes */}
        {optimizedRoutes.map((route, i) => {
          const color = ROUTE_COLORS[i % ROUTE_COLORS.length];
          const positions: [number, number][] = [];

          if (route.startHotel && isValidCoord(route.startHotel.lat) && isValidCoord(route.startHotel.lng))
            positions.push([route.startHotel.lat, route.startHotel.lng]);
          route.stops.forEach((s) => {
            if (s && isValidCoord(s.lat) && isValidCoord(s.lng)) {
              positions.push([s.lat, s.lng]);
            }
          });
          if (route.endHotel && isValidCoord(route.endHotel.lat) && isValidCoord(route.endHotel.lng))
            positions.push([route.endHotel.lat, route.endHotel.lng]);

          return (
            <React.Fragment key={i}>
              {positions.length > 1 && (
                <Polyline
                  positions={positions}
                  pathOptions={{ color, weight: 4, opacity: 0.8 }}
                />
              )}

              {/* Start Hotel Marker */}
              {route.startHotel && isValidCoord(route.startHotel.lat) && isValidCoord(route.startHotel.lng) && (
                <Marker
                  key={`start-hotel-${i}`}
                  position={[route.startHotel.lat, route.startHotel.lng]}
                >
                  <Popup>
                    <h3 className="font-bold text-sm">
                      Day {route.day + 1} Start: {route.startHotel.name}
                    </h3>
                  </Popup>
                </Marker>
              )}

              {/* End Hotel Marker (if different) */}
              {route.endHotel && isValidCoord(route.endHotel.lat) && isValidCoord(route.endHotel.lng) &&
                (!route.startHotel ||
                  route.startHotel.name !== route.endHotel.name) && (
                  <Marker
                    key={`end-hotel-${i}`}
                    position={[route.endHotel.lat, route.endHotel.lng]}
                  >
                    <Popup>
                      <h3 className="font-bold text-sm">
                        Day {route.day + 1} End: {route.endHotel.name}
                      </h3>
                    </Popup>
                  </Marker>
                )}

              {/* Stop Markers */}
              {route.stops
                .filter((stop) => stop && isValidCoord(stop.lat) && isValidCoord(stop.lng))
                .map((stop, stopIdx) => {
                const icon = getStopIcon(color, stopIdx + 1);

                return (
                  <Marker
                    key={stop.id}
                    position={[stop.lat, stop.lng]}
                    icon={icon}
                  >
                    <Popup>
                      <h3 className="font-bold text-sm">
                        {route.title ? `${route.title} (Day ${i + 1})` : `Day ${i + 1}`} - Stop {stopIdx + 1}
                      </h3>
                      <p className="font-semibold text-gray-800">
                        {stop.name}
                        {stop.romanizedName && stop.romanizedName.toLowerCase() !== stop.name.toLowerCase() && (
                          <span className="text-xs font-normal text-gray-500 italic block">
                            ({stop.romanizedName})
                          </span>
                        )}
                      </p>
                      {stop.priceEstimate && (
                        <div className="mt-1">
                          <span className="inline-block text-[11px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                            {stop.priceEstimate}
                          </span>
                        </div>
                      )}
                      {stop.highlight?.text && (
                        <div className="mt-1 pt-1 border-t border-gray-100 text-[11px] text-amber-800 font-medium">
                          <span className="font-bold text-amber-700 uppercase tracking-tight mr-1">
                            {stop.highlight.label}:
                          </span>
                          {stop.highlight.text}
                        </div>
                      )}
                    </Popup>
                  </Marker>
                );
              })}
            </React.Fragment>
          );
        })}
      </MapContainer>
    </div>
  );
});
