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

export default function DashboardLayout({ children }) {
  const pathname = usePathname()

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
