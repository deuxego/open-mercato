import { createMDX } from 'fumadocs-mdx/next';

const config = {
  reactStrictMode: true,
  output: 'standalone',
  images: {
    remotePatterns: [
      { hostname: 'img.youtube.com' },
    ],
  },
  redirects: async () => [
    {
      source: '/docs',
      destination: '/docs/introduction/overview',
      permanent: false,
    },
  ],
};

const withMDX = createMDX();
export default withMDX(config);
