# ytblocker

Open-source browser extension that blocks YouTube Shorts and (eventually) non-educational videos. Local-first — no backend, no telemetry. If you opt into the LLM classifier later, you bring your own Claude API key.

**Status:** v0.0.1 — Shorts blocker only. LLM classifier and feed filter coming soon.

## What it does today

- Hides the **Shorts** tab in the left nav
- Hides Shorts shelves on the homepage, search results, subscriptions, and watch-page sidebar
- Redirects any `youtube.com/shorts/<id>` URL back to the homepage
- Catches in-app navigation (YouTube is a single-page app) so Shorts links from anywhere still get blocked

## What's coming

- Per-channel allowlist / blocklist
- Optional LLM classifier (uses your own Claude API key) for unknown channels
- Options page (settings, allowlist editor, "test API key" button)
- Toolbar popup ("allow this channel" one-click action)
- Safari + Firefox builds

## Install — Safari (primary target)

**Prereqs:** macOS 14+, full Xcode installed (not just Command Line Tools), free Apple ID.

```bash
git clone <this-repo>
cd ytblocker
npm install
npm run safari:wrap     # builds, then runs safari-web-extension-converter
npm run safari:open     # opens the generated Xcode project
```

In Xcode:

1. Hit **Run** (⌘R). A small host app called "ytblocker" launches with a button telling you to enable the extension in Safari.
2. Quit the host app.
3. In Safari: **Settings → Extensions** → flip on **ytblocker**.
4. One-time: **Safari → Develop menu → Allow Unsigned Extensions** (this menu appears once you enable Settings → Advanced → "Show features for web developers").

Visit `youtube.com` — Shorts are gone. Visit `youtube.com/shorts/<anything>` — you'll be redirected home.

> ⚠️ Safari resets "Allow Unsigned Extensions" each time you quit Safari. You'll need to re-enable it after every Safari restart, or enroll in the paid Apple Developer Program ($99/yr) and sign the app.

## Install — Chrome / Brave / Edge (faster dev loop)

Same code, different wrapper. If you're iterating, this is 30 seconds vs. Safari's 5 minutes.

```bash
npm install
npm run build
```

Then in Chrome:

1. Go to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Pick the `.output/chrome-mv3/` folder

## Develop

```bash
npm run dev
```

Hot-reloads on changes. Opens a fresh Chrome profile with the extension preloaded.

## How it works

- **Manifest V3 WebExtension.** Same code targets Chrome, Firefox, and (later) Safari via [WXT](https://wxt.dev).
- **Content script** runs at `document_start` on `youtube.com`, injects a `<style>` tag that hides Shorts selectors, and listens for SPA navigation events to catch in-app links to `/shorts/*`.
- **All Shorts selectors** live in `src/sites/youtube/selectors.ts`. When YouTube changes its DOM, that's the only file to edit.

## License

MIT.
