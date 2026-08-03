import { defineContentScript } from '#imports';
import { getSettings, onSettingsChanged } from '@/src/background/storage';
import type { Settings } from '@/src/shared/types';

const STYLE_ID = 'feedblock-site-block-style';
const ATTR = 'data-feedblock-site-blocked';

export default defineContentScript({
  matches: ['*://*/*'],
  runAt: 'document_start',
  async main() {
    apply(await getSettings());
    onSettingsChanged(apply);
  },
});

function isBlocked(settings: Settings): boolean {
  if (!settings.enabled) return false;
  const host = location.hostname;
  return settings.blockedSites.some(
    (domain) => host === domain || host.endsWith(`.${domain}`),
  );
}

function apply(settings: Settings): void {
  if (isBlocked(settings)) {
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = `html[${ATTR}] body{display:none!important;}`;
      document.documentElement.appendChild(style);
    }
    document.documentElement.setAttribute(ATTR, '');
  } else {
    document.getElementById(STYLE_ID)?.remove();
    document.documentElement.removeAttribute(ATTR);
  }
}
