"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { signOut } from "next-auth/react"
import { Map, LogOut, User, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { useState, useRef, useEffect } from "react"

interface HeaderUser {
  name?: string | null
  email?: string | null
  avatarUrl?: string | null
}

interface HeaderProps {
  user: HeaderUser
}

const navItems = [
  { href: "/dashboard", label: "Mes voyages", icon: Map },
]

export function Header({ user }: HeaderProps) {
  const pathname = usePathname()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  const initial = (user.name ?? user.email ?? "U").charAt(0).toUpperCase()
  const avatarUrl = user.avatarUrl ?? null

  return (
    <header className="h-14 shrink-0 bg-white border-b border-slate-200 flex items-center px-4 gap-4 z-20 shadow-sm">
      {/* Logo */}
      <Link href="/dashboard" className="flex items-center gap-2.5 shrink-0 mr-2">
        <Image src="/logo.webp" alt="VéloVoyage" width={32} height={32} className="rounded-lg" unoptimized />
        <span className="text-lg font-bold text-slate-900 tracking-tight hidden sm:block">
          VéloVoyage
        </span>
      </Link>

      {/* Nav links */}
      <nav className="flex items-center gap-1 flex-1">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || (href !== "/dashboard" && pathname.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-emerald-50 text-emerald-700"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Right side */}
      <div className="flex items-center gap-3 shrink-0">
        {/* User avatar + dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen((v) => !v)}
            className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
            aria-label="Menu utilisateur"
          >
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt="Photo de profil"
                width={32}
                height={32}
                className="h-8 w-8 rounded-full object-cover"
                unoptimized
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#5F7F6F] text-white text-sm font-bold select-none">
                {initial}
              </div>
            )}
            <ChevronDown className={cn("h-3.5 w-3.5 text-slate-400 transition-transform hidden sm:block", dropdownOpen && "rotate-180")} />
          </button>

          {/* Dropdown */}
          {dropdownOpen && (
            <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-xl shadow-lg border border-slate-200 py-1.5 z-50">
              {/* User info */}
              <div className="px-4 py-2.5 border-b border-slate-100">
                {user.name && (
                  <p className="text-sm font-semibold text-slate-900 truncate">{user.name}</p>
                )}
                <p className="text-xs text-slate-400 truncate">{user.email}</p>
              </div>

              <Link
                href="/dashboard"
                onClick={() => setDropdownOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Map className="h-4 w-4 text-slate-400" />
                Mes voyages
              </Link>

              <Link
                href="/profile"
                onClick={() => setDropdownOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <User className="h-4 w-4 text-slate-400" />
                Mon profil
              </Link>

              <div className="border-t border-slate-100 mt-1 pt-1">
                <button
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors w-full text-left"
                >
                  <LogOut className="h-4 w-4" />
                  Se déconnecter
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
