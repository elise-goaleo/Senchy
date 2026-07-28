import { redirect } from "next/navigation"
import Link from "next/link"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { JoinTripCard } from "./JoinTripCard"

export const metadata = { title: "Rejoindre un voyage" }

const TYPE_LABELS: Record<string, string> = { biketrip: "Voyage à vélo", roadtrip: "Roadtrip" }

export default async function JoinPage({ params }: { params: { token: string } }) {
  const session = await auth()

  // Non connecté → on renvoie vers la connexion en gardant la destination.
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/join/${params.token}`)}`)
  }

  const trip = await db.trip.findUnique({
    where: { shareToken: params.token },
    select: {
      id: true,
      name: true,
      type: true,
      coverImageUrl: true,
      userId: true,
      user: { select: { name: true, email: true } },
      collaborators: { where: { userId: session.user.id }, select: { id: true } },
    },
  })

  // Déjà membre (propriétaire ou collaborateur) → direct au voyage.
  if (trip && (trip.userId === session.user.id || trip.collaborators.length > 0)) {
    redirect(`/trips/${trip.id}`)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {!trip ? (
          <div className="p-8 text-center">
            <h1 className="text-lg font-bold text-slate-900">Lien invalide</h1>
            <p className="mt-2 text-sm text-slate-500">
              Ce lien de partage n&apos;est plus valide ou a été désactivé par son propriétaire.
            </p>
            <Link
              href="/dashboard"
              className="mt-6 inline-block rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800"
            >
              Aller à mes voyages
            </Link>
          </div>
        ) : (
          <>
            <div
              className="h-32 bg-slate-200 bg-cover bg-center"
              style={trip.coverImageUrl ? { backgroundImage: `url(${trip.coverImageUrl})` } : undefined}
            />
            <div className="p-8 text-center">
              <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">
                {TYPE_LABELS[trip.type] ?? "Voyage"}
              </p>
              <h1 className="mt-1 text-xl font-bold text-slate-900">{trip.name}</h1>
              <p className="mt-2 text-sm text-slate-500">
                <span className="font-medium text-slate-700">
                  {trip.user.name ?? trip.user.email}
                </span>{" "}
                vous invite à collaborer sur ce voyage. Vous pourrez le consulter et le modifier.
              </p>
              <JoinTripCard token={params.token} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
