import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Enable React Strict Mode for development
  reactStrictMode: true,
  // Transpile workspace packages
  transpilePackages: ['@topology/protocol', '@topology/core'],
};

export default nextConfig;
