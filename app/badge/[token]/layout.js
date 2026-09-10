export const metadata = {
  title: "REC26 badge",
  description: "Printable REC conference badge",
}

export default function RecPublicBadgeLayout({ children }) {
  return (
    <div className="rec-public-badge-page">
      {children}
    </div>
  )
}
