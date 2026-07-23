"use client"

import { useState } from "react"
import { ChevronDown } from "lucide-react"
import { TripCard } from "@/components/TripCard"
import { cn } from "@/lib/utils"

type TripCardTrip = React.ComponentProps<typeof TripCard>["trip"]

export function CollapsibleTripSection({ title, trips }: { title: string; trips: TripCardTrip[] }) {
  const [open, setOpen] = useState(false)

  return (
    <section className="mt-10">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="group flex items-center gap-2 mb-4"
      >
        <ChevronDown
          className={cn(
            "h-5 w-5 text-slate-400 transition-transform group-hover:text-slate-600",
            open ? "" : "-rotate-90"
          )}
        />
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <span className="text-sm text-slate-400">({trips.length})</span>
      </button>

      {open && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          {trips.map((trip) => (
            <TripCard key={trip.id} trip={trip} />
          ))}
        </div>
      )}
    </section>
  )
}
