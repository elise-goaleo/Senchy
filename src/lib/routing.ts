import type { GeoJSON } from "geojson"

export interface RouteResult {
  geojson:     GeoJSON.FeatureCollection
  distanceM:   number
  durationMin: number
}

/**
 * Get the actual driving route (following roads) between two points via the
 * public OSRM server. Returns null on any failure so callers can fall back to
 * a straight line.
 */
export async function routeDriving(
  from: { lat: number; lon: number },
  to:   { lat: number; lon: number }
): Promise<RouteResult | null> {
  try {
    const coords = `${from.lon},${from.lat};${to.lon},${to.lat}`
    const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`
    const res = await fetch(url, {
      headers: { "User-Agent": "Senchy/1.0 (contact@senchy.app)" },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null

    const data = await res.json() as {
      code: string
      routes?: Array<{
        geometry: GeoJSON.LineString
        distance: number   // meters
        duration: number   // seconds
      }>
    }

    const route = data.code === "Ok" ? data.routes?.[0] : undefined
    if (!route) return null

    return {
      geojson: {
        type: "FeatureCollection",
        features: [{ type: "Feature", properties: {}, geometry: route.geometry }],
      },
      distanceM:   Math.round(route.distance),
      durationMin: Math.round(route.duration / 60),
    }
  } catch {
    return null
  }
}
