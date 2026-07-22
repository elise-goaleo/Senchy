import { redirect } from "next/navigation"

// La création se fait désormais via la modale (CreateTripModal) depuis le
// dashboard / la sidebar. On redirige les anciens liens vers le dashboard.
export default function NewTripPage() {
  redirect("/dashboard")
}
