export const SITE_URL = 'https://getmental.dev';
export const SITE_NAME = 'Mental CLI';
export const VERSION = '0.14.0';
export const INSTALL_CMD = 'npm i -g @balacode/mental';
export const GITHUB_URL = 'https://github.com/afaraha8403/mental';
export const NPM_URL = 'https://www.npmjs.com/package/@balacode/mental';
export const DOCS_URL = '/docs';

/** Sidebar on /docs. `id` matches the markdown file name. */
export const DOC_NAV = [
  {id: 'readme', href: '/docs', label: 'Overview', title: 'Docs', group: 'Start'},
  {id: 'install', href: '/docs/install', label: 'Install', title: 'Install', group: 'Start'},
  {id: 'dashboard', href: '/docs/dashboard', label: 'Dashboard', title: 'Dashboard', group: 'Surfaces'},
  {id: 'hosts', href: '/docs/hosts', label: 'Host UIs', title: 'Host UIs', group: 'Surfaces'},
  {id: 'decide', href: '/docs/decide', label: 'Decision models', title: 'Decision models', group: 'Surfaces'},
  {id: 'cli', href: '/docs/cli', label: 'CLI', title: 'CLI reference', group: 'Reference'},
  {id: 'agents', href: '/docs/agents', label: 'For agents', title: 'For agents', group: 'Reference'},
  {id: 'identity', href: '/docs/identity', label: 'Identity', title: 'Identity', group: 'Reference'},
  {id: 'track', href: '/docs/track', label: 'Time tracking', title: 'Time tracking', group: 'Reference'},
  {id: 'why', href: '/docs/why', label: 'Why', title: 'Why', group: 'Background'},
  {id: 'research', href: '/docs/research', label: 'Research', title: 'Research', group: 'Background'},
  {id: 'benchmarks', href: '/docs/benchmarks', label: 'Benchmarks', title: 'Benchmarks', group: 'Background'},
] as const;

/** Sidebar group order for `DOC_NAV`. */
export const DOC_GROUPS = ['Start', 'Surfaces', 'Reference', 'Background'] as const;

export const README_URL = 'https://github.com/afaraha8403/mental#readme';
export const LICENSE_URL = 'https://github.com/afaraha8403/mental/blob/main/LICENSE';

export const DESCRIPTION =
  'Local-first continuity for you and your coding agents.';

export const TITLE = 'Mental CLI, pick up where your agents left off';

export const OG_IMAGE = `${SITE_URL}/screenshots/dashboard-today.png`;
