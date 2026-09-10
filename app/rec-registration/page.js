"use client"

import RecRegistrationForm from "@/components/rec-registration/RecRegistrationForm"

export default function RecRegistrationPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#f4f7f9" }}>
      <header
        style={{
          background: "#0B5E78",
          color: "#fff",
          padding: "1.25rem 1.5rem",
        }}
      >
        <div style={{ maxWidth: 920, margin: "0 auto" }}>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "#F5C078" }}>
            Renewable Energy Conference & Expo
          </div>
          <h1 style={{ fontSize: 28, margin: "6px 0 0" }}>Register</h1>
        </div>
      </header>
      <main style={{ maxWidth: 920, margin: "0 auto", padding: "1.5rem" }}>
        <RecRegistrationForm />
      </main>
    </div>
  )
}
