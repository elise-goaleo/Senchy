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
import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { cn, formatDuration } from "@/lib/utils"
import { GripVertical, ChevronRight, Clock, Train, Footprints, Bike, Car, CalendarDays, X, Check, Moon, Landmark } from "lucide-react"
import type { TripSegment } from "@/app/(app)/trips/[tripId]/TripClientView"
import type { Stopover } from "@/components/StopoversPanel"

// ── Constants ─────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = { gpx: "Vélo", train: "Train", walking: "À pied", car: "Voiture", visit: "Visite" }
const TYPE_COLORS: Record<string, string> = { gpx: "#5F7F6F", train: "#3b82f6", walking: "#f59e0b", car: "#8b5cf6", visit: "#db2777" }
const TYPE_ICONS: Record<string, React.ReactNode> = {
  gpx:     <Bike       className="h-3.5 w-3.5" />,
  train:   <Train      className="h-3.5 w-3.5" />,
  walking: <Footprints className="h-3.5 w-3.5" />,
  car:     <Car        className="h-3.5 w-3.5" />,
  visit:   <Landmark   className="h-3.5 w-3.5" />,
}

function segmentLabel(seg: TripSegment) {
  if (seg.name) return seg.name
  if (seg.origin && seg.destination) return `${seg.origin} → ${seg.destination}`
  return TYPE_LABELS[seg.type] ?? "Segment"
}

// ── Grouping ──────────────────────────────────────────────────────────────────

interface Group {
  key:      string
  label:    string
  dayNum:   number | null   // null for "Sans date"
  segs:     TripSegment[]
}

function buildGroups(segments: TripSegment[]): { flatSorted: TripSegment[]; groups: Group[] } {
  // Sort: dated segments ascending by date, then undated at the end.
  // Within the same date, preserve the existing relative order (sortOrder from DB).
  const dated   = segments.filter((s) => s.departureAt)
  const undated = segments.filter((s) => !s.departureAt)

  const sortedDated = [...dated].sort((a, b) =>
    a.departureAt!.slice(0, 10).localeCompare(b.departureAt!.slice(0, 10))
  )

  const flatSorted = [...sortedDated, ...undated]

  // Build consecutive groups
  const groups: Group[] = []
  let dayCounter = 0

  for (const seg of flatSorted) {
    const dateKey = seg.departureAt ? seg.departureAt.slice(0, 10) : "__nodate__"
    const last    = groups[groups.length - 1]

    if (last && last.key === dateKey) {
      last.segs.push(seg)
    } else {
      const isUndated = dateKey === "__nodate__"
      if (!isUndated) dayCounter++
      const label = isUndated
        ? "Sans date"
        : new Date(dateKey + "T12:00:00Z").toLocaleDateString("fr-FR", {
            weekday: "long",
            day:     "numeric",
            month:   "long",
          })
      groups.push({ key: dateKey, label, dayNum: isUndated ? null : dayCounter, segs: [seg] })
    }
  }

  return { flatSorted, groups }
}

// ── Single sortable item ──────────────────────────────────────────────────────

function SortableItem({
  seg,
  isSelected,
  isDragging,
  isDateShownInHeader,
  onClick,
  onOpenDateModal,
}: {
  seg:                 TripSegment
  isSelected:          boolean
  isDragging:          boolean
  isDateShownInHeader: boolean
  onClick:             () => void
  onOpenDateModal:     (seg: TripSegment) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: seg.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} className="flex flex-col">
      {/* Main row */}
      <div className="flex items-center gap-1">
        <button
          {...attributes}
          {...listeners}
          className="flex items-center justify-center h-8 w-6 text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing shrink-0 touch-none"
          tabIndex={-1}
          aria-label="Déplacer"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <button
          onClick={onClick}
          className={cn(
            "flex-1 flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors text-left group min-w-0",
            isSelected
              ? seg.type === "train"
                ? "bg-blue-50 ring-1 ring-blue-200"
                : "bg-emerald-50/50 ring-1 ring-emerald-200/60"
              : "hover:bg-slate-50"
          )}
        >
          <div
            className="flex h-7 w-7 items-center justify-center rounded-lg shrink-0"
            style={{ background: TYPE_COLORS[seg.type] + "20", color: TYPE_COLORS[seg.type] }}
          >
            {TYPE_ICONS[seg.type]}
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium text-slate-800 truncate block">
              {segmentLabel(seg)}
            </span>
            <div className="flex gap-3 mt-0.5">
              {seg.distanceM != null && seg.distanceM > 0 && (
                <span className="text-xs text-slate-400">{(seg.distanceM / 1000).toFixed(1)} km</span>
              )}
              {seg.elevationGainM != null && seg.elevationGainM > 0 && (
                <span className="text-xs text-slate-400">↑ {Math.round(seg.elevationGainM)} m</span>
              )}
              {seg.durationMin != null && (
                <span className="text-xs text-slate-400 flex items-center gap-0.5">
                  <Clock className="h-3 w-3" />{formatDuration(seg.durationMin)}
                </span>
              )}
              {seg.type === "visit" && seg.origin && (
                <span className="text-xs text-slate-400 truncate">{seg.origin}</span>
              )}
            </div>
          </div>
          <ChevronRight className={cn(
            "h-4 w-4 shrink-0 transition-colors",
            isSelected
              ? seg.type === "train" ? "text-blue-400" : "text-emerald-500"
              : "text-slate-300 group-hover:text-slate-400"
          )} />
        </button>
      </div>

      {/* Date row — shown only for undated segments */}
      {!isDateShownInHeader && (
        <div className="flex items-center gap-1.5 pl-8 pr-3 pb-2">
          <CalendarDays className="h-3 w-3 shrink-0 text-slate-300" />
          <button
            onClick={() => onOpenDateModal(seg)}
            className="text-xs text-slate-300 hover:text-[#D15F36] transition-colors italic text-left"
          >
            Ajouter une date…
          </button>
        </div>
      )}
    </div>
  )
}

// ── Date separator ────────────────────────────────────────────────────────────

function DateSeparator({
  label, dayNum, isFirst, stopover, onStopoverClick,
}: {
  label:           string
  dayNum:          number | null
  isFirst:         boolean
  stopover:        Stopover | null
  onStopoverClick: (s: Stopover) => void
}) {
  return (
    <div className={cn("flex items-center gap-2 px-1", isFirst ? "pb-1" : "pt-3 pb-1")}>
      <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide capitalize whitespace-nowrap">
        {dayNum !== null ? `Jour ${dayNum} · ${label}` : label}
      </span>
      <div className="flex-1 h-px bg-slate-100" />
      {stopover ? (
        <button
          onClick={() => onStopoverClick(stopover)}
          className="flex h-5 w-5 items-center justify-center rounded-md text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors shrink-0"
          title={stopover.name ?? stopover.place ?? "Voir la nuit"}
        >
          <Moon className="h-3.5 w-3.5" />
        </button>
      ) : (
        <div className="flex h-5 w-5 items-center justify-center shrink-0" title="Aucune nuit renseignée">
          <Moon className="h-3.5 w-3.5 text-slate-200" />
        </div>
      )}
    </div>
  )
}

// ── Drag overlay (ghost) ──────────────────────────────────────────────────────

function DragGhost({ seg }: { seg: TripSegment }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white shadow-xl ring-1 ring-emerald-300 ml-7">
      <div
        className="flex h-6 w-6 items-center justify-center rounded-md shrink-0"
        style={{ background: TYPE_COLORS[seg.type] + "20", color: TYPE_COLORS[seg.type] }}
      >
        {TYPE_ICONS[seg.type]}
      </div>
      <span className="text-sm font-medium text-slate-800 truncate">{segmentLabel(seg)}</span>
    </div>
  )
}

// ── Date modal ────────────────────────────────────────────────────────────────

function DateModal({
  seg,
  onConfirm,
  onClose,
}: {
  seg:       TripSegment
  onConfirm: (id: string, date: string) => void
  onClose:   () => void
}) {
  const [value, setValue] = useState(seg.departureAt ? seg.departureAt.slice(0, 10) : "")
  const inputRef = useRef<HTMLInputElement>(null)

  // Close on Escape, focus input on open
  useEffect(() => {
    inputRef.current?.focus()
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
      if (e.key === "Enter" && value) { onConfirm(seg.id, value); onClose() }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onClose, onConfirm, seg.id, value])

  const label = seg.name
    ?? (seg.origin && seg.destination ? `${seg.origin} → ${seg.destination}` : null)
    ?? TYPE_LABELS[seg.type]
    ?? "Segment"

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Ajouter une date</h2>
            <p className="text-xs text-slate-400 mt-0.5 truncate max-w-[220px]">{label}</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5 space-y-4">
          <input
            ref={inputRef}
            type="date"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent"
          />

          <div className="flex gap-2">
            <button
              onClick={() => { if (value) { onConfirm(seg.id, value); onClose() } }}
              disabled={!value}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold py-2.5 transition-colors"
            >
              <Check className="h-4 w-4" />
              Confirmer
            </button>
            <button
              onClick={onClose}
              className="flex-1 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium py-2.5 transition-colors"
            >
              Annuler
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  tripId:          string
  segments:        TripSegment[]
  stopovers:       Stopover[]
  selectedId:      string | null
  onSelect:        (id: string) => void
  onReorder:       (segments: TripSegment[]) => void
  onDateChange:    (id: string, date: string) => void
  onStopoverClick: (stopover: Stopover) => void
}

export function SortableSegmentList({
  tripId, segments, stopovers, selectedId, onSelect, onReorder, onDateChange, onStopoverClick,
}: Props) {
  const [activeId, setActiveId]           = useState<string | null>(null)
  const [dateTarget, setDateTarget]       = useState<TripSegment | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  )

  // Build date-grouped view
  const { flatSorted, groups } = useMemo(() => buildGroups(segments), [segments])

  const activeSegment = flatSorted.find((s) => s.id === activeId) ?? null

  function handleDragStart(e: DragStartEvent) {
    setActiveId(e.active.id as string)
  }

  async function handleDragEnd(e: DragEndEvent) {
    setActiveId(null)
    const { active, over } = e
    if (!over || active.id === over.id) return

    const oldIndex = flatSorted.findIndex((s) => s.id === active.id)
    const newIndex = flatSorted.findIndex((s) => s.id === over.id)
    const reordered = arrayMove(flatSorted, oldIndex, newIndex)

    onReorder(reordered)

    await fetch(`/api/trips/${tripId}/reorder`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ order: reordered.map((s) => s.id) }),
    })
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={flatSorted.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <div>
            {groups.map((group, gi) => {
              const matchingStopover = group.key === "__nodate__"
                ? null
                : stopovers.find((s) => s.date.slice(0, 10) === group.key) ?? null
              return (
              <div key={group.key}>
                {/* Date separator — shown for ALL groups (dated + "Sans date") */}
                <DateSeparator
                  label={group.label}
                  dayNum={group.dayNum}
                  isFirst={gi === 0}
                  stopover={matchingStopover}
                  onStopoverClick={onStopoverClick}
                />

                {group.segs.map((seg) => (
                  <SortableItem
                    key={seg.id}
                    seg={seg}
                    isSelected={selectedId === seg.id}
                    isDragging={activeId === seg.id}
                    isDateShownInHeader={group.key !== "__nodate__"}
                    onClick={() => onSelect(seg.id)}
                    onOpenDateModal={(s) => setDateTarget(s)}
                  />
                ))}
              </div>
              )
            })}
          </div>
        </SortableContext>

        <DragOverlay>
          {activeSegment && <DragGhost seg={activeSegment} />}
        </DragOverlay>
      </DndContext>

      {dateTarget && typeof document !== "undefined" && createPortal(
        <DateModal
          seg={dateTarget}
          onConfirm={(id, date) => { onDateChange(id, date); setDateTarget(null) }}
          onClose={() => setDateTarget(null)}
        />,
        document.body
      )}
    </>
  )
}
