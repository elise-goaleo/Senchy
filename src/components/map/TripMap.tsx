"use client"

import { useEffect, useRef } from "react"
import { MapContainer, TileLayer, GeoJSON, Marker, Popup, useMap } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import type { FeatureCollection } from "geojson"
import { PlatformBadge } from "@/components/PlatformBadge"

// Fix leaflet default icon issue in Next.js
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
})

// ── Segment colors ────────────────────────────────────────────────────────────

// Couleurs assombries/saturées pour ressortir sur les fonds clairs (vert/beige).
const SEGMENT_COLORS_LIGHT: Record<string, string> = {
  gpx:     "#4F7A66",  // vert vélo
  train:   "#2563eb",  // bleu train
  walking: "#ea8c00",  // ambre à pied
  car:     "#7c3aed",  // violet voiture
}
// Couleurs plus vives pour ressortir sur le fond sombre.
const SEGMENT_COLORS_DARK: Record<string, string> = {
  gpx:     "#34d399",  // vert vif
  train:   "#60a5fa",  // bleu clair
  walking: "#fbbf24",  // ambre clair
  car:     "#a78bfa",  // violet clair
}

const POI_COLORS: Record<string, string> = {
  supermarket: "#10b981",
  toilet:      "#6366f1",
  sight:       "#f59e0b",
  custom:      "#ec4899",
  restaurant:  "#ef4444",
  cafe:        "#92400e",
  hotel:       "#8b5cf6",
  hospital:    "#dc2626",
  pharmacy:    "#0ea5e9",
  water:       "#0ea5e9",
  camp:        "#84cc16",
}

// ── Icon factories ────────────────────────────────────────────────────────────

function circleIcon(color: string) {
  return L.divIcon({
    html: `<div style="width:12px;height:12px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.25)"></div>`,
    className: "",
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  })
}

// Marqueur "nuit" : pastille indigo avec un croissant de lune (comme dans le panneau)
function moonIcon() {
  return L.divIcon({
    html: `<div style="width:26px;height:26px;border-radius:50%;background:#6366f1;border:2px solid white;box-shadow:0 1px 5px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
    </div>`,
    className: "",
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  })
}

function landmarkIcon() {
  return L.divIcon({
    html: `<div style="width:26px;height:26px;border-radius:50%;background:#db2777;border:2px solid white;box-shadow:0 1px 5px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="3" x2="21" y1="22" y2="22"/><line x1="6" x2="6" y1="18" y2="11"/><line x1="10" x2="10" y1="18" y2="11"/><line x1="14" x2="14" y1="18" y2="11"/><line x1="18" x2="18" y1="18" y2="11"/><polygon points="12 2 20 7 4 7"/></svg>
    </div>`,
    className: "",
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  })
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface TripMapProps {
  segments: Array<{
    id: string
    type: string
    geojson: FeatureCollection | null
    name: string | null
    origin?: string | null
    destination?: string | null
    version?: string
  }>
  pois: Array<{
    id: string
    lat: number
    lon: number
    category: string
    name: string | null
  }>
  stopovers?: Array<{
    id: string
    lat: number
    lon: number
    name: string | null
    place: string | null
    date: string
    platform: "booking" | "airbnb" | null
    link: string | null
  }>
  visits?: Array<{
    id: string
    lat: number
    lon: number
    name: string | null
    place: string | null
  }>
  selectedSegmentId?: string | null
  onSegmentClick?: (id: string) => void
  height?: string
  tileUrl?: string
  tileAttribution?: string
}

// ── Extract coordinates from GeoJSON ─────────────────────────────────────────

function extractLatLngs(geojson: FeatureCollection): [number, number][] {
  const result: [number, number][] = []
  for (const feature of geojson.features ?? []) {
    if (!feature.geometry) continue
    if (feature.geometry.type === "LineString") {
      for (const c of feature.geometry.coordinates) result.push([c[1], c[0]])
    } else if (feature.geometry.type === "MultiLineString") {
      for (const line of feature.geometry.coordinates)
        for (const c of line) result.push([c[1], c[0]])
    }
  }
  return result
}

// ── Initial fit to all segments ───────────────────────────────────────────────

function InitialFit({ segments, pois }: Pick<TripMapProps, "segments" | "pois">) {
  const map = useMap()
  const fitted = useRef(false)
  useEffect(() => {
    if (fitted.current) return
    const pts: [number, number][] = [
      ...segments.flatMap((s) => s.geojson ? extractLatLngs(s.geojson) : []),
      ...pois.map((p): [number, number] => [p.lat, p.lon]),
    ]
    if (pts.length > 0) {
      map.fitBounds(L.latLngBounds(pts), { padding: [48, 48] })
      fitted.current = true
    }
  }, [map, segments, pois])
  return null
}

// ── Zoom to selected segment ──────────────────────────────────────────────────

function FocusSegment({
  segments,
  selectedSegmentId,
}: Pick<TripMapProps, "segments" | "selectedSegmentId">) {
  const map = useMap()
  const prevId = useRef<string | null>(null)
  useEffect(() => {
    if (!selectedSegmentId || selectedSegmentId === prevId.current) return
    const seg = segments.find((s) => s.id === selectedSegmentId)
    if (!seg?.geojson) return   // no geojson yet → don't update prevId so we retry when segments refresh
    const pts = extractLatLngs(seg.geojson)
    if (pts.length > 0) {
      map.fitBounds(L.latLngBounds(pts), { padding: [60, 60], maxZoom: 14 })
      prevId.current = selectedSegmentId  // only lock once we actually zoomed
    }
  }, [map, segments, selectedSegmentId])
  return null
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TripMap({
  segments,
  pois,
  stopovers = [],
  visits = [],
  selectedSegmentId,
  onSegmentClick,
  height = "100%",
  tileUrl = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  tileAttribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}: TripMapProps) {
  // Brighter palette on the dark basemap so colours stay legible
  const isDarkBasemap = tileUrl.includes("dark_all")
  const palette = isDarkBasemap ? SEGMENT_COLORS_DARK : SEGMENT_COLORS_LIGHT

  return (
    <MapContainer
      center={[46.5, 2.5]}
      zoom={5}
      style={{ height, width: "100%" }}
      className="z-0"
    >
      <TileLayer
        key={tileUrl}
        attribution={tileAttribution}
        url={tileUrl}
        keepBuffer={6}
        updateWhenZooming={false}
        updateWhenIdle={false}
      />

      <InitialFit segments={segments} pois={pois} />
      <FocusSegment segments={segments} selectedSegmentId={selectedSegmentId} />

      {/* Segment traces — pass 1: white outline (casing effect) for all types */}
      {segments.map((seg) => {
        if (!seg.geojson) return null
        const isSelected = seg.id === selectedSegmentId
        return (
          <GeoJSON
            key={`${seg.id}-outline-${seg.version ?? ""}`}
            data={seg.geojson}
            style={{
              color:     "white",
              weight:    seg.type === "gpx" ? (isSelected ? 11 : 8) : (isSelected ? 9 : 7),
              opacity:   1,
              dashArray: seg.type === "train" ? "10, 8" : seg.type === "walking" ? "3, 6" : seg.type === "car" ? "14, 6, 3, 6" : undefined,
              lineCap:   "round",
              lineJoin:  "round",
            }}
            pointToLayer={() => L.marker([0, 0], { opacity: 0 })}
          />
        )
      })}

      {/* Segment traces — pass 2: colored fill on top */}
      {segments.map((seg) => {
        if (!seg.geojson) return null
        const isSelected = seg.id === selectedSegmentId
        const color = palette[seg.type] ?? "#64748b"
        const isDashed = seg.type === "train" || seg.type === "walking" || seg.type === "car"
        const label = seg.name ?? (seg.origin && seg.destination ? `${seg.origin} → ${seg.destination}` : null)
        return (
          <GeoJSON
            key={`${seg.id}-fill-${isSelected}-${seg.version ?? ""}`}
            data={seg.geojson}
            style={{
              color,
              weight:    seg.type === "gpx" ? (isSelected ? 6 : 4) : (isSelected ? 5 : 3),
              opacity:   isSelected ? 1 : 0.95,
              dashArray: seg.type === "train" ? "10, 8" : seg.type === "walking" ? "3, 6" : seg.type === "car" ? "14, 6, 3, 6" : undefined,
              lineCap:   "round",
              lineJoin:  "round",
            }}
            pointToLayer={() => L.marker([0, 0], { opacity: 0 })}
            onEachFeature={label ? (_, layer) => layer.bindTooltip(label, { sticky: true, className: "text-xs font-medium" }) : undefined}
            eventHandlers={{
              click: () => onSegmentClick?.(seg.id),
            }}
          />
        )
      })}


      {/* POI markers */}
      {pois.map((poi) => (
        <Marker
          key={poi.id}
          position={[poi.lat, poi.lon]}
          icon={circleIcon(POI_COLORS[poi.category] ?? "#64748b")}
        >
          <Popup>
            <div className="text-sm">
              <p className="font-medium">{poi.name ?? poi.category}</p>
              <p className="text-slate-500 text-xs capitalize">{poi.category}</p>
            </div>
          </Popup>
        </Marker>
      ))}

      {/* Stopover (night) markers — moon picto */}
      {stopovers.map((stop) => {
        const linkLabel = stop.platform === "booking"
          ? "Voir sur Booking"
          : stop.platform === "airbnb"
          ? "Voir sur Airbnb"
          : "Voir l'hébergement"
        return (
          <Marker key={`stop-${stop.id}`} position={[stop.lat, stop.lon]} icon={moonIcon()}>
            <Popup>
              <div className="text-sm" style={{ minWidth: 150 }}>
                <div className="flex items-center gap-2">
                  <PlatformBadge platform={stop.platform} />
                  <p className="font-medium">{stop.name ?? "Nuit"}</p>
                </div>
                {stop.place && <p className="text-slate-500 text-xs mt-1">{stop.place}</p>}
                <p className="text-slate-400 text-xs">
                  {new Date(stop.date).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}
                </p>
                {stop.link && (
                  <a
                    href={stop.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 mt-1.5 text-xs font-semibold text-[#D15F36] hover:text-[#b8502d]"
                  >
                    {linkLabel} →
                  </a>
                )}
              </div>
            </Popup>
          </Marker>
        )
      })}

      {visits.map((v) => (
        <Marker key={`visit-${v.id}`} position={[v.lat, v.lon]} icon={landmarkIcon()}>
          <Popup>
            <div className="text-sm" style={{ minWidth: 150 }}>
              <p className="font-medium text-slate-900">{v.name ?? "Visite"}</p>
              {v.place && <p className="text-slate-500 text-xs mt-1">{v.place}</p>}
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  )
}
