import { getSettings, setSettings } from '@/src/background/storage';
import {
  DEFAULT_SETTINGS,
  type AllowlistChannel,
  type Settings,
  type Strictness,
} from '@/src/shared/types';
import {
  normalizeHandle,
  resolveHandle,
} from '@/src/sites/youtube/channelResolver';

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
  $<HTMLInputElement>('claude-enabled').checked = current.claude.enabled;
  $<HTMLInputElement>('claude-key').value = current.claude.apiKey;
  $<HTMLSelectElement>('strictness').value = current.feedFilter.strictness;
  renderChannelList();
}

function renderChannelList(): void {
  const list = $<HTMLUListElement>('channel-list');
  list.replaceChildren(
    ...current.feedFilter.allowlist.map(channelRow),
  );
}

function channelRow(channel: AllowlistChannel): HTMLLIElement {
  const li = document.createElement('li');

  const info = document.createElement('div');
  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = channel.displayName || channel.handle;
  const handle = document.createElement('span');
  handle.className = 'handle';
  handle.textContent = `@${channel.handle}`;
  info.append(name, handle);

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.textContent = 'Remove';
  remove.addEventListener('click', () => void removeChannel(channel.handle));

  li.append(info, remove);
  return li;
}

function wire(): void {
  const immediate = ['enabled', 'shorts-enabled', 'feed-enabled', 'claude-enabled', 'strictness'];
  immediate.forEach((id) => $(id).addEventListener('change', save));

  $('claude-key').addEventListener('input', debouncedSave);
  $('test-key').addEventListener('click', testKey);
  $('channel-add').addEventListener('click', () => void addChannel());
  $<HTMLInputElement>('channel-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void addChannel();
    }
  });
}

async function save(): Promise<void> {
  current = {
    enabled: $<HTMLInputElement>('enabled').checked,
    shorts: { enabled: $<HTMLInputElement>('shorts-enabled').checked },
    feedFilter: {
      enabled: $<HTMLInputElement>('feed-enabled').checked,
      allowlist: current.feedFilter.allowlist,
      blocklist: current.feedFilter.blocklist,
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

async function addChannel(): Promise<void> {
  const input = $<HTMLInputElement>('channel-input');
  const button = $<HTMLButtonElement>('channel-add');
  const status = $<HTMLElement>('channel-status');

  const raw = input.value;
  const handle = normalizeHandle(raw);
  if (!handle) {
    setStatus(status, 'error', 'Enter a handle like @khanacademy');
    return;
  }
  if (current.feedFilter.allowlist.some((c) => c.handle === handle)) {
    setStatus(status, 'error', `@${handle} is already on the list`);
    return;
  }

  button.disabled = true;
  setStatus(status, '', 'Looking up channel…');
  const result = await resolveHandle(handle);
  button.disabled = false;

  if (!result.ok) {
    setStatus(status, 'error', reasonText(result.reason));
    return;
  }
  if (current.feedFilter.allowlist.some((c) => c.id === result.channel.id)) {
    setStatus(status, 'error', `${result.channel.displayName} is already on the list`);
    return;
  }

  current = {
    ...current,
    feedFilter: {
      ...current.feedFilter,
      allowlist: [...current.feedFilter.allowlist, result.channel],
    },
  };
  await setSettings(current);
  input.value = '';
  setStatus(status, 'ok', `Added ${result.channel.displayName}`);
  renderChannelList();
}

async function removeChannel(handle: string): Promise<void> {
  current = {
    ...current,
    feedFilter: {
      ...current.feedFilter,
      allowlist: current.feedFilter.allowlist.filter(
        (c) => c.handle !== handle,
      ),
    },
  };
  await setSettings(current);
  renderChannelList();
}

function reasonText(reason: 'invalid-input' | 'not-found' | 'network' | 'parse'): string {
  switch (reason) {
    case 'invalid-input':
      return 'That doesn\'t look like a valid handle.';
    case 'not-found':
      return 'No channel with that handle.';
    case 'network':
      return 'Network error — try again.';
    case 'parse':
      return 'Couldn\'t read the channel page. YouTube may have changed its HTML.';
  }
}

function setStatus(el: HTMLElement, cls: '' | 'ok' | 'error', msg: string): void {
  el.textContent = msg;
  el.className = cls;
}

function debounce<T extends () => void>(fn: T, ms: number): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
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
