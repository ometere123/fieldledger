import type { NextConfig } from 'next';
import {fileURLToPath} from 'node:url';
const config: NextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  distDir: process.env.FIELDLEDGER_NEXT_DIST_DIR || '.next',
  outputFileTracingRoot: fileURLToPath(new URL('../..', import.meta.url)),
};
export default config;
