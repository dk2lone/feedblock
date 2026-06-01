export type Strictness = 'lenient' | 'moderate' | 'strict';

export interface AllowlistChannel {
  id: string;
  handle: string;
  displayName: string;
  addedAt: number;
}

export interface Settings {
  enabled: boolean;
  shorts: {
    enabled: boolean;
  };
  feedFilter: {
    enabled: boolean;
    allowlist: AllowlistChannel[];
    blocklist: string[];
    strictness: Strictness;
  };
  claude: {
    apiKey: string;
    enabled: boolean;
  };
}

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  shorts: { enabled: true },
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
};
