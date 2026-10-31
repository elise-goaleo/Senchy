import type { FeatureCollection } from "geojson"

// Transfert et persistance de la trace importée (GPX ou Komoot) entre la page
// d'accueil et la page carte.
//   - `mem`         : handoff instantané lors d'une navigation client (aucune
//                     limite de taille, mais perdu au rafraîchissement).
//   - localStorage  : conserve la trace d'une session à l'autre, pour ne pas
//                     avoir à la réimporter à chaque visite (best-effort, peut
//                     échouer si le tracé dépasse le quota ~5 Mo).

export interface QuickTripEntry {
  name: string
  fc: FeatureCollection
}

const LS_FC = "quicktrip:fc"
const LS_NAME = "quicktrip:name"
// Anciennes clés sessionStorage : nettoyées lors de la lecture pour migrer en
// douceur les traces déjà présentes dans l'onglet courant.
const SS_FC = "quicktrip:fc"
const SS_NAME = "quicktrip:name"

let mem: QuickTripEntry | null = null

// Pour la persistance, on allège le tracé : seulement les lignes, sans
// `properties` (élévation, temps…), coordonnées arrondies à ~1 m et
// échantillonnées. Une trace complète peut dépasser le quota ~5 Mo de
// localStorage ; la version allégée reste bien en-dessous tout en suffisant à
// l'affichage et à la recherche de services le long du parcours.
const round5 = (n: number) => Math.round(n * 1e5) / 1e5

function downsample<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr
  const step = (arr.length - 1) / (max - 1)
  const out: T[] = []
  for (let i = 0; i < max; i++) out.push(arr[Math.round(i * step)])
  return out
}

function slimFc(fc: FeatureCollection, maxPerLine: number): FeatureCollection {
  const features = (fc.features ?? [])
    .filter((f) => f.geometry && (f.geometry.type === "LineString" || f.geometry.type === "MultiLineString"))
    .map((f) => {
      const g = f.geometry as GeoJSON.LineString | GeoJSON.MultiLineString
      if (g.type === "LineString") {
        return {
          type: "Feature" as const,
          properties: {},
          geometry: {
            type: "LineString" as const,
            coordinates: downsample(g.coordinates, maxPerLine).map((c) => [round5(c[0]), round5(c[1])]),
          },
        }
      }
      return {
        type: "Feature" as const,
        properties: {},
        geometry: {
          type: "MultiLineString" as const,
          coordinates: g.coordinates.map((l) => downsample(l, maxPerLine).map((c) => [round5(c[0]), round5(c[1])])),
        },
      }
    })
  return { type: "FeatureCollection", features }
}

export function setQuickTrip(entry: QuickTripEntry): void {
  mem = entry
  // On tente des versions de plus en plus légères jusqu'à passer sous le quota.
  for (const maxPerLine of [4000, 2000, 1000, 500]) {
    try {
      localStorage.setItem(LS_FC, JSON.stringify(slimFc(entry.fc, maxPerLine)))
      localStorage.setItem(LS_NAME, entry.name)
      return
    } catch {
      // Quota probablement dépassé : on réessaie avec moins de points.
    }
  }
  // Même la version minimale ne passe pas : le handoff mémoire suffit pour la
  // session en cours (la trace sera à réimporter après fermeture).
}

export function getQuickTrip(): QuickTripEntry | null {
  if (mem) return mem
  try {
    const raw = localStorage.getItem(LS_FC)
    if (raw) {
      return { name: localStorage.getItem(LS_NAME) ?? "Trace", fc: JSON.parse(raw) as FeatureCollection }
    }
    // Migration depuis l'ancien stockage de session, le cas échéant : on relit
    // puis on repersiste en version allégée via setQuickTrip.
    const ssRaw = sessionStorage.getItem(SS_FC)
    if (ssRaw) {
      const entry: QuickTripEntry = {
        name: sessionStorage.getItem(SS_NAME) ?? "Trace",
        fc: JSON.parse(ssRaw) as FeatureCollection,
      }
      sessionStorage.removeItem(SS_FC)
      sessionStorage.removeItem(SS_NAME)
      setQuickTrip(entry)
      return entry
    }
  } catch {
    // ignore (quota / JSON invalide)
  }
  return null
}

export function clearQuickTrip(): void {
  mem = null
  try {
    localStorage.removeItem(LS_FC)
    localStorage.removeItem(LS_NAME)
    sessionStorage.removeItem(SS_FC)
    sessionStorage.removeItem(SS_NAME)
  } catch {
    // ignore
  }
}
