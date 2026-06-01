"use client"

import { useEffect, useState } from "react"
import { format } from "date-fns"
import { fr } from "date-fns/locale"
import { Wind, Droplets } from "lucide-react"

interface WeatherWidgetProps {
  lat: number
  lon: number
}

interface DayForecast {
  date: string
  weathercode: number
  tempMax: number
  tempMin: number
  precipProb: number
  windSpeed: number
}

function wmoToEmoji(code: number): string {
  if (code <= 3) return "☀️"
  if (code <= 48) return "⛅"
  if (code <= 67) return "🌧️"
  if (code <= 77) return "❄️"
  if (code <= 99) return "⛈️"
  return "🌡️"
}

function wmoToLabel(code: number): string {
  if (code === 0) return "Ensoleillé"
  if (code <= 3) return "Nuageux"
  if (code <= 48) return "Brumeux"
  if (code <= 67) return "Pluvieux"
  if (code <= 77) return "Neigeux"
  if (code <= 99) return "Orageux"
  return "Variable"
}

export function WeatherWidget({ lat, lon }: WeatherWidgetProps) {
  const [forecast, setForecast] = useState<DayForecast[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    const today = format(new Date(), "yyyy-MM-dd")
    fetch(`/api/weather?lat=${lat}&lon=${lon}&date=${today}`)
      .then((r) => {
        if (!r.ok) throw new Error("Weather fetch failed")
        return r.json()
      })
      .then((data) => {
        const daily = data.daily
        if (!daily) throw new Error("No daily data")

        const days: DayForecast[] = daily.time.slice(0, 7).map(
          (date: string, i: number) => ({
            date,
            weathercode: daily.weathercode[i],
            tempMax: daily.temperature_2m_max[i],
            tempMin: daily.temperature_2m_min[i],
            precipProb: daily.precipitation_probability_max[i] ?? 0,
            windSpeed: daily.windspeed_10m_max[i] ?? 0,
          })
        )
        setForecast(days)
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [lat, lon])

  if (loading) {
    return (
      <div className="space-y-2">
        <div className="h-4 bg-slate-200 rounded animate-pulse w-24" />
        <div className="flex gap-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex-1 h-20 bg-slate-100 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (error || !forecast) {
    return (
      <p className="text-sm text-slate-400 italic">Météo indisponible</p>
    )
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-700 mb-3">
        Météo — 7 jours
      </h3>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {forecast.map((day) => {
          const date = new Date(day.date + "T12:00:00")
          const dayName = format(date, "EEE", { locale: fr })
          return (
            <div
              key={day.date}
              className="flex flex-col items-center min-w-[56px] bg-slate-50 rounded-xl px-1 py-2 gap-1 border border-slate-100"
              title={wmoToLabel(day.weathercode)}
            >
              <span className="text-xs text-slate-500 font-medium capitalize">
                {dayName}
              </span>
              <span className="text-xl" role="img" aria-label={wmoToLabel(day.weathercode)}>
                {wmoToEmoji(day.weathercode)}
              </span>
              <span className="text-xs font-semibold text-slate-800">
                {Math.round(day.tempMax)}°
              </span>
              <span className="text-xs text-slate-400">
                {Math.round(day.tempMin)}°
              </span>
              {day.precipProb > 10 && (
                <span className="flex items-center gap-0.5 text-[10px] text-blue-500">
                  <Droplets className="h-2.5 w-2.5" />
                  {day.precipProb}%
                </span>
              )}
              {day.windSpeed > 0 && (
                <span className="flex items-center gap-0.5 text-[10px] text-slate-400">
                  <Wind className="h-2.5 w-2.5" />
                  {Math.round(day.windSpeed)}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
