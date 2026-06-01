"use client"

import { useState, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
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
import { CheckCircle2, Eye, EyeOff } from "lucide-react"

function ResetPasswordForm() {
  const router      = useRouter()
  const searchParams = useSearchParams()
  const token       = searchParams.get("token") ?? ""

  const [password,   setPassword]   = useState("")
  const [confirm,    setConfirm]    = useState("")
  const [showPwd,    setShowPwd]    = useState(false)
  const [isLoading,  setIsLoading]  = useState(false)
  const [success,    setSuccess]    = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  const isValid =
    password.length >= 8 &&
    password === confirm

  const confirmError =
    confirm.length > 0 && password !== confirm
      ? "Les mots de passe ne correspondent pas."
      : null

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!isValid) return
    setError(null)
    setIsLoading(true)

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? "Une erreur s'est produite.")
        return
      }

      setSuccess(true)
      setTimeout(() => router.push("/login?reset=1"), 2500)
    } catch {
      setError("Une erreur inattendue s'est produite.")
    } finally {
      setIsLoading(false)
    }
  }

  // Missing or obviously invalid token
  if (!token) {
    return (
      <Card className="shadow-xl border-0">
        <CardHeader className="pb-4 text-center">
          <CardTitle className="text-xl">Lien invalide</CardTitle>
          <CardDescription>
            Ce lien de réinitialisation est invalide ou a expiré.
          </CardDescription>
        </CardHeader>
        <CardFooter className="justify-center pb-6">
          <Link
            href="/forgot-password"
            className="text-sm text-emerald-600 hover:text-emerald-700 hover:underline font-medium"
          >
            Faire une nouvelle demande
          </Link>
        </CardFooter>
      </Card>
    )
  }

  if (success) {
    return (
      <Card className="shadow-xl border-0">
        <CardHeader className="pb-4 text-center">
          <div className="flex justify-center mb-3">
            <CheckCircle2 className="h-12 w-12 text-emerald-500" />
          </div>
          <CardTitle className="text-xl">Mot de passe modifié !</CardTitle>
          <CardDescription>
            Votre mot de passe a bien été réinitialisé. Redirection vers la connexion…
          </CardDescription>
        </CardHeader>
        <CardFooter className="justify-center pb-6">
          <Link
            href="/login"
            className="text-sm text-emerald-600 hover:text-emerald-700 hover:underline font-medium"
          >
            Se connecter maintenant
          </Link>
        </CardFooter>
      </Card>
    )
  }

  return (
    <Card className="shadow-xl border-0">
      <CardHeader className="pb-4">
        <CardTitle className="text-xl">Nouveau mot de passe</CardTitle>
        <CardDescription>
          Choisissez un mot de passe d&apos;au moins 8 caractères.
        </CardDescription>
      </CardHeader>

      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3">
              <p className="text-sm text-red-700">{error}</p>
              {error.includes("expiré") || error.includes("invalide") ? (
                <Link
                  href="/forgot-password"
                  className="text-sm text-red-600 underline mt-1 block"
                >
                  Faire une nouvelle demande
                </Link>
              ) : null}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="password">Nouveau mot de passe</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPwd ? "text" : "password"}
                placeholder="8 caractères minimum"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoFocus
                autoComplete="new-password"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPwd((v) => !v)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-600"
                tabIndex={-1}
              >
                {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {password.length > 0 && password.length < 8 && (
              <p className="text-xs text-red-500">Au moins 8 caractères requis.</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm">Confirmer le mot de passe</Label>
            <Input
              id="confirm"
              type={showPwd ? "text" : "password"}
              placeholder="Répétez le mot de passe"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              autoComplete="new-password"
            />
            {confirmError && (
              <p className="text-xs text-red-500">{confirmError}</p>
            )}
          </div>
        </CardContent>

        <CardFooter className="flex flex-col gap-4 pt-2">
          <Button
            type="submit"
            className="w-full"
            isLoading={isLoading}
            disabled={!isValid}
          >
            Réinitialiser le mot de passe
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}

export default function ResetPasswordPage() {
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

        <Suspense fallback={<div />}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  )
}
