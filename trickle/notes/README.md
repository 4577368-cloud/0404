# Tangbuy Dropshipping App

## Overview
This is a React-based web application for Shopify sellers, featuring 4 core AI modules designed with a Glass Morphism aesthetic.

## Modules
1. **AI Website & Image Analyzer**: Connected to custom MiniMax-M2.1-AWQ model (via vLLM) with "V7.0 Independent Station Diagnosis Engine" system prompt. Performs deep audit on Brand Narrative, Trust, CRO/AOV, and Community.
2. **Winning Product Finder**: Displays trending products from Amazon/TikTok.
3. **Title & SEO Optimizer**: Generates SEO-friendly titles and keywords.
4. **Product Page Optimizer**: Creates marketing copy and HTML.

## Tech Stack
- React 18
- Tailwind CSS (with custom Glass Morphism utility classes)
- Lucide Icons
- Chart.js (included but not heavily used yet)

## Design System
- **Theme**: Glass Morphism (White opacity layers, Blur)
- **Primary Color**: #165DFF (Brand Blue)
- **Secondary**: #36CFC9
- **Accent**: #FF7D00 (Orange)

## Multi-language Support
Currently supports English (en), Chinese (zh), Spanish (es), and French (fr). Managed via `utils/translations.js`.

## Recent Updates (2026-03-12)
- **UI Improvements**: Added rounded corners to the main logo for a softer, more modern look.
- **TikTok Image Fix**: Switched TikTok product images to use direct URLs with `referrerPolicy="no-referrer"` instead of a proxy, resolving display issues caused by proxy blocking.
- **Layout Fixes**: Corrected z-index and padding issues where the header was overlapping the tab navigation.

## Maintenance
- When adding new features, ensure they follow the Glass Morphism design patterns defined in `index.html`.
- Update `utils/translations.js` for any new text to ensure full multi-language support.