# Mental CLI website

Public marketing site for [Mental CLI](https://github.com/afaraha8403/mental) (`@balacode/mental`). Canonical URL: [https://getmental.dev](https://getmental.dev).

Astro (static) plus React 19 islands, [Astryx](https://astryx.atmeta.com/docs/getting-started) components, and a theme whose tokens copy `assets/dashboard/style.css` in this repo. Screenshots in `public/screenshots/` are from the real dashboard and CLI, not mockups.

This folder is not part of the npm package.

## Develop

```bash
cd website
npm install
npm run dev
```

## Build and preview

```bash
cd website
npm run build
npm run preview
```

`npm run build` rebuilds the Mental Astryx theme, then emits static files into `dist/`.

## Deploy to Cloudflare Workers

Canonical host: **https://getmental.dev** (apex). `www.getmental.dev` 301s to the apex (see `worker.js`). `*.workers.dev` preview stays enabled.

```bash
cd website
npx wrangler login
npm run deploy
```

`npm run deploy` is `npm run build && wrangler deploy`.

### Custom domain (Ali, Cloudflare dashboard or this wrangler file)

Do not buy DNS elsewhere. The zone `getmental.dev` is already on Cloudflare.

1. From `website/`, run `npx wrangler login` on the Cloudflare account that owns `getmental.dev`.
2. Run `npm run deploy`. `wrangler.jsonc` already lists:
   - `getmental.dev` (`custom_domain: true`)
   - `www.getmental.dev` (`custom_domain: true`)
   - `workers_dev: true` (preview URL like `https://getmental.<account>.workers.dev`)
3. If deploy cannot attach the domains, in the Cloudflare dashboard: **Workers & Pages → getmental → Settings → Domains & Routes → Add → Custom domain** for `getmental.dev` and again for `www.getmental.dev`. Cloudflare creates the proxied DNS records. Typical result:
   - Apex `getmental.dev`: proxied AAAA to `100::` (Workers custom domain)
   - `www.getmental.dev`: proxied CNAME to `getmental.<account>.workers.dev` (or the same custom-domain records)
4. Confirm SSL is Universal/managed (automatic on a proxied custom domain).
5. Optional check: `https://www.getmental.dev` should 301 to `https://getmental.dev`.

This repo does not change DNS. Ali must be logged into Wrangler (or attach the domains in the dashboard) on the account that already owns the zone.

## Recapture product screenshots

Needs the Mental CLI in the parent repo, Playwright Chromium, and ffmpeg for the GIF.

```bash
cd website
npm run capture:product
```

Writes WebP/PNG (and a short GIF) into `public/screenshots/`.

After `npm run preview`, capture desktop and mobile previews of this site:

```bash
npm run capture:site
```

Writes `screenshots-of-site/desktop.png` and `screenshots-of-site/mobile.png`.

## Stack notes

- UI: `@astryxdesign/core` components, `@astryxdesign/theme-neutral` extended by `src/themes/mental/mentalTheme.ts`
- Theme build: `npx astryx theme build src/themes/mental/mentalTheme.ts`
- Agent index: `npx astryx init --all` already ran (`AGENTS.md`)
- Fonts: Inter (dashboard `--font-sans`) and JetBrains Mono (dashboard `--font-mono`), self-hosted via fontsource
- Output: static assets Worker (`dist/` + `worker.js` for the www redirect)
