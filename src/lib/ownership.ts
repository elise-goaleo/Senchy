import { db } from "@/lib/db"
import type { Trip } from "@prisma/client"

/**
 * Fetches a trip and verifies it belongs to the given user.
 *
 * @throws Response with status 404 if the trip does not exist.
 * @throws Response with status 403 if the trip belongs to a different user.
 */
export async function requireTripOwnership(
  tripId: string,
  userId: string
): Promise<Trip> {
  const trip = await db.trip.findUnique({ where: { id: tripId } })

  if (!trip) {
    throw Response.json({ error: "Trip not found" }, { status: 404 })
  }

  if (trip.userId !== userId) {
    throw Response.json({ error: "Forbidden" }, { status: 403 })
  }

  return trip
}
