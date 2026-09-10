export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return

  const dns = await import("node:dns")
  try {
    dns.setDefaultResultOrder("ipv4first")
  } catch {
    // Ignore older Node runtimes without this API.
  }
}
