"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { useDropzone } from "react-dropzone"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn, formatDuration } from "@/lib/utils"
import { StationAutocomplete } from "@/components/StationAutocomplete"
import { AddressAutocomplete, type AddressCoords } from "@/components/AddressAutocomplete"
import {
  X, Upload, FileText, CheckCircle2, Loader2, Bike, Train, Footprints, Car,
} from "lucide-react"
import type { TripSegment } from "./TripClientView"
import type { GeoJSON } from "geojson"

// ── Types ─────────────────────────────────────────────────────────────────────

type TabType = "gpx" | "train" | "walking" | "car"

interface Props {
  open:         boolean
  onClose:      () => void
  tripId:       string
  segmentCount: number
  onAdded:      (seg: TripSegment) => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

// Map raw API response → TripSegment
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSegment(raw: any): TripSegment {
  return {
    id:              raw.id,
    type:            raw.type,
    name:            raw.name ?? null,
    geojson:         raw.geojson ? (raw.geojson as GeoJSON.FeatureCollection) : null,
    distanceM:       raw.distanceM ?? null,
    elevationGainM:  raw.elevationGainM ?? null,
    elevationLossM:  raw.elevationLossM ?? null,
    elevationPoints: Array.isArray(raw.elevationPoints) ? raw.elevationPoints : null,
    durationMin:     raw.durationMin ?? null,
    departureAt:     raw.departureAt ?? null,
    arrivalAt:       raw.arrivalAt ?? null,
    origin:          raw.origin ?? null,
    destination:     raw.destination ?? null,
    startLat:        raw.startLat  ?? null,
    startLon:        raw.startLon  ?? null,
    komootUrl:       raw.komootUrl ?? null,
  }
}

// ── GPX form ──────────────────────────────────────────────────────────────────

function GpxForm({
  tripId, sortOrder, onAdded, onClose,
}: { tripId: string; sortOrder: number; onAdded: (s: TripSegment) => void; onClose: () => void }) {
  const [file, setFile]           = useState<File | null>(null)
  const [name, setName]           = useState("")
  const [date, setDate]           = useState("")
  const [komootUrl, setKomootUrl] = useState("")
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress]   = useState(0)
  const [error, setError]         = useState<string | null>(null)
  const [success, setSuccess]     = useState(false)

  const onDrop = useCallback((accepted: File[]) => {
    setError(null)
    if (accepted[0]) {
      if (accepted[0].size > 10 * 1024 * 1024) { setError("Le fichier dépasse 10 Mo."); return }
      setFile(accepted[0])
      if (!name) setName(accepted[0].name.replace(/\.gpx$/i, ""))
    }
  }, [name])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/gpx+xml": [".gpx"], "text/xml": [".gpx"] },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
    disabled: uploading,
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError("Le nom du segment est obligatoire."); return }
    setError(null)
    setUploading(true)
    setProgress(30)

    try {
      let res: Response

      if (file) {
        // Avec fichier GPX
        const formData = new FormData()
        formData.append("file", file)
        formData.append("tripId", tripId)
        formData.append("sortOrder", String(sortOrder))
        formData.append("name", name.trim())
        if (date)      formData.append("date",      date)
        if (komootUrl) formData.append("komootUrl", komootUrl.trim())
        setProgress(60)
        res = await fetch("/api/segments", { method: "POST", body: formData })
      } else {
        // Sans fichier GPX
        setProgress(60)
        res = await fetch("/api/segments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tripId, type: "gpx", name: name.trim(), sortOrder,
            departureAt: date ? new Date(date + "T12:00:00Z").toISOString() : undefined,
            komootUrl:   komootUrl.trim() || undefined,
          }),
        })
      }

      setProgress(95)

      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? "Erreur lors de l'envoi.")
        return
      }
      const raw = await res.json()
      setProgress(100)
      setSuccess(true)
      setTimeout(() => { onAdded(mapSegment(raw)); onClose() }, 700)
    } catch {
      setError("Une erreur inattendue s'est produite.")
    } finally {
      setUploading(false)
    }
  }

  if (success) return <SuccessScreen />

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <ErrorBox message={error} />}

      <div
        {...getRootProps()}
        className={cn(
          "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors",
          isDragActive     ? "border-emerald-400 bg-emerald-50"
            : file         ? "border-emerald-300 bg-emerald-50/50"
                           : "border-slate-200 hover:border-emerald-300 hover:bg-slate-50"
        )}
      >
        <input {...getInputProps()} />
        {file ? (
          <div className="flex flex-col items-center gap-2">
            <FileText className="h-10 w-10 text-emerald-500" />
            <p className="font-medium text-slate-800">{file.name}</p>
            <p className="text-sm text-slate-500">{formatBytes(file.size)}</p>
            <p className="text-xs text-slate-400">Cliquez ou déposez un autre fichier pour remplacer</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Upload className="h-10 w-10 text-slate-300" />
            <p className="font-medium text-slate-500">
              {isDragActive ? "Déposez votre fichier GPX" : "Glissez-déposez votre fichier GPX"}
            </p>
            <p className="text-sm text-slate-400">ou cliquez pour sélectionner — .gpx, max 10 Mo</p>
            <span className="text-xs text-slate-300 mt-1">Optionnel — vous pouvez créer le segment sans tracé</span>
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="gpx-name">Nom du segment <span className="text-red-500">*</span></Label>
        <Input id="gpx-name" placeholder="Ex : Col du Galibier" value={name} onChange={(e) => { setName(e.target.value); setError(null) }} maxLength={200} autoFocus />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="gpx-date">Date (optionnel)</Label>
        <Input id="gpx-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="gpx-komoot">Lien Komoot (optionnel)</Label>
        <Input id="gpx-komoot" type="url" placeholder="https://www.komoot.com/…" value={komootUrl} onChange={(e) => setKomootUrl(e.target.value)} />
      </div>

      {uploading && (
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />
            Traitement du fichier GPX…
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <Button type="submit" className="flex-1" disabled={!name.trim()} isLoading={uploading}>
          {file ? "Importer le fichier GPX" : "Créer le segment sans tracé"}
        </Button>
        <Button type="button" variant="outline" onClick={onClose} disabled={uploading}>Annuler</Button>
      </div>
    </form>
  )
}

// ── Walking form ──────────────────────────────────────────────────────────────

function WalkingForm({
  tripId, sortOrder, onAdded, onClose,
}: { tripId: string; sortOrder: number; onAdded: (s: TripSegment) => void; onClose: () => void }) {
  const [file, setFile]           = useState<File | null>(null)
  const [name, setName]           = useState("")
  const [origin, setOrigin]       = useState("")
  const [destination, setDestination] = useState("")
  const [date, setDate]           = useState("")
  const [komootUrl, setKomootUrl] = useState("")
  const [dragOver, setDragOver]   = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress]   = useState(0)
  const [error, setError]         = useState<string | null>(null)
  const [success, setSuccess]     = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function pickFile(f: File) {
    if (!f.name.toLowerCase().endsWith(".gpx")) { setError("Seuls les fichiers .gpx sont acceptés."); return }
    if (f.size > 10 * 1024 * 1024) { setError("Le fichier dépasse 10 Mo."); return }
    setError(null)
    setFile(f)
    if (!name) setName(f.name.replace(/\.gpx$/i, ""))
  }

  const isValid = name.trim()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError("Le nom du segment est obligatoire."); return }
    setError(null)
    setUploading(true)
    setProgress(30)

    try {
      let res: Response

      if (file) {
        const formData = new FormData()
        formData.append("file", file)
        formData.append("tripId", tripId)
        formData.append("type", "walking")
        formData.append("sortOrder", String(sortOrder))
        formData.append("name", name.trim())
        if (origin.trim())      formData.append("origin", origin.trim())
        if (destination.trim()) formData.append("destination", destination.trim())
        if (date)               formData.append("date", date)
        if (komootUrl.trim())   formData.append("komootUrl", komootUrl.trim())
        setProgress(60)
        res = await fetch("/api/segments", { method: "POST", body: formData })
      } else {
        setProgress(60)
        res = await fetch("/api/segments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tripId, type: "walking",
            name: name.trim(),
            origin:      origin.trim()      || undefined,
            destination: destination.trim() || undefined,
            departureAt: date ? new Date(date + "T12:00:00Z").toISOString() : undefined,
            sortOrder,
          }),
        })
      }

      setProgress(95)
      if (!res.ok) { const d = await res.json(); setError(d.error ?? "Erreur lors de la création."); return }
      const raw = await res.json()
      setProgress(100)
      setSuccess(true)
      setTimeout(() => { onAdded(mapSegment(raw)); onClose() }, 700)
    } catch {
      setError("Une erreur inattendue s'est produite.")
    } finally {
      setUploading(false)
    }
  }

  if (success) return <SuccessScreen />

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <ErrorBox message={error} />}

      {/* GPX drop zone */}
      <input ref={inputRef} type="file" accept=".gpx,application/gpx+xml,text/xml" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) pickFile(f); e.target.value = "" }} />
      <div
        className={cn(
          "border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors",
          dragOver  ? "border-emerald-400 bg-emerald-50"
            : file  ? "border-emerald-300 bg-emerald-50/50"
                    : "border-slate-200 hover:border-emerald-300 hover:bg-slate-50"
        )}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) pickFile(f) }}
      >
        {file ? (
          <div className="flex flex-col items-center gap-1.5">
            <FileText className="h-8 w-8 text-emerald-500" />
            <p className="font-medium text-slate-800 text-sm">{file.name}</p>
            <p className="text-xs text-slate-500">{formatBytes(file.size)}</p>
            <p className="text-xs text-slate-400">Cliquez pour remplacer</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1.5">
            <Upload className="h-8 w-8 text-slate-300" />
            <p className="text-sm font-medium text-slate-500">
              {dragOver ? "Déposez le fichier GPX" : "Trace GPX (optionnel)"}
            </p>
            <p className="text-xs text-slate-400">Glissez ou cliquez — .gpx, max 10 Mo</p>
          </div>
        )}
      </div>

      {/* Nom */}
      <div className="space-y-1.5">
        <Label htmlFor="w-name">Nom du segment <span className="text-red-500">*</span></Label>
        <Input id="w-name" placeholder="Ex : Traversée du centre-ville"
          value={name} onChange={(e) => { setName(e.target.value); setError(null) }} maxLength={200} autoFocus />
      </div>

      {/* Départ / Arrivée */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="w-origin">Départ <span className="text-xs font-normal text-slate-400">(optionnel)</span></Label>
          <Input id="w-origin" placeholder="Ex : Place Bellecour"
            value={origin} onChange={(e) => setOrigin(e.target.value)} maxLength={300} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="w-dest">Arrivée <span className="text-xs font-normal text-slate-400">(optionnel)</span></Label>
          <Input id="w-dest" placeholder="Ex : Parc de la Tête d'Or"
            value={destination} onChange={(e) => setDestination(e.target.value)} maxLength={300} />
        </div>
      </div>

      {/* Durée */}
      <div className="space-y-1.5">
        <Label htmlFor="w-date">Date <span className="text-xs font-normal text-slate-400">(optionnel)</span></Label>
        <Input id="w-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="w-komoot">Lien Komoot <span className="text-xs font-normal text-slate-400">(optionnel)</span></Label>
        <Input id="w-komoot" type="url" placeholder="https://www.komoot.com/…"
          value={komootUrl} onChange={(e) => setKomootUrl(e.target.value)} />
      </div>

      {uploading && (
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />
            {file ? "Traitement du fichier GPX…" : "Création du segment…"}
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <Button type="submit" className="flex-1" disabled={!isValid} isLoading={uploading}>
          {file ? "Importer la trace GPX" : "Créer le segment à pied"}
        </Button>
        <Button type="button" variant="outline" onClick={onClose} disabled={uploading}>Annuler</Button>
      </div>
    </form>
  )
}

// ── Transit form ──────────────────────────────────────────────────────────────

function TransitForm({
  tripId, type, sortOrder, onAdded, onClose,
}: { tripId: string; type: "train" | "car"; sortOrder: number; onAdded: (s: TripSegment) => void; onClose: () => void }) {
  const [name, setName]               = useState("")
  const [origin, setOrigin]           = useState("")
  const [destination, setDestination] = useState("")
  const [originCoords, setOriginCoords]           = useState<AddressCoords | null>(null)
  const [destinationCoords, setDestinationCoords] = useState<AddressCoords | null>(null)
  const [date, setDate]               = useState("")
  const [departureAt, setDepartureAt] = useState("")
  const [arrivalAt, setArrivalAt]     = useState("")
  const [durationMin, setDurationMin] = useState("")
  const [isLoading, setIsLoading]     = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [success, setSuccess]         = useState(false)

  const computedDuration = (() => {
    if (!departureAt || !arrivalAt) return null
    const diff = Math.round((new Date(arrivalAt).getTime() - new Date(departureAt).getTime()) / 60000)
    return diff > 0 ? diff : null
  })()

  const isValid = type === "car"
    ? true
    : origin.trim() && destination.trim() &&
      ((departureAt && arrivalAt && computedDuration && computedDuration > 0) ||
       (durationMin && parseInt(durationMin, 10) > 0))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      const body: Record<string, unknown> = {
        tripId, type,
        name: name.trim() || undefined,
        origin: origin.trim() || undefined,
        destination: destination.trim() || undefined,
        sortOrder,
      }
      if (departureAt && arrivalAt) {
        body.departureAt = new Date(departureAt).toISOString()
        body.arrivalAt   = new Date(arrivalAt).toISOString()
      } else if (durationMin) {
        body.durationMin = parseInt(durationMin, 10)
      }
      if (type === "car" && date) {
        body.departureAt = new Date(date + "T12:00:00Z").toISOString()
      }
      if (type === "car") {
        if (originCoords)      { body.originLat = originCoords.lat; body.originLon = originCoords.lon }
        if (destinationCoords) { body.destLat   = destinationCoords.lat; body.destLon = destinationCoords.lon }
      }

      const res = await fetch("/api/segments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? "Erreur lors de la création.")
        return
      }
      const raw = await res.json()
      setSuccess(true)
      setTimeout(() => { onAdded(mapSegment(raw)); onClose() }, 700)
    } catch {
      setError("Une erreur inattendue s'est produite.")
    } finally {
      setIsLoading(false)
    }
  }

  if (success) return <SuccessScreen />

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <ErrorBox message={error} />}

      <div className="space-y-1.5">
        <Label htmlFor="t-name">Nom du segment (optionnel)</Label>
        <Input id="t-name" placeholder={type === "train" ? "Ex : Lyon → Grenoble" : "Ex : Lyon → Marseille"} value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="t-origin">Départ {type === "car"
            ? <span className="text-xs font-normal text-slate-400">(optionnel)</span>
            : <span className="text-red-500">*</span>}</Label>
          {type === "train"
            ? <StationAutocomplete id="t-origin" placeholder="Ex : Gare de Lyon" value={origin} onChange={setOrigin} />
            : <AddressAutocomplete id="t-origin" placeholder="Ex : 12 rue de la Paix, Lyon" value={origin} onChange={(v, c) => { setOrigin(v); setOriginCoords(c) }} />}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="t-dest">Arrivée {type === "car"
            ? <span className="text-xs font-normal text-slate-400">(optionnel)</span>
            : <span className="text-red-500">*</span>}</Label>
          {type === "train"
            ? <StationAutocomplete id="t-dest" placeholder="Ex : Gare de Grenoble" value={destination} onChange={setDestination} />
            : <AddressAutocomplete id="t-dest" placeholder="Ex : Vieux-Port, Marseille" value={destination} onChange={(v, c) => { setDestination(v); setDestinationCoords(c) }} />}
        </div>
      </div>

      {type === "car" && (
        <div className="space-y-1.5">
          <Label htmlFor="t-date">Date <span className="text-xs font-normal text-slate-400">(optionnel)</span></Label>
          <Input id="t-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      )}

      {type === "train" && (
        <div className="space-y-3 rounded-xl border border-slate-200 p-4 bg-slate-50">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Horaires</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="t-dep">Départ</Label>
              <Input id="t-dep" type="datetime-local" value={departureAt} onChange={(e) => setDepartureAt(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-arr">Arrivée</Label>
              <Input id="t-arr" type="datetime-local" value={arrivalAt} onChange={(e) => setArrivalAt(e.target.value)} />
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

      {(!departureAt || !arrivalAt) && (
        <div className="space-y-1.5">
          <Label htmlFor="t-dur">
            Durée en minutes {type === "car"
              ? <span className="text-xs font-normal text-slate-400">(optionnel)</span>
              : !departureAt && !arrivalAt && <span className="text-red-500">*</span>}
          </Label>
          <Input id="t-dur" type="number" placeholder="Ex : 90" value={durationMin} onChange={(e) => setDurationMin(e.target.value)} min={1} max={9999} />
          {durationMin && parseInt(durationMin, 10) > 0 && (
            <p className="text-sm text-emerald-700 font-medium">Durée : {formatDuration(parseInt(durationMin, 10))}</p>
          )}
        </div>
      )}

      <div className="flex gap-3">
        <Button type="submit" className="flex-1" isLoading={isLoading} disabled={!isValid}>
          Créer le segment
        </Button>
        <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>Annuler</Button>
      </div>
    </form>
  )
}

// ── Shared micro-components ───────────────────────────────────────────────────

function SuccessScreen() {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <CheckCircle2 className="h-12 w-12 text-emerald-500 mb-3" />
      <p className="font-semibold text-slate-900">Segment ajouté !</p>
    </div>
  )
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3">
      <p className="text-sm text-red-700">{message}</p>
    </div>
  )
}

// ── Main modal ────────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<TabType, string> = {
  gpx:     "#5F7F6F",
  train:   "#3b82f6",
  car:     "#8b5cf6",
  walking: "#f59e0b",
}

const TABS: { id: TabType; label: string; icon: React.ReactNode }[] = [
  { id: "gpx",     label: "Trace GPX", icon: <Bike       className="h-4 w-4" /> },
  { id: "train",   label: "Train",     icon: <Train      className="h-4 w-4" /> },
  { id: "car",     label: "Voiture",   icon: <Car        className="h-4 w-4" /> },
  { id: "walking", label: "À pied",    icon: <Footprints className="h-4 w-4" /> },
]

export function AddSegmentModal({ open, onClose, tripId, segmentCount, onAdded }: Props) {
  const [activeTab, setActiveTab] = useState<TabType>("gpx")

  // Reset tab when re-opened
  useEffect(() => { if (open) setActiveTab("gpx") }, [open])

  // Escape key
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [open, onClose])

  // Body scroll lock
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : ""
    return () => { document.body.style.overflow = "" }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 backdrop-blur-sm">
      <div
        className="flex min-h-full items-center justify-center p-4"
        onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      >
        <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-0">
          <h2 className="text-lg font-semibold text-slate-900">Ajouter un segment</h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-1 px-6 pt-4 pb-0">
          {TABS.map((tab) => {
            const active = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={active ? { backgroundColor: TYPE_COLORS[tab.id] + "20", color: TYPE_COLORS[tab.id] } : undefined}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  active ? "font-semibold" : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                )}
              >
                {tab.icon}
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Divider */}
        <div className="border-b border-slate-100 mx-6 mt-3" />

        {/* Form */}
        <div className="px-6 py-5">
          {activeTab === "gpx" && (
            <GpxForm tripId={tripId} sortOrder={segmentCount} onAdded={onAdded} onClose={onClose} />
          )}
          {activeTab === "train" && (
            <TransitForm tripId={tripId} type="train" sortOrder={segmentCount} onAdded={onAdded} onClose={onClose} />
          )}
          {activeTab === "car" && (
            <TransitForm tripId={tripId} type="car" sortOrder={segmentCount} onAdded={onAdded} onClose={onClose} />
          )}
          {activeTab === "walking" && (
            <WalkingForm tripId={tripId} sortOrder={segmentCount} onAdded={onAdded} onClose={onClose} />
          )}
        </div>
        </div>
      </div>
    </div>
  )
}
