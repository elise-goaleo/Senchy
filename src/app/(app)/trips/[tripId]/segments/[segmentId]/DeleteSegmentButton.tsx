"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Trash2 } from "lucide-react"

interface DeleteSegmentButtonProps {
  segmentId: string
  tripId: string
}

export function DeleteSegmentButton({ segmentId, tripId }: DeleteSegmentButtonProps) {
  const router = useRouter()
  const [isDeleting, setIsDeleting] = useState(false)
  const [confirm, setConfirm] = useState(false)

  async function handleDelete() {
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/segments/${segmentId}`, { method: "DELETE" })
      if (res.ok) {
        router.push(`/trips/${tripId}`)
        router.refresh()
      }
    } catch {
      setIsDeleting(false)
    }
  }

  if (confirm) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-500">Confirmer la suppression ?</span>
        <Button
          variant="destructive"
          size="sm"
          isLoading={isDeleting}
          onClick={handleDelete}
        >
          Supprimer
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setConfirm(false)}
          disabled={isDeleting}
        >
          Annuler
        </Button>
      </div>
    )
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="w-8 p-0 text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
      onClick={() => setConfirm(true)}
      aria-label="Supprimer le segment"
      title="Supprimer"
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  )
}
