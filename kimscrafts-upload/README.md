# KimsCrafts Theme — v2.0

A custom Shopify 2.0 theme built for KimsCrafts handmade leather book wallets. Editorial, tactile, made for small-batch craft brands.

## Design language

**Palette:** Navy `#1A3553` · Tan `#C47B47` · Cream `#F5EDE0` · Paper `#FBFAF7`

**Fonts (via Google Fonts CDN):** Fraunces (display, variable) · DM Sans (body)

**Motifs:** Saddle-stitch dashed dividers · paper-grain texture overlay · warm-tan accents · italic emphasis in headings · ultra-wide eyebrow labels

## Features

### Product pages
- **Qty-aware pricing** — Add-to-cart button shows live total, updating as you change quantity or add upsells
- **Compact upsell bundles** — 5 upsell blocks per product, configurable from theme editor. Each checks-in via real Shopify products so pricing is accurate. Supports text input for personalization (initials)
- **Sticky mobile ATC bar** — Appears on scroll, floats add-to-cart so it's always in reach
- **Trust row** — Free shipping · fast ship · returns
- **JSON-LD schema** — Built-in for SEO

### Cart
- **Free-shipping progress bar** — Visual urgency toward your threshold
- **Gift note field** — Collapsible, auto-saves to cart note
- **Trust strip** — Secure checkout · returns · shipping
- **Cart drawer (optional)** — Slide-in cart, set in theme settings

### Homepage sections (35+ to mix and match)
- Editorial hero · Collection grid · Press logos · Founder note · Image + text · Featured testimonial · Value bar · Reviews · Social grid · Lookbook · FAQ · Newsletter · Countdown banner · Announcement strip · Shop by category · Timeline / story · Before / After · Video hero · Related products

### Other
- **Blog + article** templates with drop-cap first-letter
- **404, search, generic page** templates
- **Password page**
- **Customer account** pages (7)
- **Reduced-motion + print** stylesheets
- **Customizable** color palette, typography scale, spacing, button styles via theme settings

## Setup

1. Upload theme via Shopify Admin → Online Store → Themes → Upload
2. Go to **Customize** to configure
3. Set **Brand colors** and **Typography** in theme settings
4. Add products to the collection called "Homepage" (or change in collection-grid section)
5. For product upsells: create addon products tagged `upsell-addon`, then assign them to upsell blocks in the Product section

## Upsell setup

1. Create 5 Shopify products (hidden from collections) with the tag `upsell-addon`:
   - Vegan leather conditioner — $12
   - Saddle-stitch gift box — $8
   - Carbon-neutral shipping — $3
   - Personalized initials — $10 (requires text input)
   - Extended 2-year warranty — $9

2. In theme customizer → Product section → each Upsell block → assign its matching product

3. Button price will now update live with quantity × base + selected upsells

## Structure

```
assets/       CSS, JS, SVG patterns & icon sprite
config/       settings_schema.json (theme customization), settings_data.json
layout/       theme.liquid, password.liquid
locales/      en.default.json
sections/     All section files (36+)
snippets/     Reusable components (icons, meta tags)
templates/    Page templates (index.json, product.json, etc.)
```

## CSS conventions

- All classes prefixed `kc-` (KimsCrafts)
- CSS custom properties in `:root` — `--kc-navy`, `--kc-tan`, `--kc-f-display`, etc.
- BEM-ish: `.kc-block__element--modifier`
- Utilities prefixed `kc-u-` (e.g., `kc-u-mt-m`)

## JS conventions

- Vanilla JS, no dependencies
- All behavior in `theme.js`, no inline scripts
- Uses `data-*` attributes for hooks
- IntersectionObserver for scroll animations
- Progressive enhancement — everything works without JS

## Browser support

- Latest 2 versions of Chrome, Safari, Firefox, Edge
- iOS Safari 14+
- Gracefully degrades in older browsers (no fancy selectors, no CSS `:has()` fallbacks needed but styled progressively)

## Changelog

**v2.0** — Qty-aware pricing · Compact upsells · Sticky mobile ATC · 14 new sections (FAQ, press logos, image+text, featured testimonial, social grid, lookbook, countdown, related products, newsletter, video hero, shop by category, timeline, announcement strip, before/after) · Cart drawer · Blog/article/search/404/page templates · Comprehensive settings schema · Icon sprite · Print & reduced-motion styles

**v1.0** — Initial release
