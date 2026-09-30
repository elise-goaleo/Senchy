"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { MapContainer, TileLayer, GeoJSON, CircleMarker, Popup, Tooltip, useMap } from "react-leaflet"
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
  parks:            Array<{ osm: string; name: string; lat: number; lon: number }>
  mode:             "pays" | "regions" | "parks"
  regions:          string[]                              // clés "ISO3:Nom"
  onToggleCountry:  (code: string) => void
  onToggleRegion:   (key: string) => void
  onAddPark:        (p: { osm: string; name: string; lat: number; lon: number; kind: string }) => void
  onRemovePark:     (osm: string) => void
  onCountriesLoaded?: (list: Array<{ code: string; name: string }>) => void
  onRegionsLoading?: (loading: boolean) => void
  tileUrl?:         string
  tileAttribution?: string
  height?:          string
}

// ── Recalage de la taille Leaflet quand le conteneur change (ex. panneau replié)
function ResizeHandler() {
  const map = useMap()
  useEffect(() => {
    const el = map.getContainer()
    const ro = new ResizeObserver(() => map.invalidateSize())
    ro.observe(el)
    return () => ro.disconnect()
  }, [map])
  return null
}

// ── Points de parcs présents dans la vue (mode Parcs) ─────────────────────────
function ParksInView({
  enabled, selectedOsm, onAdd,
}: {
  enabled: boolean
  selectedOsm: Set<string>
  onAdd: (p: { osm: string; name: string; lat: number; lon: number; kind: string }) => void
}) {
  const map = useMap()
  const [items, setItems] = useState<Array<{ osm: string; name: string; lat: number; lon: number; kind: string }>>([])

  useEffect(() => {
    if (!enabled) { setItems([]); return }
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const update = () => {
      if (map.getZoom() < 7) { setItems([]); return } // trop loin : on n'interroge pas
      const b = map.getBounds()
      const bbox = `${b.getSouth().toFixed(4)},${b.getWest().toFixed(4)},${b.getNorth().toFixed(4)},${b.getEast().toFixed(4)}`
      if (timer) clearTimeout(timer)
      timer = setTimeout(async () => {
        try {
          const res = await fetch(`/api/parks/inview?bbox=${bbox}`)
          const data = await res.json()
          if (!cancelled) setItems(Array.isArray(data) ? data : [])
        } catch { if (!cancelled) setItems([]) }
      }, 500)
    }
    map.on("moveend", update)
    update()
    return () => { cancelled = true; if (timer) clearTimeout(timer); map.off("moveend", update) }
  }, [enabled, map])

  if (!enabled) return null
  return (
    <>
      {items.filter((p) => !selectedOsm.has(p.osm)).map((p) => (
        <CircleMarker
          key={p.osm}
          center={[p.lat, p.lon]}
          radius={6}
          pathOptions={{ color: "#15803d", weight: 2, fillColor: "#ffffff", fillOpacity: 1 }}
          eventHandlers={{ click: () => onAdd(p) }}
        >
          <Tooltip>{p.name}</Tooltip>
        </CircleMarker>
      ))}
    </>
  )
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
  visited, cities, parks, mode, regions, onToggleCountry, onToggleRegion,
  onAddPark, onRemovePark,
  onCountriesLoaded, onRegionsLoading,
  tileUrl, tileAttribution, height = "100%",
}: ExplorationsMapProps) {
  const [fc, setFc] = useState<FeatureCollection | null>(null)
  const [loadError, setLoadError] = useState(false)

  // Pays (ISO3) ayant au moins une région sélectionnée.
  const regionCountries = useMemo(() => {
    const s = new Set<string>()
    for (const k of regions) { const i = k.indexOf(":"); s.add(i >= 0 ? k.slice(0, i) : k) }
    return s
  }, [regions])

  // Régions chargées à la demande, mises en cache par pays (ISO3).
  const regionCache = useRef<Map<string, Feature[]>>(new Map())
  // Toutes les régions des pays visités (couche interactive du mode Régions).
  const [regionFcAll, setRegionFcAll] = useState<FeatureCollection | null>(null)
  // Uniquement les régions sélectionnées (affichées dans les DEUX modes).
  const [regionFcSelected, setRegionFcSelected] = useState<FeatureCollection | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const cache = regionCache.current
      // On charge : les pays des régions sélectionnées (toujours, pour les
      // afficher même en mode Pays) + les pays visités (en mode Régions, pour
      // pouvoir cliquer leurs régions).
      const needed = new Set<string>(regionCountries)
      if (mode === "regions") visited.forEach((v) => needed.add(v))
      const toLoad = Array.from(needed).filter((iso) => !cache.has(iso))

      if (toLoad.length > 0) {
        onRegionsLoading?.(true)
        await Promise.all(
          toLoad.map(async (iso) => {
            try {
              const res = await fetch(`/api/regions/${iso}`)
              const data = (await res.json()) as FeatureCollection
              cache.set(iso, (data.features ?? []) as Feature[])
            } catch {
              cache.set(iso, [])
            }
          })
        )
        onRegionsLoading?.(false)
      }
      if (cancelled) return

      const selSet = new Set(regions)
      const selectedFeatures = Array.from(regionCountries).flatMap((iso) =>
        (cache.get(iso) ?? []).filter((f) => selSet.has(String((f.properties as { key?: string })?.key)))
      )
      setRegionFcSelected({ type: "FeatureCollection", features: selectedFeatures })

      if (mode === "regions") {
        const allFeatures = visited.flatMap((iso) => cache.get(iso) ?? [])
        setRegionFcAll({ type: "FeatureCollection", features: allFeatures })
      }
    })()
    return () => { cancelled = true }
  }, [mode, visited, regions, regionCountries, onRegionsLoading])

  // ── Parcs / nature : contours récupérés par lot (batch lookup OSM) ───────────
  const parksCache = useRef<Map<string, Feature | null>>(new Map())
  const [parksFc, setParksFc] = useState<FeatureCollection | null>(null)
  const parksKey = useMemo(() => parks.map((p) => p.osm).slice().sort().join(","), [parks])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const cache = parksCache.current
      const toLoad = parks.map((p) => p.osm).filter((osm) => !cache.has(osm))
      if (toLoad.length > 0) {
        try {
          const res = await fetch(`/api/parks/geometry?ids=${encodeURIComponent(toLoad.join(","))}`)
          const data = (await res.json()) as FeatureCollection
          for (const f of data.features ?? []) {
            const osm = String((f.properties as { osm?: string })?.osm ?? "")
            if (osm) cache.set(osm, f as Feature)
          }
          // Marque les ids sans géométrie pour éviter de les recharger en boucle.
          for (const osm of toLoad) if (!cache.has(osm)) cache.set(osm, null)
        } catch { /* on ignore, on réessaiera au prochain changement */ }
      }
      if (cancelled) return
      const features = parks.map((p) => cache.get(p.osm)).filter((f): f is Feature => !!f)
      setParksFc({ type: "FeatureCollection", features })
    })()
    return () => { cancelled = true }
  }, [parksKey, parks])

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
  const regionsSet = useMemo(() => new Set(regions), [regions])
  const selectedParkOsm = useMemo(() => new Set(parks.map((p) => p.osm)), [parks])
  const isRegions = mode === "regions"
  // Force le recalcul des styles/handlers quand la sélection ou le mode change.
  const geoKey = useMemo(
    () => `${mode}|${visited.slice().sort().join(",")}|${Array.from(regionCountries).sort().join(",")}`,
    [mode, visited, regionCountries]
  )
  const regionAllKey = useMemo(
    () => `all|${regions.slice().sort().join(",")}|${regionFcAll?.features.length ?? 0}`,
    [regions, regionFcAll]
  )
  const regionSelKey = useMemo(
    () => `sel|${regions.slice().sort().join(",")}|${regionFcSelected?.features.length ?? 0}`,
    [regions, regionFcSelected]
  )

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
              // Hors mode Pays (Régions/Parcs), aucun pays n'est rempli (sinon il
              // paraît sélectionné) : contour neutre uniquement.
              if (mode !== "pays") {
                return { fillColor: "#94a3b8", fillOpacity: 0.04, color: "#cbd5e1", weight: 0.5 }
              }
              const code = feature ? String(feature.id) : ""
              // En mode Pays : on remplit un pays en vert seulement s'il est
              // visité ET sans région sélectionnée (sinon on n'affiche que ses
              // régions, via la couche dédiée par-dessus).
              const greenFill = visitedSet.has(code) && !regionCountries.has(code)
              return {
                fillColor:   greenFill ? "#10b981" : "#94a3b8",
                fillOpacity: greenFill ? 0.55 : 0.05,
                color:       greenFill ? "#047857" : "#cbd5e1",
                weight:      greenFill ? 1.2 : 0.5,
              }
            }}
            onEachFeature={(feature, layer) => {
              const code = String(feature.id)
              const name = (feature.properties as CountryProps)?.name ?? code
              // Cliquable seulement en mode Pays, et pas pour un pays ayant déjà
              // des régions sélectionnées (on ne gère alors que ses régions).
              if (mode === "pays" && !regionCountries.has(code)) {
                const greenFill = () => visitedSet.has(code) && !regionCountries.has(code)
                layer.on({
                  click: () => onToggleCountry(code),
                  mouseover: (e) => (e.target as L.Path).setStyle({ weight: 2, fillOpacity: greenFill() ? 0.7 : 0.18 }),
                  mouseout:  (e) => (e.target as L.Path).setStyle({
                    weight: greenFill() ? 1.2 : 0.5,
                    fillOpacity: greenFill() ? 0.55 : 0.05,
                  }),
                })
              }
              layer.bindTooltip(name, { sticky: true })
            }}
          />
        )}

        {/* Régions sélectionnées — affichées dans les DEUX modes (mode Pays :
            non cliquables, juste l'affichage vert de la région retenue). */}
        {!isRegions && regionFcSelected && regionFcSelected.features.length > 0 && (
          <GeoJSON
            key={regionSelKey}
            data={regionFcSelected}
            interactive={false}
            style={() => ({ fillColor: "#10b981", fillOpacity: 0.6, color: "#059669", weight: 1.4 })}
          />
        )}

        {/* Régions (mode Régions) — subdivisions cliquables des pays visités */}
        {isRegions && regionFcAll && (
          <GeoJSON
            key={regionAllKey}
            data={regionFcAll}
            style={(feature?: Feature<Geometry, { key?: string }>) => {
              const isVisited = feature ? regionsSet.has(String(feature.properties?.key)) : false
              // Régions non sélectionnées : quasi invisibles (mais cliquables).
              return {
                fillColor:   "#10b981",
                fillOpacity: isVisited ? 0.6 : 0.02,
                color:       isVisited ? "#059669" : "#cbd5e1",
                weight:      isVisited ? 1.4 : 0.4,
              }
            }}
            onEachFeature={(feature, layer) => {
              const props = feature.properties as { key?: string; name?: string }
              const key = String(props?.key ?? "")
              layer.on({
                click: () => onToggleRegion(key),
                mouseover: (e) => (e.target as L.Path).setStyle({ weight: 2, color: "#059669", fillOpacity: regionsSet.has(key) ? 0.75 : 0.2 }),
                mouseout:  (e) => (e.target as L.Path).setStyle({
                  weight: regionsSet.has(key) ? 1.4 : 0.4,
                  color: regionsSet.has(key) ? "#059669" : "#cbd5e1",
                  fillOpacity: regionsSet.has(key) ? 0.6 : 0.02,
                }),
              })
              if (props?.name) layer.bindTooltip(props.name, { sticky: true })
            }}
          />
        )}

        {/* Parcs / régions naturelles — surfaces remplies. En mode Parcs, un clic
            sur le parc le retire. */}
        {parksFc && parksFc.features.length > 0 && (
          <GeoJSON
            key={`parks|${mode}|${parksKey}|${parksFc.features.length}`}
            data={parksFc}
            style={() => ({ fillColor: "#16a34a", fillOpacity: 0.45, color: "#15803d", weight: 1.4, dashArray: "4 3" })}
            onEachFeature={(feature, layer) => {
              const props = feature.properties as { name?: string; osm?: string }
              if (props?.name) layer.bindTooltip(props.name, { sticky: true })
              if (mode === "parks" && props?.osm) {
                layer.on({ click: () => onRemovePark(String(props.osm)) })
              }
            }}
          />
        )}

        <ParksInView enabled={mode === "parks"} selectedOsm={selectedParkOsm} onAdd={onAddPark} />

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
        <ResizeHandler />
      </MapContainer>

      {loadError && (
        <div className="absolute bottom-3 left-3 z-[500] rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
          Impossible de charger la carte des pays.
        </div>
      )}
    </div>
  )
}
