/**
 * All Instagram CSS selectors and URL patterns live here.
 * When Instagram changes its DOM, this is the file to update.
 *
 * Instagram's web UI uses obfuscated class names that rotate, so we lean
 * heavily on stable attributes: href, aria-label, role.
 */

/**
 * Always-hidden surfaces. These hide everywhere on instagram.com, regardless
 * of the current route — e.g., the Reels link in the left sidebar shouldn't
 * tempt the user while they're on their own profile.
 */
export const ALWAYS_HIDE_SELECTORS: readonly string[] = [
  // Desktop left sidebar nav — "Reels" link.
  'a[href="/reels/"]',
  'a[href^="/reels/"][role="link"]',

  // "Explore" link in nav — algorithmic surface, kill it.
  'a[href="/explore/"]',

  // Profile-page "Reels" tab.
  'a[href$="/reels/"][role="tab"]',
];

// 'posts' — hide post articles in <main> (home).
// 'full'  — hide <main> entirely (explore, bare reels discover).
// 'all'   — hide <body> entirely (used by full-block mode, any path).
export type NukeMode = 'posts' | 'full' | 'all' | null;

/**
 * Decide how aggressively to blank the current route.
 *
 * - 'posts' (home `/`): hide individual post articles but leave the stories
 *   strip and sidebar nav alone.
 * - 'full' (Explore, bare Reels discover): blank `<main>` entirely.
 * - null: do nothing. Includes DMs, profiles, individual posts, search, AND
 *   single reels (`/reel/<id>/`, `/reels/<id>/`) — those are intentional
 *   visits from shared links and should render.
 *
 * Note: `/reels` and `/reels/` (bare) is the infinite-scroll discover feed
 * and is blocked, but `/reels/<id>/` is a single reel and is allowed.
 */
export function nukeModeForPath(pathname: string): NukeMode {
  if (pathname === '/') return 'posts';
  if (/^\/explore(\/|$)/.test(pathname)) return 'full';
  if (/^\/reels\/?$/.test(pathname)) return 'full';
  return null;
}
