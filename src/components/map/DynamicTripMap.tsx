import dynamic from "next/dynamic"

export const DynamicTripMap = dynamic(() => import("./TripMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-slate-100 animate-pulse flex items-center justify-center text-slate-400 text-sm">
      Chargement de la carte...
    </div>
  ),
})
