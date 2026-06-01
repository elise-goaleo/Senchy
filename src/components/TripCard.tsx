"use client"

import Link from "next/link"
import Image from "next/image"
import { Footprints, Calendar, Route, TrendingUp, Map } from "lucide-react"
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
  const totalKm      = trip.segments.reduce((s, seg) => s + (seg.distanceM    ?? 0), 0) / 1000
  const totalElevM   = trip.segments.reduce((s, seg) => s + (seg.elevationGainM ?? 0), 0)
  const walkCount    = trip.segments.filter((s) => s.type === "walking").length

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

      {/* Edit button — top right of cover */}
      <div className="absolute top-3 right-3 z-10">
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
        <div className="flex flex-wrap gap-1.5">
          {walkCount > 0 && (
            <Badge variant="outline">
              <Footprints className="h-3 w-3 mr-1" />{walkCount} marche
            </Badge>
          )}
          {trip.segments.length === 0 && (
            <Badge variant="outline">Aucun segment</Badge>
          )}
        </div>

        {/* Stats */}
        <div className="flex items-center gap-3">
          {totalKm > 0 && (
            <p className="text-xs font-medium text-slate-600 flex items-center gap-1">
              <Route className="h-3 w-3 text-emerald-500" />
              {totalKm.toFixed(1)} km
            </p>
          )}
          {totalElevM > 0 && (
            <p className="text-xs font-medium text-slate-600 flex items-center gap-1">
              <TrendingUp className="h-3 w-3 text-terre-400" />
              {Math.round(totalElevM)} m
            </p>
          )}
        </div>
      </Link>
    </div>
  )
}
