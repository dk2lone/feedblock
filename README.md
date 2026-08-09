<h1><img src="public/icon/128.png" width="32" align="top"> feedblock</h1>

Browser Extension for locking in. Youtube, Instagram, Reddit, Discord, ETC. 

Via Safari or Chrome

## Demo

<!-- Embed: open a new issue on this repo, drag the .mov into the comment box,
     wait for the upload, copy the https://github.com/user-attachments/... URL it
     generates, paste it bare below, then close the tab without submitting. Bare URL,
     no markdown image syntax, or you get a broken image instead of a player. -->

_Coming soon._

## Features

| | |
|---|---|
| **Shorts** | Hides the tab, the shelves, the watch sidebar. Redirects `/shorts/<id>` home. Always on. |
| **Channels** | Allowlist and blocklist by `@handle`. |
| **Claude classifier** | Haiku 4.5 judges unlisted channels. Own API key. |
| **Instagram** | Off, or feed plus explore plus reels, or the whole site. |
| **Reddit** | Home, `/r/popular`, `/r/all`. Individual posts still load. |
| **Any site** | Add a domain. It and its subdomains go blank. |
| **Hidden DMs** | Chosen Instagram contacts vanish from the inbox. Read-only, no reply box. |
| **Password lock** | 15-minute cooldown, 1-minute edit window, 30-minute revert. PBKDF2-SHA256, hashed locally, no recovery. |

## Install: Chrome, Brave, Edge

```bash
git clone https://github.com/dk2lone/feedblock.git
cd feedblock && npm install && npm run build
```

`chrome://extensions` > Developer mode > Load unpacked > `.output/chrome-mv3/`. Finder hides `.output`; press **⌘⇧.** in the picker.

## Install: Safari

Requires macOS 14+, full Xcode, and an Apple ID.

```bash
npm run safari:wrap
npm run safari:open
```

Set the signing team on both targets, press ⌘R, quit the host app. Safari > Settings > Extensions > enable feedblock, then Develop > Allow Unsigned Extensions. Safari drops that last setting on every quit unless you pay for a signed app.

## Claude classifier

Get a key at console.anthropic.com, paste it into Options, hit Test, enable the Claude toggle, reload YouTube. Roughly $0.001 per video. Keys stay in `browser.storage.local` and go only to `api.anthropic.com`.

## Architecture

WXT builds one Manifest V3 tree for Chrome, Firefox, and Safari. Content scripts in `src/sites/` run at `document_start`, inject selectors as a `<style>` tag before first paint, then track SPA navigation with a MutationObserver on an rAF debounce. The background script owns the classifier: four requests in flight at most, verdicts cached in `browser.storage.local`, mirrored in the content script so tile rendering never waits on IPC.

YouTube selectors live in `src/sites/youtube/`. Update them when YouTube changes its markup.

## Development

```bash
npm run build      # one-shot build to .output/chrome-mv3/
npm run dev        # hot-reload dev server (Chrome)
npm run compile    # type-check only
```

Chrome: rebuild, refresh the extension card, reload the tab. Safari: rebuild, press Run in Xcode. Re-run `safari:wrap` only when the manifest schema changes; its `--force` flag wipes your signing team.

## License

MIT
