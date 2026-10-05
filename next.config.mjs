/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["qrcode", "@resvg/resvg-js", "@pdf-lib/fontkit", "pdf-lib", "sharp"],
  outputFileTracingIncludes: {
    "/api/rec/scanning/badges/**/*": ["./public/rec-badges/**/*", "./public/badge/rec26-plate.png"],
    "/api/v1/rec/badges/**/*": ["./public/rec-badges/**/*", "./public/badge/rec26-plate.png"],
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
