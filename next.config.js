/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push('puppeteer');
    }
    return config;
  },
  experimental: {
    serverComponentsExternalPackages: ['puppeteer'],
  },
  // Add output configuration for serverless deployment
  output: 'standalone',
};

module.exports = nextConfig; 