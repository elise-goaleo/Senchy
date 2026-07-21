"use client"

import { Download } from "lucide-react"
import { Button } from "@/components/ui/button"

export function DownloadGpxButton({
  segmentId,
  hasGpx,
  filename,
}: {
  segmentId: string
  hasGpx:    boolean
  filename:  string
}) {
  if (!hasGpx) {
    return (
      <Button variant="outline" size="sm" className="gap-1.5" disabled title="Aucune trace GPX dans ce segment">
        <Download className="h-3.5 w-3.5" />
        GPX
      </Button>
    )
  }

  const safe = filename.replace(/[^a-zA-Z0-9À-ÿ\s-]/g, "").trim() || "trace"

  return (
    <a href={`/api/segments/${segmentId}/gpx`} download={`${safe}.gpx`}>
      <Button variant="outline" size="sm" className="gap-1.5" title="Télécharger la trace GPX">
        <Download className="h-3.5 w-3.5" />
        GPX
      </Button>
    </a>
  )
}
