"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ArrowLeft, CheckCircle2 } from "lucide-react"

export default function ForgotPasswordPage() {
  const [email, setEmail]       = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [sent, setSent]         = useState(false)
  const [error, setError]       = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? "Une erreur s'est produite. Réessayez.")
        return
      }

      setSent(true)
    } catch {
      setError("Une erreur inattendue s'est produite.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo / Brand */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <Image src="/logo.webp" alt="VéloVoyage" width={48} height={48} className="rounded-xl shadow-lg" unoptimized />
          <div>
            <h1 className="text-2xl font-bold text-white">VeloRoute</h1>
            <p className="text-xs text-emerald-400">Bike Trip Planner</p>
          </div>
        </div>

        <Card className="shadow-xl border-0">
          {sent ? (
            <>
              <CardHeader className="pb-4 text-center">
                <div className="flex justify-center mb-3">
                  <CheckCircle2 className="h-12 w-12 text-emerald-500" />
                </div>
                <CardTitle className="text-xl">Email envoyé !</CardTitle>
                <CardDescription>
                  Si un compte existe pour <strong>{email}</strong>, vous recevrez
                  un lien de réinitialisation dans quelques instants.
                </CardDescription>
              </CardHeader>
              <CardFooter className="justify-center pb-6">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-1.5 text-sm text-emerald-600 hover:text-emerald-700 hover:underline font-medium"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Retour à la connexion
                </Link>
              </CardFooter>
            </>
          ) : (
            <>
              <CardHeader className="pb-4">
                <CardTitle className="text-xl">Mot de passe oublié ?</CardTitle>
                <CardDescription>
                  Entrez votre email et nous vous enverrons un lien pour réinitialiser votre mot de passe.
                </CardDescription>
              </CardHeader>

              <form onSubmit={handleSubmit}>
                <CardContent className="space-y-4">
                  {error && (
                    <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3">
                      <p className="text-sm text-red-700">{error}</p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="email">Adresse email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="vous@exemple.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                      autoFocus
                    />
                  </div>
                </CardContent>

                <CardFooter className="flex flex-col gap-4 pt-2">
                  <Button
                    type="submit"
                    className="w-full"
                    isLoading={isLoading}
                    disabled={!email}
                  >
                    Envoyer le lien de réinitialisation
                  </Button>

                  <Link
                    href="/login"
                    className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition-colors"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Retour à la connexion
                  </Link>
                </CardFooter>
              </form>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
