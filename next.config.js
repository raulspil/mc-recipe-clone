/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push('puppeteer-core', 'chrome-aws-lambda');
    }
    return config;
  },
  experimental: {
    serverComponentsExternalPackages: ['puppeteer-core', 'chrome-aws-lambda'],
  },
  // Add output configuration for serverless deployment
  output: 'standalone',
  // Add headers configuration
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, must-revalidate',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig; 