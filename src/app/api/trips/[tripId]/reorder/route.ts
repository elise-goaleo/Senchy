import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { userHasTripAccess } from "@/lib/ownership"
import { z } from "zod"

const schema = z.object({
  order: z.array(z.string()), // segment ids in new order
})

export async function PATCH(
  request: Request,
  { params }: { params: { tripId: string } }
) {
  const session = await auth()
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 })

  if (!(await userHasTripAccess(params.tripId, session.user.id))) return new Response("Forbidden", { status: 403 })

  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return new Response("Invalid body", { status: 400 })

  // Update sortOrder for each segment in a transaction
  await db.$transaction(
    parsed.data.order.map((id, index) =>
      db.segment.update({
        where: { id },
        data: { sortOrder: index },
      })
    )
  )

  return new Response(null, { status: 204 })
}
