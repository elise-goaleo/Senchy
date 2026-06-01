import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Mail, Calendar, Route } from "lucide-react"
import { format } from "date-fns"
import { fr } from "date-fns/locale"
import { AvatarUpload } from "./AvatarUpload"

export const metadata = { title: "Mon profil" }

export default async function ProfilePage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    include: {
      _count: { select: { trips: true } },
    },
  })

  if (!user) redirect("/login")

  const trips = await db.trip.findMany({
    where: { userId: user.id },
    include: { segments: { select: { distanceM: true } } },
  })

  const totalKm = trips
    .flatMap((t) => t.segments)
    .reduce((sum, s) => sum + (s.distanceM ?? 0), 0) / 1000

  const initial = (user.name ?? user.email).charAt(0).toUpperCase()

  return (
    <div className="p-6 lg:p-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Mon profil</h1>

      {/* Avatar + infos */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex items-center gap-5">
            <AvatarUpload
              userId={user.id}
              avatarUrl={user.avatarUrl ?? null}
              initial={initial}
            />
            <div>
              <p className="text-xl font-bold text-slate-900">{user.name ?? "—"}</p>
              <p className="text-sm text-slate-500 flex items-center gap-1.5 mt-0.5">
                <Mail className="h-3.5 w-3.5" />
                {user.email}
              </p>
              <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-1">
                <Calendar className="h-3.5 w-3.5" />
                Membre depuis {format(new Date(user.createdAt), "MMMM yyyy", { locale: fr })}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Statistiques</CardTitle>
          <CardDescription>Récapitulatif de tous vos voyages</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-50 rounded-xl p-4 text-center">
              <p className="text-3xl font-bold text-slate-900">{user._count.trips}</p>
              <p className="text-sm text-slate-500 mt-1">voyage{user._count.trips > 1 ? "s" : ""}</p>
            </div>
            <div className="bg-emerald-50 rounded-xl p-4 text-center">
              <p className="text-3xl font-bold text-emerald-700">{Math.round(totalKm)}</p>
              <p className="text-sm text-emerald-600 mt-1 flex items-center justify-center gap-1">
                <Route className="h-3.5 w-3.5" />
                km planifiés
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
