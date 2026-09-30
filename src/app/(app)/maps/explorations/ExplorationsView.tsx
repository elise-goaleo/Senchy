"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Compass, Globe2, MapPin, X, Search } from "lucide-react"
import { DynamicExplorationsMap } from "@/components/map/DynamicExplorationsMap"
import { MapLayerPicker } from "@/components/map/MapLayerPicker"
import { AddressAutocomplete, type AddressCoords } from "@/components/AddressAutocomplete"
import { useMapLayer } from "@/hooks/useMapLayer"
import type { ExplorationsData } from "@/lib/ridesMap"
import { cn } from "@/lib/utils"

type City = ExplorationsData["cities"][number]
type Country = { code: string; name: string }

export function ExplorationsView({ initial }: { initial: ExplorationsData }) {
  const { layer, setLayer, layers } = useMapLayer()

  const [countries, setCountries] = useState<string[]>(initial.countries)
  const [cities, setCities]       = useState<City[]>(initial.cities)
  const [countryList, setCountryList] = useState<Country[]>([])

  const [countryQuery, setCountryQuery] = useState("")
  const [cityInput, setCityInput]       = useState("")
  const [saveState, setSaveState]       = useState<"idle" | "saving" | "saved" | "error">("idle")

  const nameByCode = useMemo(() => {
    const m = new Map<string, string>()
    countryList.forEach((c) => m.set(c.code, c.name))
    return m
  }, [countryList])

  const onCountriesLoaded = useCallback((list: Country[]) => setCountryList(list), [])

  const toggleCountry = useCallback((code: string) => {
    setCountries((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]))
  }, [])

  // ── Sauvegarde automatique (débounce) ────────────────────────────────────────
  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return }
    setSaveState("saving")
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/explorations", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ countries, cities }),
        })
        setSaveState(res.ok ? "saved" : "error")
      } catch {
        setSaveState("error")
      }
    }, 700)
    return () => clearTimeout(t)
  }, [countries, cities])

  // ── Ajout de ville depuis l'autocomplétion d'adresse ─────────────────────────
  function handleCityPick(value: string, coords: AddressCoords | null) {
    setCityInput(value)
    if (coords) {
      const name = value.split(",")[0]?.trim() || value.trim()
      setCities((prev) =>
        prev.some((c) => c.name === name && c.lat === coords.lat && c.lon === coords.lon)
          ? prev
          : [...prev, { name, lat: coords.lat, lon: coords.lon }]
      )
      setCityInput("")
    }
  }

  const countryMatches = useMemo(() => {
    const q = countryQuery.trim().toLowerCase()
    if (!q) return []
    const visited = new Set(countries)
    return countryList
      .filter((c) => !visited.has(c.code) && c.name.toLowerCase().includes(q))
      .slice(0, 8)
  }, [countryQuery, countryList, countries])

  const visitedCountries = useMemo(
    () =>
      countries
        .map((code) => ({ code, name: nameByCode.get(code) ?? code }))
        .sort((a, b) => a.name.localeCompare(b.name, "fr")),
    [countries, nameByCode]
  )

  const saveLabel =
    saveState === "saving" ? "Enregistrement…"
    : saveState === "saved" ? "Enregistré"
    : saveState === "error" ? "Erreur d'enregistrement"
    : ""

  return (
    <div className="flex flex-col lg:flex-row h-full">
      {/* ── Panneau latéral ─────────────────────────────────────────── */}
      <aside className="lg:w-[380px] lg:shrink-0 lg:h-full lg:overflow-y-auto border-b lg:border-b-0 lg:border-r border-slate-200 bg-white">
        <div className="p-5 space-y-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50">
                <Compass className="h-5 w-5 text-emerald-600" />
              </div>
              <h1 className="text-xl font-bold text-slate-900">Mes explorations</h1>
            </div>
            <p className="text-sm text-slate-500">
              Cliquez un pays sur la carte pour le marquer visité, et ajoutez les villes ci-dessous.
            </p>
            {saveLabel && (
              <p className={cn("text-xs mt-1", saveState === "error" ? "text-red-600" : "text-slate-400")}>
                {saveLabel}
              </p>
            )}
          </div>

          {/* Pays */}
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <Globe2 className="h-4 w-4 text-slate-400" />
              <h2 className="text-sm font-semibold text-slate-700">
                Pays visités <span className="text-slate-400 font-normal">({visitedCountries.length})</span>
              </h2>
            </div>

            {/* Recherche / ajout de pays */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              <input
                value={countryQuery}
                onChange={(e) => setCountryQuery(e.target.value)}
                placeholder="Rechercher un pays…"
                className="w-full rounded-xl border border-slate-200 pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent"
              />
              {countryMatches.length > 0 && (
                <ul className="absolute z-[60] top-full left-0 right-0 mt-1 bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden max-h-60 overflow-y-auto">
                  {countryMatches.map((c) => (
                    <li key={c.code}>
                      <button
                        type="button"
                        onClick={() => { toggleCountry(c.code); setCountryQuery("") }}
                        className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-emerald-50 transition-colors"
                      >
                        {c.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {visitedCountries.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {visitedCountries.map((c) => (
                  <span
                    key={c.code}
                    className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 pl-2.5 pr-1 py-1 text-xs font-medium text-emerald-800"
                  >
                    {c.name}
                    <button
                      onClick={() => toggleCountry(c.code)}
                      className="flex h-4 w-4 items-center justify-center rounded-full hover:bg-emerald-200 transition-colors"
                      title="Retirer"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400">Aucun pays pour le moment.</p>
            )}
          </section>

          {/* Villes */}
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-slate-400" />
              <h2 className="text-sm font-semibold text-slate-700">
                Villes visitées <span className="text-slate-400 font-normal">({cities.length})</span>
              </h2>
            </div>

            <AddressAutocomplete
              value={cityInput}
              onChange={handleCityPick}
              placeholder="Ajouter une ville (ex : Lisbonne)…"
            />

            {cities.length > 0 ? (
              <ul className="space-y-1 pt-1">
                {cities.map((c, i) => (
                  <li
                    key={`${c.name}-${i}`}
                    className="group flex items-center gap-2 rounded-lg px-2.5 py-1.5 hover:bg-slate-50 transition-colors"
                  >
                    <MapPin className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    <span className="flex-1 min-w-0 text-sm text-slate-700 truncate">{c.name}</span>
                    <button
                      onClick={() => setCities((prev) => prev.filter((_, idx) => idx !== i))}
                      className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 hover:text-red-600 hover:bg-red-50 transition-all"
                      title="Retirer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-400">Aucune ville pour le moment.</p>
            )}
          </section>
        </div>
      </aside>

      {/* ── Carte ───────────────────────────────────────────────────── */}
      <div className="relative flex-1 min-h-[55vh] lg:min-h-0 lg:h-full">
        <div className="absolute top-3 right-3 z-[400]">
          <MapLayerPicker layers={layers} current={layer} onSelect={setLayer} />
        </div>
        <div className="absolute inset-0 z-0 [transform:translateZ(0)]">
          <DynamicExplorationsMap
            visited={countries}
            cities={cities}
            onToggleCountry={toggleCountry}
            onCountriesLoaded={onCountriesLoaded}
            tileUrl={layer.url}
            tileAttribution={layer.attribution}
            height="100%"
          />
        </div>
      </div>
    </div>
  )
}
