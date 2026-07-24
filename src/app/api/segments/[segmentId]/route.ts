import { z } from "zod"
import { db } from "@/lib/db"
import { getAuthenticatedUser, unauthorized } from "@/lib/api-auth"
import { parseGpx, computeStats } from "@/lib/gpx"
import { routeDriving } from "@/lib/routing"
import type { GeoJSON } from "geojson"

const MAX_GPX_SIZE = 10 * 1024 * 1024 // 10 MB

// ─── Geocoding helpers (same as POST route) ───────────────────────────────────

async function geocode(place: string): Promise<{ lat: number; lon: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(place)}&format=json&limit=1`
    const res = await fetch(url, {
      headers: { "User-Agent": "Senchy/1.0 (contact@senchy.app)" },
    })
    const data = await res.json() as Array<{ lat: string; lon: string }>
    if (!data[0]) return null
    return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) }
  } catch {
    return null
  }
}

function buildLineGeoJSON(
  from: { lat: number; lon: number },
  to:   { lat: number; lon: number }
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: [[from.lon, from.lat], [to.lon, to.lat]],
      },
    }],
  }
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const updateSegmentSchema = z.object({
  name:        z.string().max(200).nullable().optional(),
  sortOrder:   z.number().int().min(0).optional(),
  departureAt: z.string().datetime().nullable().optional(),
  arrivalAt:   z.string().datetime().nullable().optional(),
  origin:      z.string().max(300).nullable().optional(),
  destination: z.string().max(300).nullable().optional(),
  originLat:   z.number().min(-90).max(90).optional(),
  originLon:   z.number().min(-180).max(180).optional(),
  destLat:     z.number().min(-90).max(90).optional(),
  destLon:     z.number().min(-180).max(180).optional(),
  durationMin: z.number().int().positive().nullable().optional(),
  notes:       z.string().nullable().optional(),
  komootUrl:   z.string().url().nullable().optional(),
  transportMode: z.string().max(50).nullable().optional(),
  terminal:      z.string().max(200).nullable().optional(),
})

// ─── Route params ─────────────────────────────────────────────────────────────

interface RouteContext {
  params: { segmentId: string }
}

// ─── Helper: resolve segment and verify ownership via its trip ────────────────

async function resolveSegment(segmentId: string, userId: string) {
  const segment = await db.segment.findUnique({
    where: { id: segmentId },
    include: { trip: true },
  })

  if (!segment) {
    throw Response.json({ error: "Segment not found" }, { status: 404 })
  }

  if (segment.trip.userId !== userId) {
    throw Response.json({ error: "Forbidden" }, { status: 403 })
  }

  return segment
}

// ─── GET /api/segments/[segmentId] ───────────────────────────────────────────

export async function GET(
  _request: Request,
  { params }: RouteContext
): Promise<Response> {
  const user = await getAuthenticatedUser()
  if (!user) return unauthorized()

  try {
    const segment = await resolveSegment(params.segmentId, user.id)
    return Response.json(segment)
  } catch (error) {
    if (error instanceof Response) return error
    console.error("[GET /api/segments/[segmentId]]", error)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}

// ─── PATCH /api/segments/[segmentId] ─────────────────────────────────────────

export async function PATCH(
  request: Request,
  { params }: RouteContext
): Promise<Response> {
  const user = await getAuthenticatedUser()
  if (!user) return unauthorized()

  try {
    const segment = await resolveSegment(params.segmentId, user.id)
    const contentType = request.headers.get("content-type") ?? ""

    // ── GPX replacement (multipart) ──────────────────────────────────────────
    if (contentType.includes("multipart/form-data")) {
      if (segment.type !== "gpx") {
        return Response.json({ error: "Ce segment n'est pas un segment GPX" }, { status: 400 })
      }

      const formData = await request.formData()
      const file = formData.get("file")

      if (!(file instanceof Blob)) {
        return Response.json({ error: "Fichier GPX manquant" }, { status: 400 })
      }
      if (file.size > MAX_GPX_SIZE) {
        return Response.json({ error: "Fichier trop volumineux (max 10 Mo)" }, { status: 413 })
      }

      const gpxString = await file.text()
      let geojson: GeoJSON.FeatureCollection
      try {
        geojson = parseGpx(gpxString)
      } catch {
        return Response.json({ error: "Fichier GPX invalide" }, { status: 422 })
      }

      const stats = computeStats(geojson)
      const updated = await db.segment.update({
        where: { id: params.segmentId },
        data: {
          gpxRaw:         gpxString,
          geojson:        geojson as object,
          distanceM:      stats.distanceM,
          elevationGainM: stats.elevationGainM,
          elevationLossM: stats.elevationLossM,
          elevationPoints: stats.elevationPoints as object,
          startLat:       stats.startLat,
          startLon:       stats.startLon,
        },
      })
      return Response.json(updated)
    }

    // ── JSON metadata update ─────────────────────────────────────────────────
    const body: unknown = await request.json()
    const parsed = updateSegmentSchema.safeParse(body)

    if (!parsed.success) {
      return Response.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    // For transit segments: re-geocode any time we have origin + destination
    // (covers name changes, missing geojson on old segments, etc.)
    let geoUpdate: Record<string, unknown> = {}

    if (segment.type === "visit") {
      // Point unique : met à jour les coordonnées à partir de l'adresse
      const d = parsed.data
      if (d.originLat != null && d.originLon != null) {
        geoUpdate = { startLat: d.originLat, startLon: d.originLon }
      } else if (d.origin !== undefined) {
        const c = d.origin ? await geocode(d.origin) : null
        geoUpdate = { startLat: c?.lat ?? null, startLon: c?.lon ?? null }
      }
    } else if (segment.type !== "gpx") {
      const d = parsed.data
      const effectiveOrigin      = d.origin      !== undefined ? d.origin      : segment.origin
      const effectiveDestination = d.destination !== undefined ? d.destination : segment.destination

      // Prefer exact coordinates picked from the address autocomplete; fall back to geocoding.
      const fromCoords = d.originLat != null && d.originLon != null
        ? { lat: d.originLat, lon: d.originLon }
        : (effectiveOrigin ? await geocode(effectiveOrigin) : null)
      const toCoords = d.destLat != null && d.destLon != null
        ? { lat: d.destLat, lon: d.destLon }
        : (effectiveDestination ? await geocode(effectiveDestination) : null)

      if (fromCoords && toCoords) {
        // Car segments follow the road network; fall back to a straight line.
        const route = segment.type === "car" ? await routeDriving(fromCoords, toCoords) : null
        geoUpdate = route
          ? {
              geojson:   route.geojson as object,
              startLat:  fromCoords.lat,
              startLon:  fromCoords.lon,
              distanceM: route.distanceM,
            }
          : {
              geojson:  buildLineGeoJSON(fromCoords, toCoords) as object,
              startLat: fromCoords.lat,
              startLon: fromCoords.lon,
            }
      }
    }

    const updated = await db.segment.update({
      where: { id: params.segmentId },
      data: {
        ...(parsed.data.name !== undefined && { name: parsed.data.name }),
        ...(parsed.data.sortOrder !== undefined && { sortOrder: parsed.data.sortOrder }),
        ...(parsed.data.departureAt !== undefined && {
          departureAt: parsed.data.departureAt ? new Date(parsed.data.departureAt) : null,
        }),
        ...(parsed.data.arrivalAt !== undefined && {
          arrivalAt: parsed.data.arrivalAt ? new Date(parsed.data.arrivalAt) : null,
        }),
        ...(parsed.data.origin !== undefined && { origin: parsed.data.origin }),
        ...(parsed.data.destination !== undefined && { destination: parsed.data.destination }),
        ...(parsed.data.durationMin !== undefined && { durationMin: parsed.data.durationMin }),
        ...(parsed.data.notes     !== undefined && { notes:     parsed.data.notes }),
        ...(parsed.data.komootUrl !== undefined && { komootUrl: parsed.data.komootUrl }),
        ...(parsed.data.transportMode !== undefined && { transportMode: parsed.data.transportMode }),
        ...(parsed.data.terminal      !== undefined && { terminal:      parsed.data.terminal }),
        ...geoUpdate,
      },
    })

    return Response.json(updated)
  } catch (error) {
    if (error instanceof Response) return error
    console.error("[PATCH /api/segments/[segmentId]]", error)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}

// ─── DELETE /api/segments/[segmentId] ────────────────────────────────────────

export async function DELETE(
  _request: Request,
  { params }: RouteContext
): Promise<Response> {
  const user = await getAuthenticatedUser()
  if (!user) return unauthorized()

  try {
    await resolveSegment(params.segmentId, user.id)

    await db.segment.delete({ where: { id: params.segmentId } })

    return new Response(null, { status: 204 })
  } catch (error) {
    if (error instanceof Response) return error
    console.error("[DELETE /api/segments/[segmentId]]", error)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}
