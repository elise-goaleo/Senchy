"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut } from "next-auth/react"
import { Bike, Map, Plus, LogOut, X, Menu } from "lucide-react"
import { cn } from "@/lib/utils"
import { useState } from "react"
import { CreateTripModal } from "@/components/EditTripModal"

interface SidebarUser {
  name?: string | null
  email?: string | null
}

interface SidebarProps {
  user: SidebarUser
}

const navItems = [
  { href: "/dashboard", label: "Mes voyages", icon: Map },
]

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  const navContent = (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-slate-700">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500 shrink-0">
          <Bike className="h-5 w-5 text-white" />
        </div>
        <span className="text-xl font-bold text-white tracking-tight">
          Senchy
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive =
            href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-emerald-500 text-white"
                  : "text-slate-300 hover:text-white hover:bg-slate-700"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          )
        })}

        <CreateTripModal>
          <button
            onClick={() => setMobileOpen(false)}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors w-full text-slate-300 hover:text-white hover:bg-slate-700"
          >
            <Plus className="h-4 w-4 shrink-0" />
            Nouveau voyage
          </button>
        </CreateTripModal>
      </nav>

      {/* User info */}
      <div className="border-t border-slate-700 px-4 py-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-white text-sm font-bold shrink-0">
            {(user.name ?? user.email ?? "U").charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            {user.name && (
              <p className="text-sm font-medium text-white truncate">
                {user.name}
              </p>
            )}
            <p className="text-xs text-slate-400 truncate">{user.email}</p>
          </div>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex items-center gap-2 text-xs text-slate-400 hover:text-white transition-colors w-full"
        >
          <LogOut className="h-3.5 w-3.5" />
          Se déconnecter
        </button>
      </div>
    </div>
  )

  return (
    <>
      {/* Mobile toggle button */}
      <button
        className="fixed top-4 left-4 z-50 flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white shadow-lg lg:hidden"
        onClick={() => setMobileOpen((v) => !v)}
        aria-label="Ouvrir le menu"
      >
        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-64 bg-slate-900 transform transition-transform duration-200 ease-in-out lg:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {navContent}
      </aside>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-64 shrink-0 bg-slate-900 min-h-screen">
        {navContent}
      </aside>
    </>
  )
}
