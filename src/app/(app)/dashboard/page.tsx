import { redirect } from "next/navigation"
import Link from "next/link"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { Button } from "@/components/ui/button"
import { TripCard } from "@/components/TripCard"
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
        <Link href="/trips/new">
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            Nouveau voyage
          </Button>
        </Link>
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
          <Link href="/trips/new">
            <Button size="lg" className="gap-2">
              <Plus className="h-4 w-4" />
              Créer votre premier voyage
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          {trips.map((trip) => (
            <TripCard key={trip.id} trip={trip} />
          ))}
        </div>
      )}
    </div>
  )
}
