"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import {
  Compass, Globe2, MapPin, X, Search, Loader2, Map as MapIcon,
  PanelLeftClose, PanelLeftOpen,
} from "lucide-react"
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
  const [regions, setRegions]     = useState<string[]>(initial.regions)
  const [cities, setCities]       = useState<City[]>(initial.cities)
  const [countryList, setCountryList] = useState<Country[]>([])

  const [mode, setMode]                 = useState<"pays" | "regions">("pays")
  const [regionsLoading, setRegionsLoading] = useState(false)
  const [countryQuery, setCountryQuery] = useState("")
  const [cityInput, setCityInput]       = useState("")
  const [saveState, setSaveState]       = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [panelOpen, setPanelOpen]       = useState(true)
  const [openModal, setOpenModal]       = useState<null | "countries" | "regions" | "cities">(null)

  const nameByCode = useMemo(() => {
    const m = new Map<string, string>()
    countryList.forEach((c) => m.set(c.code, c.name))
    return m
  }, [countryList])

  const onCountriesLoaded = useCallback((list: Country[]) => setCountryList(list), [])
  const onRegionsLoading = useCallback((loading: boolean) => setRegionsLoading(loading), [])

  const toggleCountry = useCallback((code: string) => {
    setCountries((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]))
    // Retirer un pays efface aussi ses régions sélectionnées (cohérence).
    setRegions((rs) => rs.filter((k) => !k.startsWith(code + ":")))
  }, [])

  const toggleRegion = useCallback((key: string) => {
    if (!key) return
    setRegions((prev) => (prev.includes(key) ? prev.filter((r) => r !== key) : [...prev, key]))
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
          body: JSON.stringify({ countries, regions, cities }),
        })
        setSaveState(res.ok ? "saved" : "error")
      } catch {
        setSaveState("error")
      }
    }, 700)
    return () => clearTimeout(t)
  }, [countries, regions, cities])

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

  const visitedRegions = useMemo(
    () =>
      regions
        .map((key) => {
          const idx = key.indexOf(":")
          const iso = idx >= 0 ? key.slice(0, idx) : key
          const name = idx >= 0 ? key.slice(idx + 1) : key
          return { key, name, country: nameByCode.get(iso) ?? iso }
        })
        .sort((a, b) => a.country.localeCompare(b.country, "fr") || a.name.localeCompare(b.name, "fr")),
    [regions, nameByCode]
  )

  const saveLabel =
    saveState === "saving" ? "Enregistrement…"
    : saveState === "saved" ? "Enregistré"
    : saveState === "error" ? "Erreur d'enregistrement"
    : ""

  return (
    <div className="flex flex-col lg:flex-row h-full">
      {/* ── Panneau latéral (repliable) ─────────────────────────────── */}
      {panelOpen && (
      <aside className="lg:w-[380px] lg:shrink-0 lg:h-full lg:overflow-y-auto border-b lg:border-b-0 lg:border-r border-slate-200 bg-white">
        <div className="p-5 space-y-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50">
                <Compass className="h-5 w-5 text-emerald-600" />
              </div>
              <h1 className="text-xl font-bold text-slate-900 flex-1">Mes explorations</h1>
              <button
                onClick={() => setPanelOpen(false)}
                title="Replier le panneau"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm text-slate-500">
              {mode === "pays"
                ? "Cliquez un pays sur la carte pour le marquer visité, et ajoutez les villes ci-dessous."
                : "Cliquez une région d'un pays visité pour la marquer. Passez en mode Pays pour ajouter un pays."}
            </p>
            {saveLabel && (
              <p className={cn("text-xs mt-1", saveState === "error" ? "text-red-600" : "text-slate-400")}>
                {saveLabel}
              </p>
            )}

            {/* Bascule Pays / Régions */}
            <div className="mt-3 inline-flex rounded-xl border border-slate-200 bg-slate-50 p-0.5">
              {(["pays", "regions"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors",
                    mode === m ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  )}
                >
                  {m === "pays" ? "Pays" : "Régions"}
                </button>
              ))}
              {mode === "regions" && regionsLoading && (
                <span className="flex items-center px-2 text-slate-400"><Loader2 className="h-3.5 w-3.5 animate-spin" /></span>
              )}
            </div>
          </div>

          {/* Pays */}
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <Globe2 className="h-4 w-4 text-slate-400" />
              <h2 className="text-sm font-semibold text-slate-700 flex-1">
                Pays visités <span className="text-slate-400 font-normal">({visitedCountries.length})</span>
              </h2>
              {visitedCountries.length > 0 && (
                <button
                  onClick={() => setOpenModal("countries")}
                  className="text-xs font-semibold text-emerald-700 hover:text-emerald-800"
                >
                  Voir tout
                </button>
              )}
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

            {visitedCountries.length === 0 && (
              <p className="text-xs text-slate-400">Aucun pays pour le moment.</p>
            )}
          </section>

          {/* Régions */}
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <MapIcon className="h-4 w-4 text-slate-400" />
              <h2 className="text-sm font-semibold text-slate-700 flex-1">
                Régions visitées <span className="text-slate-400 font-normal">({visitedRegions.length})</span>
              </h2>
              {visitedRegions.length > 0 && (
                <button
                  onClick={() => setOpenModal("regions")}
                  className="text-xs font-semibold text-emerald-700 hover:text-emerald-800"
                >
                  Voir tout
                </button>
              )}
            </div>

            <p className="text-xs text-slate-400">
              {countries.length === 0
                ? "Ajoutez d'abord un pays, puis passez en mode Régions pour cliquer ses régions."
                : mode === "regions"
                ? "Cliquez une région sur la carte pour l'ajouter ou la retirer."
                : "Passez en mode Régions pour cliquer les régions des pays visités."}
            </p>

            {visitedRegions.length === 0 && (
              <p className="text-xs text-slate-400">Aucune région pour le moment.</p>
            )}
          </section>

          {/* Villes */}
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-slate-400" />
              <h2 className="text-sm font-semibold text-slate-700 flex-1">
                Villes visitées <span className="text-slate-400 font-normal">({cities.length})</span>
              </h2>
              {cities.length > 0 && (
                <button
                  onClick={() => setOpenModal("cities")}
                  className="text-xs font-semibold text-emerald-700 hover:text-emerald-800"
                >
                  Voir tout
                </button>
              )}
            </div>

            <AddressAutocomplete
              value={cityInput}
              onChange={handleCityPick}
              placeholder="Ajouter une ville (ex : Lisbonne)…"
            />

            {cities.length === 0 && (
              <p className="text-xs text-slate-400">Aucune ville pour le moment.</p>
            )}
          </section>
        </div>
      </aside>
      )}

      {/* ── Carte ───────────────────────────────────────────────────── */}
      <div className="relative flex-1 min-h-[55vh] lg:min-h-0 lg:h-full">
        {/* Rouvrir le panneau quand il est replié */}
        {!panelOpen && (
          <button
            onClick={() => setPanelOpen(true)}
            title="Afficher le panneau"
            className="absolute top-3 left-3 z-[500] flex h-9 items-center gap-1.5 rounded-lg bg-white px-2.5 text-sm font-medium text-slate-600 shadow border border-slate-200 hover:text-slate-900"
          >
            <PanelLeftOpen className="h-4 w-4" />
            Ajouter une zone
          </button>
        )}
        <div className="absolute top-3 right-3 z-[400]">
          <MapLayerPicker layers={layers} current={layer} onSelect={setLayer} />
        </div>
        <div className="absolute inset-0 z-0 [transform:translateZ(0)]">
          <DynamicExplorationsMap
            visited={countries}
            cities={cities}
            mode={mode}
            regions={regions}
            onToggleCountry={toggleCountry}
            onToggleRegion={toggleRegion}
            onCountriesLoaded={onCountriesLoaded}
            onRegionsLoading={onRegionsLoading}
            tileUrl={layer.url}
            tileAttribution={layer.attribution}
            height="100%"
          />
        </div>
      </div>

      {/* ── Modale « Voir tout » ─────────────────────────────────────── */}
      {openModal === "countries" && (
        <ListModal
          title="Pays visités"
          items={visitedCountries.map((c) => ({ key: c.code, primary: c.name }))}
          onRemove={(k) => toggleCountry(k)}
          onClose={() => setOpenModal(null)}
        />
      )}
      {openModal === "regions" && (
        <ListModal
          title="Régions visitées"
          items={visitedRegions.map((r) => ({ key: r.key, primary: r.name, secondary: r.country }))}
          onRemove={(k) => toggleRegion(k)}
          onClose={() => setOpenModal(null)}
        />
      )}
      {openModal === "cities" && (
        <ListModal
          title="Villes visitées"
          items={cities.map((c, i) => ({ key: String(i), primary: c.name }))}
          onRemove={(k) => setCities((prev) => prev.filter((_, idx) => idx !== Number(k)))}
          onClose={() => setOpenModal(null)}
        />
      )}
    </div>
  )
}

// ── Modale listant tous les éléments d'une catégorie ──────────────────────────

function ListModal({
  title, items, onRemove, onClose,
}: {
  title:    string
  items:    Array<{ key: string; primary: string; secondary?: string }>
  onRemove: (key: string) => void
  onClose:  () => void
}) {
  const [q, setQ] = useState("")
  const [mounted, setMounted] = useState(false)
  const portalRef = useRef<HTMLElement | null>(null)

  useEffect(() => { portalRef.current = document.body; setMounted(true) }, [])
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", h)
    document.body.style.overflow = "hidden"
    return () => { window.removeEventListener("keydown", h); document.body.style.overflow = "" }
  }, [onClose])

  const filtered = items.filter((it) =>
    (it.primary + " " + (it.secondary ?? "")).toLowerCase().includes(q.trim().toLowerCase())
  )

  const overlay = (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900">
            {title} <span className="text-slate-400 font-normal">({items.length})</span>
          </h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Recherche */}
        {items.length > 8 && (
          <div className="px-5 pt-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Filtrer…"
                className="w-full rounded-xl border border-slate-200 pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent"
              />
            </div>
          </div>
        )}

        {/* Liste */}
        <ul className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
          {filtered.map((it) => (
            <li
              key={it.key}
              className="group flex items-center gap-2 rounded-lg px-2.5 py-2 hover:bg-slate-50 transition-colors"
            >
              <span className="flex-1 min-w-0">
                <span className="text-sm text-slate-800">{it.primary}</span>
                {it.secondary && <span className="text-xs text-slate-400 ml-1.5">· {it.secondary}</span>}
              </span>
              <button
                onClick={() => onRemove(it.key)}
                className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                title="Retirer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="px-2.5 py-6 text-center text-sm text-slate-400">Aucun résultat.</li>
          )}
        </ul>
      </div>
    </div>
  )

  return mounted && portalRef.current ? createPortal(overlay, portalRef.current) : null
}
