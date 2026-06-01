import { notFound, redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { EditSegmentForm } from "./EditSegmentForm"

interface PageProps {
  params: { tripId: string; segmentId: string }
}

export async function generateMetadata({ params }: PageProps) {
  const seg = await db.segment.findUnique({
    where: { id: params.segmentId },
    select: { name: true },
  })
  return { title: `Modifier — ${seg?.name ?? "Segment"}` }
}

export default async function EditSegmentPage({ params }: PageProps) {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const segment = await db.segment.findUnique({
    where: { id: params.segmentId },
    include: { trip: { select: { userId: true, id: true, name: true } } },
  })

  if (!segment) notFound()
  if (segment.trip.userId !== session.user.id) notFound()
  if (segment.trip.id !== params.tripId) notFound()

  return (
    <EditSegmentForm
      tripId={params.tripId}
      tripName={segment.trip.name}
      segment={{
        id:          segment.id,
        type:        segment.type,
        name:        segment.name,
        origin:      segment.origin,
        destination: segment.destination,
        durationMin: segment.durationMin,
        departureAt: segment.departureAt?.toISOString() ?? null,
        arrivalAt:   segment.arrivalAt?.toISOString()   ?? null,
      }}
    />
  )
}
