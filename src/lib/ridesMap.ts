import { db } from "@/lib/db"

/**
 * « Mes cartes » — collections de traces GPX non rattachées à un voyage
 * planifié. Faute de pouvoir migrer la base (DIRECT_URL désactivé), on stocke
 * ces traces dans un « voyage » technique par utilisateur, identifié par son
 * `type`. Ce voyage est masqué partout où l'on liste les voyages (dashboard,
 * profil, API) — voir `HIDDEN_TRIP_TYPES`.
 */
export const RIDES_TRIP_TYPE = "rides"
export const EXPLORATIONS_TRIP_TYPE = "explorations"

/** Types de voyages techniques à exclure des listes « Mes voyages ». */
export const HIDDEN_TRIP_TYPES: string[] = [RIDES_TRIP_TYPE, EXPLORATIONS_TRIP_TYPE]

/**
 * Récupère (ou crée à la volée) le « voyage » conteneur des sorties vélo de
 * l'utilisateur. Renvoie son id.
 */
export async function getOrCreateRidesTrip(userId: string): Promise<string> {
  const existing = await db.trip.findFirst({
    where: { userId, type: RIDES_TRIP_TYPE },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  })
  if (existing) return existing.id

  const created = await db.trip.create({
    data: { userId, type: RIDES_TRIP_TYPE, name: "Mes sorties vélo" },
    select: { id: true },
  })
  return created.id
}

/**
 * « Mes explorations » — pays et villes visités. Faute de migration possible,
 * les données sont stockées en JSON dans le champ `description` d'un voyage
 * technique (type `explorations`) par utilisateur.
 */
export interface ExplorationsData {
  countries: string[]                                    // codes ISO A3 (ex. "FRA")
  cities:    Array<{ name: string; lat: number; lon: number }>
}

export const EMPTY_EXPLORATIONS: ExplorationsData = { countries: [], cities: [] }

/** Récupère (ou crée) le voyage technique des explorations. Renvoie son id. */
export async function getOrCreateExplorationsTrip(userId: string): Promise<string> {
  const existing = await db.trip.findFirst({
    where: { userId, type: EXPLORATIONS_TRIP_TYPE },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  })
  if (existing) return existing.id

  const created = await db.trip.create({
    data: { userId, type: EXPLORATIONS_TRIP_TYPE, name: "Mes explorations" },
    select: { id: true },
  })
  return created.id
}

/** Décode le JSON stocké dans `description` de façon tolérante. */
export function parseExplorations(description: string | null): ExplorationsData {
  if (!description) return { ...EMPTY_EXPLORATIONS }
  try {
    const raw = JSON.parse(description) as Partial<ExplorationsData>
    const countries = Array.isArray(raw.countries)
      ? raw.countries.filter((c): c is string => typeof c === "string")
      : []
    const cities = Array.isArray(raw.cities)
      ? raw.cities.filter(
          (c): c is { name: string; lat: number; lon: number } =>
            !!c && typeof c.name === "string" &&
            typeof c.lat === "number" && typeof c.lon === "number"
        )
      : []
    return { countries, cities }
  } catch {
    return { ...EMPTY_EXPLORATIONS }
  }
}
