"use client"

import { useEffect, useRef } from "react"
import { MapContainer, TileLayer, GeoJSON, Marker, Popup, useMap } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import type { FeatureCollection } from "geojson"

// Fix leaflet default icon issue in Next.js
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
})

// ── Segment colors ────────────────────────────────────────────────────────────

const SEGMENT_COLORS: Record<string, string> = {
  gpx:     "#4a6b5e",
  train:   "#3b82f6",
  walking: "#f59e0b",
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

// ── Types ─────────────────────────────────────────────────────────────────────

interface TripMapProps {
  segments: Array<{
    id: string
    type: string
    geojson: FeatureCollection | null
    name: string | null
    origin?: string | null
    destination?: string | null
  }>
  pois: Array<{
    id: string
    lat: number
    lon: number
    category: string
    name: string | null
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
  selectedSegmentId,
  onSegmentClick,
  height = "100%",
  tileUrl = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  tileAttribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}: TripMapProps) {
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
      />

      <InitialFit segments={segments} pois={pois} />
      <FocusSegment segments={segments} selectedSegmentId={selectedSegmentId} />

      {/* Segment traces */}
      {segments.map((seg) => {
        if (!seg.geojson) return null
        const isSelected = seg.id === selectedSegmentId
        const color = SEGMENT_COLORS[seg.type] ?? "#64748b"
        const isDashed = seg.type === "train" || seg.type === "walking"
        const label = seg.name ?? (seg.origin && seg.destination ? `${seg.origin} → ${seg.destination}` : null)
        return (
          <GeoJSON
            key={`${seg.id}-${isSelected}`}
            data={seg.geojson}
            style={{
              color,
              weight:    isSelected ? 6 : 4,
              opacity:   isSelected ? 1 : 0.65,
              dashArray: seg.type === "train" ? "10, 8" : seg.type === "walking" ? "3, 6" : undefined,
              lineCap:   isDashed ? "round" : "round",
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
    </MapContainer>
  )
}
