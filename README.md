# 🐦 feedblock

Blanks the YouTube, Instagram, and Reddit feeds. Everything else on those sites keeps working.

No backend, no telemetry, no account. Chrome, Brave, Edge, Safari. MIT.

## Demo

<!-- To embed: open a new issue on this repo, drag the .mov into the comment box,
     wait for the upload to finish, copy the https://github.com/user-attachments/...
     URL it generates, paste it bare on the line below, then close the issue tab
     without submitting. Bare URL, no markdown image syntax, or you get a broken
     image instead of a player. -->

_Demo video coming._

## Why

Every blocker I tried had one setting: off. Kill YouTube and the lectures go with it. feedblock takes the feed and leaves the rest.

The classifier is the part that got interesting. Allowlists stop scaling somewhere past a few dozen channels, so anything unlisted goes to Claude Haiku, which rules educational or not. YouTube renders roughly 400 tiles per scroll, the API allows 50 requests a minute, and any lag at all shows up as tiles flickering in and out of the page while you watch.

## What it does

| | |
|---|---|
| **Shorts** | Hides the tab, the shelves, the watch sidebar. Redirects `/shorts/<id>` home. Always on. |
| **Channels** | Allowlist and blocklist by `@handle`. |
| **Claude classifier** | Haiku 4.5 judges unlisted channels. Bring your own key. |
| **Instagram** | Off, or feed plus explore plus reels, or the whole site. |
| **Reddit** | Home, `/r/popular`, `/r/all`. Individual posts still load. |
| **Any site** | Add a domain. It and its subdomains go blank. |
| **Hidden DMs** | Chosen Instagram contacts vanish from the inbox. Read-only, no reply box. |
| **Password lock** | 15-minute cooldown, 1-minute edit window, 30-minute revert. PBKDF2-SHA256, hashed locally, no recovery. |

The 15-minute cooldown is the point of the lock. Whatever sent you to the settings page has usually passed by the time it opens.

## How it works

WXT builds one Manifest V3 source tree for Chrome, Firefox, and Safari.

Content scripts in `src/sites/` run at `document_start`. Each one injects its selectors as a `<style>` tag before first paint so nothing flashes on screen, then a MutationObserver on an rAF debounce keeps up with SPA navigation and infinite scroll.

The background script owns the classifier: four requests in flight at most, a per-video verdict cache in `browser.storage.local`, one fetch to `api.anthropic.com`.

The content script keeps its own copy of that cache. An IPC round trip per tile during a mutation storm made everything flicker, so the local copy answers first and `runtime.sendMessage` mostly never fires.

YouTube selectors live in `src/sites/youtube/`. Edit there when YouTube reshuffles its markup.

## Install (Chrome, Brave, Edge)

```bash
git clone https://github.com/dk2lone/feedblock.git
cd feedblock
npm install
npm run build
```

Go to `chrome://extensions`, turn on Developer mode, click Load unpacked, pick `.output/chrome-mv3/`. Finder hides `.output`, so press **⌘⇧.** in the picker to see it.

Open youtube.com. Shorts are gone. Everything else lives in Options.

## Install (Safari)

Needs macOS 14+, full Xcode, and a free Apple ID.

```bash
npm run safari:wrap
npm run safari:open
```

In Xcode, set the signing team on both targets, press ⌘R, then quit the little host app that launches. Over in Safari: Settings, Extensions, enable feedblock. Then Develop, Allow Unsigned Extensions.

Safari forgets that last setting every time you quit it. Re-enable it on each restart, or pay Apple $99 a year and sign the app properly.

## Classifier

Grab a key from console.anthropic.com. Classification runs about $0.001 a video. Paste the key into Options, hit Test, flip the Claude toggle, reload YouTube. Unlisted tiles carry a "checking..." badge until Haiku answers.

Keys sit in `browser.storage.local` and go nowhere but Anthropic.

## Develop

```bash
npm run build      # one-shot build to .output/chrome-mv3/
npm run dev        # hot-reload dev server (Chrome)
npm run compile    # type-check only
```

Chrome: rebuild, hit the refresh icon on the extension card, reload the tab. Safari: rebuild, press Run in Xcode, since the project points straight at `.output/chrome-mv3/`.

Only re-run `safari:wrap` if the manifest schema changes. Its `--force` flag wipes your signing team.

## License

MIT.
