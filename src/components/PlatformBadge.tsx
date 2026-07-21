import { BedDouble } from "lucide-react"

// Logo de la plateforme de réservation (Booking / Airbnb / autre).
export function PlatformBadge({ platform }: { platform: "booking" | "airbnb" | null }) {
  if (platform === "booking") {
    return (
      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#003580] shrink-0">
        <span className="text-white font-black text-[11px] leading-none tracking-tight">B.</span>
      </div>
    )
  }
  if (platform === "airbnb") {
    return (
      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#FF385C] shrink-0">
        <svg className="h-4 w-4 fill-white" viewBox="0 0 32 32" aria-hidden>
          <path d="M16 2c-1.3 0-2.4.7-3.1 1.8L7.5 12c-.9 1.5-1.5 3-1.5 4.5C6 20.6 9.4 24 13.5 24c1.1 0 2.2-.3 3.1-.8.9.5 2 .8 3.1.8C23.7 24 27 20.6 27 16.5c0-1.5-.6-3-1.5-4.5l-5.4-8.2C19.4 2.7 18.3 2 17 2h-1zm0 3.5l5 7.6c.6 1 1 2 1 3 0 2.5-2 4.5-4.5 4.5S13 18.5 13 16c0-1 .4-2 1-3l2-3.5V7l-.5-.8c.2-.1.3-.2.5-.2s.3.1.5.2L16 5.5z"/>
        </svg>
      </div>
    )
  }
  return (
    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-terre-50 shrink-0">
      <BedDouble className="h-3.5 w-3.5 text-terre-700" />
    </div>
  )
}
