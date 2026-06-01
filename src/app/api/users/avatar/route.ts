import { NextRequest, NextResponse } from "next/server"
import { writeFile, mkdir, unlink } from "fs/promises"
import path from "path"
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

  // Delete old avatar file if it exists
  const existing = await db.user.findUnique({
    where: { id: authUser.id },
    select: { avatarUrl: true },
  })
  if (existing?.avatarUrl) {
    const oldFilename = existing.avatarUrl.split("/").pop()
    if (oldFilename) {
      try {
        await unlink(path.join(process.cwd(), "public", "uploads", "avatars", oldFilename))
      } catch {
        // File may already be gone — ignore
      }
    }
  }

  // Save new file
  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const dir = path.join(process.cwd(), "public", "uploads", "avatars")
    await mkdir(dir, { recursive: true })

    const filename = `${authUser.id}-${Date.now()}.jpg`
    await writeFile(path.join(dir, filename), buffer)

    const avatarUrl = `/uploads/avatars/${filename}`

    await db.user.update({
      where: { id: authUser.id },
      data: { avatarUrl },
    })

    return NextResponse.json({ avatarUrl })
  } catch (err) {
    console.error("[avatar upload]", err)
    return NextResponse.json({ error: "Erreur interne lors de l'enregistrement." }, { status: 500 })
  }
}
