import { getAuthenticatedUser, unauthorized } from "@/lib/api-auth"

const OSM_PREFIX: Record<string, string> = { node: "N", way: "W", relation: "R" }

interface OverpassEl {
  type?: string
  id?: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

// ─── GET /api/parks/inview?bbox=s,w,n,e ───────────────────────────────────────
// Parcs / aires protégées présents dans la zone visible (centres + noms, léger),
// via Overpass. Sert à afficher des points cliquables sur la carte.
export async function GET(req: Request): Promise<Response> {
  const user = await getAuthenticatedUser()
  if (!user) return unauthorized()

  const bbox = new URL(req.url).searchParams.get("bbox")?.trim()
  if (!bbox) return Response.json([])
  const parts = bbox.split(",").map(Number)
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return Response.json([])
  const [s, w, n, e] = parts
  // Garde-fou : on refuse une zone trop vaste (évite des requêtes Overpass lourdes).
  if ((n - s) * (e - w) > 40 || n <= s || e <= w) return Response.json([])

  const query = `[out:json][timeout:25];(
    relation["boundary"="national_park"](${s},${w},${n},${e});
    relation["boundary"="protected_area"](${s},${w},${n},${e});
    relation["leisure"="nature_reserve"](${s},${w},${n},${e});
    way["leisure"="nature_reserve"](${s},${w},${n},${e});
  );out center tags;`

  try {
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "Senchy/1.0 (contact@senchy.app)" },
      body: "data=" + encodeURIComponent(query),
    })
    if (!res.ok) return Response.json([])

    const data = (await res.json()) as { elements?: OverpassEl[] }
    const seen = new Set<string>()
    const out: Array<{ osm: string; name: string; lat: number; lon: number; kind: string }> = []

    for (const el of data.elements ?? []) {
      const name = el.tags?.name
      const lat = el.center?.lat ?? el.lat
      const lon = el.center?.lon ?? el.lon
      const prefix = OSM_PREFIX[el.type ?? ""] ?? ""
      if (!name || lat == null || lon == null || !prefix || el.id == null) continue
      const osm = `${prefix}${el.id}`
      if (seen.has(osm)) continue
      seen.add(osm)
      out.push({ osm, name, lat, lon, kind: el.tags?.boundary ?? el.tags?.leisure ?? "" })
      if (out.length >= 200) break
    }

    return Response.json(out, { headers: { "Cache-Control": "public, max-age=3600" } })
  } catch {
    return Response.json([])
  }
}
