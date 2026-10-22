/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Trim the response envelope and keep payloads compressed at the edge.
  poweredByHeader: false,
  compress: true,
  experimental: { serverActions: { bodySizeLimit: '12mb' } },
};
export default nextConfig;
