import { NextRequest } from "next/server"
import { z } from "zod"
import crypto from "crypto"
import { db } from "@/lib/db"
import { sendPasswordResetEmail } from "@/lib/mailer"

const schema = z.object({
  email: z.string().email(),
})

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body: unknown = await request.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ error: "Email invalide." }, { status: 400 })
    }

    const { email } = parsed.data

    // Always return 200 to avoid leaking whether an email is registered
    const user = await db.user.findUnique({ where: { email } })
    if (!user) {
      return Response.json({ ok: true }, { status: 200 })
    }

    // Delete any previous token for this email
    await db.verificationToken.deleteMany({ where: { identifier: email } })

    // Generate a secure random token
    const token   = crypto.randomBytes(32).toString("hex")
    const expires = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

    await db.verificationToken.create({
      data: { identifier: email, token, expires },
    })

    const baseUrl   = process.env.NEXTAUTH_URL ?? "http://localhost:3000"
    const resetUrl  = `${baseUrl}/reset-password?token=${token}`

    try {
      await sendPasswordResetEmail(email, resetUrl)
    } catch (mailError) {
      // En développement : afficher le lien dans les logs plutôt que de bloquer
      if (process.env.NODE_ENV === "development") {
        console.log("\n")
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        console.log("  📧  SMTP non configuré — lien de réinitialisation :")
        console.log(`  ${resetUrl}`)
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        console.log("\n")
      } else {
        console.error("[forgot-password] SMTP error:", mailError)
        return Response.json(
          { error: "Impossible d'envoyer l'email. Vérifiez la configuration SMTP (SMTP_HOST, SMTP_USER, SMTP_PASS) dans .env.local." },
          { status: 500 }
        )
      }
    }

    return Response.json({ ok: true }, { status: 200 })
  } catch (error) {
    console.error("[POST /api/auth/forgot-password]", error)
    return Response.json({ error: "Erreur interne du serveur." }, { status: 500 })
  }
}
