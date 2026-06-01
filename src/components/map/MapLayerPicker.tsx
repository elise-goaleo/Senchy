"use client"

import { useState } from "react"
import Image from "next/image"
import { Layers } from "lucide-react"
import { cn } from "@/lib/utils"
import type { TileLayerDef } from "./tileLayers"

interface Props {
  layers: TileLayerDef[]
  current: TileLayerDef
  onSelect: (id: string) => void
}

export function MapLayerPicker({ layers, current, onSelect }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      {/* Trigger */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Changer le fond de carte"
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-xl bg-white shadow-md border border-slate-200 text-slate-600 hover:text-slate-900 transition-colors",
          open && "bg-slate-100"
        )}
      >
        <Layers className="h-4 w-4" />
      </button>

      {/* Panel */}
      {open && (
        <div className="absolute top-11 right-0 bg-white rounded-2xl shadow-xl border border-slate-100 p-2 flex flex-col gap-1 min-w-[120px] z-50">
          {layers.map((layer) => {
            const isActive = layer.id === current.id
            return (
              <button
                key={layer.id}
                onClick={() => { onSelect(layer.id); setOpen(false) }}
                className={cn(
                  "flex items-center gap-2.5 px-2 py-1.5 rounded-xl text-left transition-colors w-full",
                  isActive
                    ? "bg-[#5F7F6F]/10 text-[#5F7F6F]"
                    : "hover:bg-slate-50 text-slate-700"
                )}
              >
                {/* Miniature */}
                <div className="relative h-9 w-9 rounded-lg overflow-hidden shrink-0 border border-slate-200">
                  <Image
                    src={layer.previewUrl}
                    alt={layer.name}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                </div>
                <span className={cn("text-xs font-medium", isActive && "font-semibold")}>
                  {layer.name}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
