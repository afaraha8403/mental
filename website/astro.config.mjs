// @ts-check
import {defineConfig} from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://getmental.dev',
  trailingSlash: 'never',
  output: 'static',
  compressHTML: true,
  integrations: [
    react(),
    sitemap({
      filter: (page) => !page.includes('/404'),
    }),
  ],
  vite: {
    ssr: {
      noExternal: [
        '@astryxdesign/core',
        '@astryxdesign/theme-neutral',
        '@stylexjs/stylex',
        '@heroicons/react',
      ],
    },
  },
});
