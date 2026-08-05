"use client"

import { useRouter } from "next/navigation"
import type { GeoJSON } from "geojson"
import { Zap } from "lucide-react"
import { setQuickTrip } from "@/lib/quickTripStore"
import { cn } from "@/lib/utils"

// Ouvre la trace d'un segment (vélo / à pied) dans le module Quick Trip pour y
// voir les POI le long de l'itinéraire.
export function OpenInQuickTripButton({
  geojson,
  name,
  iconOnly = false,
  label = "Ouvrir en Quick Trip",
  className,
}: {
  geojson: GeoJSON.FeatureCollection | null
  name: string | null
  iconOnly?: boolean
  label?: string
  className?: string
}) {
  const router = useRouter()
  if (!geojson) return null

  return (
    <button
      type="button"
      title="Ouvrir en Quick Trip"
      aria-label="Ouvrir en Quick Trip"
      onClick={() => {
        setQuickTrip({ name: name ?? "Trace", fc: geojson })
        router.push("/quick-trip")
      }}
      className={cn(
        "flex items-center justify-center gap-1.5 rounded-lg text-xs font-semibold text-[#D15F36] hover:text-[#b8502d] bg-[#D15F36]/10 hover:bg-[#D15F36]/20 transition-colors",
        iconOnly ? "h-8 w-8" : "h-8 px-3",
        className
      )}
    >
      <Zap className="h-3.5 w-3.5 shrink-0" />
      {!iconOnly && label}
    </button>
  )
}
