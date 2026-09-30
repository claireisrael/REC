"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

const NAV_ITEMS = [
  { href: "/dashboard/rec-conference", label: "Overview" },
  { href: "/dashboard/rec-conference/admin/conferences", label: "Conferences" },
  { href: "/dashboard/rec-conference/admin/programs", label: "Programs" },
  { href: "/dashboard/rec-conference/admin/registrations", label: "Registrations" },
  { href: "/dashboard/rec-conference/admin/coupons", label: "Coupons" },
  { href: "/dashboard/rec-conference/admin/media", label: "Media" },
  { href: "/dashboard/rec-conference/admin/reports", label: "Reports" },
  { href: "/dashboard/rec-conference/admin/scanning", label: "Scanning" },
  { href: "/rec-registration", label: "Public register" },
  { href: "/rec-scanner", label: "Scanner" },
]

function deskBack(pathname) {
  const path = (pathname || "/").replace(/\/$/, "")
  if (path === "/dashboard" || path === "/dashboard/rec-conference") {
    return { href: "/", label: "Home" }
  }
  if (!path.startsWith("/dashboard")) return null

  const conferenceEdit = path.match(/\/admin\/conferences\/edit\/([^/]+)$/)
  if (conferenceEdit) {
    return { href: `/dashboard/rec-conference/admin/conferences/${conferenceEdit[1]}`, label: "Back" }
  }

  const programEdit = path.match(/\/admin\/programs\/edit\/([^/]+)$/)
  if (programEdit) {
    return { href: `/dashboard/rec-conference/admin/programs/${programEdit[1]}`, label: "Back" }
  }

  const timeslots = path.match(/(\/admin\/programs\/[^/]+\/sessions)\/timeslots$/)
  if (timeslots) return { href: `/dashboard/rec-conference${timeslots[1]}`, label: "Back" }

  const session = path.match(/(\/admin\/programs\/[^/]+\/sessions)\/[^/]+$/)
  if (session) return { href: `/dashboard/rec-conference${session[1]}`, label: "Back" }

  const sessions = path.match(/(\/admin\/programs\/[^/]+)\/sessions$/)
  if (sessions) return { href: `/dashboard/rec-conference${sessions[1]}`, label: "Back" }

  if (/\/admin\/registrations\/(new|import|.+\/edit)$/.test(path)) {
    return { href: "/dashboard/rec-conference/admin/registrations", label: "Back" }
  }
  if (/\/admin\/programs\/new$/.test(path) || /\/admin\/programs\/[^/]+$/.test(path)) {
    return { href: "/dashboard/rec-conference/admin/programs", label: "Back" }
  }
  if (/\/admin\/conferences\/(new|[^/]+)$/.test(path)) {
    return { href: "/dashboard/rec-conference/admin/conferences", label: "Back" }
  }
  if (/\/admin\/scanning\/(?!events$).+/.test(path)) {
    return { href: "/dashboard/rec-conference/admin/scanning/events", label: "Back" }
  }

  return { href: "/dashboard/rec-conference", label: "Back" }
}

export default function DashboardLayout({ children }) {
  const pathname = usePathname()
  const back = deskBack(pathname)

  return (
    <div>
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          height: "var(--header-height)",
          display: "flex",
          alignItems: "center",
          gap: "1.5rem",
          padding: "0 1.25rem",
          background: "#0B5E78",
          color: "#fff",
        }}
      >
        {back && (
          <Link href={back.href} style={{ color: "#fff", textDecoration: "none", fontWeight: 700, fontSize: "0.85rem", whiteSpace: "nowrap" }}>
            ← {back.label}
          </Link>
        )}
        <Link href="/dashboard/rec-conference" style={{ fontWeight: 800, textDecoration: "none" }}>
          REC Test
        </Link>
        <nav style={{ display: "flex", gap: "0.85rem", flexWrap: "wrap", fontSize: "0.9rem" }}>
          {NAV_ITEMS.map((item) => {
            const active =
              item.href === "/dashboard/rec-conference"
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(`${item.href}/`)
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  color: "#fff",
                  textDecoration: "none",
                  opacity: active ? 1 : 0.8,
                  fontWeight: active ? 700 : 500,
                }}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
      </header>
      <main>{children}</main>
    </div>
  )
}
