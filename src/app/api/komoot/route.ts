import { z } from "zod"
import { getAuthenticatedUser, unauthorized } from "@/lib/api-auth"

const KOMOOT_API = "https://www.komoot.com/api/v007/tours"
const FETCH_TIMEOUT_MS = 20_000

const bodySchema = z.object({
  url: z.string().min(1).max(500),
})

interface KomootCoord {
  lat: number
  lng: number
  alt?: number
  t?: number
}

// Extrait l'identifiant numérique d'un tour Komoot depuis une URL collée
// (…/tour/47437935, avec ou sans slug/params) ou un ID brut.
function parseTourId(input: string): string | null {
  const fromUrl = input.match(/tour\/(\d+)/)
  if (fromUrl) return fromUrl[1]
  const bare = input.trim().match(/^(\d+)$/)
  return bare ? bare[1] : null
}

async function komootGet(path: string): Promise<Response> {
  return fetch(`${KOMOOT_API}/${path}`, {
    headers: {
      // L'API Komoot renvoie 406 sans cet Accept (HAL+JSON).
      "Accept": "application/hal+json",
      "User-Agent": "Mozilla/5.0 (compatible; Senchy/1.0)",
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
}

export async function POST(request: Request): Promise<Response> {
  const user = await getAuthenticatedUser()
  if (!user) return unauthorized()

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: "URL manquante" }, { status: 400 })
  }

  const tourId = parseTourId(parsed.data.url)
  if (!tourId) {
    return Response.json(
      { error: "Lien Komoot non reconnu (attendu : …komoot.com/tour/ID)" },
      { status: 400 }
    )
  }

  // ── Coordonnées de la trace ───────────────────────────────────────────────
  let coordsRes: Response
  try {
    coordsRes = await komootGet(`${tourId}/coordinates`)
  } catch (err) {
    const msg =
      err instanceof Error && err.name === "TimeoutError"
        ? "Komoot n'a pas répondu à temps"
        : "Impossible de joindre Komoot"
    return Response.json({ error: msg }, { status: 504 })
  }

  if (coordsRes.status === 403) {
    return Response.json(
      { error: "Ce tour Komoot est privé — rends-le public pour l'importer." },
      { status: 403 }
    )
  }
  if (coordsRes.status === 404) {
    return Response.json({ error: "Tour Komoot introuvable." }, { status: 404 })
  }
  if (!coordsRes.ok) {
    return Response.json(
      { error: `Komoot a renvoyé ${coordsRes.status}` },
      { status: 502 }
    )
  }

  const coordsData = (await coordsRes.json()) as { items?: KomootCoord[] }
  const items = coordsData.items ?? []
  if (items.length < 2) {
    return Response.json(
      { error: "Ce tour ne contient pas de tracé exploitable." },
      { status: 422 }
    )
  }

  // ── Nom du tour (best-effort) ─────────────────────────────────────────────
  let name = `Tour Komoot ${tourId}`
  try {
    const metaRes = await komootGet(tourId)
    if (metaRes.ok) {
      const meta = (await metaRes.json()) as { name?: string }
      if (meta.name) name = meta.name
    }
  } catch {
    // le nom par défaut suffit
  }

  // ── Conversion en GeoJSON LineString ──────────────────────────────────────
  const coordinates = items.map((p) =>
    p.alt != null ? [p.lng, p.lat, p.alt] : [p.lng, p.lat]
  )
  const geojson = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates },
      },
    ],
  }

  return Response.json({ geojson, name })
}
