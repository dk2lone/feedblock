export type Strictness = 'lenient' | 'moderate' | 'strict';

// 'partial' = blank feed/explore/reels only (DMs, profiles, posts, search,
// single reels still load). 'full' = blank every page on instagram.com.
export type InstagramMode = 'off' | 'partial' | 'full';

export interface AllowlistChannel {
  id: string;
  handle: string;
  displayName: string;
  addedAt: number;
}

export const COOLDOWN_MS = 15 * 60_000;
export const EDIT_WINDOW_MS = 1 * 60_000;
export const REVERT_DELAY_MS = 30 * 60_000;

// Snapshot of every "off switch" at the moment the unlock countdown starts.
// On auto-revert we slam these back so anything the user toggled off during
// the editing window is undone.
export interface UnlockGuard {
  enabled: boolean;
  shortFormVideo: { enabled: boolean };
  instagram: { mode: InstagramMode };
  feedFilter: { enabled: boolean };
}

export interface PasswordLock {
  enabled: boolean;
  hash: string;
  salt: string;
  iterations: number;
  // When the 15-min cooldown ends and the 1-min editing window opens. 0 = inactive.
  unlockAt: number;
  // When the 1-min editing window closes. 0 = inactive.
  editExpiresAt: number;
  // When the 30-min enjoy period ends and guard restores. 0 = no changes made.
  revertAt: number;
  // Captured when password accepted; restored when revertAt passes.
  guard: UnlockGuard | null;
}

export interface Settings {
  enabled: boolean;
  shortFormVideo: {
    enabled: boolean;
  };
  instagram: {
    mode: InstagramMode;
  };
  feedFilter: {
    enabled: boolean;
    allowlist: AllowlistChannel[];
    blocklist: AllowlistChannel[];
    strictness: Strictness;
  };
  claude: {
    apiKey: string;
    enabled: boolean;
  };
  password: PasswordLock;
}

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  shortFormVideo: { enabled: true },
  instagram: { mode: 'partial' },
  feedFilter: {
    enabled: false,
    allowlist: [],
    blocklist: [],
    strictness: 'moderate',
  },
  claude: {
    apiKey: '',
    enabled: false,
  },
  password: {
    enabled: false,
    hash: '',
    salt: '',
    iterations: 0,
    unlockAt: 0,
    editExpiresAt: 0,
    revertAt: 0,
    guard: null,
  },
};
