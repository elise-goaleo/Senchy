import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { Button } from "@/components/ui/button"
import { TripCard } from "@/components/TripCard"
import { CreateTripModal } from "@/components/EditTripModal"
import { CollapsibleTripSection } from "@/components/CollapsibleTripSection"
import { Plus, Map } from "lucide-react"

export const metadata = {
  title: "Mes voyages",
}

export default async function DashboardPage() {
  const session = await auth()

  if (!session?.user?.id) {
    redirect("/login")
  }

  const trips = await db.trip.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    include: {
      segments: {
        select: { type: true, distanceM: true, elevationGainM: true },
      },
    },
  })

  // Classement :
  //  - Brouillons : voyages sans aucune date
  //  - À venir    : date de fin (ou de début à défaut) aujourd'hui ou plus tard
  //  - Passés     : date de fin (ou de début à défaut) antérieure à aujourd'hui
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const refDate = (t: (typeof trips)[number]) => t.endDate ?? t.startDate

  // Sans date — l'ordre du query (createdAt desc) est conservé
  const draftTrips = trips.filter((t) => !refDate(t))

  const upcomingTrips = trips
    .filter((t) => { const d = refDate(t); return d && d >= today })
    .sort((a, b) => {
      const da = a.startDate ?? a.endDate
      const db = b.startDate ?? b.endDate
      return (da?.getTime() ?? 0) - (db?.getTime() ?? 0)   // le plus proche en premier
    })

  const pastTrips = trips
    .filter((t) => { const d = refDate(t); return d && d < today })
    .sort((a, b) => {
      const da = a.endDate ?? a.startDate
      const db = b.endDate ?? b.startDate
      return (db?.getTime() ?? 0) - (da?.getTime() ?? 0)   // le plus récent en premier
    })

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Mes voyages</h1>
          <p className="text-sm text-slate-500 mt-1">
            {trips.length === 0
              ? "Aucun voyage pour le moment"
              : `${trips.length} voyage${trips.length > 1 ? "s" : ""}`}
          </p>
        </div>
        <CreateTripModal>
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            Nouveau voyage
          </Button>
        </CreateTripModal>
      </div>

      {/* Empty state */}
      {trips.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-emerald-50 mb-6">
            <Map className="h-10 w-10 text-emerald-500" />
          </div>
          <h2 className="text-xl font-semibold text-slate-900 mb-2">
            Commencez à planifier
          </h2>
          <p className="text-slate-500 max-w-sm mb-8">
            Créez votre premier voyage pour commencer à organiser vos itinéraires
            à vélo, en train et à pied.
          </p>
          <CreateTripModal>
            <Button size="lg" className="gap-2">
              <Plus className="h-4 w-4" />
              Créer votre premier voyage
            </Button>
          </CreateTripModal>
        </div>
      ) : (
        <>
          {/* Voyages à venir */}
          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Voyages à venir</h2>
            {upcomingTrips.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                {upcomingTrips.map((trip) => (
                  <TripCard key={trip.id} trip={trip} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400">Aucun voyage à venir.</p>
            )}
          </section>

          {/* Brouillons (repliable) — voyages sans date */}
          {draftTrips.length > 0 && <CollapsibleTripSection title="Brouillons" trips={draftTrips} />}

          {/* Voyages passés (repliable) */}
          {pastTrips.length > 0 && <CollapsibleTripSection title="Voyages passés" trips={pastTrips} />}
        </>
      )}
    </div>
  )
}
