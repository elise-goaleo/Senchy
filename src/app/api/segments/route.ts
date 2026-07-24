import { z } from "zod"
import { db } from "@/lib/db"
import { getAuthenticatedUser, unauthorized } from "@/lib/api-auth"
import { requireTripOwnership } from "@/lib/ownership"
import { parseGpx, computeStats } from "@/lib/gpx"
import { routeDriving } from "@/lib/routing"

const MAX_GPX_SIZE = 10 * 1024 * 1024 // 10 MB

// ─── Geocoding (Nominatim / OSM) ──────────────────────────────────────────────

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
  to: { lat: number; lon: number }
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

// ─── Schemas ──────────────────────────────────────────────────────────────────

const gpxBareSchema = z.object({
  tripId:      z.string().min(1),
  type:        z.literal("gpx"),
  name:        z.string().max(200).optional(),
  departureAt: z.string().datetime().optional(),
  komootUrl:   z.string().max(500).optional(),
  sortOrder:   z.number().int().min(0),
})

const visitSegmentSchema = z.object({
  tripId:    z.string().min(1),
  type:      z.literal("visit"),
  name:      z.string().min(1).max(200),
  place:     z.string().max(300).optional(),   // adresse / lieu
  lat:       z.number().min(-90).max(90).optional(),
  lon:       z.number().min(-180).max(180).optional(),
  notes:     z.string().max(2000).optional(),
  sortOrder: z.number().int().min(0),
})

const milestoneSchema = z.object({
  tripId:        z.string().min(1),
  type:          z.enum(["arrival", "departure"]),
  transportMode: z.string().max(50).optional(),
  terminal:      z.string().max(200).optional(),
  place:         z.string().max(300).optional(),   // ville (arrivée pour un départ, départ pour une arrivée)
  lat:           z.number().min(-90).max(90).optional(),
  lon:           z.number().min(-180).max(180).optional(),
  departureAt:   z.string().datetime().optional(),
  arrivalAt:     z.string().datetime().optional(),
  sortOrder:     z.number().int().min(0),
})

const transitSegmentSchema = z.object({
  tripId:      z.string().min(1),
  name:        z.string().max(200).optional(),
  type:        z.enum(["train", "walking", "car"]),
  origin:      z.string().min(1).max(300).optional(),
  destination: z.string().min(1).max(300).optional(),
  originLat:   z.number().min(-90).max(90).optional(),
  originLon:   z.number().min(-180).max(180).optional(),
  destLat:     z.number().min(-90).max(90).optional(),
  destLon:     z.number().min(-180).max(180).optional(),
  durationMin: z.number().int().positive().optional(),
  departureAt: z.string().datetime().optional(),
  arrivalAt:   z.string().datetime().optional(),
  sortOrder:   z.number().int().min(0),
}).refine(
  (d) => d.type === "walking" || d.type === "car" || d.durationMin != null || (d.departureAt != null && d.arrivalAt != null),
  { message: "Durée ou horaires de départ/arrivée requis" }
)

// ─── POST /api/segments ───────────────────────────────────────────────────────

export async function POST(request: Request): Promise<Response> {
  const user = await getAuthenticatedUser()
  if (!user) return unauthorized()

  try {
    const contentType = request.headers.get("content-type") ?? ""

    // ── GPX upload (multipart/form-data) ─────────────────────────────────────
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData()

      const tripId       = formData.get("tripId")
      const name         = formData.get("name")
      const sortOrderRaw = formData.get("sortOrder")
      const file         = formData.get("file")
      const dateRaw      = formData.get("date")
      const komootUrl    = formData.get("komootUrl")
      const typeRaw      = formData.get("type")
      const origin       = formData.get("origin")
      const destination  = formData.get("destination")
      const durationRaw  = formData.get("durationMin")

      if (
        typeof tripId !== "string" ||
        typeof sortOrderRaw !== "string" ||
        !(file instanceof Blob)
      ) {
        return Response.json(
          { error: "Missing required fields: tripId, sortOrder, file" },
          { status: 400 }
        )
      }

      const sortOrder = parseInt(sortOrderRaw, 10)
      if (isNaN(sortOrder)) {
        return Response.json({ error: "sortOrder must be a number" }, { status: 400 })
      }

      if (file.size > MAX_GPX_SIZE) {
        return Response.json(
          { error: "File too large. Maximum size is 10 MB." },
          { status: 413 }
        )
      }

      try {
        await requireTripOwnership(tripId, user.id)
      } catch (err) {
        if (err instanceof Response) return err
        throw err
      }

      const gpxString = await file.text()

      let geojson: GeoJSON.FeatureCollection
      try {
        geojson = parseGpx(gpxString)
      } catch {
        return Response.json({ error: "Invalid GPX file" }, { status: 422 })
      }

      const stats = computeStats(geojson)

      const departureAt = typeof dateRaw === "string" && dateRaw
        ? new Date(dateRaw + "T12:00:00Z")
        : null

      const segmentType = typeRaw === "walking" ? "walking" : "gpx"

      const segment = await db.segment.create({
        data: {
          tripId,
          type:           segmentType,
          name:           typeof name === "string" && name.length > 0 ? name : null,
          sortOrder,
          gpxRaw:         gpxString,
          geojson:        geojson as object,
          distanceM:      stats.distanceM,
          elevationGainM: stats.elevationGainM,
          elevationLossM: stats.elevationLossM,
          elevationPoints: stats.elevationPoints as object,
          startLat:       stats.startLat,
          startLon:       stats.startLon,
          departureAt,
          komootUrl:      typeof komootUrl === "string" && komootUrl.length > 0 ? komootUrl : null,
          origin:         typeof origin === "string" && origin.length > 0 ? origin : null,
          destination:    typeof destination === "string" && destination.length > 0 ? destination : null,
          durationMin:    typeof durationRaw === "string" && durationRaw ? parseInt(durationRaw, 10) || null : null,
        },
      })

      return Response.json(segment, { status: 201 })
    }

    // ── GPX sans fichier (JSON) ───────────────────────────────────────────────
    const body: unknown = await request.json()

    if (typeof body === "object" && body !== null && (body as Record<string, unknown>).type === "gpx") {
      const parsed = gpxBareSchema.safeParse(body)
      if (!parsed.success) {
        return Response.json(
          { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
          { status: 400 }
        )
      }
      const { tripId, name, sortOrder, departureAt, komootUrl } = parsed.data
      try { await requireTripOwnership(tripId, user.id) } catch (err) {
        if (err instanceof Response) return err; throw err
      }
      const segment = await db.segment.create({
        data: {
          tripId, type: "gpx", name: name ?? null, sortOrder,
          departureAt: departureAt ? new Date(departureAt) : null,
          komootUrl:   komootUrl || null,
        },
      })
      return Response.json(segment, { status: 201 })
    }

    // ── Arrivée / Départ (jalon transport — tout optionnel) ───────────────────
    if (typeof body === "object" && body !== null &&
        ((body as Record<string, unknown>).type === "arrival" || (body as Record<string, unknown>).type === "departure")) {
      const parsed = milestoneSchema.safeParse(body)
      if (!parsed.success) {
        return Response.json(
          { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
          { status: 400 }
        )
      }
      const { tripId, type, transportMode, terminal, place, lat, lon, departureAt, arrivalAt, sortOrder } = parsed.data
      try { await requireTripOwnership(tripId, user.id) } catch (err) {
        if (err instanceof Response) return err; throw err
      }
      const segment = await db.segment.create({
        data: {
          tripId, type, sortOrder,
          transportMode: transportMode || null,
          terminal:      terminal || null,
          origin:        place || null,
          startLat:      lat ?? null,
          startLon:      lon ?? null,
          departureAt:   departureAt ? new Date(departureAt) : null,
          arrivalAt:     arrivalAt   ? new Date(arrivalAt)   : null,
        },
      })
      return Response.json(segment, { status: 201 })
    }

    // ── Visite (point à visiter — pas de trajet) ──────────────────────────────
    if (typeof body === "object" && body !== null && (body as Record<string, unknown>).type === "visit") {
      const parsed = visitSegmentSchema.safeParse(body)
      if (!parsed.success) {
        return Response.json(
          { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
          { status: 400 }
        )
      }
      const { tripId, name, place, lat, lon, notes, sortOrder } = parsed.data
      try { await requireTripOwnership(tripId, user.id) } catch (err) {
        if (err instanceof Response) return err; throw err
      }
      const segment = await db.segment.create({
        data: {
          tripId, type: "visit", name, sortOrder,
          origin:   place ?? null,
          notes:    notes ?? null,
          startLat: lat ?? null,
          startLon: lon ?? null,
        },
      })
      return Response.json(segment, { status: 201 })
    }

    // ── Train / walking segment (JSON) ────────────────────────────────────────
    const parsed = transitSegmentSchema.safeParse(body)

    if (!parsed.success) {
      return Response.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { tripId, name, type, origin, destination, sortOrder,
            departureAt, arrivalAt } = parsed.data

    // Compute durationMin from dates if not provided
    let durationMin = parsed.data.durationMin
    if (!durationMin && departureAt && arrivalAt) {
      const dep = new Date(departureAt)
      const arr = new Date(arrivalAt)
      durationMin = Math.round((arr.getTime() - dep.getTime()) / 60000)
    }

    try {
      await requireTripOwnership(tripId, user.id)
    } catch (err) {
      if (err instanceof Response) return err
      throw err
    }

    // Prefer exact coordinates picked from the address autocomplete; fall back to
    // geocoding the typed text. Both origin and destination are optional.
    const { originLat, originLon, destLat, destLon } = parsed.data
    const [fromCoords, toCoords] = await Promise.all([
      originLat != null && originLon != null ? { lat: originLat, lon: originLon } : (origin ? geocode(origin) : null),
      destLat   != null && destLon   != null ? { lat: destLat,   lon: destLon   } : (destination ? geocode(destination) : null),
    ])

    // For car segments, follow the actual road network (OSRM); fall back to a
    // straight line if routing fails. Other transit types stay straight lines.
    let geojson = fromCoords && toCoords ? buildLineGeoJSON(fromCoords, toCoords) : null
    let routedDistanceM:   number | null = null
    let routedDurationMin: number | null = null

    if (type === "car" && fromCoords && toCoords) {
      const route = await routeDriving(fromCoords, toCoords)
      if (route) {
        geojson           = route.geojson
        routedDistanceM   = route.distanceM
        routedDurationMin = route.durationMin
      }
    }

    const segment = await db.segment.create({
      data: {
        tripId,
        type,
        name:        name ?? null,
        sortOrder,
        origin,
        destination,
        distanceM:   routedDistanceM ?? null,
        durationMin: durationMin ?? routedDurationMin ?? null,
        departureAt: departureAt ? new Date(departureAt) : null,
        arrivalAt:   arrivalAt   ? new Date(arrivalAt)   : null,
        geojson:     geojson ? (geojson as object) : undefined,
        startLat:    fromCoords?.lat ?? null,
        startLon:    fromCoords?.lon ?? null,
      },
    })

    return Response.json(segment, { status: 201 })
  } catch (error) {
    console.error("[POST /api/segments]", error)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}
