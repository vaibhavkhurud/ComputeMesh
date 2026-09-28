/* eslint-env node */
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_API_URL: process.env.API_BASE_URL || 'http://localhost:3001',
    NEXT_PUBLIC_APP_ENV: process.env.APP_ENV || 'development',
  },
};

export default nextConfig;
