"use client"

import { useRef, useState, useTransition } from "react"
import { MessageSquare, Check, X, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface Props {
  segmentId: string
  initialNotes: string | null
}

export function SegmentNotes({ segmentId, initialNotes }: Props) {
  const [notes,    setNotes]    = useState(initialNotes ?? "")
  const [editing,  setEditing]  = useState(false)
  const [draft,    setDraft]    = useState(notes)
  const [isPending, startTransition] = useTransition()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function openEditor() {
    setDraft(notes)
    setEditing(true)
    setTimeout(() => textareaRef.current?.focus(), 0)
  }

  function cancel() {
    setEditing(false)
    setDraft(notes)
  }

  function deleteNotes() {
    startTransition(async () => {
      await fetch(`/api/segments/${segmentId}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ notes: null }),
      })
      setNotes("")
    })
  }

  function save() {
    const value = draft.trim()
    startTransition(async () => {
      await fetch(`/api/segments/${segmentId}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ notes: value || null }),
      })
      setNotes(value)
      setEditing(false)
    })
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") cancel()
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save()
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-700">Commentaires</h3>
        </div>
        {!editing && (
          <div className="flex items-center gap-3">
            {notes && (
              <button
                onClick={deleteNotes}
                disabled={isPending}
                className="flex items-center justify-center h-6 w-6 rounded-md text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                aria-label="Supprimer le commentaire"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={openEditor}
              className="text-xs font-bold text-[#D15F36] hover:text-[#b8502d] transition-colors"
            >
              {notes ? "Modifier" : "Ajouter…"}
            </button>
          </div>
        )}
      </div>

      {editing ? (
        <div className="space-y-2">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={4}
            placeholder="Ajoute tes notes, impressions, infos pratiques…"
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-800 placeholder:text-slate-300 outline-none focus:ring-2 focus:ring-[#D15F36]/40 focus:border-[#D15F36]/60 resize-none transition"
          />
          <div className="flex items-center gap-2 justify-end">
            <span className="text-[11px] text-slate-300 mr-auto">⌘↩ pour enregistrer · Échap pour annuler</span>
            <button
              onClick={cancel}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-500 hover:bg-slate-50 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
              Annuler
            </button>
            <button
              onClick={save}
              disabled={isPending}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#D15F36] hover:bg-[#b8502d] text-white text-xs font-semibold disabled:opacity-50 transition-colors"
            >
              <Check className="h-3.5 w-3.5" />
              Enregistrer
            </button>
          </div>
        </div>
      ) : notes ? (
        <button
          onClick={openEditor}
          className={cn(
            "w-full text-left rounded-xl bg-slate-50 hover:bg-slate-100 px-4 py-3 text-sm text-slate-700 whitespace-pre-wrap transition-colors",
          )}
        >
          {notes}
        </button>
      ) : (
        <button
          onClick={openEditor}
          className="w-full text-left rounded-xl border-2 border-dashed border-slate-200 hover:border-slate-300 px-4 py-5 text-sm text-slate-300 italic transition-colors"
        >
          Ajoute tes notes, impressions, infos pratiques…
        </button>
      )}
    </div>
  )
}
