"use client"

import { useEffect, useState, useCallback } from "react"
import { X, Link2, Copy, Check, Loader2, Trash2, UserPlus } from "lucide-react"

interface Collaborator {
  id: string
  userId: string
  name: string | null
  email: string
}

interface ShareState {
  shareToken: string | null
  currentUserId: string
  owner: { id: string; name: string | null; email: string }
  collaborators: Collaborator[]
}

export function ShareTripModal({
  tripId,
  tripName,
  onClose,
}: {
  tripId: string
  tripName: string
  onClose: () => void
}) {
  const [state, setState] = useState<ShareState | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/trips/${tripId}/share`)
      if (!res.ok) throw new Error()
      setState(await res.json())
    } catch {
      setError("Impossible de charger le partage.")
    } finally {
      setLoading(false)
    }
  }, [tripId])

  useEffect(() => {
    load()
  }, [load])

  const shareUrl =
    state?.shareToken && typeof window !== "undefined"
      ? `${window.location.origin}/join/${state.shareToken}`
      : null

  async function enableLink() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/trips/${tripId}/share`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) throw new Error()
      setState((s) => (s ? { ...s, shareToken: data.shareToken } : s))
    } catch {
      setError("Erreur lors de l'activation du lien.")
    } finally {
      setBusy(false)
    }
  }

  async function disableLink() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/trips/${tripId}/share`, { method: "DELETE" })
      if (!res.ok) throw new Error()
      setState((s) => (s ? { ...s, shareToken: null } : s))
    } catch {
      setError("Erreur lors de la désactivation du lien.")
    } finally {
      setBusy(false)
    }
  }

  async function copyLink() {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard indisponible — l'utilisateur peut sélectionner à la main */
    }
  }

  async function removeCollaborator(id: string) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/trips/${tripId}/collaborators/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error()
      setState((s) =>
        s ? { ...s, collaborators: s.collaborators.filter((c) => c.id !== id) } : s
      )
    } catch {
      setError("Erreur lors du retrait du collaborateur.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[1000] overflow-y-auto bg-black/40" onClick={onClose}>
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          className="w-full max-w-md rounded-2xl bg-white shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-emerald-600" />
              <h2 className="text-base font-bold text-slate-900">Partager le voyage</h2>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="p-5">
            <p className="text-sm text-slate-500">
              Partage <span className="font-medium text-slate-700">{tripName}</span>. Toute personne
              disposant du lien pourra le consulter et le modifier après connexion.
            </p>

            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
              </div>
            ) : (
              <>
                {/* Lien de partage */}
                <div className="mt-4">
                  {state?.shareToken ? (
                    <>
                      <div className="flex items-center gap-2">
                        <input
                          readOnly
                          value={shareUrl ?? ""}
                          onFocus={(e) => e.currentTarget.select()}
                          className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600"
                        />
                        <button
                          onClick={copyLink}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-800"
                        >
                          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                          {copied ? "Copié" : "Copier"}
                        </button>
                      </div>
                      <button
                        onClick={disableLink}
                        disabled={busy}
                        className="mt-2 text-xs text-slate-400 hover:text-red-600 disabled:opacity-50"
                      >
                        Désactiver le lien
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={enableLink}
                      disabled={busy}
                      className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
                    >
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                      Activer le lien de partage
                    </button>
                  )}
                </div>

                {/* Membres */}
                {state && (
                  <div className="mt-6">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Personnes ayant accès
                    </h3>
                    <ul className="mt-2 space-y-1.5">
                      <li className="flex items-center justify-between rounded-lg px-2 py-1.5">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-800">
                            {state.owner.name ?? state.owner.email}
                            {state.owner.id === state.currentUserId && " (vous)"}
                          </p>
                          <p className="truncate text-xs text-slate-400">{state.owner.email}</p>
                        </div>
                        <span className="shrink-0 text-xs font-medium text-emerald-700">Propriétaire</span>
                      </li>
                      {state.collaborators.map((c) => (
                        <li
                          key={c.id}
                          className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-slate-50"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-slate-800">
                              {c.name ?? c.email}
                              {c.userId === state.currentUserId && " (vous)"}
                            </p>
                            <p className="truncate text-xs text-slate-400">{c.email}</p>
                          </div>
                          <button
                            onClick={() => removeCollaborator(c.id)}
                            disabled={busy}
                            title="Retirer l'accès"
                            className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
