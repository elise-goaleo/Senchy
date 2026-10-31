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

export function setQuickTrip(entry: QuickTripEntry): void {
  mem = entry
  try {
    localStorage.setItem(LS_FC, JSON.stringify(entry.fc))
    localStorage.setItem(LS_NAME, entry.name)
  } catch {
    // Quota dépassé ou localStorage indisponible : le handoff mémoire suffit.
  }
}

export function getQuickTrip(): QuickTripEntry | null {
  if (mem) return mem
  try {
    let raw = localStorage.getItem(LS_FC)
    let name = localStorage.getItem(LS_NAME)
    // Migration depuis l'ancien stockage de session, le cas échéant.
    if (!raw) {
      const ssRaw = sessionStorage.getItem(SS_FC)
      if (ssRaw) {
        raw = ssRaw
        name = sessionStorage.getItem(SS_NAME)
        try {
          localStorage.setItem(LS_FC, ssRaw)
          if (name) localStorage.setItem(LS_NAME, name)
          sessionStorage.removeItem(SS_FC)
          sessionStorage.removeItem(SS_NAME)
        } catch {
          // ignore (quota) : on sait au moins lire la trace pour cette fois.
        }
      }
    }
    if (raw) {
      return { name: name ?? "Trace", fc: JSON.parse(raw) as FeatureCollection }
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
