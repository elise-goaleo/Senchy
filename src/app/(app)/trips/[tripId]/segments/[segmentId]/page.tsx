import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { SegmentMapWithPicker } from "@/components/map/SegmentMapWithPicker"
import { ElevationChart } from "@/components/charts/ElevationChart"
import { TravelTimeCalculator } from "@/components/TravelTimeCalculator"
import { DeleteSegmentButton } from "./DeleteSegmentButton"
import { EditSegmentModal } from "./EditSegmentModal"
import { DownloadGpxButton } from "./DownloadGpxButton"
import {
  TrendingUp,
  TrendingDown,
  Mountain,
  Route,
  Train,
  Clock,
  ArrowRight,
  ArrowLeft,
  CalendarDays,
  Link2,
} from "lucide-react"
import { SegmentNotes } from "./SegmentNotes"
import type { GeoJSON } from "geojson"

interface PageProps {
  params: { tripId: string; segmentId: string }
}

export async function generateMetadata({ params }: PageProps) {
  const seg = await db.segment.findUnique({
    where: { id: params.segmentId },
    select: { name: true, type: true },
  })
  return {
    title: seg?.name ?? (seg?.type === "train" ? "Segment train" : "Segment"),
  }
}

// Gradient analysis: find sections steeper than threshold
function findSteepSections(
  points: Array<{ distanceM: number; elevationM: number }>,
  thresholdPct = 5
): Array<{ startKm: number; endKm: number; gradientPct: number }> {
  if (points.length < 2) return []
  const sections: Array<{ startKm: number; endKm: number; gradientPct: number }> = []
  const WINDOW = 500 // metres

  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i]
    // find point ~WINDOW m ahead
    let j = i + 1
    while (j < points.length - 1 && points[j].distanceM - start.distanceM < WINDOW) {
      j++
    }
    const end = points[j]
    const distDelta = end.distanceM - start.distanceM
    if (distDelta < 100) continue
    const elevDelta = end.elevationM - start.elevationM
    const gradient = (elevDelta / distDelta) * 100
    if (Math.abs(gradient) >= thresholdPct) {
      // Avoid duplicating nearby sections
      const lastSection = sections[sections.length - 1]
      if (lastSection && start.distanceM / 1000 - lastSection.endKm < 0.3) continue
      sections.push({
        startKm: parseFloat((start.distanceM / 1000).toFixed(2)),
        endKm: parseFloat((end.distanceM / 1000).toFixed(2)),
        gradientPct: parseFloat(gradient.toFixed(1)),
      })
    }
  }
  return sections.slice(0, 15) // limit to 15 rows
}

export default async function SegmentDetailPage({ params }: PageProps) {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const segment = await db.segment.findUnique({
    where: { id: params.segmentId },
    include: { trip: { select: { userId: true, id: true, name: true } } },
  })

  if (!segment) notFound()
  if (segment.trip.userId !== session.user.id) notFound()
  if (segment.trip.id !== params.tripId) notFound()

  const geojson = segment.geojson
    ? (segment.geojson as unknown as GeoJSON.FeatureCollection)
    : null

  // Vélo et à pied ont une trace GPX : même contenu riche (carte, stats, profil).
  // Le contenu simplifié (carte d'info) reste pour le train / la voiture, ou pour
  // un segment vélo/à pied sans tracé.
  const hasTrace = (segment.type === "gpx" || segment.type === "walking") && !!geojson

  const elevPoints = (
    Array.isArray(segment.elevationPoints)
      ? (segment.elevationPoints as Array<{ distanceM: number; elevationM: number }>)
      : []
  )

  const steepSections = elevPoints.length > 0
    ? findSteepSections(elevPoints, 5)
    : []

  const segmentLabel =
    segment.name ??
    (segment.origin && segment.destination
      ? `${segment.origin} → ${segment.destination}`
      : "Segment")

  const typeLabel =
    segment.type === "gpx"
      ? "Vélo (GPX)"
      : segment.type === "train"
      ? "Train"
      : "À pied"

  const typeBadgeVariant =
    segment.type === "gpx"
      ? "default"
      : segment.type === "train"
      ? "secondary"
      : "outline"

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto overflow-x-hidden">
      {/* Breadcrumb (desktop) */}
      <div className="hidden lg:flex items-center gap-2 text-sm text-slate-500 mb-6">
        <Link href="/dashboard" className="hover:text-slate-900 transition-colors">
          Mes voyages
        </Link>
        <span>/</span>
        <Link
          href={`/trips/${params.tripId}`}
          className="hover:text-slate-900 transition-colors"
        >
          {segment.trip.name}
        </Link>
        <span>/</span>
        <span className="text-slate-800 font-medium truncate">{segmentLabel}</span>
      </div>

      {/* Retour (mobile) */}
      <Link
        href={`/trips/${params.tripId}`}
        className="lg:hidden inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition-colors mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Retour
      </Link>

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-6">
        <div>
          <div className="mb-2">
            <Badge variant={typeBadgeVariant}>{typeLabel}</Badge>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">{segmentLabel}</h1>
          {segment.origin && segment.destination && (
            <div className="flex items-center gap-2 text-slate-500">
              <span>{segment.origin}</span>
              <ArrowRight className="h-4 w-4" />
              <span>{segment.destination}</span>
            </div>
          )}
          {segment.departureAt && (
            <div className="flex items-center gap-1.5 text-sm text-slate-400 mt-1.5">
              <CalendarDays className="h-3.5 w-3.5" />
              {segment.departureAt.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:shrink-0">
          {segment.komootUrl ? (
            <a href={segment.komootUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="gap-1.5">
                <Link2 className="h-3.5 w-3.5" />
                Komoot
              </Button>
            </a>
          ) : (
            <Button variant="outline" size="sm" className="gap-1.5" disabled>
              <Link2 className="h-3.5 w-3.5" />
              Komoot
            </Button>
          )}
          {(segment.type === "gpx" || segment.type === "walking") && (
            <DownloadGpxButton
              segmentId={segment.id}
              hasGpx={segment.gpxRaw != null}
              filename={segmentLabel}
            />
          )}
          <DeleteSegmentButton segmentId={segment.id} tripId={params.tripId} />
          <EditSegmentModal
            segment={{
              id:          segment.id,
              type:        segment.type,
              name:        segment.name,
              origin:      segment.origin,
              destination: segment.destination,
              durationMin: segment.durationMin,
              departureAt: segment.departureAt?.toISOString() ?? null,
              arrivalAt:   segment.arrivalAt?.toISOString()   ?? null,
              komootUrl:   segment.komootUrl ?? null,
            }}
          />
        </div>
      </div>

      <div className="space-y-6">

      {/* Contenu riche — vélo & à pied (avec tracé) */}
      {hasTrace && geojson && (
        <div className="space-y-6">
          {/* Map */}
          <div className="rounded-xl overflow-hidden border border-slate-200 shadow-sm">
            <SegmentMapWithPicker geojson={geojson} height="400px" />
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              {
                icon: Route,
                label: "Distance",
                value: segment.distanceM != null
                  ? `${(segment.distanceM / 1000).toFixed(2)} km`
                  : "—",
                color: "text-emerald-600",
                bg: "bg-emerald-50",
              },
              {
                icon: TrendingUp,
                label: "Dénivelé +",
                value: segment.elevationGainM != null
                  ? `${Math.round(segment.elevationGainM)} m`
                  : "—",
                color: "text-blue-600",
                bg: "bg-blue-50",
              },
              {
                icon: TrendingDown,
                label: "Dénivelé -",
                value: segment.elevationLossM != null
                  ? `${Math.round(segment.elevationLossM)} m`
                  : "—",
                color: "text-orange-600",
                bg: "bg-orange-50",
              },
              {
                icon: Mountain,
                label: "Altitude max",
                value:
                  elevPoints.length > 0
                    ? `${Math.round(Math.max(...elevPoints.map((p) => p.elevationM)))} m`
                    : "—",
                color: "text-purple-600",
                bg: "bg-purple-50",
              },
            ].map(({ icon: Icon, label, value, color, bg }) => (
              <Card key={label}>
                <CardContent className="flex items-center gap-2 sm:gap-3 px-3 sm:px-6 pt-5 pb-4">
                  <div className={`flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-xl ${bg} shrink-0`}>
                    <Icon className={`h-4 w-4 sm:h-5 sm:w-5 ${color}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-slate-500">{label}</p>
                    <p className="text-base sm:text-lg font-bold text-slate-900 whitespace-nowrap">{value}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Elevation profile */}
          {elevPoints.length > 0 && (
            <Card>
              <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-2">
                <CardTitle className="text-base">Profil altimétrique</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                <ElevationChart points={elevPoints} />
              </CardContent>
            </Card>
          )}

          {/* Gradient analysis */}
          {steepSections.length > 0 && (
            <Card>
              <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-2">
                <CardTitle className="text-base">
                  Sections raides (&gt; 5%)
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-slate-400 border-b border-slate-100">
                        <th className="text-left pb-2 font-medium">Début (km)</th>
                        <th className="text-left pb-2 font-medium">Fin (km)</th>
                        <th className="text-left pb-2 font-medium">Gradient</th>
                        <th className="text-left pb-2 font-medium">Sens</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {steepSections.map((s, i) => (
                        <tr key={i} className="text-slate-700">
                          <td className="py-2">{s.startKm}</td>
                          <td className="py-2">{s.endKm}</td>
                          <td className="py-2">
                            <span
                              className={
                                Math.abs(s.gradientPct) >= 10
                                  ? "text-red-600 font-semibold"
                                  : "text-orange-600"
                              }
                            >
                              {s.gradientPct > 0 ? "+" : ""}
                              {s.gradientPct}%
                            </span>
                          </td>
                          <td className="py-2">
                            {s.gradientPct > 0 ? "Montée" : "Descente"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Travel time calculator */}
          {segment.distanceM != null && segment.distanceM > 0 && (
            <Card>
              <CardContent className="p-4 sm:px-6 sm:pt-5 sm:pb-6">
                <TravelTimeCalculator distanceM={segment.distanceM} mode={segment.type === "walking" ? "walking" : "cycling"} />
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Contenu simplifié — train / voiture, ou segment sans tracé */}
      {!hasTrace && (
        <Card>
          <CardContent className="p-4 sm:p-6 space-y-4">
            <div className="flex items-center gap-4 text-slate-700">
              {segment.type === "train" ? (
                <Train className="h-8 w-8 text-blue-500 shrink-0" />
              ) : (
                <Route className="h-8 w-8 text-amber-500 shrink-0" />
              )}
              <div>
                {segment.origin && segment.destination && (
                  <p className="text-lg font-semibold">
                    {segment.origin}
                    <span className="mx-2 text-slate-400">→</span>
                    {segment.destination}
                  </p>
                )}
                {segment.durationMin != null && (
                  <p className="flex items-center gap-1.5 text-slate-500 mt-1">
                    <Clock className="h-4 w-4" />
                    {segment.durationMin} minutes
                    {segment.durationMin >= 60 && (
                      <span className="text-slate-400">
                        — soit {Math.floor(segment.durationMin / 60)} h{" "}
                        {segment.durationMin % 60 > 0
                          ? `${segment.durationMin % 60} min`
                          : ""}
                      </span>
                    )}
                  </p>
                )}
              </div>
            </div>

            {segment.type === "train" && (
              <div className="bg-blue-50 rounded-xl p-4 text-sm text-blue-700">
                <p>Ce segment est un trajet en train sans trace cartographique.</p>
              </div>
            )}
            {segment.type === "walking" && (
              <div className="bg-amber-50 rounded-xl p-4 text-sm text-amber-700">
                <p>Ce segment est un trajet à pied sans trace cartographique.</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Notes / commentaires */}
      <Card>
        <CardContent className="p-4 sm:px-6 sm:pt-5 sm:pb-5">
          <SegmentNotes segmentId={params.segmentId} initialNotes={segment.notes ?? null} />
        </CardContent>
      </Card>

      </div>
    </div>
  )
}
