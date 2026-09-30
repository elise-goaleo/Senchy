import { getAuthenticatedUser, unauthorized } from "@/lib/api-auth"

interface RouteContext {
  params: { iso3: string }
}

// Arrondit récursivement toutes les coordonnées à `dp` décimales (~11 m à 4 dp)
// pour alléger le GeoJSON envoyé au navigateur, sans changer la topologie.
function roundCoords(coords: unknown, dp = 4): unknown {
  if (typeof coords === "number") return Math.round(coords * 10 ** dp) / 10 ** dp
  if (Array.isArray(coords)) return coords.map((c) => roundCoords(c, dp))
  return coords
}

// ─── GET /api/regions/[iso3] ──────────────────────────────────────────────────
// Renvoie les subdivisions administratives de niveau 1 (régions/états) d'un pays,
// via geoBoundaries (gbOpen). Réponse : FeatureCollection allégée avec, par
// feature, { name, key: "ISO3:Nom" }.
export async function GET(_req: Request, { params }: RouteContext): Promise<Response> {
  const user = await getAuthenticatedUser()
  if (!user) return unauthorized()

  const iso3 = params.iso3?.toUpperCase()
  if (!iso3 || !/^[A-Z]{3}$/.test(iso3)) {
    return Response.json({ error: "Code pays ISO3 invalide" }, { status: 400 })
  }

  const empty = { type: "FeatureCollection", features: [] as unknown[] }

  try {
    // 1) Métadonnées geoBoundaries → URL du GeoJSON simplifié.
    const metaRes = await fetch(
      `https://www.geoboundaries.org/api/current/gbOpen/${iso3}/ADM1/`,
      { next: { revalidate: 60 * 60 * 24 * 30 } }
    )
    if (!metaRes.ok) return Response.json(empty, { headers: { "Cache-Control": "public, max-age=86400" } })

    const metaRaw: unknown = await metaRes.json()
    const meta = Array.isArray(metaRaw) ? metaRaw[0] : metaRaw
    const url =
      (meta as { simplifiedGeometryGeoJSON?: string; gjDownloadURL?: string })?.simplifiedGeometryGeoJSON ??
      (meta as { gjDownloadURL?: string })?.gjDownloadURL
    if (!url) return Response.json(empty, { headers: { "Cache-Control": "public, max-age=86400" } })

    // 2) GeoJSON réel (github raw résout le pointeur Git LFS côté serveur).
    const geoRes = await fetch(url, { next: { revalidate: 60 * 60 * 24 * 30 } })
    if (!geoRes.ok) return Response.json(empty, { headers: { "Cache-Control": "public, max-age=86400" } })

    const fc = await geoRes.json() as {
      features?: Array<{ properties?: Record<string, unknown>; geometry?: unknown }>
    }

    const features = (fc.features ?? []).map((f) => {
      const name = String(f.properties?.shapeName ?? "")
      return {
        type: "Feature" as const,
        properties: { name, key: `${iso3}:${name}` },
        geometry: f.geometry ? { ...(f.geometry as object), coordinates: roundCoords((f.geometry as { coordinates?: unknown }).coordinates) } : null,
      }
    })

    return Response.json(
      { type: "FeatureCollection", features },
      { headers: { "Cache-Control": "public, max-age=86400" } }
    )
  } catch {
    return Response.json(empty, { headers: { "Cache-Control": "public, max-age=3600" } })
  }
}
