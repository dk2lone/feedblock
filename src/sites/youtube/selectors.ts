/**
 * All YouTube Shorts CSS selectors live here.
 * When YouTube changes its DOM, this is the file to update.
 */

export const SHORTS_SELECTORS: readonly string[] = [
  // Desktop left navigation
  'ytd-mini-guide-entry[aria-label="Shorts"]',
  'ytd-guide-entry-renderer:has(a[title="Shorts"])',

  // Home feed shelves (the horizontal "Shorts" row)
  'ytd-rich-section-renderer:has([is-shorts])',
  'ytd-reel-shelf-renderer',
  'ytd-rich-shelf-renderer[is-shorts]',

  // Search results
  'grid-shelf-view-model:has(ytm-shorts-lockup-view-model)',
  'ytm-shorts-lockup-view-model',

  // Subscription feed
  'ytd-rich-grid-row:has([is-shorts])',

  // Watch-page sidebar suggestions
  'ytd-compact-video-renderer:has(a[href^="/shorts/"])',

  // Mobile (m.youtube.com)
  'ytm-pivot-bar-item-renderer:has([aria-label="Shorts"])',
  'ytm-reel-shelf-renderer',
];

export const SHORTS_URL_PREFIX = '/shorts/';
