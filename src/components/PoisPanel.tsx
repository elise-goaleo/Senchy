"use client"

import { useState } from "react"
import { Trash2, Plus, Download, MapPin, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"

interface Poi {
  id: string
  category: string
  name: string | null
  lat: number
  lon: number
  notes: string | null
}

interface OsmCandidate {
  osmId: number
  name: string | undefined
  category: string
  lat: number
  lon: number
}

interface PoisPanelProps {
  tripId: string
  initialPois: Poi[]
}

const CATEGORY_ICONS: Record<string, string> = {
  supermarket: "🛒",
  toilet: "🚻",
  sight: "🏛️",
  custom: "📍",
  restaurant: "🍽️",
  cafe: "☕",
  hotel: "🏨",
  hospital: "🏥",
  pharmacy: "💊",
  bicycle_shop: "🚲",
  water: "💧",
  camp: "⛺",
}

const OSM_CATEGORIES = ["supermarket", "toilet", "sight", "water", "camp", "bicycle_shop"]

export function PoisPanel({ tripId, initialPois }: PoisPanelProps) {
  const [pois, setPois] = useState<Poi[]>(initialPois)
  const [osmCandidates, setOsmCandidates] = useState<OsmCandidate[]>([])
  const [loadingOsm, setLoadingOsm] = useState(false)
  const [osmError, setOsmError] = useState<string | null>(null)
  const [savingOsmId, setSavingOsmId] = useState<number | null>(null)
  const [showManualForm, setShowManualForm] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Manual form state
  const [manualName, setManualName] = useState("")
  const [manualCategory, setManualCategory] = useState("custom")
  const [manualLat, setManualLat] = useState("")
  const [manualLon, setManualLon] = useState("")
  const [manualNotes, setManualNotes] = useState("")
  const [savingManual, setSavingManual] = useState(false)

  async function deletePoi(poiId: string) {
    setDeletingId(poiId)
    try {
      const res = await fetch(`/api/pois/${poiId}`, { method: "DELETE" })
      if (res.ok) {
        setPois((prev) => prev.filter((p) => p.id !== poiId))
      }
    } finally {
      setDeletingId(null)
    }
  }

  async function loadFromOsm() {
    setLoadingOsm(true)
    setOsmError(null)
    setOsmCandidates([])
    try {
      const cats = OSM_CATEGORIES.join(",")
      const res = await fetch(`/api/overpass?tripId=${tripId}&categories=${cats}`)
      if (!res.ok) {
        const d = await res.json()
        setOsmError(d.error ?? "Erreur lors du chargement des POIs OSM")
        return
      }
      const data = await res.json()
      setOsmCandidates(data.pois ?? [])
    } catch {
      setOsmError("Impossible de contacter le serveur Overpass")
    } finally {
      setLoadingOsm(false)
    }
  }

  async function saveOsmPoi(candidate: OsmCandidate) {
    setSavingOsmId(candidate.osmId)
    try {
      const res = await fetch("/api/pois", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripId,
          category: candidate.category as "supermarket" | "toilet" | "sight" | "custom",
          name: candidate.name,
          lat: candidate.lat,
          lon: candidate.lon,
          osmId: candidate.osmId,
        }),
      })
      if (res.ok) {
        const newPoi = await res.json()
        setPois((prev) => [...prev, newPoi])
        setOsmCandidates((prev) => prev.filter((c) => c.osmId !== candidate.osmId))
      }
    } finally {
      setSavingOsmId(null)
    }
  }

  async function saveManualPoi(e: React.FormEvent) {
    e.preventDefault()
    if (!manualLat || !manualLon) return
    setSavingManual(true)
    try {
      const res = await fetch("/api/pois", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripId,
          category: manualCategory as "supermarket" | "toilet" | "sight" | "custom",
          name: manualName || undefined,
          lat: parseFloat(manualLat),
          lon: parseFloat(manualLon),
          notes: manualNotes || undefined,
        }),
      })
      if (res.ok) {
        const newPoi = await res.json()
        setPois((prev) => [...prev, newPoi])
        setManualName("")
        setManualCategory("custom")
        setManualLat("")
        setManualLon("")
        setManualNotes("")
        setShowManualForm(false)
      }
    } finally {
      setSavingManual(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Existing POIs */}
      {pois.length > 0 && (
        <ul className="space-y-2">
          {pois.map((poi) => (
            <li
              key={poi.id}
              className="flex items-center gap-2 bg-white rounded-lg border border-slate-200 px-3 py-2"
            >
              <span className="text-base" role="img">
                {CATEGORY_ICONS[poi.category] ?? "📍"}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">
                  {poi.name ?? poi.category}
                </p>
                <p className="text-xs text-slate-400 capitalize">{poi.category}</p>
              </div>
              <button
                onClick={() => deletePoi(poi.id)}
                disabled={deletingId === poi.id}
                className="text-slate-400 hover:text-red-500 transition-colors disabled:opacity-50"
                aria-label="Supprimer"
              >
                {deletingId === poi.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {pois.length === 0 && (
        <p className="text-sm text-slate-400 italic">Aucun point d&apos;intérêt</p>
      )}

      {/* Actions */}
      <div className="flex gap-2 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          onClick={loadFromOsm}
          isLoading={loadingOsm}
          className="gap-2"
        >
          <Download className="h-3.5 w-3.5" />
          Charger depuis OSM
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowManualForm((v) => !v)}
          className="gap-2"
        >
          <Plus className="h-3.5 w-3.5" />
          Ajouter manuellement
        </Button>
      </div>

      {osmError && (
        <p className="text-xs text-red-600">{osmError}</p>
      )}

      {/* OSM candidates */}
      {osmCandidates.length > 0 && (
        <div>
          <p className="text-xs text-slate-500 mb-2">
            {osmCandidates.length} POI{osmCandidates.length > 1 ? "s" : ""} trouvé
            {osmCandidates.length > 1 ? "s" : ""} — cliquez pour sauvegarder
          </p>
          <ul className="space-y-1.5 max-h-60 overflow-y-auto">
            {osmCandidates.map((c) => (
              <li key={c.osmId}>
                <button
                  onClick={() => saveOsmPoi(c)}
                  disabled={savingOsmId === c.osmId}
                  className="w-full flex items-center gap-2 text-left bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 rounded-lg px-3 py-2 transition-colors"
                >
                  <span>{CATEGORY_ICONS[c.category] ?? "📍"}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {c.name ?? c.category}
                    </p>
                    <p className="text-xs text-slate-400 capitalize">{c.category}</p>
                  </div>
                  {savingOsmId === c.osmId ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-500 shrink-0" />
                  ) : (
                    <Plus className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Manual form */}
      {showManualForm && (
        <form onSubmit={saveManualPoi} className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-3">
          <p className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <MapPin className="h-4 w-4 text-emerald-600" />
            Nouveau POI
          </p>

          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2 space-y-1">
              <Label htmlFor="poi-name" className="text-xs">Nom (optionnel)</Label>
              <Input
                id="poi-name"
                placeholder="Nom du lieu"
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                className="h-8 text-sm"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="poi-category" className="text-xs">Catégorie</Label>
              <select
                id="poi-category"
                value={manualCategory}
                onChange={(e) => setManualCategory(e.target.value)}
                className="flex h-8 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="custom">Personnalisé</option>
                <option value="supermarket">Supermarché</option>
                <option value="toilet">Toilettes</option>
                <option value="sight">Curiosité</option>
              </select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="poi-lat" className="text-xs">Latitude</Label>
              <Input
                id="poi-lat"
                placeholder="48.8566"
                value={manualLat}
                onChange={(e) => setManualLat(e.target.value)}
                required
                className="h-8 text-sm"
              />
            </div>

            <div className="col-span-2 space-y-1">
              <Label htmlFor="poi-lon" className="text-xs">Longitude</Label>
              <Input
                id="poi-lon"
                placeholder="2.3522"
                value={manualLon}
                onChange={(e) => setManualLon(e.target.value)}
                required
                className="h-8 text-sm"
              />
            </div>

            <div className="col-span-2 space-y-1">
              <Label htmlFor="poi-notes" className="text-xs">Notes (optionnel)</Label>
              <Input
                id="poi-notes"
                placeholder="Notes..."
                value={manualNotes}
                onChange={(e) => setManualNotes(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowManualForm(false)}
            >
              Annuler
            </Button>
            <Button
              type="submit"
              size="sm"
              isLoading={savingManual}
              disabled={!manualLat || !manualLon}
            >
              Ajouter
            </Button>
          </div>
        </form>
      )}

      {/* Category legend */}
      {pois.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {Array.from(new Set(pois.map((p) => p.category))).map((cat) => (
            <Badge key={cat} variant="outline" className="text-xs gap-1">
              {CATEGORY_ICONS[cat] ?? "📍"}
              <span className="capitalize">{cat}</span>
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}
