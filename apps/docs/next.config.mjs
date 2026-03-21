import { createMDX } from 'fumadocs-mdx/next';

const config = {
  reactStrictMode: true,
  output: 'standalone',
};

const withMDX = createMDX();
export default withMDX(config);
