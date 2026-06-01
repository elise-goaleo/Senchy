import dynamic from "next/dynamic"

export const DynamicSegmentMap = dynamic(() => import("./SegmentMap"), {
  ssr: false,
  loading: () => (
    <div
      className="w-full rounded-lg bg-slate-100 animate-pulse flex items-center justify-center text-slate-400 text-sm"
      style={{ height: "400px" }}
    >
      Chargement de la carte...
    </div>
  ),
})
