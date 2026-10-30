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

Production deploys run in GitHub Actions (`.github/workflows/deploy-website.yml`), not from a laptop. The workflow builds `website/` and runs `wrangler deploy` when `website/` changes on `main`, when a GitHub Release is published, or when someone runs the workflow by hand. It authenticates with the repo secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. The token is the Cloudflare "Edit Cloudflare Workers" template, scoped to this account and the `getmental.dev` zone. Do not commit either value.

`npm run deploy` (`npm run build && wrangler deploy`) is only for a local check against an account you are already logged into. It is not how getmental.dev ships.

Wrangler reads `website/.env` when you run it from this folder. Copy `.env.example` to `.env` and fill the two Cloudflare values. The same two names are GitHub Actions secrets. `NPM_TOKEN` stays a GitHub secret only. The Mental CLI does not load this file. Decision-model keys go in `~/.mental/config.json` via `mental option decide key`.

### Custom domain

Do not buy DNS elsewhere. The zone `getmental.dev` is already on Cloudflare. `wrangler.jsonc` lists both hosts as custom domains, and the GitHub deploy attaches them:

- `getmental.dev` (`custom_domain: true`)
- `www.getmental.dev` (`custom_domain: true`)
- `workers_dev: true` (preview URL like `https://getmental.<account>.workers.dev`)

If a deploy cannot attach the domains, in the Cloudflare dashboard: **Workers & Pages → getmental → Settings → Domains & Routes → Add → Custom domain** for `getmental.dev` and again for `www.getmental.dev`. Cloudflare creates the proxied DNS records. Typical result:

- Apex `getmental.dev`: proxied AAAA to `100::` (Workers custom domain)
- `www.getmental.dev`: proxied CNAME to `getmental.<account>.workers.dev` (or the same custom-domain records)

SSL is Universal/managed on a proxied custom domain. `https://www.getmental.dev` should 301 to `https://getmental.dev`. This repo does not edit DNS by hand.

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
