"use client"

import { useEffect, useRef } from "react"
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import type { FeatureCollection } from "geojson"

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
})

interface SegmentMapProps {
  geojson: FeatureCollection
  height?: string
  tileUrl?: string
  tileAttribution?: string
}

// Signature de la trace : change dès que la géométrie change (GPX remplacé)
function traceSig(geojson: FeatureCollection): string {
  let pts = 0
  let first = ""
  for (const feature of geojson.features ?? []) {
    const g = feature.geometry
    if (!g) continue
    if (g.type === "LineString") {
      pts += g.coordinates.length
      if (!first && g.coordinates[0]) first = `${g.coordinates[0][0]},${g.coordinates[0][1]}`
    } else if (g.type === "MultiLineString") {
      for (const line of g.coordinates) pts += line.length
      if (!first && g.coordinates[0]?.[0]) first = `${g.coordinates[0][0][0]},${g.coordinates[0][0][1]}`
    }
  }
  return `${geojson.features?.length ?? 0}:${pts}:${first}`
}

function FitBounds({ geojson, sig }: { geojson: FeatureCollection; sig: string }) {
  const map = useMap()
  const lastSig = useRef<string | null>(null)

  useEffect(() => {
    // Recadre au premier rendu ET à chaque changement de trace
    if (lastSig.current === sig) return

    const allCoords: [number, number][] = []

    for (const feature of geojson.features ?? []) {
      if (!feature.geometry) continue
      if (feature.geometry.type === "LineString") {
        for (const c of feature.geometry.coordinates) {
          allCoords.push([c[1], c[0]])
        }
      } else if (feature.geometry.type === "MultiLineString") {
        for (const line of feature.geometry.coordinates) {
          for (const c of line) {
            allCoords.push([c[1], c[0]])
          }
        }
      }
    }

    if (allCoords.length > 0) {
      map.fitBounds(L.latLngBounds(allCoords), { padding: [20, 20] })
      lastSig.current = sig
    }
  }, [map, geojson, sig])

  return null
}

export default function SegmentMap({
  geojson,
  height = "400px",
  tileUrl = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  tileAttribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}: SegmentMapProps) {
  const sig = traceSig(geojson)

  return (
    <MapContainer
      center={[46.5, 2.5]}
      zoom={10}
      style={{ height, width: "100%" }}
      className="rounded-lg z-0"
    >
      <TileLayer
        key={tileUrl}
        attribution={tileAttribution}
        url={tileUrl}
      />
      <FitBounds geojson={geojson} sig={sig} />
      <GeoJSON
        key={sig}
        data={geojson}
        style={{
          color: "#4a6b5e",
          weight: 4,
          opacity: 0.85,
        }}
      />
    </MapContainer>
  )
}
