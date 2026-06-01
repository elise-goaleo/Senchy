"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { DynamicTripMap } from "@/components/map/DynamicTripMap"
import { MapLayerPicker } from "@/components/map/MapLayerPicker"
import { SortableSegmentList } from "@/components/SortableSegmentList"
import { StopoversPanel, type Stopover } from "@/components/StopoversPanel"
import { useMapLayer } from "@/hooks/useMapLayer"
import { AddSegmentModal } from "./AddSegmentModal"
import { EditSegmentModal } from "./segments/[segmentId]/EditSegmentModal"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { ElevationChart } from "@/components/charts/ElevationChart"
import {
  Plus, ArrowLeft, Route, TrendingUp, TrendingDown,
  Clock, X, ArrowRight, Bike, Train, Footprints, CalendarClock,
  Sun, Moon, Link2, ChevronDown,
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
  tripDescription: string | null
  segments: TripSegment[]
  initialStopovers: Stopover[]
  totalDistanceM: number
  totalElevGainM: number
  totalElevLossM: number
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = { gpx: "Vélo", train: "Train", walking: "À pied" }
const TYPE_COLORS: Record<string, string> = { gpx: "#5F7F6F", train: "#3b82f6", walking: "#f59e0b" }
const TYPE_ICONS: Record<string, React.ReactNode> = {
  gpx:     <Bike      className="h-4 w-4" />,
  train:   <Train     className="h-4 w-4" />,
  walking: <Footprints className="h-4 w-4" />,
}

function segmentLabel(seg: TripSegment) {
  if (seg.name) return seg.name
  if (seg.origin && seg.destination) return `${seg.origin} → ${seg.destination}`
  return TYPE_LABELS[seg.type] ?? "Segment"
}

function formatTime(distanceM: number, kmh = 15) {
  const min = Math.round((distanceM / 1000 / kmh) * 60)
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} h`
  return `${h} h ${m} min`
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TripClientView({
  tripId, tripName, tripDescription,
  segments,
  initialStopovers,
  totalDistanceM, totalElevGainM, totalElevLossM,
}: Props) {
  const [selectedId,      setSelectedId]      = useState<string | null>(null)
  const [orderedSegs,     setOrderedSegs]     = useState(segments)
  const [stopovers,       setStopovers]       = useState<Stopover[]>(initialStopovers)
  const [addOpen,         setAddOpen]         = useState(false)
  const [panel,           setPanel]           = useState<"segments" | "stopovers">("segments")
  const [bottomCollapsed, setBottomCollapsed] = useState(false)
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

  const selected = orderedSegs.find((s) => s.id === selectedId) ?? null

  const mapSegments = orderedSegs.map((s) => ({
    id: s.id, type: s.type, geojson: s.geojson, name: s.name,
    origin: s.origin, destination: s.destination,
  }))

  function handleSegmentClick(id: string) {
    setSelectedId((prev) => (prev === id ? null : id))
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

  return (
    <div className="relative h-full">

      <AddSegmentModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        tripId={tripId}
        segmentCount={orderedSegs.length}
        onAdded={(seg) => setOrderedSegs((prev) => prev.some((s) => s.id === seg.id) ? prev : [...prev, seg])}
      />

      {/* ── Left panel ────────────────────────────────────────────── */}
      <aside className="absolute top-3 left-3 bottom-3 w-[360px] bg-white flex flex-col overflow-hidden shadow-xl z-10 rounded-2xl">

        {/* Header */}
        <div className="px-5 pt-4 pb-4">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700 transition-colors mb-3"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Mes voyages
          </Link>
          <h1 className="text-xl font-bold text-slate-900 leading-tight">{tripName}</h1>
          {tripDescription && (
            <p className="text-sm text-slate-500 mt-1 line-clamp-2">{tripDescription}</p>
          )}
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-2 divide-x divide-slate-100">
          {[
            { icon: <Route className="h-4 w-4" />, value: (totalDistanceM / 1000).toFixed(0) + " km", label: "Distance", color: "text-[#7F9C8D]" },
            { icon: <TrendingUp className="h-4 w-4" />, value: totalElevGainM > 0 ? Math.round(totalElevGainM) + " m" : "—", label: "Dénivelé +", color: "text-[#D15F36]" },
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

        {/* ── Sun / Moon toggle ──────────────────────────────────── */}
        <div className="px-5 py-3">
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
              Segments
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

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">

          {panel === "segments" && (
            <div className="px-5 py-4 border-b border-slate-100">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Segments ({segments.length})
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
                  <p className="text-sm text-slate-400">Aucun segment</p>
                  <Button size="sm" className="mt-3 gap-1.5" onClick={() => setAddOpen(true)}>
                    <Plus className="h-3.5 w-3.5" />
                    Ajouter un segment
                  </Button>
                </div>
              ) : (
                <SortableSegmentList
                  tripId={tripId}
                  segments={orderedSegs}
                  selectedId={selectedId}
                  onSelect={handleSegmentClick}
                  onReorder={setOrderedSegs}
                  onDateChange={handleDateChange}
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
              Ajouter un segment
            </Button>
          </div>
        )}
      </aside>

      {/* ── Layer picker ──────────────────────────────────────────── */}
      <div className="absolute top-3 right-3 z-10">
        <MapLayerPicker layers={layers} current={layer} onSelect={setLayer} />
      </div>

      {/* ── Map ───────────────────────────────────────────────────── */}
      <div className="absolute inset-0 z-0">
        {orderedSegs.length > 0 ? (
          <DynamicTripMap
            segments={mapSegments}
            pois={[]}
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
              Ajoutez un segment GPX pour afficher votre itinéraire sur la carte
            </p>
            <Button className="gap-2" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" />
              Importer un fichier GPX
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
              <div className="min-w-0 shrink-0 max-w-[160px]">
                <p className="font-semibold text-slate-900 truncate">{segmentLabel(selected)}</p>
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
                {selected.elevationLossM != null && selected.elevationLossM > 0 && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <TrendingDown className="h-4 w-4 text-slate-400" />
                    <div>
                      <p className="text-sm font-bold text-slate-900 leading-none">{Math.round(selected.elevationLossM)} m</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Dénivelé -</p>
                    </div>
                  </div>
                )}
                {selected.distanceM != null && selected.distanceM > 0 && selected.type === "gpx" && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Clock className="h-4 w-4 text-slate-400" />
                    <div>
                      <p className="text-sm font-bold text-slate-900 leading-none">{formatTime(selected.distanceM)}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Temps estimé</p>
                    </div>
                  </div>
                )}
                {selected.durationMin != null && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Clock className="h-4 w-4 text-slate-400" />
                    <div>
                      <p className="text-sm font-bold text-slate-900 leading-none">{selected.durationMin} min</p>
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
                {selected.type !== "train" && (
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
                {selected.type === "train" ? (
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
                ) : (
                  <Link href={`/trips/${tripId}/segments/${selected.id}`}>
                    <button className="flex items-center gap-1.5 text-xs font-semibold text-[#D15F36] hover:text-[#b8502d] bg-[#D15F36]/10 hover:bg-[#D15F36]/20 px-3 py-1.5 rounded-lg transition-colors">
                      Détail
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </Link>
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
