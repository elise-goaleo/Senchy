import type { TripSegment } from "@/app/(app)/trips/[tripId]/TripClientView"
import type { Stopover } from "@/components/StopoversPanel"

const TYPE_LABELS: Record<string, string> = {
  gpx:     "Vélo",
  train:   "Train",
  walking: "À pied",
  car:     "Voiture",
}

function formatDate(iso: string | null): string {
  if (!iso) return ""
  return new Date(iso).toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  })
}

function formatDatetime(iso: string | null): string {
  if (!iso) return ""
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  })
}

function formatDuration(min: number | null): string {
  if (min == null) return ""
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} h`
  return `${h} h ${m} min`
}

function buildDayMap(segments: TripSegment[]): Map<string, number> {
  const dated = segments
    .filter((s) => s.departureAt)
    .map((s) => s.departureAt!.slice(0, 10))
  const uniqueDates = Array.from(new Set(dated)).sort()
  const map = new Map<string, number>()
  uniqueDates.forEach((d, i) => map.set(d, i + 1))
  return map
}

export async function exportTripToExcel(
  tripName: string,
  segments: TripSegment[],
  stopovers: Stopover[]
) {
  const { utils, writeFile } = await import("xlsx")

  const dayMap = buildDayMap(segments)

  // Sort segments by date (undated last), then by original order
  const sorted = [...segments].sort((a, b) => {
    if (!a.departureAt && !b.departureAt) return 0
    if (!a.departureAt) return 1
    if (!b.departureAt) return -1
    return a.departureAt.localeCompare(b.departureAt)
  })

  // ── Sheet 1 : Segments ──────────────────────────────────────────────────────

  const segRows = sorted.map((seg) => {
    const dateKey = seg.departureAt?.slice(0, 10) ?? null
    const dayNum  = dateKey ? (dayMap.get(dateKey) ?? null) : null
    const label   = seg.name ?? (seg.origin && seg.destination ? `${seg.origin} → ${seg.destination}` : TYPE_LABELS[seg.type] ?? "Segment")

    return {
      "Jour":            dayNum != null ? `Jour ${dayNum}` : "",
      "Date":            formatDate(seg.departureAt),
      "Type":            TYPE_LABELS[seg.type] ?? seg.type,
      "Nom":             label,
      "Départ":          seg.origin ?? "",
      "Arrivée":         seg.destination ?? "",
      "Distance (km)":   seg.distanceM != null ? Math.round(seg.distanceM / 100) / 10 : "",
      "Dénivelé + (m)":  seg.elevationGainM != null ? Math.round(seg.elevationGainM) : "",
      "Dénivelé - (m)":  seg.elevationLossM != null ? Math.round(seg.elevationLossM) : "",
      "Durée":           formatDuration(seg.durationMin),
      "Heure départ":    formatDatetime(seg.departureAt),
      "Heure arrivée":   formatDatetime(seg.arrivalAt),
      "Lien Komoot":     seg.komootUrl ?? "",
    }
  })

  // ── Sheet 2 : Nuits ─────────────────────────────────────────────────────────

  const nightRows = [...stopovers]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((s) => ({
      "Date d'arrivée":  formatDate(s.date),
      "Date de départ":  s.endDate ? formatDate(s.endDate) : "",
      "Nom du logement": s.name ?? "",
      "Adresse":         s.place ?? "",
      "Plateforme":      s.platform ?? "",
      "Lien":            s.link ?? "",
      "Notes":           s.notes ?? "",
    }))

  // ── Workbook ─────────────────────────────────────────────────────────────────

  const wb = utils.book_new()

  const wsSegs = utils.json_to_sheet(segRows)
  styleSheet(wsSegs)
  utils.book_append_sheet(wb, wsSegs, "Segments")

  const wsNights = utils.json_to_sheet(nightRows)
  styleSheet(wsNights)
  utils.book_append_sheet(wb, wsNights, "Nuits")

  const filename = `${tripName.replace(/[^a-zA-Z0-9À-ÿ\s-]/g, "").trim()}.xlsx`
  writeFile(wb, filename)
}

function styleSheet(ws: import("xlsx").WorkSheet) {
  const ref = ws["!ref"]
  if (!ref) return
  // Parse range manually to avoid importing utils again
  const colLetters = ref.split(":")[1]?.replace(/[0-9]/g, "") ?? "A"
  const lastCol = colLetters.charCodeAt(0) - 65
  const lastRow = parseInt(ref.split(":")[1]?.replace(/[A-Z]/g, "") ?? "1", 10)

  const colWidths: number[] = []
  for (let C = 0; C <= lastCol; C++) {
    let max = 10
    for (let R = 0; R <= lastRow; R++) {
      const addr = String.fromCharCode(65 + C) + (R + 1)
      const cell = ws[addr]
      if (cell?.v) {
        const len = String(cell.v).length
        if (len > max) max = len
      }
    }
    colWidths.push(Math.min(max + 2, 60))
  }
  ws["!cols"] = colWidths.map((w) => ({ wch: w }))
}
