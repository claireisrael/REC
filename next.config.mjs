/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["qrcode"],
  images: {
    unoptimized: true,
  },
}

export default nextConfig
