"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { createPortal } from "react-dom"
import { useDropzone } from "react-dropzone"
import { X, Pencil, Upload, ImageIcon, Check, Move, CalendarDays } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import Image from "next/image"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TripEditData {
  id:                  string
  name:                string
  description:         string | null
  startDate:           string | null   // "YYYY-MM-DD"
  endDate:             string | null
  coverImageUrl:       string | null
  coverImagePosition:  string | null   // "X% Y%"
}

// ── Image positioner (drag to crop) ──────────────────────────────────────────

function parsePosition(pos: string | null): { x: number; y: number } {
  if (!pos) return { x: 50, y: 50 }
  const [xStr, yStr] = pos.split(" ")
  return { x: parseFloat(xStr) || 50, y: parseFloat(yStr) || 50 }
}

function ImagePositioner({
  src,
  position,
  onChange,
}: {
  src:      string
  position: { x: number; y: number }
  onChange: (pos: { x: number; y: number }) => void
}) {
  const dragging  = useRef(false)
  const dragStart = useRef({ mx: 0, my: 0, px: 50, py: 50 })

  useEffect(() => {
    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!dragging.current) return
      const { clientX, clientY } = "touches" in e ? e.touches[0] : e
      const dx = clientX - dragStart.current.mx
      const dy = clientY - dragStart.current.my
      // sensitivity: lower = slower / more precise
      const sensitivity = 0.12
      const nx = Math.max(0, Math.min(100, dragStart.current.px - dx * sensitivity))
      const ny = Math.max(0, Math.min(100, dragStart.current.py - dy * sensitivity))
      onChange({ x: nx, y: ny })
    }
    const onUp = () => { dragging.current = false }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("touchmove", onMove, { passive: false })
    window.addEventListener("mouseup", onUp)
    window.addEventListener("touchend", onUp)
    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("touchmove", onMove)
      window.removeEventListener("mouseup", onUp)
      window.removeEventListener("touchend", onUp)
    }
  }, [onChange])

  const startDrag = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    const { clientX, clientY } = "touches" in e ? e.touches[0] : e
    dragging.current = true
    dragStart.current = { mx: clientX, my: clientY, px: position.x, py: position.y }
  }

  return (
    <div
      className="relative h-44 rounded-xl overflow-hidden cursor-grab active:cursor-grabbing select-none touch-none"
      onMouseDown={startDrag}
      onTouchStart={startDrag}
    >
      <Image
        src={src}
        alt="Cadrage"
        fill
        draggable={false}
        unoptimized
        style={{ objectFit: "cover", objectPosition: `${position.x}% ${position.y}%` }}
      />
      {/* Hint overlay */}
      <div className="absolute inset-0 flex items-end justify-center pb-3 pointer-events-none">
        <span className="flex items-center gap-1.5 bg-black/40 text-white text-xs px-3 py-1.5 rounded-full backdrop-blur-sm">
          <Move className="h-3 w-3" />
          Glissez pour cadrer
        </span>
      </div>
      {/* Grid guides */}
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: "linear-gradient(rgba(255,255,255,.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.15) 1px, transparent 1px)",
        backgroundSize: "33.33% 33.33%",
      }} />
    </div>
  )
}

// ── Modal form ────────────────────────────────────────────────────────────────

function ModalForm({ trip, onClose }: { trip: TripEditData; onClose: () => void }) {
  const router = useRouter()

  const [name,        setName]        = useState(trip.name)
  const [description, setDescription] = useState(trip.description ?? "")
  const [startDate,   setStartDate]   = useState(trip.startDate ?? "")
  const [endDate,     setEndDate]     = useState(trip.endDate ?? "")
  const [coverFile,   setCoverFile]   = useState<File | null>(null)
  const [preview,     setPreview]     = useState<string | null>(trip.coverImageUrl)
  const [position,    setPosition]    = useState(parsePosition(trip.coverImagePosition))
  const [isLoading,   setIsLoading]   = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const [success,     setSuccess]     = useState(false)

  // Cleanup blob URL
  useEffect(() => {
    return () => {
      if (preview && preview.startsWith("blob:")) URL.revokeObjectURL(preview)
    }
  }, [preview])

  const onDrop = useCallback((accepted: File[]) => {
    const file = accepted[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { setError("Image trop volumineuse (max 5 Mo)"); return }
    setCoverFile(file)
    setPreview(URL.createObjectURL(file))
    setError(null)
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/jpeg": [".jpg", ".jpeg"], "image/png": [".png"], "image/webp": [".webp"] },
    maxFiles: 1,
    disabled: isLoading,
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError("Le titre est requis"); return }
    setError(null)
    setIsLoading(true)

    try {
      // 1 — Metadata
      const metaRes = await fetch(`/api/trips/${trip.id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          name:               name.trim(),
          description:        description.trim() || null,
          startDate:          startDate || null,
          endDate:            endDate   || null,
          coverImagePosition: preview ? `${Math.round(position.x)}% ${Math.round(position.y)}%` : null,
        }),
      })
      if (!metaRes.ok) {
        const d = await metaRes.json()
        setError(d.error ?? "Erreur lors de la mise à jour.")
        return
      }

      // 2 — Cover image (optional)
      if (coverFile) {
        const formData = new FormData()
        formData.append("cover", coverFile)
        const imgRes = await fetch(`/api/trips/${trip.id}`, {
          method: "PATCH",
          body:   formData,
        })
        if (!imgRes.ok) {
          const d = await imgRes.json()
          setError(d.error ?? "Erreur lors de l'upload de la photo.")
          return
        }
      }

      setSuccess(true)
      router.refresh()
      setTimeout(onClose, 900)
    } catch {
      setError("Une erreur inattendue s'est produite.")
    } finally {
      setIsLoading(false)
    }
  }

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center py-14 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 mb-3">
          <Check className="h-7 w-7 text-emerald-500" />
        </div>
        <p className="font-semibold text-slate-900">Voyage mis à jour !</p>
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

      {/* Cover image */}
      <div className="space-y-2">
        <Label>Photo de couverture</Label>

        {/* Drag-to-position — shown when a photo is selected */}
        {preview && (
          <ImagePositioner src={preview} position={position} onChange={setPosition} />
        )}

        {/* Dropzone */}
        <div
          {...getRootProps()}
          className={cn(
            "relative rounded-xl border-2 border-dashed overflow-hidden transition-colors cursor-pointer",
            isDragActive ? "border-emerald-400 bg-emerald-50"
                        : "border-slate-200 hover:border-emerald-300 hover:bg-slate-50"
          )}
          style={{ height: preview ? 44 : 120 }}
        >
          <input {...getInputProps()} />
          <div className="flex items-center justify-center h-full gap-2 text-slate-400">
            <Upload className="h-4 w-4 shrink-0" />
            <p className="text-sm">
              {isDragActive ? "Déposez l'image…"
                : preview   ? "Changer la photo"
                            : "Glissez une photo ou cliquez"}
            </p>
            {!preview && <span className="text-xs text-slate-300">JPG · PNG · WebP · max 5 Mo</span>}
          </div>
        </div>
      </div>

      {/* Name */}
      <div className="space-y-2">
        <Label htmlFor="et-name">Titre du voyage</Label>
        <Input
          id="et-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex : Tour des Alpes"
          maxLength={200}
          required
        />
      </div>

      {/* Description */}
      <div className="space-y-2">
        <Label htmlFor="et-desc">Description <span className="text-slate-400 font-normal">(optionnel)</span></Label>
        <textarea
          id="et-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Un court résumé de votre voyage…"
          maxLength={2000}
          rows={3}
          className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent resize-none"
        />
      </div>

      {/* Dates */}
      <div className="space-y-2">
        <Label className="flex items-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
          Dates du voyage
        </Label>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <p className="text-xs text-slate-500">Départ</p>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-slate-500">Retour</p>
            <Input
              type="date"
              value={endDate}
              min={startDate || undefined}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>
      </div>

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

// ── Exported component ────────────────────────────────────────────────────────

export function EditTripModal({ trip }: { trip: TripEditData }) {
  const [open,    setOpen]    = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [open])

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
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">Modifier le voyage</h2>
          <button
            onClick={() => setOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-6 py-5">
          <ModalForm trip={trip} onClose={() => setOpen(false)} />
        </div>
      </div>
    </div>
  )

  return (
    <>
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true) }}
        className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/90 hover:bg-white text-slate-600 hover:text-slate-900 shadow-sm transition-colors"
        title="Modifier le voyage"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>

      {mounted && open ? createPortal(overlay, document.body) : null}
    </>
  )
}
