import { getSettings, setSettings } from '@/src/background/storage';
import {
  DEFAULT_SETTINGS,
  type Settings,
  type Strictness,
} from '@/src/shared/types';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing from options.html`);
  return el as T;
};

let current: Settings = DEFAULT_SETTINGS;

async function init(): Promise<void> {
  current = await getSettings();
  render();
  wire();
}

function render(): void {
  $<HTMLInputElement>('enabled').checked = current.enabled;
  $<HTMLInputElement>('shorts-enabled').checked = current.shorts.enabled;
  $<HTMLInputElement>('feed-enabled').checked = current.feedFilter.enabled;
  $<HTMLTextAreaElement>('allowlist').value =
    current.feedFilter.allowlist.join('\n');
  $<HTMLTextAreaElement>('blocklist').value =
    current.feedFilter.blocklist.join('\n');
  $<HTMLInputElement>('claude-enabled').checked = current.claude.enabled;
  $<HTMLInputElement>('claude-key').value = current.claude.apiKey;
  $<HTMLSelectElement>('strictness').value = current.feedFilter.strictness;
}

function wire(): void {
  const immediate = ['enabled', 'shorts-enabled', 'feed-enabled', 'claude-enabled', 'strictness'];
  immediate.forEach((id) => $(id).addEventListener('change', save));

  const deferred = ['allowlist', 'blocklist', 'claude-key'];
  deferred.forEach((id) => $(id).addEventListener('input', debouncedSave));

  $('test-key').addEventListener('click', testKey);
}

async function save(): Promise<void> {
  current = {
    enabled: $<HTMLInputElement>('enabled').checked,
    shorts: { enabled: $<HTMLInputElement>('shorts-enabled').checked },
    feedFilter: {
      enabled: $<HTMLInputElement>('feed-enabled').checked,
      allowlist: parseLines($<HTMLTextAreaElement>('allowlist').value),
      blocklist: parseLines($<HTMLTextAreaElement>('blocklist').value),
      strictness: $<HTMLSelectElement>('strictness').value as Strictness,
    },
    claude: {
      enabled: $<HTMLInputElement>('claude-enabled').checked,
      apiKey: $<HTMLInputElement>('claude-key').value.trim(),
    },
  };
  await setSettings(current);
  flashSaved();
}

const debouncedSave = debounce(save, 400);

function debounce<T extends () => void>(fn: T, ms: number): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
}

function parseLines(s: string): string[] {
  return s
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

function flashSaved(): void {
  const el = $('save-indicator');
  el.textContent = '✓ saved';
  setTimeout(() => {
    el.textContent = '';
  }, 1200);
}

async function testKey(): Promise<void> {
  const status = $<HTMLElement>('key-status');
  const key = $<HTMLInputElement>('claude-key').value.trim();
  if (!key) {
    status.textContent = '✗ enter a key first';
    status.className = 'error';
    return;
  }
  status.textContent = 'testing…';
  status.className = '';
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 8,
        messages: [{ role: 'user', content: 'ping' }],
      }),
    });
    if (resp.ok) {
      status.textContent = '✓ key works';
      status.className = 'ok';
    } else {
      const body = await resp.text();
      status.textContent = `✗ ${resp.status}: ${truncate(body, 100)}`;
      status.className = 'error';
    }
  } catch (e) {
    status.textContent = `✗ network error: ${(e as Error).message}`;
    status.className = 'error';
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

void init();
