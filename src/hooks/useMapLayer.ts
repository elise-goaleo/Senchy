"use client"

import { useState, useEffect } from "react"
import { TILE_LAYERS, DEFAULT_TILE_LAYER, type TileLayerDef } from "@/components/map/tileLayers"

const STORAGE_KEY = "vv_map_layer"

export function useMapLayer(): {
  layer: TileLayerDef
  setLayer: (id: string) => void
  layers: TileLayerDef[]
} {
  const [layerId, setLayerId] = useState<string>(DEFAULT_TILE_LAYER.id)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && TILE_LAYERS.find((l) => l.id === stored)) {
      setLayerId(stored)
    }
  }, [])

  function setLayer(id: string) {
    setLayerId(id)
    localStorage.setItem(STORAGE_KEY, id)
  }

  const layer = TILE_LAYERS.find((l) => l.id === layerId) ?? DEFAULT_TILE_LAYER

  return { layer, setLayer, layers: TILE_LAYERS }
}
