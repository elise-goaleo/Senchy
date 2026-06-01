import { NextRequest } from "next/server"
import { z } from "zod"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"

const schema = z.object({
  token:    z.string().min(1),
  password: z.string().min(8, "Le mot de passe doit contenir au moins 8 caractères."),
})

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body: unknown = await request.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      const msg = parsed.error.errors[0]?.message ?? "Données invalides."
      return Response.json({ error: msg }, { status: 400 })
    }

    const { token, password } = parsed.data

    // Find the token
    const record = await db.verificationToken.findUnique({ where: { token } })

    if (!record) {
      return Response.json(
        { error: "Ce lien est invalide ou a déjà été utilisé." },
        { status: 400 }
      )
    }

    if (record.expires < new Date()) {
      // Clean up expired token
      await db.verificationToken.delete({ where: { token } })
      return Response.json(
        { error: "Ce lien a expiré. Veuillez faire une nouvelle demande." },
        { status: 400 }
      )
    }

    // Find the user by identifier (email)
    const user = await db.user.findUnique({ where: { email: record.identifier } })
    if (!user) {
      return Response.json({ error: "Utilisateur introuvable." }, { status: 400 })
    }

    // Hash the new password and update the user
    const passwordHash = await bcrypt.hash(password, 12)
    await db.user.update({
      where: { id: user.id },
      data: { passwordHash },
    })

    // Delete the token (single-use)
    await db.verificationToken.delete({ where: { token } })

    return Response.json({ ok: true }, { status: 200 })
  } catch (error) {
    console.error("[POST /api/auth/reset-password]", error)
    return Response.json({ error: "Erreur interne du serveur." }, { status: 500 })
  }
}
