"use client"

import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from "@dnd-kit/core"
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { useState, useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import {
  GripVertical, Moon, Plus, Trash2, Pencil, X, BedDouble, Link2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Stopover {
  id:        string
  sortOrder: number
  date:      string        // ISO string — arrivée
  endDate:   string | null // ISO string — départ (optionnel)
  name:      string | null // nom du logement
  place:     string | null // adresse
  notes:     string | null
  platform:  "booking" | "airbnb" | null
  link:      string | null
}

interface Props {
  tripId:    string
  stopovers: Stopover[]
  onChange:  (stopovers: Stopover[]) => void
}

// ── Platform badge ────────────────────────────────────────────────────────────

function PlatformBadge({ platform }: { platform: "booking" | "airbnb" | null }) {
  if (platform === "booking") {
    return (
      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#003580] shrink-0">
        <span className="text-white font-black text-[11px] leading-none tracking-tight">B.</span>
      </div>
    )
  }
  if (platform === "airbnb") {
    return (
      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#FF385C] shrink-0">
        <svg className="h-4 w-4 fill-white" viewBox="0 0 32 32" aria-hidden>
          <path d="M16 2c-1.3 0-2.4.7-3.1 1.8L7.5 12c-.9 1.5-1.5 3-1.5 4.5C6 20.6 9.4 24 13.5 24c1.1 0 2.2-.3 3.1-.8.9.5 2 .8 3.1.8C23.7 24 27 20.6 27 16.5c0-1.5-.6-3-1.5-4.5l-5.4-8.2C19.4 2.7 18.3 2 17 2h-1zm0 3.5l5 7.6c.6 1 1 2 1 3 0 2.5-2 4.5-4.5 4.5S13 18.5 13 16c0-1 .4-2 1-3l2-3.5V7l-.5-.8c.2-.1.3-.2.5-.2s.3.1.5.2L16 5.5z"/>
        </svg>
      </div>
    )
  }
  return (
    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-terre-50 shrink-0">
      <BedDouble className="h-3.5 w-3.5 text-terre-700" />
    </div>
  )
}

// ── Platform picker (3 toggle buttons) ───────────────────────────────────────

function PlatformPicker({
  value, onChange,
}: {
  value: "booking" | "airbnb" | null
  onChange: (v: "booking" | "airbnb" | null) => void
}) {
  const options: Array<{ id: "booking" | "airbnb" | null; label: string }> = [
    { id: "booking", label: "Booking" },
    { id: "airbnb",  label: "Airbnb"  },
    { id: null,      label: "Autre"   },
  ]
  return (
    <div className="grid grid-cols-3 gap-2">
      {options.map((opt) => {
        const active = value === opt.id
        return (
          <button
            key={String(opt.id)}
            type="button"
            onClick={() => onChange(opt.id)}
            className={cn(
              "flex flex-col items-center gap-1.5 py-2.5 rounded-xl border transition-all text-xs font-medium",
              active
                ? "border-slate-300 bg-slate-50 shadow-sm"
                : "border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-500"
            )}
          >
            <PlatformBadge platform={opt.id} />
            <span className={active ? "text-slate-800" : "text-slate-500"}>{opt.label}</span>
          </button>
        )
      })}
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDateRange(start: string, end: string | null): string {
  const s = new Date(start)
  const e = end ? new Date(end) : null
  if (!e) {
    return s.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })
  }
  const startStr = s.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })
  const endStr   = e.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })
  return `${startStr} → ${endStr}`
}

function extractCity(place: string | null): string | null {
  if (!place?.trim()) return null
  const parts = place.split(",").map((s) => s.trim()).filter(Boolean)
  const last = parts[parts.length - 1] ?? ""
  // Supprime le code postal éventuel en tête (ex : "75001 Paris" → "Paris")
  const city = last.replace(/^\d{4,6}\s*/, "").trim()
  return city || null
}

function nightsCount(start: string, end: string | null): number | null {
  if (!end) return null
  const diff = new Date(end).getTime() - new Date(start).getTime()
  const n = Math.round(diff / 86_400_000)
  return n > 0 ? n : null
}

function toDateInput(iso: string) { return iso.slice(0, 10) }

// ── Stopover modal (ajout & édition) ─────────────────────────────────────────

type StopoverFormData = {
  date: string; endDate: string | null; name: string | null; place: string | null;
  notes: string; platform: "booking" | "airbnb" | null; link: string | null
}

function StopoverModal({
  title, initial, onSave, onClose, loading, error,
}: {
  title:    string
  initial?: { date: string; endDate: string | null; name: string | null; place: string | null; notes: string; platform: "booking" | "airbnb" | null; link: string | null }
  onSave:   (data: StopoverFormData) => void
  onClose:  () => void
  loading:  boolean
  error:    string | null
}) {
  const [date,     setDate]     = useState(initial?.date     ?? "")
  const [endDate,  setEndDate]  = useState(initial?.endDate  ? toDateInput(initial.endDate) : "")
  const [name,     setName]     = useState(initial?.name     ?? "")
  const [place,    setPlace]    = useState(initial?.place    ?? "")
  const [notes,    setNotes]    = useState(initial?.notes    ?? "")
  const [platform, setPlatform] = useState<"booking" | "airbnb" | null>(initial?.platform ?? null)
  const [link,     setLink]     = useState(initial?.link     ?? "")
  const [mounted,  setMounted]  = useState(false)
  const portalRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    portalRef.current = document.body
    setMounted(true)
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onClose])

  useEffect(() => {
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = "" }
  }, [])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!date) return
    onSave({
      date,
      endDate:  endDate || null,
      name:     name.trim()  || null,
      place:    place.trim() || null,
      notes:    notes.trim(),
      platform,
      link:     link.trim()  || null,
    })
  }

  const overlay = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">

          <div className="space-y-2">
            <Label>Plateforme</Label>
            <PlatformPicker value={platform} onChange={setPlatform} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="s-date">Arrivée</Label>
              <Input
                id="s-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="s-enddate">
                Départ <span className="text-slate-400 font-normal text-xs">(opt.)</span>
              </Label>
              <Input
                id="s-enddate"
                type="date"
                value={endDate}
                min={date || undefined}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="s-name">
              Nom <span className="text-slate-400 font-normal">(optionnel)</span>
            </Label>
            <Input
              id="s-name"
              type="text"
              placeholder="Hôtel des Alpes, Camping du lac…"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={300}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="s-place">
              Adresse <span className="text-slate-400 font-normal">(optionnel)</span>
            </Label>
            <Input
              id="s-place"
              type="text"
              placeholder="14 rue de la Paix, Paris…"
              value={place}
              onChange={(e) => setPlace(e.target.value)}
              maxLength={500}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="s-link">
              Lien <span className="text-slate-400 font-normal">(optionnel)</span>
            </Label>
            <Input
              id="s-link"
              type="url"
              placeholder="https://…"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              maxLength={2000}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="s-notes">
              Notes <span className="text-slate-400 font-normal">(optionnel)</span>
            </Label>
            <Input
              id="s-notes"
              type="text"
              placeholder="Confirmation, contact…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={1000}
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-3 pt-1">
            <Button type="submit" className="flex-1" isLoading={loading}>
              Enregistrer
            </Button>
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Annuler
            </Button>
          </div>
        </form>
      </div>
    </div>
  )

  return mounted && portalRef.current ? createPortal(overlay, portalRef.current) : null
}

// ── Sortable tile ─────────────────────────────────────────────────────────────

function SortableStopover({
  stop, isDragging, onEdit, onDelete,
}: {
  stop:       Stopover
  isDragging: boolean
  onEdit:     () => void
  onDelete:   () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: stop.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  }

  return (
    <div ref={setNodeRef} style={style}>
      <div className="flex items-center gap-1">
        {/* Grip */}
        <button
          {...attributes}
          {...listeners}
          className="flex items-center justify-center h-8 w-6 text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing shrink-0 touch-none"
          tabIndex={-1}
          aria-label="Déplacer"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        {/* Tile */}
        <div className="group flex-1 flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 transition-colors min-w-0">
          {/* Icon */}
          <PlatformBadge platform={stop.platform} />

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium text-slate-800 truncate">
                {stop.name || stop.place || <span className="text-slate-400 italic">Sans nom</span>}
              </span>
              {stop.link && (
                <a
                  href={stop.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="shrink-0 text-slate-400 hover:text-[#D15F36] transition-colors"
                  title="Voir le lien"
                >
                  <Link2 className="h-3 w-3" />
                </a>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5 min-w-0">
              <span className="text-xs text-slate-400 shrink-0">{formatDateRange(stop.date, stop.endDate)}</span>
              {(() => {
                const n = nightsCount(stop.date, stop.endDate)
                return n ? (
                  <span className="text-[10px] font-medium text-slate-400 bg-slate-100 rounded-full px-1.5 py-0.5 shrink-0">
                    {n} nuit{n > 1 ? "s" : ""}
                  </span>
                ) : null
              })()}
            </div>
            {extractCity(stop.place) && (
              <span className="text-xs text-slate-400 truncate block">{extractCity(stop.place)}</span>
            )}
          </div>

          {/* Actions — on hover */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <button
              onClick={onEdit}
              className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <Pencil className="h-3 w-3" />
            </button>
            <button
              onClick={onDelete}
              className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Drag ghost ────────────────────────────────────────────────────────────────

function DragGhost({ stop }: { stop: Stopover }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white shadow-xl ring-1 ring-terre-300 ml-7">
      <PlatformBadge platform={stop.platform} />
      <div className="min-w-0">
        <span className="text-sm font-medium text-slate-800 truncate block">
          {stop.name || stop.place || "Sans nom"}
        </span>
        <span className="text-xs text-slate-400">{formatDateRange(stop.date, stop.endDate)}</span>
      </div>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function StopoversPanel({ tripId, stopovers, onChange }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [editId,   setEditId]   = useState<string | null>(null)
  const [adding,   setAdding]   = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  )

  const activeStop = stopovers.find((s) => s.id === activeId) ?? null

  // ── DnD ───────────────────────────────────────────────────────────────────

  function handleDragStart(e: DragStartEvent) { setActiveId(e.active.id as string) }

  async function handleDragEnd(e: DragEndEvent) {
    setActiveId(null)
    const { active, over } = e
    if (!over || active.id === over.id) return

    const oldIndex = stopovers.findIndex((s) => s.id === active.id)
    const newIndex = stopovers.findIndex((s) => s.id === over.id)
    const reordered = arrayMove(stopovers, oldIndex, newIndex)

    onChange(reordered)

    await fetch(`/api/trips/${tripId}/stopovers`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ order: reordered.map((s) => s.id) }),
    })
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────

  async function handleAdd(data: StopoverFormData) {
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch(`/api/trips/${tripId}/stopovers`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(data),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        setSaveError(err.error ?? "Une erreur est survenue")
        return
      }
      const created: Stopover = await res.json()
      onChange([...stopovers, created])
      setAdding(false)
    } catch {
      setSaveError("Impossible de contacter le serveur")
    } finally {
      setSaving(false)
    }
  }

  async function handleEdit(id: string, data: StopoverFormData) {
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch(`/api/trips/${tripId}/stopovers/${id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(data),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        setSaveError(err.error ?? "Une erreur est survenue")
        return
      }
      const updated: Stopover = await res.json()
      onChange(stopovers.map((s) => (s.id === id ? updated : s)))
      setEditId(null)
    } catch {
      setSaveError("Impossible de contacter le serveur")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    onChange(stopovers.filter((s) => s.id !== id))
    await fetch(`/api/trips/${tripId}/stopovers/${id}`, { method: "DELETE" })
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="px-5 py-4">

      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Nuits ({stopovers.length})
        </h2>
        <button
          onClick={() => setAdding(true)}
          className="text-xs text-[#D15F36] hover:text-[#b8502d] font-bold flex items-center gap-0.5"
        >
          <Plus className="h-3.5 w-3.5" />
          Ajouter
        </button>
      </div>

      {/* Empty state */}
      {stopovers.length === 0 && !adding && (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-terre-50 mb-3">
            <Moon className="h-6 w-6 text-terre-600" />
          </div>
          <p className="text-sm font-medium text-slate-700 mb-1">Aucune nuit planifiée</p>
          <p className="text-xs text-slate-400 mb-4">Ajoutez vos étapes nuitées pour organiser votre voyage.</p>
          <Button size="sm" className="gap-1.5 bg-terre-500 hover:bg-terre-800" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" />
            Ajouter une nuit
          </Button>
        </div>
      )}

      {/* Sortable list */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={stopovers.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-0.5">
            {stopovers.map((stop) => (
              <SortableStopover
                key={stop.id}
                stop={stop}
                isDragging={activeId === stop.id}
                onEdit={() => { setSaveError(null); setEditId(stop.id) }}
                onDelete={() => handleDelete(stop.id)}
              />
            ))}
          </div>
        </SortableContext>

        <DragOverlay>
          {activeStop && <DragGhost stop={activeStop} />}
        </DragOverlay>
      </DndContext>

      {/* Add modal */}
      {adding && (
        <StopoverModal
          title="Ajouter une nuit"
          onSave={handleAdd}
          onClose={() => { setAdding(false); setSaveError(null) }}
          loading={saving}
          error={saveError}
        />
      )}

      {/* Edit modal */}
      {editId && (() => {
        const stop = stopovers.find((s) => s.id === editId)
        if (!stop) return null
        return (
          <StopoverModal
            title="Modifier la nuit"
            initial={{
              date:     toDateInput(stop.date),
              endDate:  stop.endDate,
              name:     stop.name,
              place:    stop.place,
              notes:    stop.notes ?? "",
              platform: stop.platform,
              link:     stop.link,
            }}
            onSave={(data) => handleEdit(editId, data)}
            onClose={() => { setEditId(null); setSaveError(null) }}
            loading={saving}
            error={saveError}
          />
        )
      })()}

    </div>
  )
}
