"use client"

import { useEffect, useMemo, useState } from "react"
import { MapContainer, TileLayer, GeoJSON, CircleMarker, Popup, useMap } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import type { Feature, FeatureCollection, Geometry } from "geojson"

// Icône Leaflet par défaut (chemins cassés sous Next sans ce correctif).
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
})

// GeoJSON mondial (léger, ~250 Ko) : chaque feature a `id` = code ISO A3 et
// `properties.name`. Servi via le CDN jsDelivr.
const WORLD_GEOJSON_URL =
  "https://cdn.jsdelivr.net/gh/johan/world.geo.json@master/countries.geo.json"

interface CountryProps { name?: string }

export interface ExplorationsMapProps {
  visited:          string[]                              // codes ISO A3
  cities:           Array<{ name: string; lat: number; lon: number }>
  onToggleCountry:  (code: string) => void
  onCountriesLoaded?: (list: Array<{ code: string; name: string }>) => void
  tileUrl?:         string
  tileAttribution?: string
  height?:          string
}

// ── Cadrage initial sur les données existantes ────────────────────────────────
function InitialFit({
  fc, visited, cities,
}: {
  fc: FeatureCollection | null
  visited: string[]
  cities: Array<{ name: string; lat: number; lon: number }>
}) {
  const map = useMap()
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (done || !fc) return
    const pts: [number, number][] = cities.map((c) => [c.lat, c.lon])
    const visitedSet = new Set(visited)
    const visitedFeatures = fc.features.filter((f) => visitedSet.has(String(f.id)))
    if (visitedFeatures.length > 0) {
      const b = L.geoJSON({ type: "FeatureCollection", features: visitedFeatures } as FeatureCollection).getBounds()
      pts.forEach((p) => b.extend(p))
      if (b.isValid()) { map.fitBounds(b, { padding: [40, 40] }); setDone(true); return }
    }
    if (pts.length > 0) {
      const b = L.latLngBounds(pts)
      if (b.isValid()) { map.fitBounds(b, { padding: [60, 60], maxZoom: 8 }); setDone(true); return }
    }
    map.setView([25, 10], 2)
    setDone(true)
  }, [done, fc, visited, cities, map])

  return null
}

export default function ExplorationsMap({
  visited, cities, onToggleCountry, onCountriesLoaded,
  tileUrl, tileAttribution, height = "100%",
}: ExplorationsMapProps) {
  const [fc, setFc] = useState<FeatureCollection | null>(null)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(WORLD_GEOJSON_URL)
      .then((r) => r.json())
      .then((data: FeatureCollection) => {
        if (cancelled) return
        setFc(data)
        onCountriesLoaded?.(
          data.features
            .map((f) => ({ code: String(f.id), name: (f.properties as CountryProps)?.name ?? String(f.id) }))
            .sort((a, b) => a.name.localeCompare(b.name, "fr"))
        )
      })
      .catch(() => { if (!cancelled) setLoadError(true) })
    return () => { cancelled = true }
  }, [onCountriesLoaded])

  const visitedSet = useMemo(() => new Set(visited), [visited])
  // Force le recalcul des styles quand la sélection change.
  const geoKey = useMemo(() => visited.slice().sort().join(","), [visited])

  return (
    <div style={{ height, width: "100%" }} className="relative">
      <MapContainer
        center={[25, 10]}
        zoom={2}
        minZoom={2}
        worldCopyJump
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          url={tileUrl ?? "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"}
          attribution={tileAttribution ?? '&copy; OpenStreetMap'}
        />

        {fc && (
          <GeoJSON
            key={geoKey}
            data={fc}
            style={(feature?: Feature<Geometry, CountryProps>) => {
              const isVisited = feature ? visitedSet.has(String(feature.id)) : false
              return {
                fillColor:   isVisited ? "#10b981" : "#94a3b8",
                fillOpacity: isVisited ? 0.55 : 0.06,
                color:       isVisited ? "#047857" : "#cbd5e1",
                weight:      isVisited ? 1.2 : 0.5,
              }
            }}
            onEachFeature={(feature, layer) => {
              const code = String(feature.id)
              const name = (feature.properties as CountryProps)?.name ?? code
              layer.on({
                click: () => onToggleCountry(code),
                mouseover: (e) => (e.target as L.Path).setStyle({ weight: 2, fillOpacity: visitedSet.has(code) ? 0.7 : 0.2 }),
                mouseout:  (e) => (e.target as L.Path).setStyle({
                  weight: visitedSet.has(code) ? 1.2 : 0.5,
                  fillOpacity: visitedSet.has(code) ? 0.55 : 0.06,
                }),
              })
              layer.bindTooltip(name, { sticky: true })
            }}
          />
        )}

        {cities.map((c, i) => (
          <CircleMarker
            key={`${c.name}-${i}`}
            center={[c.lat, c.lon]}
            radius={5}
            pathOptions={{
              color: "#047857",
              weight: 1.5,
              fillColor: "#10b981",
              fillOpacity: 1,
            }}
          >
            <Popup>{c.name}</Popup>
          </CircleMarker>
        ))}

        <InitialFit fc={fc} visited={visited} cities={cities} />
      </MapContainer>

      {loadError && (
        <div className="absolute bottom-3 left-3 z-[500] rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
          Impossible de charger la carte des pays.
        </div>
      )}
    </div>
  )
}
