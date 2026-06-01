"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ArrowLeft } from "lucide-react"

export default function NewTripPage() {
  const router = useRouter()

  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [globalError, setGlobalError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErrors({})
    setGlobalError(null)

    if (!name.trim()) {
      setErrors({ name: ["Le nom du voyage est requis."] })
      return
    }

    setIsLoading(true)

    try {
      const res = await fetch("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        if (data.details) {
          setErrors(data.details)
        } else {
          setGlobalError(data.error ?? "Une erreur s'est produite.")
        }
        return
      }

      const trip = await res.json()
      router.push(`/trips/${trip.id}`)
    } catch {
      setGlobalError("Impossible de créer le voyage. Veuillez réessayer.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="p-6 lg:p-8 max-w-2xl mx-auto">
      {/* Back link */}
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 mb-6 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Retour aux voyages
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Nouveau voyage</CardTitle>
          <CardDescription>
            Donnez un nom à votre voyage et commencez à planifier vos étapes.
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-5">
            {globalError && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3">
                <p className="text-sm text-red-700">{globalError}</p>
              </div>
            )}

            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name">
                Nom du voyage <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                type="text"
                placeholder="Ex : Tour des Alpes 2025"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
                maxLength={200}
              />
              {errors.name && (
                <p className="text-xs text-red-600">{errors.name[0]}</p>
              )}
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description (optionnelle)</Label>
              <textarea
                id="description"
                rows={4}
                placeholder="Décrivez votre voyage, vos objectifs..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={2000}
                className="flex w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50 resize-none"
              />
              {errors.description && (
                <p className="text-xs text-red-600">{errors.description[0]}</p>
              )}
              <p className="text-xs text-slate-400 text-right">
                {description.length}/2000
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Link href="/dashboard">
                <Button type="button" variant="outline">
                  Annuler
                </Button>
              </Link>
              <Button type="submit" isLoading={isLoading} disabled={!name.trim()}>
                Créer le voyage
              </Button>
            </div>
          </CardContent>
        </form>
      </Card>
    </div>
  )
}
