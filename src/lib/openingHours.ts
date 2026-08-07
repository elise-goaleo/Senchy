// Évaluation « ouvert maintenant ? » d'un tag OSM `opening_hours`.
//
// Renvoie :
//   true  → ouvert à `date`
//   false → fermé à `date`
//   null  → indéterminé (tag absent, vide, ou format hors des cas gérés)
//
// Volontairement CONSERVATEUR : tout ce qui sort des cas courants (mois,
// saisons, numéros de semaine, horaires « sunrise/sunset », commentaires…)
// renvoie `null` plutôt que de risquer de masquer à tort un commerce ouvert.
//
// Cas gérés : `24/7`, plusieurs règles séparées par `;`, sélecteurs de jours
// (`Mo`, `Mo-Fr`, `Sa,Su`, plages qui bouclent type `Sa-Mo`), plusieurs
// créneaux horaires (`08:00-12:00,14:00-19:00`), `off`/`closed`, et les règles
// jours fériés (`PH …`) qui sont ignorées (ne s'appliquent à aucun jour de la
// semaine dans ce modèle simplifié).

const DAYS: Record<string, number> = {
  Mo: 0, Tu: 1, We: 2, Th: 3, Fr: 4, Sa: 5, Su: 6,
}

interface ParsedRule {
  days: Set<number> | null // null = tous les jours
  off: boolean
  ranges: Array<[number, number]> // minutes depuis minuit
}

function parseDays(spec: string): Set<number> | null {
  const set = new Set<number>()
  for (const raw of spec.split(",")) {
    const tok = raw.trim()
    if (!tok) continue
    const range = tok.match(/^(Mo|Tu|We|Th|Fr|Sa|Su)-(Mo|Tu|We|Th|Fr|Sa|Su)$/)
    const single = tok.match(/^(Mo|Tu|We|Th|Fr|Sa|Su)$/)
    if (range) {
      const a = DAYS[range[1]]
      const b = DAYS[range[2]]
      for (let i = 0; i < 7; i++) {
        const d = (a + i) % 7
        set.add(d)
        if (d === b) break
      }
    } else if (single) {
      set.add(DAYS[single[1]])
    } else {
      return null // jeton de jour non reconnu
    }
  }
  return set
}

// Renvoie la règle analysée, ou `null` si le format n'est pas géré.
function parseRule(rule: string): ParsedRule | null {
  const r = rule.trim()
  if (!r) return { days: new Set(), off: false, ranges: [] }

  // Formats non gérés → on abandonne (l'appelant renverra `null`).
  if (/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i.test(r)) return null
  if (/week|easter|sunrise|sunset|dawn|dusk|\[|\]|"/i.test(r)) return null

  // Règle jours fériés / vacances scolaires → ne s'applique à aucun jour ici.
  if (/^(PH|SH)\b/i.test(r)) return { days: new Set(), off: false, ranges: [] }

  const offMatch = /\b(off|closed)\b/i.test(r)
  const timeMatches = r.match(/\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}/g) ?? []

  // Le sélecteur de jours est ce qui précède le premier horaire ou `off`.
  const firstTime = r.search(/\d{1,2}:\d{2}/)
  const firstOff = r.search(/\b(off|closed)\b/i)
  let cut = -1
  if (firstTime >= 0) cut = firstTime
  if (firstOff >= 0 && (cut < 0 || firstOff < cut)) cut = firstOff
  const dayPart = (cut >= 0 ? r.slice(0, cut) : r).trim()

  let days: Set<number> | null
  if (dayPart === "") {
    days = null // tous les jours
  } else {
    days = parseDays(dayPart)
    if (days === null) return null
  }

  const ranges: Array<[number, number]> = []
  for (const t of timeMatches) {
    const m = t.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/)
    if (!m) continue
    const start = Number(m[1]) * 60 + Number(m[2])
    let end = Number(m[3]) * 60 + Number(m[4])
    if (end === 0) end = 1440 // 00:00 / 24:00 en fin = minuit
    ranges.push([start, end])
  }

  return { days, off: offMatch && ranges.length === 0, ranges }
}

export function isOpenNow(raw: string | null | undefined, date: Date): boolean | null {
  if (!raw) return null
  const s = raw.trim()
  if (!s) return null
  if (s === "24/7") return true

  const today = (date.getDay() + 6) % 7 // getDay: 0=Dim → 0=Lu … 6=Di
  const nowMin = date.getHours() * 60 + date.getMinutes()

  const rules = s.split(";").map((x) => x.trim()).filter(Boolean)
  if (rules.length === 0) return null

  let applied = false
  let ranges: Array<[number, number]> = []
  for (const rule of rules) {
    const p = parseRule(rule)
    if (p === null) return null // format non géré → indéterminé
    const applies = p.days === null || p.days.has(today)
    if (!applies) continue
    applied = true
    if (p.off) {
      ranges = [] // un `off` postérieur annule les créneaux précédents du jour
    } else {
      ranges.push(...p.ranges)
    }
  }

  if (!applied) return false // aucune règle ne couvre aujourd'hui → fermé
  if (ranges.length === 0) return false // jour explicitement fermé

  for (const [start, end] of ranges) {
    const open = end > start ? nowMin >= start && nowMin < end : nowMin >= start || nowMin < end
    if (open) return true
  }
  return false
}
