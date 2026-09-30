import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { getOrCreateExplorationsTrip, parseExplorations } from "@/lib/ridesMap"
import { ExplorationsView } from "./ExplorationsView"

export const metadata = { title: "Mes explorations" }

export default async function ExplorationsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const tripId = await getOrCreateExplorationsTrip(session.user.id)
  const trip = await db.trip.findUnique({
    where: { id: tripId },
    select: { description: true },
  })

  return <ExplorationsView initial={parseExplorations(trip?.description ?? null)} />
}
