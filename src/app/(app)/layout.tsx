import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { Header } from "@/components/layout/Header"

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  if (!session?.user) {
    redirect("/login")
  }

  let avatarUrl: string | null = null
  if (session.user.id) {
    try {
      const dbUser = await db.user.findUnique({
        where: { id: session.user.id },
        select: { avatarUrl: true },
      })
      avatarUrl = dbUser?.avatarUrl ?? null
    } catch {
      // Non-fatal — header shows initials as fallback
    }
  }

  const user = {
    name:      session.user.name  ?? null,
    email:     session.user.email ?? null,
    avatarUrl,
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-50">
      <Header user={user} />
      <main className="flex-1 min-h-0 overflow-auto">
        {children}
      </main>
    </div>
  )
}
