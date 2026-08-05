import type { FeatureCollection } from "geojson"

// Appelle l'endpoint serveur qui convertit un lien Komoot public en tracé GeoJSON.
export async function fetchKomootRoute(
  url: string
): Promise<{ geojson: FeatureCollection; name: string }> {
  const res = await fetch("/api/komoot", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error ?? "Impossible de charger ce tour Komoot")
  }
  return res.json() as Promise<{ geojson: FeatureCollection; name: string }>
}
