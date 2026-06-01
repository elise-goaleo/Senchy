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

function FitBounds({ geojson }: { geojson: FeatureCollection }) {
  const map = useMap()
  const fitted = useRef(false)

  useEffect(() => {
    if (fitted.current) return

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
      fitted.current = true
    }
  }, [map, geojson])

  return null
}

export default function SegmentMap({
  geojson,
  height = "400px",
  tileUrl = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  tileAttribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}: SegmentMapProps) {
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
      <FitBounds geojson={geojson} />
      <GeoJSON
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
