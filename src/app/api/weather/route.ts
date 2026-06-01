import { db } from "@/lib/db"
import { getAuthenticatedUser, unauthorized } from "@/lib/api-auth"

const CACHE_TTL_MS = 3 * 60 * 60 * 1000 // 3 hours

// ─── Open-Meteo response shape (partial) ─────────────────────────────────────

interface OpenMeteoResponse {
  latitude: number
  longitude: number
  timezone: string
  daily: {
    time: string[]
    temperature_2m_max: number[]
    temperature_2m_min: number[]
    precipitation_sum: number[]
    precipitation_probability_max: number[]
    windspeed_10m_max: number[]
    weathercode: number[]
  }
}

// ─── GET /api/weather?lat=xx&lon=yy&date=YYYY-MM-DD ──────────────────────────

export async function GET(request: Request): Promise<Response> {
  const user = await getAuthenticatedUser()
  if (!user) return unauthorized()

  const { searchParams } = new URL(request.url)
  const latStr = searchParams.get("lat")
  const lonStr = searchParams.get("lon")
  const dateStr = searchParams.get("date")

  if (!latStr || !lonStr || !dateStr) {
    return Response.json(
      { error: "lat, lon and date query parameters are required" },
      { status: 400 }
    )
  }

  const lat = parseFloat(latStr)
  const lon = parseFloat(lonStr)

  if (isNaN(lat) || isNaN(lon)) {
    return Response.json({ error: "lat and lon must be valid numbers" }, { status: 400 })
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return Response.json(
      { error: "date must be in YYYY-MM-DD format" },
      { status: 400 }
    )
  }

  const forecastDate = new Date(dateStr)
  if (isNaN(forecastDate.getTime())) {
    return Response.json({ error: "Invalid date" }, { status: 400 })
  }

  try {
    // ── Check cache ──────────────────────────────────────────────────────────
    const cached = await db.weatherCache.findUnique({
      where: { lat_lon_forecastDate: { lat, lon, forecastDate } },
    })

    if (cached) {
      const ageMs = Date.now() - cached.fetchedAt.getTime()
      if (ageMs < CACHE_TTL_MS) {
        return Response.json(cached.payload)
      }
    }

    // ── Fetch from Open-Meteo ────────────────────────────────────────────────
    const url = new URL("https://api.open-meteo.com/v1/forecast")
    url.searchParams.set("latitude", lat.toString())
    url.searchParams.set("longitude", lon.toString())
    url.searchParams.set(
      "daily",
      "temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,windspeed_10m_max,weathercode"
    )
    url.searchParams.set("timezone", "auto")
    url.searchParams.set("forecast_days", "14")

    const res = await fetch(url.toString(), {
      next: { revalidate: 0 }, // disable Next.js cache — we manage our own
    })

    if (!res.ok) {
      return Response.json(
        { error: `Weather API returned ${res.status}` },
        { status: 502 }
      )
    }

    const payload = (await res.json()) as OpenMeteoResponse

    // ── Upsert cache ─────────────────────────────────────────────────────────
    await db.weatherCache.upsert({
      where: { lat_lon_forecastDate: { lat, lon, forecastDate } },
      create: {
        lat,
        lon,
        forecastDate,
        payload: payload as object,
        fetchedAt: new Date(),
      },
      update: {
        payload: payload as object,
        fetchedAt: new Date(),
      },
    })

    return Response.json(payload)
  } catch (error) {
    console.error("[GET /api/weather]", error)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}
