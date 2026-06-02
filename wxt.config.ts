import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: '.',
  manifest: {
    name: 'ytblocker',
    description:
      'Block YouTube Shorts and non-educational videos. Local-first, BYO Claude API key.',
    permissions: ['storage', 'activeTab'],
    host_permissions: [
      '*://*.youtube.com/*',
      'https://api.anthropic.com/*',
    ],
    action: {
      default_popup: 'popup.html',
      default_title: 'ytblocker',
    },
    options_ui: {
      page: 'options.html',
      open_in_tab: true,
    },
  },
});
