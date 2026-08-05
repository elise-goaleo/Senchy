"use client"

import { useCallback, useState } from "react"
import { useRouter } from "next/navigation"
import { useDropzone } from "react-dropzone"
import type { FeatureCollection } from "geojson"
import { Upload, AlertCircle, Loader2, Link2 } from "lucide-react"
import { parseGpx } from "@/lib/gpx"
import { fetchKomootRoute } from "@/lib/komoot"
import { setQuickTrip } from "@/lib/quickTripStore"
import { cn } from "@/lib/utils"

// Le fichier contient-il un tracé exploitable ?
function hasTrack(fc: FeatureCollection): boolean {
  for (const f of fc.features ?? []) {
    const g = f.geometry
    if (!g) continue
    if (g.type === "LineString" && g.coordinates.length >= 2) return true
    if (g.type === "MultiLineString" && g.coordinates.some((l) => l.length >= 2)) return true
  }
  return false
}

export function QuickTripImport() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState<null | "gpx" | "komoot">(null)
  const [komootUrl, setKomootUrl] = useState("")

  // Bascule vers la page carte avec le tracé importé.
  const handoff = useCallback(
    (name: string, fc: FeatureCollection) => {
      setQuickTrip({ name, fc })
      router.push("/quick-trip")
    },
    [router]
  )

  const onDrop = useCallback(
    async (files: File[]) => {
      const file = files[0]
      if (!file) return
      setError(null)
      setLoading("gpx")
      try {
        const text = await file.text()
        const fc = parseGpx(text)
        if (!hasTrack(fc)) {
          setError("Ce fichier GPX ne contient pas de tracé exploitable.")
          setLoading(null)
          return
        }
        handoff(file.name, fc)
      } catch {
        setError("Fichier GPX invalide ou illisible.")
        setLoading(null)
      }
    },
    [handoff]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/gpx+xml": [".gpx"], "text/xml": [".gpx"] },
    maxFiles: 1,
    multiple: false,
    disabled: loading !== null,
  })

  const loadKomoot = useCallback(async () => {
    const url = komootUrl.trim()
    if (!url) return
    setError(null)
    setLoading("komoot")
    try {
      const { geojson, name } = await fetchKomootRoute(url)
      handoff(name, geojson)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible de charger ce tour Komoot")
      setLoading(null)
    }
  }, [komootUrl, handoff])

  const busy = loading !== null

  return (
    <div className="max-w-xl">
      {/* Import GPX */}
      <div
        {...getRootProps()}
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-4 sm:py-8 text-center transition-colors",
          busy ? "cursor-wait opacity-70" : "cursor-pointer",
          isDragActive
            ? "border-[#D15F36] bg-[#D15F36]/5"
            : "border-slate-300 hover:border-slate-400 bg-slate-50/50"
        )}
      >
        <input {...getInputProps()} />
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white border border-slate-200">
          {loading === "gpx" ? (
            <Loader2 className="h-5 w-5 text-[#D15F36] animate-spin" />
          ) : (
            <Upload className="h-5 w-5 text-slate-400" />
          )}
        </div>
        <p className="text-sm font-medium text-slate-700">
          {loading === "gpx"
            ? "Analyse de la trace…"
            : isDragActive
            ? "Dépose le fichier ici"
            : "Glisse une trace GPX ou clique pour parcourir"}
        </p>
      </div>

      {/* Séparateur */}
      <div className="my-3 flex items-center gap-3 text-xs font-medium text-slate-400">
        <span className="h-px flex-1 bg-slate-200" />
        ou
        <span className="h-px flex-1 bg-slate-200" />
      </div>

      {/* Import via lien Komoot */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Link2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="url"
            value={komootUrl}
            onChange={(e) => setKomootUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") loadKomoot() }}
            disabled={busy}
            placeholder="Colle un lien Komoot (tour public)"
            className="h-10 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-[#D15F36] focus:outline-none focus:ring-1 focus:ring-[#D15F36] disabled:opacity-60"
          />
        </div>
        <button
          onClick={loadKomoot}
          disabled={busy || komootUrl.trim() === ""}
          className="flex h-10 items-center gap-1.5 rounded-xl bg-[#D15F36] px-4 text-sm font-semibold text-white hover:bg-[#b8502d] transition-colors disabled:opacity-40"
        >
          {loading === "komoot" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Charger
        </button>
      </div>

      {error && (
        <p className="mt-3 flex items-center gap-1.5 text-sm text-red-600">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </p>
      )}
    </div>
  )
}
