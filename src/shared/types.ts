export type Strictness = 'lenient' | 'moderate' | 'strict';

export interface Settings {
  enabled: boolean;
  shorts: {
    enabled: boolean;
  };
  feedFilter: {
    enabled: boolean;
    allowlist: string[];
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
