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

export interface PasswordLock {
  enabled: boolean;
  hash: string;
  salt: string;
  iterations: number;
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
  },
};
