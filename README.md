# feedblock

Open-source browser extension that blanks the YouTube and Instagram feeds — Shorts, Reels, Explore, and non-educational videos. Local-first — no backend, no telemetry. Optional LLM classifier uses your own Claude API key.

(Local checkout, npm package, and Safari bundle id are still `ytblocker` for historical reasons — only the GitHub repo and user-visible names have been migrated to `feedblock`.)

**Status:** v0.0.1 — YouTube Shorts blocker, channel allowlist/blocklist, options page, toolbar popup, Claude classifier, and Instagram blocker (Off / Partial / Full modes) all shipped. Verified in Safari and Chrome.

## What it does today

**Shorts blocker (always on):**
- Hides the **Shorts** tab in the left nav
- Hides Shorts shelves on homepage, search results, subscriptions, and watch-page sidebar
- Redirects `youtube.com/shorts/<id>` back to the homepage
- Catches SPA navigation so in-app Shorts links also get blocked

**Channel filter (opt-in):**
- Per-channel **allowlist** (only these channels appear on the home feed and watch sidebar)
- Per-channel **blocklist** (these channels are always hidden, even if the classifier would pass them)
- Add channels by `@handle` in the Options page; pre-seeded with Khan Academy, Amoeba Sisters, and Brian Casel on first install

**Claude classifier (opt-in, BYO API key):**
- For channels not on either list, asks Claude Haiku 4.5 whether the video is educational
- Strict definition: STEM + music videos pass; everything else (vlogs, gaming, comedy, sports, ambiguous content) blocks
- Per-video verdict cache — never re-classifies the same video
- Concurrency throttle (4 in-flight) so YouTube's ~400-tile renders don't blow past the 50 req/min rate limit
- "checking…" badge on tiles awaiting a verdict

**Toolbar popup:**
- Click the icon while on a video or channel page → see current channel + one-click **Allow** / **Block** buttons
- Mirrors the master toggles (Enabled / Feed filter / Claude)

**Bonus:** Search-history dropdown entries (the ones with the × Remove button) are hidden in the YouTube searchbar. Predictive typeahead is left alone.

**Instagram blocker (opt-in, three modes):**
- **Off** — don't touch instagram.com
- **Partial** — blanks the home feed, Explore, and the bare `/reels` index. DMs, profiles, posts, search, and single-reel URLs are left alone
- **Block completely** — blanks every instagram.com page. Set-and-forget for "I just don't want to be here at all"

## What's coming

- Classifier stats in Options (pass/block/error/cache-hit counters)
- Prompt-tuning surface: last N classifications with manual override
- Strictness presets (loose / strict)
- Firefox build

## Install — Chrome / Brave / Edge

Fastest path. Verified on Chrome 131+.

```bash
git clone <this-repo>
cd ytblocker
npm install
npm run build
```

Then in Chrome:

1. Go to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → pick the `.output/chrome-mv3/` folder
   - Note: `.output` is hidden in Finder. Press **⌘⇧.** in the file picker to reveal dotfolders, or **⌘⇧G** and paste the path.
4. Click the puzzle-piece icon in the toolbar and **pin** feedblock for easy access

Visit `youtube.com` — Shorts are gone. Open the extension's **Options** page to add channels or enable the classifier.

## Install — Safari

**Prereqs:** macOS 14+, full Xcode installed (not just Command Line Tools), free Apple ID.

```bash
git clone <this-repo>
cd ytblocker
npm install
npm run safari:wrap     # builds, then runs safari-web-extension-converter
npm run safari:open     # opens the generated Xcode project
```

In Xcode:

1. Set the signing team for both `ytblocker` and `ytblocker Extension` targets (Signing & Capabilities → Team → your free Apple ID).
2. Hit **Run** (⌘R). A small host app called "ytblocker" launches with a button telling you to enable the extension in Safari.
3. Quit the host app.
4. In Safari: **Settings → Extensions** → flip on **ytblocker**.
5. One-time: **Safari → Develop menu → Allow Unsigned Extensions** (the Develop menu appears once you enable Settings → Advanced → "Show features for web developers").

> ⚠️ Safari resets "Allow Unsigned Extensions" each time you quit Safari. You'll need to re-enable it after every Safari restart, or enroll in the paid Apple Developer Program ($99/yr) and sign the app.

## Configure the classifier

1. Get an Anthropic API key at https://console.anthropic.com/settings/keys (small amount of credit required; classifier calls are ~$0.001/video).
2. Open the feedblock Options page → paste the key → click **Test**. Green = good.
3. Enable the **Claude** toggle.
4. Reload `youtube.com`. Unknown-channel tiles will show a "checking…" badge until Haiku returns a verdict.

API keys are stored in `browser.storage.local`, never sent anywhere except `api.anthropic.com`.

## Develop

```bash
npm run build     # one-shot build to .output/chrome-mv3/
npm run dev       # hot-reload dev server (Chrome)
npm run compile   # type-check only
```

**Safari dev loop (after first-time setup):** just `npm run build`, then hit ▶ Run in Xcode. The Xcode project references `.output/chrome-mv3/` directly, so a rebuild is all that's needed.

⚠️ Only re-run `npm run safari:wrap` if the manifest schema changes — the `--force` flag wipes your signing team and you'll have to set it up again.

**Chrome dev loop:** after `npm run build`, hit the ↻ refresh icon on the feedblock card in `chrome://extensions`, then reload the YouTube tab.

## How it works

- **Manifest V3 WebExtension** via [WXT](https://wxt.dev) — same code targets Chrome, Firefox, and Safari from a single source tree.
- **Content script** (`src/sites/youtube/`) runs at `document_start`. It injects a `<style>` tag with Shorts selectors and an empty-allowlist nuke, then a MutationObserver+rAF debounce drives the feed filter against tile DOM.
- **Background script** (`src/background/`) holds the classifier — it manages an in-flight queue, per-video verdict cache in `browser.storage.local`, and the fetch to `api.anthropic.com` (with the `anthropic-dangerous-direct-browser-access` header required for browser-context calls).
- **Content script verdict cache:** there's a second cache inside the content script itself. YouTube's DOM mutates constantly, and an IPC round-trip per scan caused tile flicker. The local cache short-circuits before any runtime message.
- **All YouTube selectors** live in `src/sites/youtube/`. When YouTube changes its DOM, that's where to edit.

## License

MIT.
