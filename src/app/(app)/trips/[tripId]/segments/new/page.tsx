"use client"

import { useState, useRef, DragEvent } from "react"
import { useRouter, useParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { ArrowLeft, Upload, FileText, CheckCircle2, Loader2 } from "lucide-react"

type TabType = "gpx" | "train" | "walking"

const TAB_LABELS: Record<TabType, string> = {
  gpx: "Trace GPX",
  train: "Train",
  walking: "À pied",
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

// ─── GPX Tab ──────────────────────────────────────────────────────────────────

function GpxTab({ tripId }: { tripId: string }) {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState("")
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [progress, setProgress] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function pickFile(f: File) {
    if (!f.name.toLowerCase().endsWith(".gpx")) {
      setError("Seuls les fichiers .gpx sont acceptés.")
      return
    }
    if (f.size > 10 * 1024 * 1024) {
      setError("Le fichier dépasse la taille maximale de 10 Mo.")
      return
    }
    setError(null)
    setFile(f)
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) pickFile(f)
    e.target.value = ""   // reset so same file can be re-selected
  }

  function onDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(true)
  }

  function onDragLeave() { setDragOver(false) }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f) pickFile(f)
  }

  async function handleSave() {
    if (!name.trim()) {
      setError("Le nom du segment est obligatoire.")
      return
    }
    setError(null)
    setUploading(true)
    setProgress(10)

    try {
      const tripsRes = await fetch(`/api/trips/${tripId}`)
      const tripData = tripsRes.ok ? await tripsRes.json() : { segments: [] }
      const sortOrder = (tripData.segments?.length ?? 0)
      setProgress(30)

      let res: Response

      if (file) {
        // Chemin avec fichier GPX
        const formData = new FormData()
        formData.append("file", file)
        formData.append("tripId", tripId)
        formData.append("sortOrder", String(sortOrder))
        formData.append("name", name.trim())
        setProgress(50)
        res = await fetch("/api/segments", { method: "POST", body: formData })
      } else {
        // Chemin sans fichier GPX
        setProgress(50)
        res = await fetch("/api/segments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tripId,
            type: "gpx",
            name: name.trim() || undefined,
            sortOrder,
          }),
        })
      }

      setProgress(90)

      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? "Erreur lors de la création du segment.")
        return
      }

      setProgress(100)
      setSuccess(true)
      setTimeout(() => router.push(`/trips/${tripId}`), 800)
    } catch {
      setError("Une erreur inattendue s'est produite.")
    } finally {
      setUploading(false)
    }
  }

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <CheckCircle2 className="h-12 w-12 text-emerald-500 mb-3" />
        <p className="font-semibold text-slate-900">Segment importé avec succès !</p>
        <p className="text-sm text-slate-500 mt-1">Redirection en cours...</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Drop zone */}
      <input
        ref={inputRef}
        type="file"
        accept=".gpx,application/gpx+xml,text/xml"
        className="hidden"
        onChange={onInputChange}
      />
      <div
        className={cn(
          "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors",
          dragOver
            ? "border-emerald-400 bg-emerald-50"
            : file
            ? "border-emerald-300 bg-emerald-50/50"
            : "border-slate-200 hover:border-emerald-300 hover:bg-slate-50"
        )}
        onClick={() => inputRef.current?.click()}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
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
            <p className="font-medium text-slate-600">
              {dragOver ? "Déposez votre fichier GPX ici" : "Glissez-déposez votre fichier GPX"}
            </p>
            <p className="text-sm text-slate-400">ou cliquez pour sélectionner — .gpx, max 10 Mo</p>
            <span className="text-xs text-slate-300 mt-1">Optionnel — vous pouvez créer le segment sans tracé</span>
          </div>
        )}
      </div>

      {/* Name input */}
      <div className="space-y-1.5">
        <Label htmlFor="gpx-name">
          Nom du segment <span className="text-red-500">*</span>
          <span className="ml-1 text-xs font-normal text-slate-400">(obligatoire)</span>
        </Label>
        <Input
          id="gpx-name"
          placeholder="Ex : Col du Galibier"
          value={name}
          onChange={(e) => { setName(e.target.value); setError(null) }}
          maxLength={200}
          autoFocus
          className={!name.trim() ? "border-orange-300 focus:border-orange-400" : ""}
        />
      </div>

      {/* Progress bar */}
      {uploading && (
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />
            {file ? "Traitement du fichier GPX..." : "Création du segment..."}
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      <Button
        type="button"
        className="w-full"
        isLoading={uploading}
        disabled={!name.trim()}
        onClick={handleSave}
      >
        {!name.trim()
          ? "Saisissez un nom pour continuer"
          : file
          ? "Importer le fichier GPX"
          : "Créer le segment sans tracé"}
      </Button>
    </div>
  )
}

// ─── Transit Tab (train / walking) ────────────────────────────────────────────

function TransitTab({ tripId, type }: { tripId: string; type: "train" | "walking" }) {
  const router = useRouter()
  const [name, setName]               = useState("")
  const [origin, setOrigin]           = useState("")
  const [destination, setDestination] = useState("")
  const [departureAt, setDepartureAt] = useState("")
  const [arrivalAt, setArrivalAt]     = useState("")
  const [durationMin, setDurationMin] = useState("")
  const [isLoading, setIsLoading]     = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})

  // Auto-compute duration from dates
  const computedDuration = (() => {
    if (!departureAt || !arrivalAt) return null
    const diff = Math.round((new Date(arrivalAt).getTime() - new Date(departureAt).getTime()) / 60000)
    return diff > 0 ? diff : null
  })()

  const displayDuration = computedDuration ?? (durationMin ? parseInt(durationMin, 10) : null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setFieldErrors({})
    setIsLoading(true)

    try {
      const tripsRes = await fetch(`/api/trips/${tripId}`)
      const tripData = tripsRes.ok ? await tripsRes.json() : { segments: [] }
      const sortOrder = tripData.segments?.length ?? 0

      const body: Record<string, unknown> = {
        tripId,
        type,
        name: name.trim() || undefined,
        origin: origin.trim(),
        destination: destination.trim(),
        sortOrder,
      }

      if (departureAt && arrivalAt) {
        body.departureAt = new Date(departureAt).toISOString()
        body.arrivalAt   = new Date(arrivalAt).toISOString()
      } else if (durationMin) {
        body.durationMin = parseInt(durationMin, 10)
      }

      const res = await fetch("/api/segments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json()
        if (data.details) setFieldErrors(data.details)
        else setError(data.error ?? "Erreur lors de la création du segment.")
        return
      }

      router.push(`/trips/${tripId}`)
    } catch {
      setError("Une erreur inattendue s'est produite.")
    } finally {
      setIsLoading(false)
    }
  }

  const isValid = origin.trim() && destination.trim() &&
    ((departureAt && arrivalAt && computedDuration && computedDuration > 0) ||
     (durationMin && parseInt(durationMin, 10) > 0))

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="transit-name">Nom du segment (optionnel)</Label>
        <Input
          id="transit-name"
          placeholder={type === "train" ? "Ex : Lyon → Grenoble" : "Ex : Traversée du centre-ville"}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={200}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="transit-origin">Départ <span className="text-red-500">*</span></Label>
          <Input
            id="transit-origin"
            placeholder="Ex : Gare de Lyon"
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            required
            maxLength={300}
          />
          {fieldErrors.origin && <p className="text-xs text-red-600">{fieldErrors.origin[0]}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="transit-destination">Arrivée <span className="text-red-500">*</span></Label>
          <Input
            id="transit-destination"
            placeholder="Ex : Gare de Grenoble"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            required
            maxLength={300}
          />
          {fieldErrors.destination && <p className="text-xs text-red-600">{fieldErrors.destination[0]}</p>}
        </div>
      </div>

      {/* Date/time fields — train only */}
      {type === "train" && (
        <div className="space-y-4 rounded-xl border border-slate-200 p-4 bg-slate-50">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Horaires</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="departure-at">Départ</Label>
              <Input
                id="departure-at"
                type="datetime-local"
                value={departureAt}
                onChange={(e) => setDepartureAt(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="arrival-at">Arrivée</Label>
              <Input
                id="arrival-at"
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

      {/* Manual duration — fallback if no dates */}
      {(!departureAt || !arrivalAt) && (
        <div className="space-y-2">
          <Label htmlFor="transit-duration">
            Durée en minutes {!departureAt && !arrivalAt && <span className="text-red-500">*</span>}
          </Label>
          <Input
            id="transit-duration"
            type="number"
            placeholder="Ex : 90"
            value={durationMin}
            onChange={(e) => setDurationMin(e.target.value)}
            min={1}
            max={9999}
          />
          {displayDuration && displayDuration > 0 && (
            <p className="text-xs text-slate-400">
              {Math.floor(displayDuration / 60) > 0 ? `${Math.floor(displayDuration / 60)} h ` : ""}
              {displayDuration % 60 > 0 ? `${displayDuration % 60} min` : ""}
            </p>
          )}
        </div>
      )}

      <Button type="submit" className="w-full" isLoading={isLoading} disabled={!isValid}>
        Créer le segment
      </Button>
    </form>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NewSegmentPage() {
  const params = useParams()
  const tripId = params.tripId as string
  const [activeTab, setActiveTab] = useState<TabType>("gpx")

  return (
    <div className="p-6 lg:p-8 max-w-2xl mx-auto">
      <Link
        href={`/trips/${tripId}`}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 mb-6 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Retour au voyage
      </Link>

      <h1 className="text-2xl font-bold text-slate-900 mb-6">
        Ajouter un segment
      </h1>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex border-b border-slate-200">
          {(Object.keys(TAB_LABELS) as TabType[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "flex-1 px-4 py-3 text-sm font-medium transition-colors",
                activeTab === tab
                  ? "bg-emerald-50 text-emerald-700 border-b-2 border-emerald-500"
                  : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
              )}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>

        <div className="p-6">
          {activeTab === "gpx" && <GpxTab tripId={tripId} />}
          {activeTab === "train" && <TransitTab tripId={tripId} type="train" />}
          {activeTab === "walking" && <TransitTab tripId={tripId} type="walking" />}
        </div>
      </div>
    </div>
  )
}
