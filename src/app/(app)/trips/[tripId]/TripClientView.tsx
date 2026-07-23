"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { DynamicTripMap } from "@/components/map/DynamicTripMap"
import { MapLayerPicker } from "@/components/map/MapLayerPicker"
import { SortableSegmentList } from "@/components/SortableSegmentList"
import { StopoversPanel, StopoverModal, type Stopover, type StopoverFormData } from "@/components/StopoversPanel"
import { useMapLayer } from "@/hooks/useMapLayer"
import { useStopoverMarkers } from "@/hooks/useStopoverMarkers"
import { AddSegmentModal } from "./AddSegmentModal"
import { EditSegmentModal } from "./segments/[segmentId]/EditSegmentModal"
import { Button } from "@/components/ui/button"
import { TRIP_TYPE_LABELS, type TripType } from "@/components/EditTripModal"
import { cn, formatDuration } from "@/lib/utils"
import { ElevationChart } from "@/components/charts/ElevationChart"
import { exportTripToExcel } from "@/hooks/useExportTrip"
import {
  Plus, ArrowLeft, Route, TrendingUp, TrendingDown,
  Clock, X, ArrowRight, Bike, Train, Footprints, Car, CalendarClock,
  Sun, Moon, Link2, ChevronDown, Trash2, Loader2, FileSpreadsheet,
} from "lucide-react"
import type { GeoJSON } from "geojson"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TripSegment {
  id: string
  type: string
  name: string | null
  geojson: GeoJSON.FeatureCollection | null
  distanceM: number | null
  elevationGainM: number | null
  elevationLossM: number | null
  elevationPoints: Array<{ distanceM: number; elevationM: number }> | null
  durationMin: number | null
  departureAt: string | null
  arrivalAt: string | null
  origin: string | null
  destination: string | null
  startLat:  number | null
  startLon:  number | null
  komootUrl: string | null
}

interface Props {
  tripId: string
  tripName: string
  tripType: TripType
  tripDescription: string | null
  segments: TripSegment[]
  initialStopovers: Stopover[]
  totalDistanceM: number
  totalElevGainM: number
  totalElevLossM: number
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = { gpx: "Vélo", train: "Train", walking: "À pied", car: "Voiture" }
const EMPTY_POIS: never[] = []
const TYPE_COLORS: Record<string, string> = { gpx: "#5F7F6F", train: "#3b82f6", walking: "#f59e0b", car: "#8b5cf6" }
const TYPE_ICONS: Record<string, React.ReactNode> = {
  gpx:     <Bike      className="h-4 w-4" />,
  train:   <Train     className="h-4 w-4" />,
  walking: <Footprints className="h-4 w-4" />,
  car:     <Car       className="h-4 w-4" />,
}

const MODE_ORDER = ["gpx", "car", "train", "walking"]
const CHIP_ICONS: Record<string, React.ReactNode> = {
  gpx:     <Bike       className="h-3.5 w-3.5" />,
  car:     <Car        className="h-3.5 w-3.5" />,
  train:   <Train      className="h-3.5 w-3.5" />,
  walking: <Footprints className="h-3.5 w-3.5" />,
}

function segmentLabel(seg: TripSegment) {
  if (seg.name) return seg.name
  if (seg.origin && seg.destination) return `${seg.origin} → ${seg.destination}`
  return TYPE_LABELS[seg.type] ?? "Segment"
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TripClientView({
  tripId, tripName, tripType, tripDescription,
  segments,
  initialStopovers,
}: Props) {
  const router = useRouter()
  const isRoadtrip = tripType === "roadtrip"
  // Libellés selon le type : « étape » (roadtrip) ou « segment » (biketrip)
  const stepWord = isRoadtrip ? "étape" : "segment"
  const StepsWord = isRoadtrip ? "Étapes" : "Segments"
  const [selectedId,      setSelectedId]      = useState<string | null>(null)
  const [orderedSegs,     setOrderedSegs]     = useState(segments)
  const [stopovers,       setStopovers]       = useState<Stopover[]>(initialStopovers)
  const [addOpen,         setAddOpen]         = useState(false)
  const [panel,           setPanel]           = useState<"segments" | "stopovers">("segments")
  const [bottomCollapsed, setBottomCollapsed] = useState(false)
  const [editingStopover, setEditingStopover] = useState<Stopover | null>(null)
  const [stopoverSaving,  setStopoverSaving]  = useState(false)
  const [stopoverError,   setStopoverError]   = useState<string | null>(null)
  const [deletingId,      setDeletingId]      = useState<string | null>(null)
  const [distanceMode,    setDistanceMode]    = useState<string>("")
  const { layer, setLayer, layers }           = useMapLayer()

  // Sync segment data when server props change (e.g. after router.refresh() from EditSegmentModal)
  useEffect(() => {
    setOrderedSegs((prev) => {
      const map = new Map(segments.map((s) => [s.id, s]))
      const updated = prev.filter((s) => map.has(s.id)).map((s) => map.get(s.id)!)
      const prevIds = new Set(prev.map((s) => s.id))
      const added   = segments.filter((s) => !prevIds.has(s.id))
      return [...updated, ...added]
    })
  }, [segments])

  // Cumulative stats, broken down by segment type
  const modeStats = useMemo(() => {
    const byMode: Record<string, { distanceM: number; gainM: number; lossM: number }> = {}
    for (const s of orderedSegs) {
      const b = (byMode[s.type] ??= { distanceM: 0, gainM: 0, lossM: 0 })
      b.distanceM += s.distanceM ?? 0
      b.gainM     += s.elevationGainM ?? 0
      b.lossM     += s.elevationLossM ?? 0
    }
    return byMode
  }, [orderedSegs])

  const presentModes = MODE_ORDER.filter((m) => modeStats[m])
  const activeStats  = modeStats[distanceMode] ?? { distanceM: 0, gainM: 0, lossM: 0 }

  // Geocode night addresses → moon markers on the map
  const stopoverMarkers = useStopoverMarkers(stopovers)

  // Default to (or fall back to) the first available type
  useEffect(() => {
    if (!modeStats[distanceMode]) setDistanceMode(presentModes[0] ?? "")
  }, [distanceMode, modeStats, presentModes])

  const selected = orderedSegs.find((s) => s.id === selectedId) ?? null

  const mapSegments = useMemo(
    () => orderedSegs.map((s) => ({
      id: s.id, type: s.type, geojson: s.geojson, name: s.name,
      origin: s.origin, destination: s.destination,
      // Signature de la trace : change quand le GPX est remplacé, pour forcer
      // react-leaflet à redessiner (il ne réagit pas aux seuls changements de `data`)
      version: `${s.distanceM ?? ""}|${s.elevationGainM ?? ""}|${s.elevationLossM ?? ""}|${s.startLat ?? ""}|${s.startLon ?? ""}`,
    })),
    [orderedSegs]
  )

  const handleSegmentClick = useCallback((id: string) => {
    setSelectedId((prev) => (prev === id ? null : id))
  }, [])

  // Sur mobile, taper un segment vélo (gpx) ou à pied (walking) dans la liste ouvre
  // directement sa page détail (la carte de segment sélectionné est hors écran sur petit écran).
  const handleSegmentSelect = useCallback((id: string) => {
    const isMobile =
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 767px)").matches
    if (isMobile) {
      const seg = orderedSegs.find((s) => s.id === id)
      if (seg?.type === "gpx" || seg?.type === "walking") {
        router.push(`/trips/${tripId}/segments/${id}`)
        return
      }
    }
    handleSegmentClick(id)
  }, [orderedSegs, router, tripId, handleSegmentClick])

  async function handleStopoverEdit(data: StopoverFormData) {
    if (!editingStopover) return
    setStopoverSaving(true)
    setStopoverError(null)
    try {
      const res = await fetch(`/api/trips/${tripId}/stopovers/${editingStopover.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const d = await res.json()
        setStopoverError(d.error ?? "Erreur lors de la mise à jour.")
        return
      }
      const updated: Stopover = await res.json()
      setStopovers((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
      setEditingStopover(null)
    } catch {
      setStopoverError("Une erreur inattendue s'est produite.")
    } finally {
      setStopoverSaving(false)
    }
  }

  async function handleDateChange(segmentId: string, dateValue: string) {
    const seg = orderedSegs.find((s) => s.id === segmentId)
    if (!seg) return

    let newDepartureAt: string | null = null
    let newArrivalAt: string | null = null

    if (dateValue) {
      const [y, m, d] = dateValue.split("-").map(Number)
      if (seg.departureAt) {
        // Preserve existing time, just change the date
        const dt = new Date(seg.departureAt)
        dt.setFullYear(y, m - 1, d)
        newDepartureAt = dt.toISOString()
      } else {
        newDepartureAt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).toISOString()
      }
      if (seg.arrivalAt) {
        const at = new Date(seg.arrivalAt)
        at.setFullYear(y, m - 1, d)
        newArrivalAt = at.toISOString()
      }
    }

    // Optimistic update
    setOrderedSegs((prev) =>
      prev.map((s) =>
        s.id === segmentId
          ? { ...s, departureAt: newDepartureAt, arrivalAt: newArrivalAt ?? (dateValue ? s.arrivalAt : null) }
          : s
      )
    )

    await fetch(`/api/segments/${segmentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        departureAt: newDepartureAt,
        arrivalAt: newArrivalAt,
      }),
    })
  }

  async function handleDeleteSegment(segmentId: string) {
    setDeletingId(segmentId)
    try {
      const res = await fetch(`/api/segments/${segmentId}`, { method: "DELETE" })
      if (res.ok) {
        setOrderedSegs((prev) => prev.filter((s) => s.id !== segmentId))
        setSelectedId(null)
      }
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="relative h-full">

      <AddSegmentModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        tripId={tripId}
        titleLabel={isRoadtrip ? "Ajouter une étape" : "Ajouter un segment"}
        segmentCount={orderedSegs.length}
        onAdded={(seg) => setOrderedSegs((prev) => prev.some((s) => s.id === seg.id) ? prev : [...prev, seg])}
      />

      {editingStopover && (
        <StopoverModal
          title="Modifier la nuit"
          initial={{
            date:     editingStopover.date.slice(0, 10),
            endDate:  editingStopover.endDate,
            name:     editingStopover.name,
            place:    editingStopover.place,
            notes:    editingStopover.notes ?? "",
            platform: editingStopover.platform,
            link:     editingStopover.link,
          }}
          onSave={handleStopoverEdit}
          onClose={() => setEditingStopover(null)}
          loading={stopoverSaving}
          error={stopoverError}
        />
      )}

      {/* ── Left panel ────────────────────────────────────────────── */}
      <aside className="absolute top-3 left-0 right-0 mx-auto max-w-[calc(100%-1.5rem)] lg:left-3 lg:right-auto lg:mx-0 lg:max-w-none h-[calc(100%-1.5rem)] w-[360px] bg-white flex flex-col overflow-hidden shadow-xl z-10 rounded-2xl [transform:translateZ(0)]">

        {/* Contenu défilant : l'en-tête défile, le sélecteur Segments/Nuits reste collé en haut */}
        <div className="flex-1 overflow-y-auto">

        {/* Header */}
        <div className="px-5 pt-4 pb-4">
          <div className="flex items-center justify-between mb-3">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700 transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Mes voyages
            </Link>
            <button
              onClick={() => exportTripToExcel(tripName, orderedSegs, stopovers)}
              title="Exporter en Excel"
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-emerald-600"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Export
            </button>
          </div>
          <h1 className="text-xl font-bold text-slate-900 leading-tight">{tripName}</h1>
          <div className="mt-1.5 inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
            {isRoadtrip ? <Car className="h-3 w-3 text-[#8b5cf6]" /> : <Bike className="h-3 w-3 text-[#5F7F6F]" />}
            {TRIP_TYPE_LABELS[tripType]}
          </div>
          {tripDescription && (
            <p className="text-sm text-slate-500 mt-1 line-clamp-2">{tripDescription}</p>
          )}
        </div>

        {/* km + dénivelé cumulés — masqués pour un roadtrip */}
        {!isRoadtrip && (<>
        {/* Distance filter chips — break the cumulative distance down by type */}
        {presentModes.length > 0 && (
          <div className="px-5 pb-3 flex items-center gap-1.5 flex-wrap">
            {presentModes.map((m) => {
              const active = distanceMode === m
              const km = modeStats[m].distanceM
              return (
                <button
                  key={m}
                  onClick={() => setDistanceMode(m)}
                  title={TYPE_LABELS[m]}
                  style={active ? { backgroundColor: TYPE_COLORS[m] + "20", color: TYPE_COLORS[m] } : undefined}
                  className={cn(
                    "flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors",
                    active ? "font-semibold" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  )}
                >
                  <span style={{ color: TYPE_COLORS[m] }}>{CHIP_ICONS[m]}</span>
                  {km > 0 ? `${Math.round(km / 1000)} km` : TYPE_LABELS[m]}
                </button>
              )
            })}
          </div>
        )}

        {/* Stats bar — reflects the selected type filter */}
        <div className="grid grid-cols-2 divide-x divide-slate-100">
          {[
            { icon: <Route className="h-4 w-4" />, value: activeStats.distanceM > 0 ? (activeStats.distanceM / 1000).toFixed(0) + " km" : "—", label: TYPE_LABELS[distanceMode] ? `Distance · ${TYPE_LABELS[distanceMode]}` : "Distance", color: "text-[#7F9C8D]" },
            { icon: <TrendingUp className="h-4 w-4" />, value: activeStats.gainM > 0 ? Math.round(activeStats.gainM) + " m" : "—", label: "Dénivelé +", color: "text-[#D15F36]" },
          ].map(({ icon, value, label, color }) => (
            <div key={label} className="flex items-center justify-center gap-2 py-2.5 px-4">
              <div className={cn("shrink-0", color)}>{icon}</div>
              <div>
                <p className="text-base font-bold text-slate-900 leading-none">{value}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">{label}</p>
              </div>
            </div>
          ))}
        </div>
        </>)}

        {/* ── Sun / Moon toggle (reste collé en haut au scroll) ──── */}
        <div className="sticky top-0 z-20 bg-white px-5 py-3">
          <div className="flex items-center bg-slate-100 rounded-xl p-1 gap-1">
            <button
              onClick={() => setPanel("segments")}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-sm font-medium transition-all",
                panel === "segments"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              )}
            >
              <Sun className="h-4 w-4" />
              {StepsWord}
            </button>
            <button
              onClick={() => setPanel("stopovers")}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-sm font-medium transition-all",
                panel === "stopovers"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              )}
            >
              <Moon className="h-4 w-4" />
              Nuits
            </button>
          </div>
        </div>

          {panel === "segments" && (
            <div className="px-5 py-4 border-b border-slate-100">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  {StepsWord} ({segments.length})
                </h2>
                <button
                  onClick={() => setAddOpen(true)}
                  className="text-xs text-[#D15F36] hover:text-[#b8502d] font-bold flex items-center gap-0.5"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Ajouter
                </button>
              </div>

              {orderedSegs.length === 0 ? (
                <div className="text-center py-6">
                  <Route className="h-8 w-8 text-slate-200 mx-auto mb-2" />
                  <p className="text-sm text-slate-400">{isRoadtrip ? "Aucune étape" : "Aucun segment"}</p>
                  <Button size="sm" className="mt-3 gap-1.5" onClick={() => setAddOpen(true)}>
                    <Plus className="h-3.5 w-3.5" />
                    {isRoadtrip ? "Ajouter une étape" : "Ajouter un segment"}
                  </Button>
                </div>
              ) : (
                <SortableSegmentList
                  tripId={tripId}
                  segments={orderedSegs}
                  stopovers={stopovers}
                  selectedId={selectedId}
                  onSelect={handleSegmentSelect}
                  onReorder={setOrderedSegs}
                  onDateChange={handleDateChange}
                  onStopoverClick={(s) => { setEditingStopover(s); setStopoverError(null) }}
                />
              )}
            </div>
          )}

          {panel === "stopovers" && (
            <StopoversPanel
              tripId={tripId}
              stopovers={stopovers}
              onChange={setStopovers}
            />
          )}

        </div>

        {/* Footer */}
        {panel === "segments" && (
          <div className="border-t border-slate-100 px-5 py-4">
            <Button className="w-full gap-2" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" />
              {isRoadtrip ? "Ajouter une étape" : "Ajouter un segment"}
            </Button>
          </div>
        )}
      </aside>

      {/* ── Layer picker ──────────────────────────────────────────── */}
      <div className="absolute top-3 right-3 z-10">
        <MapLayerPicker layers={layers} current={layer} onSelect={setLayer} />
      </div>

      {/* ── Map ───────────────────────────────────────────────────── */}
      <div className="absolute inset-0 z-0 [transform:translateZ(0)]">
        {orderedSegs.length > 0 ? (
          <DynamicTripMap
            segments={mapSegments}
            pois={EMPTY_POIS}
            stopovers={stopoverMarkers}
            selectedSegmentId={selectedId}
            onSegmentClick={handleSegmentClick}
            height="100%"
            tileUrl={layer.url}
            tileAttribution={layer.attribution}
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center bg-slate-100 text-center px-8">
            <Route className="h-16 w-16 text-slate-300 mb-4" />
            <p className="text-slate-500 font-medium mb-2 text-lg">Aucune trace GPS disponible</p>
            <p className="text-sm text-slate-400 mb-6">
              {isRoadtrip
                ? "Ajoutez une étape pour afficher votre itinéraire sur la carte"
                : "Ajoutez un segment GPX pour afficher votre itinéraire sur la carte"}
            </p>
            <Button className="gap-2" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" />
              {isRoadtrip ? "Ajouter une étape" : "Importer un fichier GPX"}
            </Button>
          </div>
        )}
      </div>

      {/* ── Bottom segment panel ───────────────────────────────────── */}
      <div
        className={cn(
          "absolute bottom-0 left-[372px] right-0 z-20 transition-transform duration-300 ease-out",
          selected ? "translate-y-0" : "translate-y-full"
        )}
      >
        {selected && (
          <div className="relative mx-3 mb-3">
            {/* Collapse handle — floats above the card */}
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-10">
              <button
                onClick={() => setBottomCollapsed((v) => !v)}
                className="flex h-7 w-10 items-center justify-center rounded-full bg-white text-slate-400 hover:text-slate-600 transition-colors"
              >
                <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", bottomCollapsed ? "rotate-180" : "")} />
              </button>
            </div>

            <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
            {/* Single row: icon + name + stats + actions */}
            <div className="flex items-center gap-4 px-5 py-4">
              {/* Type icon */}
              <div
                className="flex h-9 w-9 items-center justify-center rounded-xl shrink-0"
                style={{ background: TYPE_COLORS[selected.type] + "20" }}
              >
                <span style={{ color: TYPE_COLORS[selected.type] }}>{TYPE_ICONS[selected.type]}</span>
              </div>

              {/* Name */}
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900 break-words">{segmentLabel(selected)}</p>
                <p className="text-xs text-slate-400">{TYPE_LABELS[selected.type]}</p>
              </div>

              {/* Separator */}
              <div className="h-8 w-px bg-slate-200 shrink-0" />

              {/* Stats — inline */}
              <div className="flex items-center gap-5 flex-1 min-w-0">
                {selected.distanceM != null && selected.distanceM > 0 && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Route className="h-4 w-4 text-slate-400" />
                    <div>
                      <p className="text-sm font-bold text-slate-900 leading-none">{(selected.distanceM / 1000).toFixed(1)} km</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Distance</p>
                    </div>
                  </div>
                )}
                {selected.elevationGainM != null && selected.elevationGainM > 0 && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <TrendingUp className="h-4 w-4 text-emerald-500" />
                    <div>
                      <p className="text-sm font-bold text-slate-900 leading-none">{Math.round(selected.elevationGainM)} m</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Dénivelé +</p>
                    </div>
                  </div>
                )}
                {/* Dénivelé - : masqué pour le vélo (gpx), conservé pour les autres traces (à pied) */}
                {selected.elevationLossM != null && selected.elevationLossM > 0 && selected.type !== "gpx" && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <TrendingDown className="h-4 w-4 text-slate-400" />
                    <div>
                      <p className="text-sm font-bold text-slate-900 leading-none">{Math.round(selected.elevationLossM)} m</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Dénivelé -</p>
                    </div>
                  </div>
                )}
                {selected.durationMin != null && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Clock className="h-4 w-4 text-slate-400" />
                    <div>
                      <p className="text-sm font-bold text-slate-900 leading-none">{formatDuration(selected.durationMin)}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Durée</p>
                    </div>
                  </div>
                )}
                {selected.origin && selected.destination && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <ArrowRight className="h-4 w-4 text-slate-400" />
                    <div>
                      <p className="text-sm font-bold text-slate-900 leading-none truncate max-w-[140px]">{selected.origin} → {selected.destination}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Trajet</p>
                    </div>
                  </div>
                )}
                {selected.departureAt && selected.arrivalAt && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <CalendarClock className="h-4 w-4 text-blue-400" />
                    <div>
                      <p className="text-sm font-bold text-slate-900 leading-none">
                        {new Date(selected.departureAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                        {" → "}
                        {new Date(selected.arrivalAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Horaires</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 shrink-0">
                {selected.type !== "train" && selected.type !== "car" && (
                  selected.komootUrl ? (
                    <a
                      href={selected.komootUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:text-[#D15F36] hover:bg-[#D15F36]/10 transition-colors"
                      title="Voir sur Komoot"
                    >
                      <Link2 className="h-4 w-4" />
                    </a>
                  ) : (
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-200 cursor-not-allowed" title="Aucun lien Komoot">
                      <Link2 className="h-4 w-4" />
                    </div>
                  )
                )}
                <EditSegmentModal
                  segment={{
                    id:          selected.id,
                    type:        selected.type,
                    name:        selected.name,
                    origin:      selected.origin,
                    destination: selected.destination,
                    durationMin: selected.durationMin,
                    departureAt: selected.departureAt,
                    arrivalAt:   selected.arrivalAt,
                    komootUrl:   selected.komootUrl,
                  }}
                />
                {selected.type !== "train" && selected.type !== "car" && (
                  <Link href={`/trips/${tripId}/segments/${selected.id}`}>
                    <button className="flex items-center gap-1.5 text-xs font-semibold text-[#D15F36] hover:text-[#b8502d] bg-[#D15F36]/10 hover:bg-[#D15F36]/20 px-3 py-1.5 rounded-lg transition-colors">
                      Détail
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </Link>
                )}
                {(selected.type === "train" || selected.type === "car") && (
                  <button
                    onClick={() => {
                      if (confirm(`Supprimer ${isRoadtrip ? "l'étape" : "le segment"} "${selected.name ?? selected.origin + " → " + selected.destination}" ?`))
                        handleDeleteSegment(selected.id)
                    }}
                    disabled={deletingId === selected.id}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
                    title="Supprimer ce segment"
                  >
                    {deletingId === selected.id
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <Trash2 className="h-4 w-4" />}
                  </button>
                )}
                <button
                  onClick={() => setSelectedId(null)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Elevation chart */}
            {!bottomCollapsed && selected.elevationPoints && selected.elevationPoints.length > 0 && (
              <div className="px-4 pb-4 pt-3 border-t border-slate-100">
                <ElevationChart points={selected.elevationPoints} />
              </div>
            )}

            </div>
          </div>
        )}
      </div>
    </div>
  )
}
