"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import { useDropzone } from "react-dropzone"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { StationAutocomplete } from "@/components/StationAutocomplete"
import { AddressAutocomplete, type AddressCoords } from "@/components/AddressAutocomplete"
import {
  X, Pencil, Upload, FileText, CheckCircle2, Loader2,
} from "lucide-react"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SegmentEditData {
  id:          string
  type:        string
  name:        string | null
  origin:      string | null
  destination: string | null
  durationMin: number | null
  departureAt: string | null
  arrivalAt:   string | null
  komootUrl:   string | null
  notes?:      string | null
  transportMode?: string | null
  terminal?:      string | null
}

const TRANSPORT_MODES = ["Avion", "Train", "Voiture", "Bus", "Bateau", "Autre"]

// ── Helpers ───────────────────────────────────────────────────────────────────

function toDateInput(isoStr: string | null): string {
  return isoStr ? isoStr.slice(0, 10) : ""
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

// ── Modal form ────────────────────────────────────────────────────────────────

function ModalForm({
  segment,
  onClose,
}: {
  segment: SegmentEditData
  onClose: () => void
}) {
  const router = useRouter()

  const [name, setName]               = useState(segment.name ?? "")
  const [date, setDate]               = useState(toDateInput(segment.departureAt))
  const [origin, setOrigin]           = useState(segment.origin ?? "")
  const [destination, setDestination] = useState(segment.destination ?? "")
  const [originCoords, setOriginCoords]           = useState<AddressCoords | null>(null)
  const [destinationCoords, setDestinationCoords] = useState<AddressCoords | null>(null)
  const [departureAt, setDepartureAt] = useState(toDatetimeLocal(segment.departureAt))
  const [arrivalAt, setArrivalAt]     = useState(toDatetimeLocal(segment.arrivalAt))
  const [durationMin, setDurationMin] = useState(segment.durationMin?.toString() ?? "")
  const [komootUrl, setKomootUrl]     = useState(segment.komootUrl ?? "")
  const [notes, setNotes]             = useState(segment.notes ?? "")
  const isMilestone = segment.type === "arrival" || segment.type === "departure"
  const milestoneLocal = toDatetimeLocal(segment.type === "arrival" ? segment.arrivalAt : segment.departureAt)
  const [transportMode, setTransportMode] = useState(segment.transportMode ?? "")
  const [terminal, setTerminal]           = useState(segment.terminal ?? "")
  const [mDate, setMDate]                 = useState(milestoneLocal ? milestoneLocal.slice(0, 10) : "")
  const [mTime, setMTime]                 = useState(milestoneLocal ? milestoneLocal.slice(11, 16) : "")
  const [gpxFile, setGpxFile]         = useState<File | null>(null)
  const [isLoading, setIsLoading]     = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [success, setSuccess]         = useState(false)

  const computedDuration = (() => {
    if (!departureAt || !arrivalAt) return null
    const diff = Math.round(
      (new Date(arrivalAt).getTime() - new Date(departureAt).getTime()) / 60000
    )
    return diff > 0 ? diff : null
  })()

  const onDrop = useCallback((accepted: File[]) => {
    setError(null)
    if (accepted[0]) {
      if (accepted[0].size > 10 * 1024 * 1024) { setError("Fichier trop volumineux (max 10 Mo)"); return }
      setGpxFile(accepted[0])
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/gpx+xml": [".gpx"], "text/xml": [".gpx"] },
    maxFiles: 1,
    disabled: isLoading,
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      // 1 — Metadata (JSON PATCH)
      const body: Record<string, unknown> = {
        name:      name.trim() || null,
        komootUrl: komootUrl.trim() || null,
      }

      if (isMilestone) {
        body.transportMode = transportMode || null
        body.terminal      = terminal.trim() || null
        const iso = mDate ? new Date(`${mDate}T${mTime || "12:00"}:00`).toISOString() : null
        if (segment.type === "departure") body.departureAt = iso
        else                              body.arrivalAt   = iso
      } else if (segment.type === "visit") {
        body.origin = origin.trim() || null
        body.notes  = notes.trim() || null
        if (originCoords) { body.originLat = originCoords.lat; body.originLon = originCoords.lon }
      } else if (segment.type === "train") {
        body.origin      = origin.trim() || null
        body.destination = destination.trim() || null
        if (departureAt) body.departureAt = new Date(departureAt).toISOString()
        if (arrivalAt)   body.arrivalAt   = new Date(arrivalAt).toISOString()
        if (computedDuration) body.durationMin = computedDuration
      } else if (segment.type === "walking" || segment.type === "car") {
        body.origin      = origin.trim() || null
        body.destination = destination.trim() || null
        if (durationMin) body.durationMin = parseInt(durationMin, 10)
        body.departureAt = date ? new Date(date + "T12:00:00Z").toISOString() : null
        if (segment.type === "car") {
          if (originCoords)      { body.originLat = originCoords.lat; body.originLon = originCoords.lon }
          if (destinationCoords) { body.destLat   = destinationCoords.lat; body.destLon = destinationCoords.lon }
        }
      } else {
        body.departureAt = date ? new Date(date + "T12:00:00Z").toISOString() : null
      }

      const metaRes = await fetch(`/api/segments/${segment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!metaRes.ok) {
        const d = await metaRes.json()
        setError(d.error ?? "Erreur lors de la mise à jour.")
        return
      }

      // 2 — GPX replacement (multipart PATCH, optional)
      if (gpxFile) {
        const formData = new FormData()
        formData.append("file", gpxFile)
        const gpxRes = await fetch(`/api/segments/${segment.id}`, {
          method: "PATCH",
          body: formData,
        })
        if (!gpxRes.ok) {
          const d = await gpxRes.json()
          setError(d.error ?? "Erreur lors du remplacement de la trace GPX.")
          return
        }
      }

      setSuccess(true)
      router.refresh()
      setTimeout(onClose, 1000)
    } catch {
      setError("Une erreur inattendue s'est produite.")
    } finally {
      setIsLoading(false)
    }
  }

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <CheckCircle2 className="h-12 w-12 text-emerald-500 mb-3" />
        <p className="font-semibold text-slate-900">Modifications enregistrées !</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Name */}
      {!isMilestone && (
        <div className="space-y-2">
          <Label htmlFor="m-name">{segment.type === "visit" ? "Nom du lieu" : "Nom du segment"}</Label>
          <Input
            id="m-name"
            placeholder={segment.type === "train" ? "Ex : Lyon → Paris" : segment.type === "visit" ? "Ex : Colisée, Musée du Louvre…" : "Ex : Col du Galibier"}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
          />
        </div>
      )}

      {/* Arrivée / Départ */}
      {isMilestone && (
        <>
          <p className="text-sm text-slate-500">Tous les champs sont optionnels.</p>
          <div className="space-y-2">
            <Label htmlFor="m-mode">Mode de transport</Label>
            <select
              id="m-mode"
              value={transportMode}
              onChange={(e) => setTransportMode(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 bg-white outline-none focus:ring-2 focus:ring-emerald-400"
            >
              <option value="">—</option>
              {TRANSPORT_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="m-mdate">Date</Label>
              <Input id="m-mdate" type="date" value={mDate} onChange={(e) => setMDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="m-mtime">Heure</Label>
              <Input id="m-mtime" type="time" value={mTime} onChange={(e) => setMTime(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="m-term">Terminal</Label>
            <Input id="m-term" placeholder="Ex : Terminal 2E, Quai 3…" value={terminal} onChange={(e) => setTerminal(e.target.value)} maxLength={200} />
          </div>
        </>
      )}

      {/* Visite — adresse + notes */}
      {segment.type === "visit" && (
        <>
          <div className="space-y-2">
            <Label htmlFor="m-place">Adresse / lieu</Label>
            <AddressAutocomplete id="m-place" value={origin} onChange={(v, c) => { setOrigin(v); setOriginCoords(c) }} placeholder="Ex : Piazza del Colosseo, Rome" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="m-notes">Notes</Label>
            <textarea
              id="m-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              maxLength={2000}
              placeholder="Horaires, billets, infos pratiques…"
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent resize-none"
            />
          </div>
        </>
      )}

      {/* Date — GPX / walking / car */}
      {segment.type !== "train" && segment.type !== "visit" && !isMilestone && (
        <div className="space-y-2">
          <Label htmlFor="m-date">Date</Label>
          <Input id="m-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      )}

      {/* Origin / destination — transit */}
      {(segment.type === "train" || segment.type === "walking" || segment.type === "car") && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="m-origin">Départ</Label>
            {segment.type === "car"
              ? <AddressAutocomplete id="m-origin" value={origin} onChange={(v, c) => { setOrigin(v); setOriginCoords(c) }} placeholder="Ex : 12 rue de la Paix, Lyon" />
              : <StationAutocomplete id="m-origin" value={origin} onChange={setOrigin} placeholder="Ex : Gare de Lyon" />}
          </div>
          <div className="space-y-2">
            <Label htmlFor="m-dest">Arrivée</Label>
            {segment.type === "car"
              ? <AddressAutocomplete id="m-dest" value={destination} onChange={(v, c) => { setDestination(v); setDestinationCoords(c) }} placeholder="Ex : Vieux-Port, Marseille" />
              : <StationAutocomplete id="m-dest" value={destination} onChange={setDestination} placeholder="Ex : Gare de Grenoble" />}
          </div>
        </div>
      )}

      {/* Train horaires */}
      {segment.type === "train" && (
        <div className="space-y-3 rounded-xl border border-slate-200 p-4 bg-slate-50">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Horaires</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="m-dep">Départ</Label>
              <Input id="m-dep" type="datetime-local" value={departureAt} onChange={(e) => setDepartureAt(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="m-arr">Arrivée</Label>
              <Input id="m-arr" type="datetime-local" value={arrivalAt} onChange={(e) => setArrivalAt(e.target.value)} />
            </div>
          </div>
          {computedDuration && computedDuration > 0 && (
            <p className="text-sm text-emerald-700 font-medium">
              Durée : {Math.floor(computedDuration / 60) > 0 ? `${Math.floor(computedDuration / 60)} h ` : ""}
              {computedDuration % 60 > 0 ? `${computedDuration % 60} min` : ""}
            </p>
          )}
        </div>
      )}

      {/* Walking / car duration */}
      {(segment.type === "walking" || segment.type === "car") && (
        <div className="space-y-2">
          <Label htmlFor="m-dur">Durée (minutes)</Label>
          <Input id="m-dur" type="number" placeholder="Ex : 45" value={durationMin} onChange={(e) => setDurationMin(e.target.value)} min={1} max={9999} />
        </div>
      )}

      {/* Komoot URL — GPX only */}
      {segment.type === "gpx" && (
        <div className="space-y-2">
          <Label htmlFor="m-komoot">Lien Komoot</Label>
          <Input
            id="m-komoot"
            type="url"
            placeholder="https://www.komoot.com/…"
            value={komootUrl}
            onChange={(e) => setKomootUrl(e.target.value)}
          />
        </div>
      )}

      {/* GPX replacement */}
      {segment.type === "gpx" && (
        <div className="space-y-2">
          <Label>Remplacer la trace GPX</Label>
          <div
            {...getRootProps()}
            className={cn(
              "border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors",
              isDragActive ? "border-emerald-400 bg-emerald-50"
                : gpxFile   ? "border-emerald-300 bg-emerald-50/50"
                             : "border-slate-200 hover:border-emerald-300 hover:bg-slate-50"
            )}
          >
            <input {...getInputProps()} />
            {gpxFile ? (
              <div className="flex flex-col items-center gap-1.5">
                <FileText className="h-8 w-8 text-emerald-500" />
                <p className="font-medium text-slate-800 text-sm">{gpxFile.name}</p>
                <p className="text-xs text-slate-400">{formatBytes(gpxFile.size)}</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1.5">
                <Upload className="h-8 w-8 text-slate-300" />
                <p className="text-sm text-slate-500">
                  {isDragActive ? "Déposez le fichier" : "Glissez un .gpx pour remplacer la trace"}
                </p>
                <p className="text-xs text-slate-400">Laissez vide pour conserver l'actuelle</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-1">
        <Button type="submit" className="flex-1" isLoading={isLoading}>
          Enregistrer
        </Button>
        <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
          Annuler
        </Button>
      </div>
    </form>
  )
}

// ── Modal wrapper (exported) ──────────────────────────────────────────────────

export function EditSegmentModal({ segment }: { segment: SegmentEditData }) {
  const [open, setOpen]       = useState(false)
  const [mounted, setMounted] = useState(false)
  const portalRef             = useRef<HTMLElement | null>(null)

  // Wait for document to be available (SSR guard)
  useEffect(() => {
    portalRef.current = document.body
    setMounted(true)
  }, [])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [open])

  // Prevent body scroll while open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : ""
    return () => { document.body.style.overflow = "" }
  }, [open])

  const overlay = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}
    >
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">{
            segment.type === "visit" ? "Modifier la visite"
            : segment.type === "departure" ? "Modifier le départ"
            : segment.type === "arrival" ? "Modifier l'arrivée"
            : "Modifier le segment"
          }</h2>
          <button
            onClick={() => setOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <div className="px-6 py-5">
          <ModalForm segment={segment} onClose={() => setOpen(false)} />
        </div>
      </div>
    </div>
  )

  return (
    <>
      <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
        <Pencil className="h-3.5 w-3.5" />
        Modifier
      </Button>

      {mounted && open && portalRef.current
        ? createPortal(overlay, portalRef.current)
        : null}
    </>
  )
}
