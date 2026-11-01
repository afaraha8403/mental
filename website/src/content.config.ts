import {defineCollection} from 'astro:content';
import {glob} from 'astro/loaders';

const docs = defineCollection({
  loader: glob({
    pattern: '*.md',
    base: '../docs',
    generateId: ({entry}) => entry.replace(/\.md$/i, '').toLowerCase(),
  }),
});

export const collections = {docs};
