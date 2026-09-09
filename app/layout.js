import "bootstrap/dist/css/bootstrap.min.css"
import "@fortawesome/fontawesome-svg-core/styles.css"
import "react-phone-input-2/lib/style.css"
import "../styles/portal-kit.css"
import "./globals.css"
import { AppwriteProvider } from "@/lib/appwrite/provider"
import { AuthProvider } from "@/lib/auth/auth-provider"

export const metadata = {
  title: "REC System (test)",
  description: "Standalone Renewable Energy Conference test app",
}

export const dynamic = "force-dynamic"

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AppwriteProvider>
          <AuthProvider>{children}</AuthProvider>
        </AppwriteProvider>
      </body>
    </html>
  )
}
