"use client"

import { useState, useEffect, useRef } from "react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { Loader2, MapPin } from "lucide-react"

export interface AddressCoords {
  lat: number
  lon: number
}

interface Suggestion {
  primary:   string
  secondary: string | null
  label:     string
  lat:       number
  lon:       number
}

interface Props {
  id?:          string
  value:        string
  /** Called on every change. `coords` is set only when the user picks a suggestion;
   *  it is null when the user types freely (so the backend re-geocodes the text). */
  onChange:     (value: string, coords: AddressCoords | null) => void
  placeholder?: string
  className?:   string
}

interface PhotonFeature {
  properties: {
    name?: string; housenumber?: string; street?: string; postcode?: string
    city?: string; state?: string; country?: string
  }
  geometry: { coordinates: [number, number] }
}

function toSuggestion(f: PhotonFeature): Suggestion | null {
  const p = f.properties
  const [lon, lat] = f.geometry.coordinates
  if (typeof lat !== "number" || typeof lon !== "number") return null

  const street  = [p.housenumber, p.street].filter(Boolean).join(" ").trim()
  const primary = p.name || street || p.city || p.country
  if (!primary) return null

  const parts: string[] = []
  if (street && street !== primary)  parts.push(street)
  if (p.postcode)                    parts.push(p.postcode)
  if (p.city && p.city !== primary)  parts.push(p.city)
  if (p.country)                     parts.push(p.country)
  const secondary = parts.join(", ") || null

  return {
    primary,
    secondary,
    label: secondary ? `${primary}, ${secondary}` : primary,
    lat,
    lon,
  }
}

export function AddressAutocomplete({ id, value, onChange, placeholder, className }: Props) {
  const [query,   setQuery]   = useState(value)
  const [results, setResults] = useState<Suggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [open,    setOpen]    = useState(false)
  const timerRef     = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const skipSearchRef = useRef(false)

  // Sync when parent resets the value
  useEffect(() => { setQuery(value) }, [value])

  // Debounced search
  useEffect(() => {
    // Don't re-search right after the user picked a suggestion
    if (skipSearchRef.current) { skipSearchRef.current = false; return }
    if (query.length < 3) { setResults([]); setOpen(false); return }

    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=6&lang=fr`
        const res  = await fetch(url)
        const data = await res.json() as { features: PhotonFeature[] }

        const suggestions = (data.features ?? [])
          .map(toSuggestion)
          .filter((s): s is Suggestion => s !== null)

        // Deduplicate by label
        const seen = new Set<string>()
        const unique = suggestions.filter((s) => {
          if (seen.has(s.label)) return false
          seen.add(s.label)
          return true
        })

        setResults(unique)
        setOpen(unique.length > 0)
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 300)
  }, [query])

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node))
        setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  function select(s: Suggestion) {
    skipSearchRef.current = true
    onChange(s.label, { lat: s.lat, lon: s.lon })
    setQuery(s.label)
    setResults([])
    setOpen(false)
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="relative">
        <Input
          id={id}
          value={query}
          placeholder={placeholder}
          autoComplete="off"
          className="pr-8"
          onChange={(e) => {
            setQuery(e.target.value)
            onChange(e.target.value, null)   // manual typing → no exact coords
          }}
          onFocus={() => { if (results.length > 0) setOpen(true) }}
        />
        {loading && (
          <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-slate-400 pointer-events-none" />
        )}
      </div>

      {open && results.length > 0 && (
        <ul className="absolute z-[60] top-full left-0 right-0 mt-1 bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden max-h-60 overflow-y-auto">
          {results.map((s, i) => (
            <li key={i}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); select(s) }}
                className="w-full flex items-start gap-2.5 px-3 py-2.5 hover:bg-slate-50 text-left transition-colors"
              >
                <MapPin className="h-3.5 w-3.5 text-[#8b5cf6] mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{s.primary}</p>
                  {s.secondary && (
                    <p className="text-xs text-slate-400 truncate">{s.secondary}</p>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
