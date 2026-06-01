export interface TileLayerDef {
  id: string
  name: string
  url: string
  attribution: string
  maxZoom?: number
  /** URL d'une tuile fixe pour la miniature (z=5, France) */
  previewUrl: string
}

export const TILE_LAYERS: TileLayerDef[] = [
  {
    id: "osm",
    name: "Standard",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    previewUrl: "https://a.tile.openstreetmap.org/5/16/11.png",
  },
  {
    id: "cyclosm",
    name: "Cycliste",
    url: "https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | <a href="https://www.cyclosm.org">CyclOSM</a>',
    previewUrl: "https://a.tile-cyclosm.openstreetmap.fr/cyclosm/5/16/11.png",
  },
  {
    id: "topo",
    name: "Topo",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | <a href="https://opentopomap.org">OpenTopoMap</a>',
    maxZoom: 17,
    previewUrl: "https://a.tile.opentopomap.org/5/16/11.png",
  },
  {
    id: "satellite",
    name: "Satellite",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "&copy; Esri &mdash; Source: Esri, Maxar, GeoEye",
    previewUrl: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/5/11/16",
  },
  {
    id: "dark",
    name: "Sombre",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | &copy; <a href="https://carto.com">CARTO</a>',
    previewUrl: "https://a.basemaps.cartocdn.com/dark_all/5/16/11.png",
  },
]

export const DEFAULT_TILE_LAYER = TILE_LAYERS[0]
