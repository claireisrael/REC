import Link from "next/link"

export const metadata = {
  title: "REC26 badge",
  description: "Printable REC conference badge",
}

export default function RecPublicBadgeLayout({ children }) {
  return (
    <div className="rec-public-badge-page">
      <Link href="/" className="rec-public-badge-home">← Home</Link>
      {children}
    </div>
  )
}
