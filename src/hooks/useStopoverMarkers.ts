"use client"

import { useEffect, useRef, useState } from "react"
import type { Stopover } from "@/components/StopoversPanel"

export interface StopoverMarker {
  id:       string
  lat:      number
  lon:      number
  name:     string | null
  place:    string | null
  date:     string
  platform: "booking" | "airbnb" | null
  link:     string | null
}

async function geocodePlace(query: string): Promise<{ lat: number; lon: number } | null> {
  try {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=1&lang=fr`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json() as { features?: Array<{ geometry: { coordinates: [number, number] } }> }
    const f = data.features?.[0]
    if (!f) return null
    const [lon, lat] = f.geometry.coordinates
    if (typeof lat !== "number" || typeof lon !== "number") return null
    return { lat, lon }
  } catch {
    return null
  }
}

/**
 * Geocodes each stopover's address (`place`) so the nights can be shown on the map.
 * Results are cached by address string to avoid re-geocoding on every change.
 */
export function useStopoverMarkers(stopovers: Stopover[]): StopoverMarker[] {
  const cache = useRef<Map<string, { lat: number; lon: number } | null>>(new Map())
  const [markers, setMarkers] = useState<StopoverMarker[]>([])

  useEffect(() => {
    let cancelled = false

    async function run() {
      const results = await Promise.all(
        stopovers.map(async (s): Promise<StopoverMarker | null> => {
          const q = s.place?.trim()
          if (!q) return null
          let coords = cache.current.get(q)
          if (coords === undefined) {
            coords = await geocodePlace(q)
            cache.current.set(q, coords)
          }
          if (!coords) return null
          return { id: s.id, lat: coords.lat, lon: coords.lon, name: s.name, place: s.place, date: s.date, platform: s.platform, link: s.link }
        })
      )
      if (!cancelled) setMarkers(results.filter((m): m is StopoverMarker => m !== null))
    }

    run()
    return () => { cancelled = true }
  }, [stopovers])

  return markers
}
