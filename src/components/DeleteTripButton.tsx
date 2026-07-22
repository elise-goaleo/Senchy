"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createPortal } from "react-dom"
import { Trash2, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"

export function DeleteTripButton({ tripId, tripName }: { tripId: string; tripName: string }) {
  const router = useRouter()
  const [open,       setOpen]       = useState(false)
  const [mounted,    setMounted]    = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape" && !isDeleting) setOpen(false) }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [open, isDeleting])

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : ""
    return () => { document.body.style.overflow = "" }
  }, [open])

  async function handleDelete() {
    setIsDeleting(true)
    setError(null)
    try {
      const res = await fetch(`/api/trips/${tripId}`, { method: "DELETE" })
      if (!res.ok && res.status !== 204) {
        setError("La suppression a échoué. Veuillez réessayer.")
        setIsDeleting(false)
        return
      }
      // Le voyage disparaît de la liste au refresh (la tuile — et cette modale — sont démontées).
      router.refresh()
    } catch {
      setError("Une erreur est survenue.")
      setIsDeleting(false)
    }
  }

  const overlay = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget && !isDeleting) setOpen(false) }}
    >
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-red-50 shrink-0">
            <AlertTriangle className="h-5 w-5 text-red-600" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-slate-900">Supprimer le voyage ?</h2>
            <p className="text-sm text-slate-500 mt-1">
              «&nbsp;{tripName}&nbsp;» sera supprimé avec tous ses segments et ses nuits.
              Cette action est irréversible.
            </p>
          </div>
        </div>

        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

        <div className="flex gap-3 justify-end mt-6">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isDeleting}>
            Annuler
          </Button>
          <Button variant="destructive" onClick={handleDelete} isLoading={isDeleting}>
            Supprimer
          </Button>
        </div>
      </div>
    </div>
  )

  return (
    <>
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true) }}
        title="Supprimer ce voyage"
        className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/90 text-slate-500 hover:text-red-600 hover:bg-white shadow-sm transition-colors"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>

      {mounted && open ? createPortal(overlay, document.body) : null}
    </>
  )
}
