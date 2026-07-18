# Fonts

Currently loaded via Google Fonts CDN in `index.html`:
- **Cinzel** (600, 700) — display/heading font, used for the logo, buttons,
  room code, card corners. Gives the "engraved brass plate" casino feel.
- **Inter** (400–700) — body font for everything else (forms, labels, chip counts).

## To self-host instead of using the CDN
1. Download both families (e.g. from Google Fonts or fonts.google.com/download)
2. Drop the `.woff2` files in this folder
3. Add `@font-face` rules to `src/styles/theme.css` pointing at them
4. Remove the `<link>` tags from `index.html`

No component code needs to change either way — everything references the
fonts through the `--font-display` / `--font-body` CSS variables.
