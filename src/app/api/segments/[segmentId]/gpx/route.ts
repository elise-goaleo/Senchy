import { db } from "@/lib/db"
import { getAuthenticatedUser, unauthorized } from "@/lib/api-auth"

interface RouteContext {
  params: { segmentId: string }
}

// ─── GET /api/segments/[segmentId]/gpx — download the inserted GPX trace ───────
export async function GET(_req: Request, { params }: RouteContext): Promise<Response> {
  const user = await getAuthenticatedUser()
  if (!user) return unauthorized()

  const segment = await db.segment.findUnique({
    where: { id: params.segmentId },
    include: { trip: { select: { userId: true } } },
  })

  if (!segment) return Response.json({ error: "Segment not found" }, { status: 404 })
  if (segment.trip.userId !== user.id) return Response.json({ error: "Forbidden" }, { status: 403 })
  if (!segment.gpxRaw) return Response.json({ error: "Aucune trace GPX" }, { status: 404 })

  const base = (segment.name ?? "trace").replace(/[^a-zA-Z0-9À-ÿ\s-]/g, "").trim() || "trace"

  return new Response(segment.gpxRaw, {
    headers: {
      "Content-Type": "application/gpx+xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${base}.gpx"`,
    },
  })
}
