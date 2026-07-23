"use client"

import { useState } from "react"
import { Clock } from "lucide-react"

interface TravelTimeCalculatorProps {
  distanceM: number
  mode?: "cycling" | "walking"
}

// Configuration par mode : vitesse par défaut, plage du curseur et presets
const CONFIG = {
  cycling: {
    default: 15,
    min: 5,
    max: 30,
    presets: [
      { label: "Randonnée", speed: 12 },
      { label: "Loisir", speed: 15 },
      { label: "Sport", speed: 20 },
    ],
  },
  walking: {
    default: 5,
    min: 2,
    max: 8,
    presets: [
      { label: "Tranquille", speed: 4 },
      { label: "Normal", speed: 5 },
      { label: "Rapide", speed: 6 },
    ],
  },
} as const

function formatDuration(hours: number): string {
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} h`
  return `${h} h ${m} min`
}

export function TravelTimeCalculator({ distanceM, mode = "cycling" }: TravelTimeCalculatorProps) {
  const cfg = CONFIG[mode]
  const [speed, setSpeed] = useState<number>(cfg.default)

  const distanceKm = distanceM / 1000
  const hours = distanceKm / speed

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
        <Clock className="h-4 w-4 text-emerald-600" />
        Calculateur de temps de parcours
      </h3>

      <div className="flex items-center gap-3">
        <label className="text-xs text-slate-500 whitespace-nowrap">
          Vitesse (km/h)
        </label>
        <input
          type="range"
          min={cfg.min}
          max={cfg.max}
          step={1}
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
          className="flex-1 accent-emerald-500"
        />
        <input
          type="number"
          min={cfg.min}
          max={cfg.max}
          value={speed}
          onChange={(e) => {
            const v = Number(e.target.value)
            if (v >= cfg.min && v <= cfg.max) setSpeed(v)
          }}
          className="w-16 text-center text-sm border border-slate-200 rounded-md py-1 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      {/* Presets */}
      <div className="flex gap-2">
        {cfg.presets.map((p) => (
          <button
            key={p.label}
            onClick={() => setSpeed(p.speed)}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
              speed === p.speed
                ? "bg-emerald-500 text-white border-emerald-500"
                : "bg-white text-slate-600 border-slate-200 hover:border-emerald-300 hover:text-emerald-700"
            }`}
          >
            {p.label} ({p.speed} km/h)
          </button>
        ))}
      </div>

      {/* Result */}
      <div className="bg-emerald-50 rounded-xl px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-xs text-emerald-600">Durée estimée</p>
          <p className="text-2xl font-bold text-emerald-700">
            {formatDuration(hours)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-500">Distance</p>
          <p className="text-sm font-semibold text-slate-700">
            {distanceKm.toFixed(1)} km
          </p>
          <p className="text-xs text-slate-400">à {speed} km/h</p>
        </div>
      </div>
    </div>
  )
}
