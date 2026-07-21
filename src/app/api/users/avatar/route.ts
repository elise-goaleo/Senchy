import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getAuthenticatedUser, unauthorized } from "@/lib/api-auth"

const MAX_SIZE = 5 * 1024 * 1024 // 5 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"]

export async function POST(req: NextRequest) {
  const authUser = await getAuthenticatedUser()
  if (!authUser) return unauthorized()

  const formData = await req.formData()
  const file = formData.get("file") as File | null

  if (!file) {
    return NextResponse.json({ error: "Fichier manquant" }, { status: 400 })
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "Fichier trop volumineux (max 5 Mo)" }, { status: 400 })
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Format non supporté (jpg, png, webp)" }, { status: 400 })
  }

  try {
    // Stockage en data URL (base64) directement en base — compatible hébergement serverless
    const buffer  = Buffer.from(await file.arrayBuffer())
    const avatarUrl = `data:${file.type};base64,${buffer.toString("base64")}`

    await db.user.update({
      where: { id: authUser.id },
      data:  { avatarUrl },
    })

    return NextResponse.json({ avatarUrl })
  } catch (err) {
    console.error("[avatar upload]", err)
    return NextResponse.json({ error: "Erreur interne lors de l'enregistrement." }, { status: 500 })
  }
}
