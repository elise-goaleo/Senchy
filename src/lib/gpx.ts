import { gpx as gpxToGeoJSON } from "@tmcw/togeojson"
import { DOMParser } from "@xmldom/xmldom"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GpxStats {
  distanceM: number
  elevationGainM: number
  elevationLossM: number
  elevationPoints: Array<{ distanceM: number; elevationM: number }>
  maxElevationM: number
  minElevationM: number
  startLat: number | null
  startLon: number | null
  bounds: {
    minLat: number
    maxLat: number
    minLon: number
    maxLon: number
  } | null
}

export interface GradientPoint {
  distanceM: number
  gradientPct: number
}

// ─── GPX parsing ─────────────────────────────────────────────────────────────

export function parseGpx(gpxString: string): GeoJSON.FeatureCollection {
  const parser = new DOMParser()
  const doc = parser.parseFromString(gpxString, "text/xml")
  return gpxToGeoJSON(doc as unknown as Document)
}

// ─── Haversine distance ───────────────────────────────────────────────────────

function haversineM(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6_371_000 // Earth radius in metres
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ─── Stat computation ─────────────────────────────────────────────────────────

export function computeStats(geojson: GeoJSON.FeatureCollection): GpxStats {
  // Collect all coordinate arrays from LineString / MultiLineString features
  const allCoords: number[][] = []

  for (const feature of geojson.features) {
    if (!feature.geometry) continue
    const geom = feature.geometry
    if (geom.type === "LineString") {
      allCoords.push(...geom.coordinates)
    } else if (geom.type === "MultiLineString") {
      for (const line of geom.coordinates) {
        allCoords.push(...line)
      }
    }
  }

  if (allCoords.length === 0) {
    return {
      distanceM: 0,
      elevationGainM: 0,
      elevationLossM: 0,
      elevationPoints: [],
      maxElevationM: 0,
      minElevationM: 0,
      startLat: null,
      startLon: null,
      bounds: null,
    }
  }

  let distanceM = 0
  let elevationGainM = 0
  let elevationLossM = 0
  let maxElevationM = -Infinity
  let minElevationM = Infinity

  // Raw elevation points (one per coordinate)
  const rawElevPoints: Array<{ distanceM: number; elevationM: number }> = []

  for (let i = 0; i < allCoords.length; i++) {
    const coord = allCoords[i]
    const lon = coord[0]
    const lat = coord[1]
    const ele = coord[2] ?? NaN

    if (i > 0) {
      const prev = allCoords[i - 1]
      distanceM += haversineM(prev[1], prev[0], lat, lon)

      if (!isNaN(ele) && !isNaN(prev[2] ?? NaN)) {
        const diff = ele - prev[2]
        if (diff > 0) elevationGainM += diff
        else elevationLossM += Math.abs(diff)
      }
    }

    if (!isNaN(ele)) {
      if (ele > maxElevationM) maxElevationM = ele
      if (ele < minElevationM) minElevationM = ele
      rawElevPoints.push({ distanceM, elevationM: ele })
    }
  }

  // Bounds
  const lats = allCoords.map((c) => c[1])
  const lons = allCoords.map((c) => c[0])
  const bounds = {
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
    minLon: Math.min(...lons),
    maxLon: Math.max(...lons),
  }

  // Downsample elevation points to max 500
  const MAX_POINTS = 500
  let elevationPoints: Array<{ distanceM: number; elevationM: number }>
  if (rawElevPoints.length <= MAX_POINTS) {
    elevationPoints = rawElevPoints
  } else {
    const step = (rawElevPoints.length - 1) / (MAX_POINTS - 1)
    elevationPoints = Array.from({ length: MAX_POINTS }, (_, i) => {
      const idx = Math.round(i * step)
      return rawElevPoints[Math.min(idx, rawElevPoints.length - 1)]
    })
  }

  const first = allCoords[0]

  return {
    distanceM,
    elevationGainM,
    elevationLossM,
    elevationPoints,
    maxElevationM: isFinite(maxElevationM) ? maxElevationM : 0,
    minElevationM: isFinite(minElevationM) ? minElevationM : 0,
    startLat: first[1] ?? null,
    startLon: first[0] ?? null,
    bounds,
  }
}

// ─── Travel time estimate ─────────────────────────────────────────────────────

export function estimateTravelTime(distanceM: number, paceKmh: number): string {
  if (paceKmh <= 0) return "0min"
  const totalMinutes = Math.round((distanceM / 1000 / paceKmh) * 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes}min`
  if (minutes === 0) return `${hours}h`
  return `${hours}h ${minutes}min`
}

// ─── Gradient computation ─────────────────────────────────────────────────────

export function computeGradients(
  geojson: GeoJSON.FeatureCollection
): GradientPoint[] {
  const allCoords: number[][] = []

  for (const feature of geojson.features) {
    if (!feature.geometry) continue
    const geom = feature.geometry
    if (geom.type === "LineString") {
      allCoords.push(...geom.coordinates)
    } else if (geom.type === "MultiLineString") {
      for (const line of geom.coordinates) {
        allCoords.push(...line)
      }
    }
  }

  if (allCoords.length < 2) return []

  const gradients: GradientPoint[] = []
  let cumulativeDistanceM = 0

  for (let i = 1; i < allCoords.length; i++) {
    const prev = allCoords[i - 1]
    const curr = allCoords[i]
    const segDistM = haversineM(prev[1], prev[0], curr[1], curr[0])
    cumulativeDistanceM += segDistM

    const prevEle = prev[2]
    const currEle = curr[2]

    if (
      segDistM > 0 &&
      prevEle !== undefined &&
      currEle !== undefined &&
      !isNaN(prevEle) &&
      !isNaN(currEle)
    ) {
      const elevDiff = currEle - prevEle
      const gradientPct = (elevDiff / segDistM) * 100
      gradients.push({ distanceM: cumulativeDistanceM, gradientPct })
    }
  }

  return gradients
}
