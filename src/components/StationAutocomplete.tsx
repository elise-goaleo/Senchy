"use client"

import { useState, useEffect, useRef } from "react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { Loader2, TrainFront } from "lucide-react"

interface Station {
  name:  string
  city:  string | null
  country: string | null
  label: string
}

interface Props {
  id?:         string
  value:       string
  onChange:    (value: string) => void
  placeholder?: string
  className?:  string
}

export function StationAutocomplete({ id, value, onChange, placeholder, className }: Props) {
  const [query,   setQuery]   = useState(value)
  const [results, setResults] = useState<Station[]>([])
  const [loading, setLoading] = useState(false)
  const [open,    setOpen]    = useState(false)
  const timerRef    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Sync when parent resets the value
  useEffect(() => { setQuery(value) }, [value])

  // Debounced search
  useEffect(() => {
    if (query.length < 2) { setResults([]); setOpen(false); return }

    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&osm_tag=railway:station&limit=8&lang=fr`
        const res  = await fetch(url)
        const data = await res.json() as { features: Array<{
          properties: { name?: string; city?: string; state?: string; country?: string }
          geometry:   { coordinates: [number, number] }
        }> }

        const stations: Station[] = (data.features ?? [])
          .filter((f) => f.properties.name)
          .map((f) => {
            const p = f.properties
            const parts: string[] = []
            if (p.city    && p.city    !== p.name) parts.push(p.city)
            if (p.country)                         parts.push(p.country)
            return {
              name:    p.name!,
              city:    p.city    ?? null,
              country: p.country ?? null,
              label:   parts.length ? `${p.name}, ${parts.join(", ")}` : p.name!,
            }
          })

        // Deduplicate by label
        const seen = new Set<string>()
        const unique = stations.filter((s) => {
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
    }, 280)
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

  function select(station: Station) {
    onChange(station.label)
    setQuery(station.label)
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
            onChange(e.target.value)
          }}
          onFocus={() => { if (results.length > 0) setOpen(true) }}
        />
        {loading && (
          <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-slate-400 pointer-events-none" />
        )}
      </div>

      {open && results.length > 0 && (
        <ul className="absolute z-[60] top-full left-0 right-0 mt-1 bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden max-h-60 overflow-y-auto">
          {results.map((station, i) => (
            <li key={i}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); select(station) }}
                className="w-full flex items-start gap-2.5 px-3 py-2.5 hover:bg-slate-50 text-left transition-colors"
              >
                <TrainFront className="h-3.5 w-3.5 text-blue-400 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{station.name}</p>
                  {(station.city || station.country) && (
                    <p className="text-xs text-slate-400 truncate">
                      {[station.city, station.country].filter(Boolean).join(", ")}
                    </p>
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
