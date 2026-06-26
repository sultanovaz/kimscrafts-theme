# AI Frontier — dashboard

A borderless, mobile-first AI intelligence dashboard. Every frontier model, lab,
benchmark and product launch in one feed — built so you can grind in the real
world and still never miss a move in AI.

**Live URL (after the one-time setup below):**
https://sultanovaz.github.io/kimscrafts-theme/

## What's here

- `index.html` — the dashboard (self-contained: HTML + CSS + vanilla JS, no build step).
- `data.json` — curated "Frontier intel" feed, generated from deep research + news feeds.
- `seed.json` — the durable, fact-checked research base the refresher always builds on.
- `build/fetch-news.mjs` — Node script (run by CI) that rebuilds `data.json`.
- `manifest.webmanifest` + `assets/icon.svg` — installable PWA ("Add to home screen").
- `countdown/` — the original "The 90" countdown, preserved at `/countdown/`.

## How it stays fresh (two independent layers)

1. **Live pulse** — fetched *in your browser* every time you open the page
   (Hacker News via Algolia + dev.to). Always current, needs no server, works
   even if everything else fails.
2. **Frontier intel** — `data.json`, refreshed by the `Refresh AI Frontier data`
   GitHub Action every ~3 hours. It merges fresh news-feed items on top of the
   curated research base, dedupes, and commits the result. This only needs
   `contents: write`, so it avoids the Pages-API permission the integration lacks.

> Scheduled Actions only run on the **default branch**, so the auto-refresh
> begins once this is merged to `main`. Until then, the committed `data.json`
> plus the in-browser Live pulse keep it fresh.

## One-time setup (repo owner)

GitHub Pages can't be enabled by the automation token, so flip it on once:

1. Repo **Settings → Pages**.
2. **Build and deployment → Source:** `Deploy from a branch`.
3. **Branch:** `main`, folder **`/docs`** → Save.
   *(To preview before merging, pick the feature branch instead.)*
4. Wait ~1 minute, then open https://sultanovaz.github.io/kimscrafts-theme/
   and tap **Add to home screen** for the full-screen app.
