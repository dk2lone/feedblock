import { getSettings, onSettingsChanged, setSettings } from '@/src/background/storage';
import { hashPassword, verifyPassword } from '@/src/shared/password';
import {
  DEFAULT_SETTINGS,
  type AllowlistChannel,
  type InstagramMode,
  type Settings,
} from '@/src/shared/types';
import {
  formatRemaining,
  getUnlockState,
  withCooldownStarted,
  withEnjoyStarted,
  withUnlockCancelled,
} from '@/src/shared/unlockState';
import {
  normalizeHandle,
  resolveHandle,
} from '@/src/sites/youtube/channelResolver';

type Kind = 'allow' | 'block';

const IDS: Record<Kind, { input: string; button: string; status: string; list: string }> = {
  allow: {
    input: 'channel-input',
    button: 'channel-add',
    status: 'channel-status',
    list: 'channel-list',
  },
  block: {
    input: 'block-input',
    button: 'block-add',
    status: 'block-status',
    list: 'block-list',
  },
};

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing from options.html`);
  return el as T;
};

let current: Settings = DEFAULT_SETTINGS;
let settingsWired = false;
let claudeWired = false;
let siteWired = false;
let tickHandle: ReturnType<typeof setInterval> | null = null;

async function init(): Promise<void> {
  current = await getSettings();
  $('unlock-form').addEventListener('submit', (e) => void onUnlockSubmit(e));
  $('cooldown-cancel').addEventListener('click', () => void onCancel());

  renderClaude();
  wireClaude();
  renderSiteSection();
  wireSiteInput();

  onSettingsChanged((s) => {
    current = s;
    renderClaude();
    renderSiteSection();
    routeScreen();
  });
  routeScreen();
  startTicker();
}

function routeScreen(): void {
  const state = getUnlockState(current.password);
  if (state.kind === 'no-password') {
    showSettings(null, null);
    return;
  }
  if (state.kind === 'editing') {
    showSettings(state.editExpiresAt, null);
    return;
  }
  if (state.kind === 'active') {
    showSettings(null, state.revertAt);
    return;
  }
  if (state.kind === 'cooldown') {
    showCooldown(state.unlockAt);
    return;
  }
  showLockScreen();
}

function showLockScreen(): void {
  $('lock-screen').hidden = false;
  $('cooldown-screen').hidden = true;
  $('editing-banner').hidden = true;
  $('active-banner').hidden = true;
  $('settings-main').hidden = true;
  $<HTMLInputElement>('unlock-password').value = '';
  $('unlock-status').hidden = true;
  $<HTMLInputElement>('unlock-password').focus();
}

function showCooldown(unlockAt: number): void {
  $('lock-screen').hidden = true;
  $('cooldown-screen').hidden = false;
  $('editing-banner').hidden = true;
  $('active-banner').hidden = true;
  $('settings-main').hidden = true;
  $('cooldown-countdown').textContent = formatRemaining(unlockAt - Date.now());
}

function showSettings(editExpiresAt: number | null, revertAt: number | null): void {
  $('lock-screen').hidden = true;
  $('cooldown-screen').hidden = true;
  $('editing-banner').hidden = editExpiresAt === null;
  $('active-banner').hidden = revertAt === null;
  $('settings-main').hidden = false;
  if (editExpiresAt !== null) {
    $('editing-countdown').textContent = formatRemaining(editExpiresAt - Date.now());
  }
  if (revertAt !== null) {
    $('active-countdown').textContent = formatRemaining(revertAt - Date.now());
  }
  render();
  if (!settingsWired) {
    wire();
    settingsWired = true;
  }
}

async function onUnlockSubmit(e: Event): Promise<void> {
  e.preventDefault();
  if (getUnlockState(current.password).kind !== 'locked') return;
  const input = $<HTMLInputElement>('unlock-password');
  const status = $('unlock-status');
  const submit = $<HTMLButtonElement>('unlock-submit');
  submit.disabled = true;
  status.hidden = true;
  const ok = await verifyPassword(input.value, current.password);
  submit.disabled = false;
  if (!ok) {
    status.textContent = 'Incorrect password.';
    status.className = 'error';
    status.hidden = false;
    input.select();
    return;
  }
  current = withCooldownStarted(current);
  await setSettings(current);
  routeScreen();
}

async function onCancel(): Promise<void> {
  current = withUnlockCancelled(current);
  await setSettings(current);
  routeScreen();
}

function startTicker(): void {
  if (tickHandle) clearInterval(tickHandle);
  tickHandle = setInterval(() => {
    const state = getUnlockState(current.password);
    if (state.kind === 'cooldown') {
      $('cooldown-countdown').textContent = formatRemaining(state.unlockAt - Date.now());
      if (Date.now() >= state.unlockAt) routeScreen();
      return;
    }
    if (state.kind === 'editing') {
      $('editing-countdown').textContent = formatRemaining(state.editExpiresAt - Date.now());
      if (Date.now() >= state.editExpiresAt) routeScreen();
      return;
    }
    if (state.kind === 'active') {
      $('active-countdown').textContent = formatRemaining(state.revertAt - Date.now());
      if (Date.now() >= state.revertAt) routeScreen();
    }
  }, 1000);
}

function renderClaude(): void {
  $<HTMLInputElement>('claude-enabled').checked = current.claude.enabled;
  $<HTMLInputElement>('claude-key').value = current.claude.apiKey;
}

function wireClaude(): void {
  if (claudeWired) return;
  $('claude-enabled').addEventListener('change', saveClaude);
  $('claude-key').addEventListener('input', debouncedSaveClaude);
  $('test-key').addEventListener('click', testKey);
  claudeWired = true;
}

function saveClaude(): void {
  current = {
    ...current,
    claude: {
      enabled: $<HTMLInputElement>('claude-enabled').checked,
      apiKey: $<HTMLInputElement>('claude-key').value.trim(),
    },
  };
  void setSettings(current);
  flashSaved();
}

const debouncedSaveClaude = debounce(saveClaude, 400);

function render(): void {
  $<HTMLInputElement>('enabled').checked = current.enabled;
  $<HTMLInputElement>('shorts-enabled').checked = current.shortFormVideo.enabled;
  $<HTMLInputElement>('feed-enabled').checked = current.feedFilter.enabled;
  $<HTMLInputElement>(`ig-${current.instagram.mode}`).checked = true;
  renderList('allow');
  renderList('block');
  renderPasswordSection();
}

function renderPasswordSection(): void {
  const set = current.password.enabled;
  $('password-state-label').textContent = set
    ? 'Password is set'
    : 'Password is not set';
  $('password-state-hint').textContent = set
    ? 'Settings and popup require this password to change.'
    : 'Anyone with access to this browser can change settings.';
  $('password-set').hidden = set;
  $('password-change').hidden = !set;
}

function listFor(kind: Kind): AllowlistChannel[] {
  return kind === 'allow'
    ? current.feedFilter.allowlist
    : current.feedFilter.blocklist;
}

function renderList(kind: Kind): void {
  const list = $<HTMLUListElement>(IDS[kind].list);
  list.replaceChildren(...listFor(kind).map((c) => channelRow(kind, c)));
}

function channelRow(kind: Kind, channel: AllowlistChannel): HTMLLIElement {
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
  remove.addEventListener('click', () => void removeChannel(kind, channel.handle));

  li.append(info, remove);
  return li;
}

function renderSiteSection(): void {
  const ul = $<HTMLUListElement>('site-list');
  const state = getUnlockState(current.password);
  const canRemove = state.kind === 'no-password' || state.kind === 'editing' || state.kind === 'active';
  ul.replaceChildren(...current.blockedSites.map((d) => siteRow(d, canRemove)));
}

function siteRow(domain: string, canRemove: boolean): HTMLLIElement {
  const li = document.createElement('li');

  const info = document.createElement('div');
  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = domain;
  info.append(name);

  if (canRemove) {
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => void removeSite(domain));
    li.append(info, remove);
  } else {
    li.append(info);
  }
  return li;
}

function wireSiteInput(): void {
  if (siteWired) return;
  $('site-add').addEventListener('click', () => void addSite());
  $<HTMLInputElement>('site-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void addSite();
    }
  });
  siteWired = true;
}

function normalizeDomain(input: string): string | null {
  let s = input.trim().toLowerCase();
  s = s.replace(/^https?:\/\//, '');
  s = s.replace(/^www\./, '');
  s = s.replace(/[/?#].*$/, '');
  s = s.replace(/\.$/, '');
  if (!s || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(s)) {
    return null;
  }
  return s;
}

async function addSite(): Promise<void> {
  const input = $<HTMLInputElement>('site-input');
  const status = $<HTMLElement>('site-status');
  const domain = normalizeDomain(input.value);
  if (!domain) {
    setStatus(status, 'error', 'Enter a domain like reddit.com');
    return;
  }
  if (current.blockedSites.includes(domain)) {
    setStatus(status, 'error', `${domain} is already blocked`);
    return;
  }
  current = { ...current, blockedSites: [...current.blockedSites, domain] };
  await setSettings(current);
  input.value = '';
  setStatus(status, 'ok', `Blocking ${domain}`);
  renderSiteSection();
}

async function removeSite(domain: string): Promise<void> {
  current = { ...current, blockedSites: current.blockedSites.filter((d) => d !== domain) };
  const state = getUnlockState(current.password);
  if (state.kind === 'editing') {
    current = withEnjoyStarted(current);
  }
  await setSettings(current);
  renderSiteSection();
}

function wire(): void {
  const immediate = ['enabled', 'shorts-enabled', 'feed-enabled'];
  immediate.forEach((id) => $(id).addEventListener('change', save));

  document.querySelectorAll<HTMLInputElement>('input[name="ig-mode"]').forEach(
    (radio) => radio.addEventListener('change', save),
  );

  for (const kind of ['allow', 'block'] as Kind[]) {
    $(IDS[kind].button).addEventListener('click', () => void addChannel(kind));
    $<HTMLInputElement>(IDS[kind].input).addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void addChannel(kind);
      }
    });
  }

  $('password-save').addEventListener('click', () => void setNewPassword());
  $<HTMLInputElement>('password-new').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void setNewPassword();
    }
  });
  $('password-change-save').addEventListener('click', () => void changePassword());
  $<HTMLInputElement>('password-change-new').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void changePassword();
    }
  });
}

async function save(): Promise<void> {
  current = {
    enabled: $<HTMLInputElement>('enabled').checked,
    shortFormVideo: { enabled: $<HTMLInputElement>('shorts-enabled').checked },
    instagram: { mode: readInstagramMode() },
    feedFilter: {
      enabled: $<HTMLInputElement>('feed-enabled').checked,
      allowlist: current.feedFilter.allowlist,
      blocklist: current.feedFilter.blocklist,
      strictness: current.feedFilter.strictness,
    },
    claude: current.claude,
    blockedSites: current.blockedSites,
    password: current.password,
  };
  const state = getUnlockState(current.password);
  if (state.kind === 'editing') {
    current = withEnjoyStarted(current);
  }
  await setSettings(current);
  flashSaved();
}

async function setNewPassword(): Promise<void> {
  const input = $<HTMLInputElement>('password-new');
  const status = $('password-set-status');
  const plain = input.value;
  if (plain.length < 4) {
    setStatus(status, 'error', 'Use at least 4 characters.');
    return;
  }
  const hashed = await hashPassword(plain);
  current = {
    ...current,
    password: { enabled: true, ...hashed, unlockAt: 0, editExpiresAt: 0, revertAt: 0, guard: null },
  };
  await setSettings(current);
  input.value = '';
  setStatus(status, 'ok', 'Password set. Lock takes effect next time you open these pages.');
  renderPasswordSection();
}

async function changePassword(): Promise<void> {
  const input = $<HTMLInputElement>('password-change-new');
  const status = $('password-change-status');
  const plain = input.value;
  if (plain === '') {
    current = {
      ...current,
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
    await setSettings(current);
    setStatus(status, 'ok', 'Password removed.');
    renderPasswordSection();
    return;
  }
  if (plain.length < 4) {
    setStatus(status, 'error', 'Use at least 4 characters, or leave blank to remove.');
    return;
  }
  const hashed = await hashPassword(plain);
  current = {
    ...current,
    password: { enabled: true, ...hashed, unlockAt: 0, editExpiresAt: 0, revertAt: 0, guard: null },
  };
  await setSettings(current);
  input.value = '';
  setStatus(status, 'ok', 'Password updated.');
  renderPasswordSection();
}

function readInstagramMode(): InstagramMode {
  const checked = document.querySelector<HTMLInputElement>(
    'input[name="ig-mode"]:checked',
  );
  const value = checked?.value;
  if (value === 'off' || value === 'partial' || value === 'full') return value;
  return current.instagram.mode;
}

const debouncedSave = debounce(save, 400);

async function addChannel(kind: Kind): Promise<void> {
  const input = $<HTMLInputElement>(IDS[kind].input);
  const button = $<HTMLButtonElement>(IDS[kind].button);
  const status = $<HTMLElement>(IDS[kind].status);

  const raw = input.value;
  const handle = normalizeHandle(raw);
  if (!handle) {
    setStatus(status, 'error', 'Enter a handle like @khanacademy');
    return;
  }
  if (listFor(kind).some((c) => c.handle === handle)) {
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
  if (listFor(kind).some((c) => c.id === result.channel.id)) {
    setStatus(status, 'error', `${result.channel.displayName} is already on the list`);
    return;
  }

  const updated = [...listFor(kind), result.channel];
  current = updateList(current, kind, updated);
  const state = getUnlockState(current.password);
  if (state.kind === 'editing') {
    current = withEnjoyStarted(current);
  }
  await setSettings(current);
  input.value = '';
  setStatus(status, 'ok', `Added ${result.channel.displayName}`);
  renderList(kind);
}

async function removeChannel(kind: Kind, handle: string): Promise<void> {
  const updated = listFor(kind).filter((c) => c.handle !== handle);
  current = updateList(current, kind, updated);
  const state = getUnlockState(current.password);
  if (state.kind === 'editing') {
    current = withEnjoyStarted(current);
  }
  await setSettings(current);
  renderList(kind);
}

function updateList(
  settings: Settings,
  kind: Kind,
  next: AllowlistChannel[],
): Settings {
  return {
    ...settings,
    feedFilter: {
      ...settings.feedFilter,
      ...(kind === 'allow' ? { allowlist: next } : { blocklist: next }),
    },
  };
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
