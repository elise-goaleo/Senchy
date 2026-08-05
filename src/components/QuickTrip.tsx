"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useDropzone } from "react-dropzone"
import type { FeatureCollection } from "geojson"
import { Upload, MapPin, LocateFixed, Loader2, Pencil, Link2, AlertCircle } from "lucide-react"
import { parseGpx, computeStats } from "@/lib/gpx"
import { DynamicTripMap } from "@/components/map/DynamicTripMap"
import { MapLayerPicker } from "@/components/map/MapLayerPicker"
import { useMapLayer } from "@/hooks/useMapLayer"
import { getQuickTrip, setQuickTrip, clearQuickTrip } from "@/lib/quickTripStore"
import { fetchKomootRoute } from "@/lib/komoot"
import { cn } from "@/lib/utils"

// ─── Catégories de services recherchés ────────────────────────────────────────

type Category = "bakery" | "supermarket" | "water" | "toilet"

const CATEGORIES: Array<{ id: Category; label: string; emoji: string; color: string }> = [
  { id: "bakery",      label: "Boulangeries", emoji: "🥖", color: "#d97706" },
  { id: "supermarket", label: "Supermarchés", emoji: "🛒", color: "#10b981" },
  { id: "water",       label: "Points d'eau", emoji: "💧", color: "#0ea5e9" },
  { id: "toilet",      label: "Toilettes",    emoji: "🚻", color: "#6366f1" },
]

interface Poi {
  id: string
  lat: number
  lon: number
  category: string
  name: string | null
  openingHours?: string | null
}

// Aplati la trace GeoJSON en une liste ordonnée de [lon, lat].
function extractCoordinates(geojson: FeatureCollection): [number, number][] {
  const out: [number, number][] = []
  for (const feature of geojson.features ?? []) {
    const geom = feature.geometry
    if (!geom) continue
    if (geom.type === "LineString") {
      for (const c of geom.coordinates) out.push([c[0], c[1]])
    } else if (geom.type === "MultiLineString") {
      for (const line of geom.coordinates) for (const c of line) out.push([c[0], c[1]])
    }
  }
  return out
}

export function QuickTrip() {
  const { layer, setLayer, layers } = useMapLayer()

  const [geojson, setGeojson] = useState<FeatureCollection | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [distanceKm, setDistanceKm] = useState<number | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)

  const [enabled, setEnabled] = useState<Record<Category, boolean>>({
    bakery: true, supermarket: true, water: true, toilet: true,
  })
  const [pois, setPois] = useState<Poi[]>([])
  const [loadingPois, setLoadingPois] = useState(false)
  const [poiError, setPoiError] = useState<string | null>(null)
  const [partial, setPartial] = useState(false)

  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null)
  const [geoError, setGeoError] = useState<string | null>(null)
  const [geoLoading, setGeoLoading] = useState(false)

  // Garde-fou contre les réponses hors-séquence lors de toggles rapides
  const reqIdRef = useRef(0)

  // ── Recherche des services le long de la trace ──────────────────────────────
  const fetchPois = useCallback(
    async (fc: FeatureCollection, cats: Record<Category, boolean>) => {
      const active = (Object.keys(cats) as Category[]).filter((c) => cats[c])
      if (active.length === 0) { setPois([]); setPoiError(null); return }

      const coordinates = extractCoordinates(fc)
      if (coordinates.length < 2) return

      const myReq = ++reqIdRef.current
      setLoadingPois(true)
      setPoiError(null)
      setPartial(false)
      try {
        const res = await fetch("/api/quick-pois", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ coordinates, categories: active, radius: 300 }),
        })
        if (myReq !== reqIdRef.current) return // réponse obsolète
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          setPoiError(data.error ?? "Impossible de récupérer les services")
          setPois([])
          return
        }
        const data = (await res.json()) as { pois: Array<Omit<Poi, "id"> & { osmId: number }>; partial?: boolean }
        setPois(data.pois.map((p) => ({ ...p, id: `osm-${p.osmId}` })))
        setPartial(Boolean(data.partial))
      } catch {
        if (myReq === reqIdRef.current) setPoiError("Erreur réseau")
      } finally {
        if (myReq === reqIdRef.current) setLoadingPois(false)
      }
    },
    []
  )

  // ── Application d'un tracé (commun au drop et au handoff depuis l'accueil) ───
  const applyGeojson = useCallback(
    (fc: FeatureCollection, name: string): boolean => {
      const coords = extractCoordinates(fc)
      if (coords.length < 2) {
        setParseError("Ce fichier GPX ne contient pas de tracé exploitable.")
        return false
      }
      const stats = computeStats(fc)
      setGeojson(fc)
      setFileName(name)
      setDistanceKm(stats.distanceM > 0 ? stats.distanceM / 1000 : null)
      setPois([])
      fetchPois(fc, enabled)
      return true
    },
    [enabled, fetchPois]
  )

  // ── Chargement d'un fichier GPX (dropzone de la page carte) ─────────────────
  const onDrop = useCallback(
    async (files: File[]) => {
      const file = files[0]
      if (!file) return
      setParseError(null)
      try {
        const text = await file.text()
        const fc = parseGpx(text)
        if (applyGeojson(fc, file.name)) {
          setQuickTrip({ name: file.name, fc })
        }
      } catch {
        setParseError("Fichier GPX invalide ou illisible.")
      }
    },
    [applyGeojson]
  )

  // ── Chargement d'un tour Komoot ─────────────────────────────────────────────
  const [komootUrl, setKomootUrl] = useState("")
  const [komootLoading, setKomootLoading] = useState(false)
  const loadKomoot = useCallback(async () => {
    const url = komootUrl.trim()
    if (!url) return
    setParseError(null)
    setKomootLoading(true)
    try {
      const { geojson, name } = await fetchKomootRoute(url)
      if (applyGeojson(geojson, name)) {
        setQuickTrip({ name, fc: geojson })
      }
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Impossible de charger ce tour Komoot")
    } finally {
      setKomootLoading(false)
    }
  }, [komootUrl, applyGeojson])

  // ── Handoff depuis l'accueil : charge la trace importée au montage ──────────
  const didInit = useRef(false)
  useEffect(() => {
    if (didInit.current) return
    didInit.current = true
    const entry = getQuickTrip()
    if (!entry) return
    applyGeojson(entry.fc, entry.name)
  }, [applyGeojson])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/gpx+xml": [".gpx"], "text/xml": [".gpx"] },
    maxFiles: 1,
    multiple: false,
  })

  // ── Toggle d'une catégorie ──────────────────────────────────────────────────
  function toggleCategory(cat: Category) {
    const next = { ...enabled, [cat]: !enabled[cat] }
    setEnabled(next)
    if (geojson) fetchPois(geojson, next)
  }

  // ── Géolocalisation ─────────────────────────────────────────────────────────
  function locate() {
    if (!("geolocation" in navigator)) {
      setGeoError("Géolocalisation non disponible sur cet appareil.")
      return
    }
    setGeoLoading(true)
    setGeoError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude })
        setGeoLoading(false)
      },
      (err) => {
        setGeoError(
          err.code === err.PERMISSION_DENIED
            ? "Accès à la position refusé."
            : "Impossible de te localiser."
        )
        setGeoLoading(false)
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 }
    )
  }

  // ── Réinitialisation ────────────────────────────────────────────────────────
  function reset() {
    clearQuickTrip()
    setGeojson(null)
    setFileName(null)
    setDistanceKm(null)
    setPois([])
    setParseError(null)
    setPoiError(null)
  }

  const counts = pois.reduce<Record<string, number>>((acc, p) => {
    acc[p.category] = (acc[p.category] ?? 0) + 1
    return acc
  }, {})

  return !geojson ? (
    <div className="max-w-xl">
      <div
        {...getRootProps()}
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-4 sm:py-10 text-center cursor-pointer transition-colors",
          isDragActive
            ? "border-[#D15F36] bg-[#D15F36]/5"
            : "border-slate-300 hover:border-slate-400 bg-slate-50/50"
        )}
      >
        <input {...getInputProps()} />
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white border border-slate-200">
          <Upload className="h-5 w-5 text-slate-400" />
        </div>
        <p className="text-sm font-medium text-slate-700">
          {isDragActive ? "Dépose le fichier ici" : "Glisse un fichier GPX ou clique pour parcourir"}
        </p>
      </div>

      {/* Séparateur */}
      <div className="my-3 flex items-center gap-3 text-xs font-medium text-slate-400">
        <span className="h-px flex-1 bg-slate-200" />
        ou
        <span className="h-px flex-1 bg-slate-200" />
      </div>

      {/* Import via lien Komoot */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Link2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="url"
            value={komootUrl}
            onChange={(e) => setKomootUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") loadKomoot() }}
            disabled={komootLoading}
            placeholder="Colle un lien Komoot (tour public)"
            className="h-10 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-[#D15F36] focus:outline-none focus:ring-1 focus:ring-[#D15F36] disabled:opacity-60"
          />
        </div>
        <button
          onClick={loadKomoot}
          disabled={komootLoading || komootUrl.trim() === ""}
          className="flex h-10 items-center gap-1.5 rounded-xl bg-[#D15F36] px-4 text-sm font-semibold text-white hover:bg-[#b8502d] transition-colors disabled:opacity-40"
        >
          {komootLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Charger
        </button>
      </div>

      {parseError && (
        <p className="mt-3 flex items-center gap-1.5 text-sm text-red-600">
          <AlertCircle className="h-4 w-4 shrink-0" /> {parseError}
        </p>
      )}
    </div>
  ) : (
    <div className="space-y-4">
      {/* Nom de la trace (bold) · distance · crayon.
          Desktop : tout en ligne, crayon après les km.
          Mobile  : les km passent sous le nom, crayon à côté du nom. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <MapPin className="h-4 w-4 text-[#4F7A66] shrink-0" />
        <span className="truncate max-w-[220px] text-sm font-bold text-slate-900">{fileName}</span>
        <button
          onClick={reset}
          title="Importer une nouvelle trace"
          aria-label="Importer une nouvelle trace"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors shrink-0 sm:order-last"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        {distanceKm != null && (
          <span className="basis-full sm:basis-auto text-sm text-slate-500">
            <span className="hidden sm:inline">· </span>{distanceKm.toFixed(1)} km
          </span>
        )}
      </div>

      {/* Filtres : « Me localiser » en tête, puis les catégories */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={locate}
          disabled={geoLoading}
          className="flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition-colors disabled:opacity-50"
        >
          {geoLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LocateFixed className="h-3.5 w-3.5" />}
          <span className="hidden sm:inline">Me localiser</span>
        </button>
        {CATEGORIES.map((cat) => {
          const on = enabled[cat.id]
          const count = counts[cat.id]
          return (
            <button
              key={cat.id}
              onClick={() => toggleCategory(cat.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                on
                  ? "border-transparent text-white"
                  : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
              )}
              style={on ? { backgroundColor: cat.color } : undefined}
              title={cat.label}
            >
              <span>{cat.emoji}</span>
              <span className="hidden sm:inline">{cat.label}</span>
              {on && count != null && (
                <span className="ml-0.5 rounded-full bg-white/25 px-1.5 py-px text-[10px] font-bold">
                  {count}
                </span>
              )}
            </button>
          )
        })}
        {loadingPois && (
          <span className="flex items-center gap-1.5 text-xs text-slate-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Recherche…
          </span>
        )}
      </div>

      {(poiError || geoError) && (
        <p className="flex items-center gap-1.5 text-sm text-red-600">
          <AlertCircle className="h-4 w-4 shrink-0" /> {poiError ?? geoError}
        </p>
      )}
      {partial && !poiError && (
        <p className="flex items-center gap-1.5 text-sm text-amber-600">
          <AlertCircle className="h-4 w-4 shrink-0" /> Résultats partiels — une partie de la trace n&apos;a pas pu être interrogée, réessaie.
        </p>
      )}

      {/* Carte */}
      <div className="relative h-[70vh] min-h-[440px] w-full overflow-hidden rounded-xl border border-slate-200">
        <div className="absolute right-3 top-3 z-[400]">
          <MapLayerPicker layers={layers} current={layer} onSelect={setLayer} />
        </div>
        <DynamicTripMap
          segments={[{ id: "quick", type: "gpx", geojson, name: fileName }]}
          pois={pois}
          userLocation={userLocation}
          tileUrl={layer.url}
          tileAttribution={layer.attribution}
          height="100%"
        />
      </div>
    </div>
  )
}
