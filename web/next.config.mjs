/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  trailingSlash: true,
  experimental: {
    optimizePackageImports: [
      '@mysten/dapp-kit',
      '@mysten/sui.js',
      '@tanstack/react-query',
    ],
  },
};

export default nextConfig;
