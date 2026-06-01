"use client"

import { DynamicSegmentMap } from "./DynamicSegmentMap"
import { MapLayerPicker } from "./MapLayerPicker"
import { useMapLayer } from "@/hooks/useMapLayer"
import type { GeoJSON } from "geojson"

interface Props {
  geojson: GeoJSON.FeatureCollection
  height?: string
}

export function SegmentMapWithPicker({ geojson, height = "400px" }: Props) {
  const { layer, setLayer, layers } = useMapLayer()

  return (
    <div className="relative">
      <DynamicSegmentMap
        geojson={geojson}
        height={height}
        tileUrl={layer.url}
        tileAttribution={layer.attribution}
      />
      <div className="absolute top-2 right-2 z-[1000]">
        <MapLayerPicker layers={layers} current={layer} onSelect={setLayer} />
      </div>
    </div>
  )
}
