// @ts-check
import {defineConfig} from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import {satteri} from '@astrojs/markdown-satteri';
import {docLinksPlugin} from './remark-doc-links.mjs';

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
  markdown: {
    processor: satteri({
      mdastPlugins: [docLinksPlugin],
    }),
  },
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
