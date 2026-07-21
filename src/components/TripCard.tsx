"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { Calendar, TrendingUp, Map, Copy, Loader2, Bike, Footprints } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { EditTripModal, type TripEditData } from "@/components/EditTripModal"

interface TripCardProps {
  trip: {
    id:                  string
    name:                string
    description:         string | null
    startDate:           Date | null
    endDate:             Date | null
    coverImageUrl:       string | null
    coverImagePosition:  string | null
    createdAt:           Date
    segments:            Array<{ type: string; distanceM: number | null; elevationGainM: number | null }>
  }
}

function formatDate(d: Date) {
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })
}

export function TripCard({ trip }: TripCardProps) {
  const router   = useRouter()
  const [duplicating, setDuplicating] = useState(false)

  async function handleDuplicate(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setDuplicating(true)
    try {
      const res = await fetch(`/api/trips/${trip.id}/duplicate`, { method: "POST" })
      if (res.ok) {
        const newTrip = await res.json()
        router.push(`/trips/${newTrip.id}`)
        router.refresh()
      }
    } finally {
      setDuplicating(false)
    }
  }

  // Distance + dénivelé par mode — uniquement vélo et à pied, chacun avec son picto/couleur
  const modeStats = [
    { type: "gpx",     Icon: Bike,       color: "#5F7F6F" },
    { type: "walking", Icon: Footprints, color: "#f59e0b" },
  ].map((m) => {
    const segs = trip.segments.filter((s) => s.type === m.type)
    return {
      ...m,
      km:   segs.reduce((a, s) => a + (s.distanceM      ?? 0), 0) / 1000,
      elev: segs.reduce((a, s) => a + (s.elevationGainM ?? 0), 0),
    }
  }).filter((m) => m.km > 0 || m.elev > 0)

  const editData: TripEditData = {
    id:                  trip.id,
    name:                trip.name,
    description:         trip.description,
    startDate:           trip.startDate ? trip.startDate.toISOString().slice(0, 10) : null,
    endDate:             trip.endDate   ? trip.endDate.toISOString().slice(0, 10)   : null,
    coverImageUrl:       trip.coverImageUrl,
    coverImagePosition:  trip.coverImagePosition,
  }

  return (
    <div className="group relative rounded-2xl overflow-hidden bg-white border border-slate-200 hover:shadow-lg transition-shadow">

      {/* Cover image */}
      <Link href={`/trips/${trip.id}`} className="block">
        <div className="relative h-40 bg-slate-100">
          {trip.coverImageUrl ? (
            <Image
              src={trip.coverImageUrl}
              alt={trip.name}
              fill
              unoptimized
              style={{ objectFit: "cover", objectPosition: trip.coverImagePosition ?? "50% 50%" }}
            />
          ) : (
            <div className="h-full flex items-center justify-center">
              <Map className="h-10 w-10 text-slate-200" />
            </div>
          )}
          {/* Gradient overlay for text legibility */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
        </div>
      </Link>

      {/* Actions — top right of cover */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5">
        <button
          onClick={handleDuplicate}
          disabled={duplicating}
          title="Dupliquer ce voyage"
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/90 text-slate-500 hover:text-emerald-700 hover:bg-white shadow-sm transition-colors disabled:opacity-50"
        >
          {duplicating
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <Copy className="h-3.5 w-3.5" />}
        </button>
        <EditTripModal trip={editData} />
      </div>

      {/* Body */}
      <Link href={`/trips/${trip.id}`} className="block p-4 space-y-3">

        {/* Title + dates */}
        <div>
          <h2 className="font-semibold text-slate-900 group-hover:text-emerald-700 transition-colors line-clamp-1">
            {trip.name}
          </h2>
          {trip.startDate ? (
            <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {formatDate(trip.startDate)}
              {trip.endDate && <> → {formatDate(trip.endDate)}</>}
            </p>
          ) : (
            <p className="text-xs text-slate-300 mt-0.5 flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Aucune date définie
            </p>
          )}
        </div>

        {/* Description */}
        {trip.description && (
          <p className="text-xs text-slate-500 line-clamp-2">{trip.description}</p>
        )}

        {/* Segment badges */}
        {trip.segments.length === 0 && (
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline">Aucun segment</Badge>
          </div>
        )}

        {/* Stats — par mode (vélo / à pied), sur une même ligne */}
        {modeStats.length > 0 && (
          <div className="flex items-center flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-slate-600">
            {modeStats.map(({ type, Icon, color, km, elev }) => (
              <div key={type} className="flex items-center gap-2">
                <Icon className="h-3.5 w-3.5 shrink-0" style={{ color }} />
                {km > 0 && <span>{km.toFixed(1)} km</span>}
                {elev > 0 && (
                  <span className="flex items-center gap-0.5">
                    <TrendingUp className="h-3 w-3 text-slate-400" />
                    {Math.round(elev)} m
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </Link>
    </div>
  )
}
