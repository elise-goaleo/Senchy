import type { FeatureCollection } from "geojson"

// Transfert de la trace importée (GPX ou Komoot) entre la page d'accueil et la
// page carte.
//   - `mem`          : handoff instantané lors d'une navigation client (aucune
//                      limite de taille, mais perdu au rafraîchissement).
//   - sessionStorage : survit à un rafraîchissement de la page carte (best-effort,
//                      peut échouer si le tracé dépasse le quota ~5 Mo).

export interface QuickTripEntry {
  name: string
  fc: FeatureCollection
}

const SS_FC = "quicktrip:fc"
const SS_NAME = "quicktrip:name"

let mem: QuickTripEntry | null = null

export function setQuickTrip(entry: QuickTripEntry): void {
  mem = entry
  try {
    sessionStorage.setItem(SS_FC, JSON.stringify(entry.fc))
    sessionStorage.setItem(SS_NAME, entry.name)
  } catch {
    // Quota dépassé ou sessionStorage indisponible : le handoff mémoire suffit.
  }
}

export function getQuickTrip(): QuickTripEntry | null {
  if (mem) return mem
  try {
    const raw = sessionStorage.getItem(SS_FC)
    if (raw) {
      return { name: sessionStorage.getItem(SS_NAME) ?? "Trace", fc: JSON.parse(raw) as FeatureCollection }
    }
  } catch {
    // ignore (quota / JSON invalide)
  }
  return null
}

export function clearQuickTrip(): void {
  mem = null
  try {
    sessionStorage.removeItem(SS_FC)
    sessionStorage.removeItem(SS_NAME)
  } catch {
    // ignore
  }
}
