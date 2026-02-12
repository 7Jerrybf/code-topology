import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Enable React Strict Mode for development
  reactStrictMode: true,
  // Standalone output for Docker deployment (set NEXT_OUTPUT_STANDALONE=1 in Docker build)
  ...(process.env.NEXT_OUTPUT_STANDALONE === '1' ? { output: 'standalone' as const } : {}),
  // Transpile workspace packages
  transpilePackages: ['@topology/protocol', '@topology/core'],
};

export default nextConfig;
