"use client"

import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useDropzone } from "react-dropzone"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import {
  ArrowLeft, CheckCircle2, Loader2, Upload, FileText, Bike, Train, Footprints,
} from "lucide-react"

// ── Types ─────────────────────────────────────────────────────────────────────

interface SegmentData {
  id:          string
  type:        string
  name:        string | null
  origin:      string | null
  destination: string | null
  durationMin: number | null
  departureAt: string | null
  arrivalAt:   string | null
}

interface Props {
  tripId:   string
  tripName: string
  segment:  SegmentData
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = { gpx: "Vélo", train: "Train", walking: "À pied" }
const TYPE_COLORS: Record<string, string> = { gpx: "#10b981", train: "#3b82f6", walking: "#f59e0b" }
const TYPE_ICONS: Record<string, React.ReactNode> = {
  gpx:     <Bike       className="h-4 w-4" />,
  train:   <Train      className="h-4 w-4" />,
  walking: <Footprints className="h-4 w-4" />,
}

function toDateInput(isoStr: string | null): string {
  if (!isoStr) return ""
  return isoStr.slice(0, 10)
}

function toDatetimeLocal(isoStr: string | null): string {
  if (!isoStr) return ""
  const dt = new Date(isoStr)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

// ── Component ─────────────────────────────────────────────────────────────────

export function EditSegmentForm({ tripId, tripName, segment }: Props) {
  const router = useRouter()

  // ── Form state ──────────────────────────────────────────────────────────────
  const [name, setName]               = useState(segment.name ?? "")
  const [date, setDate]               = useState(toDateInput(segment.departureAt))
  const [origin, setOrigin]           = useState(segment.origin ?? "")
  const [destination, setDestination] = useState(segment.destination ?? "")
  const [departureAt, setDepartureAt] = useState(toDatetimeLocal(segment.departureAt))
  const [arrivalAt, setArrivalAt]     = useState(toDatetimeLocal(segment.arrivalAt))
  const [durationMin, setDurationMin] = useState(segment.durationMin?.toString() ?? "")
  const [gpxFile, setGpxFile]         = useState<File | null>(null)

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [success, setSuccess]     = useState(false)

  // Auto-compute duration for train
  const computedDuration = (() => {
    if (!departureAt || !arrivalAt) return null
    const diff = Math.round((new Date(arrivalAt).getTime() - new Date(departureAt).getTime()) / 60000)
    return diff > 0 ? diff : null
  })()

  // ── GPX drop zone ────────────────────────────────────────────────────────────
  const onDrop = useCallback((accepted: File[]) => {
    setError(null)
    if (accepted.length > 0) {
      const f = accepted[0]
      if (f.size > 10 * 1024 * 1024) {
        setError("Le fichier dépasse 10 Mo.")
        return
      }
      setGpxFile(f)
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/gpx+xml": [".gpx"], "text/xml": [".gpx"] },
    maxFiles: 1,
    disabled: isLoading,
  })

  // ── Submit ───────────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      // 1 — Save metadata via JSON PATCH
      const body: Record<string, unknown> = {
        name: name.trim() || null,
      }

      if (segment.type === "train") {
        if (origin.trim())      body.origin      = origin.trim()
        if (destination.trim()) body.destination = destination.trim()
        if (departureAt)        body.departureAt = new Date(departureAt).toISOString()
        if (arrivalAt)          body.arrivalAt   = new Date(arrivalAt).toISOString()
        if (computedDuration)   body.durationMin = computedDuration
      } else if (segment.type === "walking") {
        if (origin.trim())            body.origin      = origin.trim()
        if (destination.trim())       body.destination = destination.trim()
        if (durationMin)              body.durationMin = parseInt(durationMin, 10)
        if (date)                     body.departureAt = new Date(date + "T12:00:00Z").toISOString()
      } else {
        // GPX: just date
        if (date) body.departureAt = new Date(date + "T12:00:00Z").toISOString()
        else      body.departureAt = null
      }

      const metaRes = await fetch(`/api/segments/${segment.id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      })

      if (!metaRes.ok) {
        const data = await metaRes.json()
        setError(data.error ?? "Erreur lors de la mise à jour.")
        return
      }

      // 2 — Replace GPX trace if a new file was selected
      if (gpxFile) {
        const formData = new FormData()
        formData.append("file", gpxFile)

        const gpxRes = await fetch(`/api/segments/${segment.id}`, {
          method: "PATCH",
          body:   formData,
        })

        if (!gpxRes.ok) {
          const data = await gpxRes.json()
          setError(data.error ?? "Erreur lors du remplacement de la trace GPX.")
          return
        }
      }

      setSuccess(true)
      setTimeout(() => router.push(`/trips/${tripId}`), 800)
    } catch {
      setError("Une erreur inattendue s'est produite.")
    } finally {
      setIsLoading(false)
    }
  }

  // ── Success screen ───────────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <CheckCircle2 className="h-12 w-12 text-emerald-500 mb-3" />
        <p className="font-semibold text-slate-900">Modifications enregistrées !</p>
        <p className="text-sm text-slate-500 mt-1">Redirection en cours…</p>
      </div>
    )
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 lg:p-8 max-w-2xl mx-auto">

      {/* Breadcrumb */}
      <Link
        href={`/trips/${tripId}`}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 mb-6 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        {tripName}
      </Link>

      {/* Title */}
      <div className="flex items-center gap-3 mb-8">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl shrink-0"
          style={{ background: TYPE_COLORS[segment.type] + "20", color: TYPE_COLORS[segment.type] }}
        >
          {TYPE_ICONS[segment.type]}
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Modifier le segment</h1>
          <p className="text-sm text-slate-400">{TYPE_LABELS[segment.type]}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* Error */}
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* ── Informations générales ─────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Informations générales</p>
          </div>
          <div className="p-5 space-y-4">

            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="edit-name">Nom du segment</Label>
              <Input
                id="edit-name"
                placeholder={segment.type === "train" ? "Ex : Lyon → Paris" : "Ex : Col du Galibier"}
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={200}
              />
            </div>

            {/* Date — GPX and walking */}
            {segment.type !== "train" && (
              <div className="space-y-2">
                <Label htmlFor="edit-date">Date</Label>
                <Input
                  id="edit-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
            )}

            {/* Origin / destination — transit */}
            {(segment.type === "train" || segment.type === "walking") && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-origin">Départ <span className="text-red-500">*</span></Label>
                  <Input
                    id="edit-origin"
                    placeholder="Ex : Gare de Lyon"
                    value={origin}
                    onChange={(e) => setOrigin(e.target.value)}
                    required
                    maxLength={300}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-dest">Arrivée <span className="text-red-500">*</span></Label>
                  <Input
                    id="edit-dest"
                    placeholder="Ex : Gare de Marseille"
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    required
                    maxLength={300}
                  />
                </div>
              </div>
            )}

            {/* Train — departure / arrival datetimes */}
            {segment.type === "train" && (
              <div className="space-y-4 rounded-xl border border-slate-200 p-4 bg-slate-50">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Horaires</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-dep">Départ</Label>
                    <Input
                      id="edit-dep"
                      type="datetime-local"
                      value={departureAt}
                      onChange={(e) => setDepartureAt(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-arr">Arrivée</Label>
                    <Input
                      id="edit-arr"
                      type="datetime-local"
                      value={arrivalAt}
                      onChange={(e) => setArrivalAt(e.target.value)}
                    />
                  </div>
                </div>
                {computedDuration && computedDuration > 0 && (
                  <p className="text-sm text-emerald-700 font-medium">
                    Durée calculée : {Math.floor(computedDuration / 60) > 0 ? `${Math.floor(computedDuration / 60)} h ` : ""}
                    {computedDuration % 60 > 0 ? `${computedDuration % 60} min` : ""}
                  </p>
                )}
              </div>
            )}

            {/* Walking — manual duration */}
            {segment.type === "walking" && (
              <div className="space-y-2">
                <Label htmlFor="edit-duration">Durée (minutes)</Label>
                <Input
                  id="edit-duration"
                  type="number"
                  placeholder="Ex : 45"
                  value={durationMin}
                  onChange={(e) => setDurationMin(e.target.value)}
                  min={1}
                  max={9999}
                />
              </div>
            )}
          </div>
        </div>

        {/* ── GPX replacement ────────────────────────────────────────────────── */}
        {segment.type === "gpx" && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Remplacer la trace GPX</p>
            </div>
            <div className="p-5">
              <div
                {...getRootProps()}
                className={cn(
                  "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors",
                  isDragActive
                    ? "border-emerald-400 bg-emerald-50"
                    : gpxFile
                    ? "border-emerald-300 bg-emerald-50/50"
                    : "border-slate-200 hover:border-emerald-300 hover:bg-slate-50"
                )}
              >
                <input {...getInputProps()} />
                {gpxFile ? (
                  <div className="flex flex-col items-center gap-2">
                    <FileText className="h-10 w-10 text-emerald-500" />
                    <p className="font-medium text-slate-800">{gpxFile.name}</p>
                    <p className="text-sm text-slate-500">{formatBytes(gpxFile.size)}</p>
                    <p className="text-xs text-slate-400">Cliquez ou déposez un autre fichier pour remplacer</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="h-10 w-10 text-slate-300" />
                    <p className="font-medium text-slate-500">
                      {isDragActive ? "Déposez votre fichier GPX" : "Glissez un nouveau fichier GPX"}
                    </p>
                    <p className="text-sm text-slate-400">ou cliquez pour sélectionner — .gpx, max 10 Mo</p>
                    <p className="text-xs text-slate-300 mt-1">Laissez vide pour conserver la trace actuelle</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Actions ──────────────────────────────────────────────────────────── */}
        <div className="flex gap-3">
          <Button type="submit" className="flex-1" isLoading={isLoading}>
            Enregistrer les modifications
          </Button>
          <Link href={`/trips/${tripId}`}>
            <Button type="button" variant="outline" disabled={isLoading}>
              Annuler
            </Button>
          </Link>
        </div>

      </form>
    </div>
  )
}
