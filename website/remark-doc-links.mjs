const GITHUB_BLOB = 'https://github.com/afaraha8403/mental/blob/main/';

/**
 * Rewrite docs links while Sätteri parses markdown.
 * `./cli.md` becomes `/docs/cli`. `../README.md` stays on GitHub.
 */
export const docLinksPlugin = {
  name: 'mental-doc-links',
  link(node, context) {
    rewrite(node, context);
  },
  definition(node, context) {
    rewrite(node, context);
  },
  image(node, context) {
    rewrite(node, context);
  },
};

/**
 * @param {{ url?: string }} node
 * @param {{ setProperty: (node: unknown, key: string, value: string) => void }} context
 */
function rewrite(node, context) {
  if (typeof node.url !== 'string') return;
  const next = mapUrl(node.url);
  if (next !== node.url) context.setProperty(node, 'url', next);
}

/**
 * @param {string} url
 */
function mapUrl(url) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('#') || url.startsWith('//')) {
    return url;
  }
  const hashAt = url.indexOf('#');
  const path = hashAt === -1 ? url : url.slice(0, hashAt);
  const hash = hashAt === -1 ? '' : url.slice(hashAt);
  let rel = path;
  if (rel.startsWith('./')) rel = rel.slice(2);
  if (rel.startsWith('../')) {
    return `${GITHUB_BLOB}${rel.slice(3)}${hash}`;
  }
  if (rel.endsWith('.md')) {
    const slug = rel.slice(0, -3).replace(/\\/g, '/');
    if (slug.toLowerCase() === 'readme') return `/docs${hash}`;
    return `/docs/${slug}${hash}`;
  }
  return url;
}
