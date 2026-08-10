import { db } from "@/lib/db"
import { getAuthenticatedUser, unauthorized } from "@/lib/api-auth"
import { userHasTripAccess } from "@/lib/ownership"

interface RouteContext {
  params: { segmentId: string }
}

// ─── GET /api/segments/[segmentId]/gpx — download the inserted GPX trace ───────
export async function GET(_req: Request, { params }: RouteContext): Promise<Response> {
  const user = await getAuthenticatedUser()
  if (!user) return unauthorized()

  // On ne lit QUE `gpxRaw` (+ de quoi vérifier l'accès et nommer le fichier) :
  // charger aussi geojson/elevationPoints ferait dépasser 5 Mo (Accelerate) sur
  // les grosses traces alors qu'on ne sert que le GPX brut.
  const segment = await db.segment.findUnique({
    where: { id: params.segmentId },
    select: { gpxRaw: true, name: true, tripId: true },
  })

  if (!segment) return Response.json({ error: "Segment not found" }, { status: 404 })
  if (!(await userHasTripAccess(segment.tripId, user.id))) return Response.json({ error: "Forbidden" }, { status: 403 })
  if (!segment.gpxRaw) return Response.json({ error: "Aucune trace GPX" }, { status: 404 })

  const base = (segment.name ?? "trace").replace(/[^a-zA-Z0-9À-ÿ\s-]/g, "").trim() || "trace"

  return new Response(segment.gpxRaw, {
    headers: {
      "Content-Type": "application/gpx+xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${base}.gpx"`,
    },
  })
}
