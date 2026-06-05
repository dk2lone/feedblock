import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: '.',
  manifest: {
    name: 'feedblock',
    description:
      'Blank the YouTube and Instagram feeds — Shorts, Reels, Explore, and (soon) non-educational videos. Local-first, BYO Claude API key.',
    permissions: ['storage', 'activeTab'],
    host_permissions: [
      '*://*.youtube.com/*',
      '*://*.instagram.com/*',
      'https://api.anthropic.com/*',
    ],
    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      96: 'icon/96.png',
      128: 'icon/128.png',
    },
    action: {
      default_popup: 'popup.html',
      default_title: 'feedblock',
      default_icon: {
        16: 'icon/16.png',
        32: 'icon/32.png',
      },
    },
    options_ui: {
      page: 'options.html',
      open_in_tab: true,
    },
  },
});
