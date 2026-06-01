"use client"

import { useRef, useState, useEffect } from "react"

// ── Gradient difficulty ───────────────────────────────────────────────────────

const GRADIENT_LEVELS = [
  { max: 4,        color: "#22c55e", label: "< 4 %" },
  { max: 8,        color: "#eab308", label: "< 8 %" },
  { max: 12,       color: "#f97316", label: "< 12 %" },
  { max: 16,       color: "#ef4444", label: "< 16 %" },
  { max: Infinity, color: "#991b1b", label: "> 16 %" },
]

function gradientColor(pct: number): string {
  const abs = Math.abs(pct)
  return GRADIENT_LEVELS.find((l) => abs < l.max)?.color ?? "#991b1b"
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Point { distanceM: number; elevationM: number }

interface ElevationChartProps {
  points: Point[]
  height?: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function linTicks(min: number, max: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => min + (max - min) * (i / (count - 1)))
}

// ── Main component ────────────────────────────────────────────────────────────

export function ElevationChart({ points, height = 90 }: ElevationChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth]       = useState(400)
  const [tooltip, setTooltip]   = useState<{ x: number; y: number; point: Point; pct: number } | null>(null)

  // Observe container width
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    ro.observe(el)
    setWidth(el.getBoundingClientRect().width)
    return () => ro.disconnect()
  }, [])

  if (points.length < 2) {
    return (
      <div className="flex items-center justify-center text-xs text-slate-400" style={{ height }}>
        Aucune donnée d&apos;altitude
      </div>
    )
  }

  // ── Layout ────────────────────────────────────────────────────────────────

  const ML = 38, MR = 8, MT = 6, MB = 18
  const chartW = Math.max(width - ML - MR, 10)
  const chartH = height
  const totalH = height + MT + MB

  // ── Scales ────────────────────────────────────────────────────────────────

  const minDist = points[0].distanceM
  const maxDist = points[points.length - 1].distanceM
  const elevs   = points.map((p) => p.elevationM)
  const minElev = Math.min(...elevs)
  const maxElev = Math.max(...elevs)
  const elevPad = Math.max((maxElev - minElev) * 0.18, 15)
  const yMin    = minElev - elevPad
  const yMax    = maxElev + elevPad

  const xS = (d: number) => ((d - minDist) / (maxDist - minDist)) * chartW
  const yS = (e: number) => chartH - ((e - yMin) / (yMax - yMin)) * chartH

  // ── SVG data ──────────────────────────────────────────────────────────────

  const pts = points.map((p) => ({ ...p, sx: xS(p.distanceM), sy: yS(p.elevationM) }))

  // Area fill path (neutral, under colored line)
  const areaD =
    pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.sx.toFixed(1)},${p.sy.toFixed(1)}`).join(" ") +
    ` L${pts[pts.length - 1].sx.toFixed(1)},${chartH} L0,${chartH} Z`

  // Colored line segments
  const segs = pts.slice(1).map((curr, i) => {
    const prev = pts[i]
    const dDist = curr.distanceM - prev.distanceM
    const dElev = curr.elevationM - prev.elevationM
    const pct   = dDist > 0 ? (dElev / dDist) * 100 : 0
    return { x1: prev.sx, y1: prev.sy, x2: curr.sx, y2: curr.sy, color: gradientColor(pct), pct }
  })

  // Axes ticks
  const xTicks = linTicks(minDist, maxDist, 5)
  const yTicks = linTicks(yMin, yMax, 4)

  // ── Mouse interaction ─────────────────────────────────────────────────────

  function handleMouseMove(e: React.MouseEvent<SVGGElement>) {
    const rect = containerRef.current?.querySelector("svg")?.getBoundingClientRect()
    if (!rect) return
    const mx = e.clientX - rect.left - ML
    if (mx < 0 || mx > chartW) { setTooltip(null); return }

    // Find nearest point
    let closest = pts[0]
    let minDx = Infinity
    for (const p of pts) {
      const dx = Math.abs(p.sx - mx)
      if (dx < minDx) { minDx = dx; closest = p }
    }

    const idx = pts.indexOf(closest)
    const prev = pts[idx - 1]
    const dDist = prev ? closest.distanceM - prev.distanceM : 0
    const dElev = prev ? closest.elevationM - prev.elevationM : 0
    const pct   = dDist > 0 ? (dElev / dDist) * 100 : 0

    setTooltip({ x: closest.sx, y: closest.sy, point: closest, pct })
  }

  // ── Gradient bar ──────────────────────────────────────────────────────────

  const barSegs: Array<{ x: number; w: number; color: string }> = []
  for (const seg of segs) {
    const last = barSegs[barSegs.length - 1]
    if (last && last.color === seg.color) {
      last.w += seg.x2 - seg.x1
    } else {
      barSegs.push({ x: xS(points[segs.indexOf(seg)].distanceM), w: seg.x2 - seg.x1, color: seg.color })
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div ref={containerRef} className="select-none">
      <svg width={width} height={totalH} style={{ display: "block" }}>
        <g transform={`translate(${ML},${MT})`}>

          {/* Horizontal grid lines */}
          {yTicks.map((v) => (
            <line key={v} x1={0} y1={yS(v).toFixed(1)} x2={chartW} y2={yS(v).toFixed(1)}
              stroke="#e2e8f0" strokeWidth={1} />
          ))}

          {/* Area fill */}
          <path d={areaD} fill="#10b981" fillOpacity={0.08} />

          {/* Colored line segments */}
          {segs.map((seg, i) => (
            <line key={i}
              x1={seg.x1.toFixed(1)} y1={seg.y1.toFixed(1)}
              x2={seg.x2.toFixed(1)} y2={seg.y2.toFixed(1)}
              stroke={seg.color} strokeWidth={2.5} strokeLinecap="round"
            />
          ))}

          {/* Interactive overlay */}
          <rect
            x={0} y={0} width={chartW} height={chartH}
            fill="transparent"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setTooltip(null)}
          />

          {/* Tooltip crosshair */}
          {tooltip && (
            <>
              <line x1={tooltip.x} y1={0} x2={tooltip.x} y2={chartH}
                stroke="#94a3b8" strokeWidth={1} strokeDasharray="3,2" />
              <circle cx={tooltip.x} cy={tooltip.y} r={4}
                fill={gradientColor(tooltip.pct)} stroke="white" strokeWidth={2} />
              <g transform={`translate(${Math.min(tooltip.x + 6, chartW - 80)},${Math.max(tooltip.y - 36, 0)})`}>
                <rect x={0} y={0} width={78} height={34} rx={5} fill="white"
                  stroke="#e2e8f0" strokeWidth={1}
                  style={{ filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.12))" }} />
                <text x={8} y={13} fontSize={9} fill="#64748b">
                  {(tooltip.point.distanceM / 1000).toFixed(1)} km
                </text>
                <text x={8} y={25} fontSize={10} fontWeight={700} fill="#0f172a">
                  {tooltip.point.elevationM.toFixed(0)} m
                </text>
                <text x={52} y={25} fontSize={10} fontWeight={700}
                  fill={gradientColor(tooltip.pct)}>
                  {tooltip.pct > 0 ? "+" : ""}{tooltip.pct.toFixed(1)}%
                </text>
              </g>
            </>
          )}

          {/* X axis */}
          {xTicks.map((d) => (
            <text key={d} x={xS(d).toFixed(1)} y={chartH + 13} fontSize={9}
              fill="#94a3b8" textAnchor="middle">
              {(d / 1000).toFixed(0)} km
            </text>
          ))}

          {/* Y axis */}
          {yTicks.map((v) => (
            <text key={v} x={-5} y={(yS(v) + 3).toFixed(1)} fontSize={9}
              fill="#94a3b8" textAnchor="end">
              {v.toFixed(0)}
            </text>
          ))}
        </g>
      </svg>


    </div>
  )
}
