import { auth } from "@/lib/auth"

export interface AuthenticatedUser {
  id: string
  email: string
}

/**
 * Resolves the authenticated user from the current NextAuth session.
 * Returns null if the user is not authenticated (caller must return a 401).
 */
export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const session = await auth()
  if (!session?.user?.id || !session.user.email) {
    return null
  }
  return {
    id: session.user.id,
    email: session.user.email,
  }
}

/** Convenience: returns a 401 JSON Response. */
export function unauthorized(): Response {
  return Response.json({ error: "Unauthorized" }, { status: 401 })
}
