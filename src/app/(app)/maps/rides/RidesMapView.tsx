"use client"

import { useCallback, useMemo, useState } from "react"
import { useDropzone } from "react-dropzone"
import type { FeatureCollection } from "geojson"
import { Upload, Bike, Trash2, Route, TrendingUp, Loader2, AlertCircle } from "lucide-react"
import { DynamicTripMap } from "@/components/map/DynamicTripMap"
import { MapLayerPicker } from "@/components/map/MapLayerPicker"
import { useMapLayer } from "@/hooks/useMapLayer"
import { cn } from "@/lib/utils"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RideTrace {
  id:             string
  name:           string | null
  geojson:        FeatureCollection | null
  distanceM:      number | null
  elevationGainM: number | null
  createdAt:      string
}

const MAX_GPX_SIZE = 10 * 1024 * 1024 // 10 Mo
const EMPTY_POIS: [] = []

// ── Helpers ─────────────────────────────────────────────────────────────────

function stripGpxExt(fileName: string): string {
  return fileName.replace(/\.gpx$/i, "").trim() || "Sortie"
}

function formatKm(distanceM: number | null): string {
  if (distanceM == null) return "—"
  return `${(distanceM / 1000).toFixed(1)} km`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })
}

// ── View ──────────────────────────────────────────────────────────────────────

export function RidesMapView({
  tripId,
  initialTraces,
}: {
  tripId: string
  initialTraces: RideTrace[]
}) {
  const { layer, setLayer, layers } = useMapLayer()

  const [traces, setTraces]     = useState<RideTrace[]>(initialTraces)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [uploading, setUploading]   = useState(false)
  const [error, setError]           = useState<string | null>(null)

  const mapSegments = useMemo(
    () => traces.map((t) => ({ id: t.id, type: "gpx", geojson: t.geojson, name: t.name })),
    [traces]
  )

  const totalKm = useMemo(
    () => traces.reduce((sum, t) => sum + (t.distanceM ?? 0), 0) / 1000,
    [traces]
  )

  const onDrop = useCallback(async (accepted: File[]) => {
    if (accepted.length === 0) return
    setError(null)
    setUploading(true)

    // Upload séquentiel : chaque .gpx devient un segment GPX du voyage "rides".
    const added: RideTrace[] = []
    try {
      for (const file of accepted) {
        if (file.size > MAX_GPX_SIZE) {
          setError(`« ${file.name} » dépasse 10 Mo et a été ignoré.`)
          continue
        }
        const formData = new FormData()
        formData.append("tripId", tripId)
        formData.append("type", "gpx")
        formData.append("name", stripGpxExt(file.name))
        formData.append("sortOrder", String(traces.length + added.length))
        formData.append("file", file)

        const res = await fetch("/api/segments", { method: "POST", body: formData })
        if (!res.ok) {
          const d = await res.json().catch(() => ({}))
          setError(d.error ?? `Échec de l'import de « ${file.name} ».`)
          continue
        }
        const seg = await res.json()
        added.push({
          id:             seg.id,
          name:           seg.name ?? stripGpxExt(file.name),
          geojson:        (seg.geojson as FeatureCollection | null) ?? null,
          distanceM:      seg.distanceM ?? null,
          elevationGainM: seg.elevationGainM ?? null,
          createdAt:      new Date().toISOString(),
        })
      }
      if (added.length > 0) setTraces((prev) => [...added, ...prev])
    } catch {
      setError("Une erreur inattendue s'est produite pendant l'import.")
    } finally {
      setUploading(false)
    }
  }, [tripId, traces.length])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/gpx+xml": [".gpx"], "text/xml": [".gpx"] },
    multiple: true,
    disabled: uploading,
  })

  async function handleDelete(id: string) {
    // Optimiste : on retire tout de suite, on annule si l'API échoue.
    const previous = traces
    setTraces((prev) => prev.filter((t) => t.id !== id))
    if (selectedId === id) setSelectedId(null)
    const res = await fetch(`/api/segments/${id}`, { method: "DELETE" })
    if (!res.ok) {
      setError("Impossible de supprimer cette trace.")
      setTraces(previous)
    }
  }

  return (
    <div className="flex flex-col lg:flex-row h-full">
      {/* ── Panneau latéral ─────────────────────────────────────────── */}
      <aside className="lg:w-[380px] lg:shrink-0 lg:h-full lg:overflow-y-auto border-b lg:border-b-0 lg:border-r border-slate-200 bg-white">
        <div className="p-5 space-y-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50">
                <Bike className="h-5 w-5 text-emerald-600" />
              </div>
              <h1 className="text-xl font-bold text-slate-900">Mes sorties vélo</h1>
            </div>
            <p className="text-sm text-slate-500">
              {traces.length === 0
                ? "Importez vos traces GPX pour les voir sur la carte."
                : `${traces.length} sortie${traces.length > 1 ? "s" : ""} · ${totalKm.toFixed(0)} km au total`}
            </p>
          </div>

          {/* Zone d'import */}
          <div
            {...getRootProps()}
            className={cn(
              "border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors",
              isDragActive
                ? "border-emerald-400 bg-emerald-50"
                : "border-slate-200 hover:border-emerald-300 hover:bg-slate-50",
              uploading && "opacity-60 cursor-wait"
            )}
          >
            <input {...getInputProps()} />
            <div className="flex flex-col items-center gap-1.5">
              {uploading ? (
                <Loader2 className="h-8 w-8 text-emerald-500 animate-spin" />
              ) : (
                <Upload className="h-8 w-8 text-slate-300" />
              )}
              <p className="text-sm text-slate-600 font-medium">
                {uploading
                  ? "Import en cours…"
                  : isDragActive
                  ? "Déposez vos fichiers"
                  : "Glissez un ou plusieurs .gpx"}
              </p>
              <p className="text-xs text-slate-400">ou cliquez pour choisir — max 10 Mo par fichier</p>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Liste des sorties */}
          {traces.length > 0 && (
            <ul className="space-y-1.5">
              {traces.map((t) => {
                const active = selectedId === t.id
                return (
                  <li key={t.id}>
                    <div
                      onClick={() => setSelectedId(active ? null : t.id)}
                      className={cn(
                        "group flex items-center gap-3 rounded-xl px-3 py-2.5 cursor-pointer transition-colors",
                        active ? "bg-emerald-50 ring-1 ring-emerald-200" : "hover:bg-slate-50"
                      )}
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100">
                        <Bike className="h-4 w-4 text-emerald-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">
                          {t.name || "Sortie"}
                        </p>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-400">
                          <span className="flex items-center gap-1">
                            <Route className="h-3 w-3" />
                            {formatKm(t.distanceM)}
                          </span>
                          {t.elevationGainM != null && (
                            <span className="flex items-center gap-1">
                              <TrendingUp className="h-3 w-3" />
                              {Math.round(t.elevationGainM)} m
                            </span>
                          )}
                          <span>{formatDate(t.createdAt)}</span>
                        </div>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(t.id) }}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 hover:text-red-600 hover:bg-red-50 transition-all"
                        title="Supprimer cette trace"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </aside>

      {/* ── Carte ───────────────────────────────────────────────────── */}
      <div className="relative flex-1 min-h-[55vh] lg:min-h-0 lg:h-full">
        {traces.length > 0 ? (
          <>
            <div className="absolute top-3 right-3 z-[400]">
              <MapLayerPicker layers={layers} current={layer} onSelect={setLayer} />
            </div>
            <div className="absolute inset-0 z-0 [transform:translateZ(0)]">
              <DynamicTripMap
                segments={mapSegments}
                pois={EMPTY_POIS}
                selectedSegmentId={selectedId}
                onSegmentClick={(id) => setSelectedId(id)}
                height="100%"
                tileUrl={layer.url}
                tileAttribution={layer.attribution}
              />
            </div>
          </>
        ) : (
          <div className="h-full flex flex-col items-center justify-center bg-slate-100 text-center px-8 py-16">
            <Bike className="h-16 w-16 text-slate-300 mb-4" />
            <p className="text-slate-500 font-medium mb-2 text-lg">Aucune trace pour le moment</p>
            <p className="text-sm text-slate-400">
              Importez vos fichiers GPX depuis le panneau pour les voir apparaître ici.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
