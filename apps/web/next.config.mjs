/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 3D assets (glTF/textures) will be served via Cloudflare CDN once Phase 10
  // starts — no image/asset domains configured yet since none exist.
};

export default nextConfig;
