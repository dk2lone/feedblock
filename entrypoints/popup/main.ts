import { browser } from 'wxt/browser';
import { getSettings, onSettingsChanged, setSettings } from '@/src/background/storage';
import { verifyPassword } from '@/src/shared/password';
import {
  formatRemaining,
  getUnlockState,
  withCooldownStarted,
  withEnjoyStarted,
  withUnlockCancelled,
} from '@/src/shared/unlockState';
import { resolveHandle } from '@/src/sites/youtube/channelResolver';
import type { AllowlistChannel, Settings } from '@/src/shared/types';
import type { DetectedChannel } from '@/entrypoints/youtube.content';

type Kind = 'allow' | 'block';

let settings: Settings;
let detected: DetectedChannel | null = null;
let tickHandle: ReturnType<typeof setInterval> | null = null;
let renderedPhase: string | null = null;
let togglesWired = false;
let claudeWired = false;
let channelWired = false;

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing from popup.html`);
  return el as T;
};

async function init(): Promise<void> {
  settings = await getSettings();
  $('open-options').addEventListener('click', () => {
    void browser.runtime.openOptionsPage();
    window.close();
  });
  $('unlock-form').addEventListener('submit', (e) => void onUnlockSubmit(e));
  $('cooldown-cancel').addEventListener('click', () => void onCancel());

  renderClaude();
  wireClaude();
  void revealChannel();

  onSettingsChanged((s) => {
    settings = s;
    renderClaude();
    render();
  });
  render();
  startTicker();
}

function render(): void {
  const state = getUnlockState(settings.password);

  if (state.kind === 'no-password') {
    showOpen();
    return;
  }
  if (state.kind === 'editing') {
    showEditing(state.editExpiresAt);
    return;
  }
  if (state.kind === 'active') {
    showActive(state.revertAt);
    return;
  }
  if (state.kind === 'cooldown') {
    showCooldown(state.unlockAt);
    return;
  }
  showLocked();
}

function hideAll(): void {
  $('lock-section').hidden = true;
  $('cooldown-section').hidden = true;
  $('editing-section').hidden = true;
  $('active-section').hidden = true;
  $('toggles-section').hidden = true;
}

function showLocked(): void {
  hideAll();
  $('lock-section').hidden = false;
  if (renderedPhase !== 'locked') {
    $<HTMLInputElement>('unlock-password').value = '';
    $('unlock-status').hidden = true;
    $<HTMLInputElement>('unlock-password').focus();
  }
  renderedPhase = 'locked';
}

function showCooldown(unlockAt: number): void {
  hideAll();
  $('cooldown-section').hidden = false;
  $('cooldown-countdown').textContent = formatRemaining(unlockAt - Date.now());
  renderedPhase = 'cooldown';
}

function showEditing(editExpiresAt: number): void {
  hideAll();
  $('editing-section').hidden = false;
  $('toggles-section').hidden = false;
  $('editing-countdown').textContent = formatRemaining(editExpiresAt - Date.now());
  if (renderedPhase !== 'editing') {
    renderToggles();
    if (!togglesWired) {
      wireToggles();
      togglesWired = true;
    }
  }
  renderedPhase = 'editing';
}

function showActive(revertAt: number): void {
  hideAll();
  $('active-section').hidden = false;
  $('toggles-section').hidden = false;
  $('active-countdown').textContent = formatRemaining(revertAt - Date.now());
  if (renderedPhase !== 'active') {
    renderToggles();
    if (!togglesWired) {
      wireToggles();
      togglesWired = true;
    }
  }
  renderedPhase = 'active';
}

function showOpen(): void {
  hideAll();
  $('toggles-section').hidden = false;
  if (renderedPhase !== 'open') {
    renderToggles();
    if (!togglesWired) {
      wireToggles();
      togglesWired = true;
    }
  }
  renderedPhase = 'open';
}

function startTicker(): void {
  if (tickHandle) clearInterval(tickHandle);
  tickHandle = setInterval(() => {
    const state = getUnlockState(settings.password);
    if (state.kind === 'cooldown') {
      $('cooldown-countdown').textContent = formatRemaining(state.unlockAt - Date.now());
      if (Date.now() >= state.unlockAt) render();
      return;
    }
    if (state.kind === 'editing') {
      $('editing-countdown').textContent = formatRemaining(state.editExpiresAt - Date.now());
      if (Date.now() >= state.editExpiresAt) render();
      return;
    }
    if (state.kind === 'active') {
      $('active-countdown').textContent = formatRemaining(state.revertAt - Date.now());
      if (Date.now() >= state.revertAt) render();
      return;
    }
  }, 1000);
}

async function onUnlockSubmit(e: Event): Promise<void> {
  e.preventDefault();
  const input = $<HTMLInputElement>('unlock-password');
  const status = $('unlock-status');
  const button = $<HTMLButtonElement>('unlock-submit');
  button.disabled = true;
  status.hidden = true;
  const ok = await verifyPassword(input.value, settings.password);
  button.disabled = false;
  if (!ok) {
    status.textContent = 'Incorrect password.';
    status.className = 'status error';
    status.hidden = false;
    input.select();
    return;
  }
  settings = withCooldownStarted(settings);
  await setSettings(settings);
  render();
}

async function onCancel(): Promise<void> {
  settings = withUnlockCancelled(settings);
  await setSettings(settings);
  render();
}

function renderClaude(): void {
  $<HTMLInputElement>('claude-enabled').checked = settings.claude.enabled;
}

function wireClaude(): void {
  if (claudeWired) return;
  $('claude-enabled').addEventListener('change', () => void saveClaude());
  claudeWired = true;
}

async function saveClaude(): Promise<void> {
  settings = {
    ...settings,
    claude: { ...settings.claude, enabled: $<HTMLInputElement>('claude-enabled').checked },
  };
  await setSettings(settings);
}

function renderToggles(): void {
  $<HTMLInputElement>('enabled').checked = settings.enabled;
  $<HTMLInputElement>('feed-enabled').checked = settings.feedFilter.enabled;
}

function wireToggles(): void {
  ['enabled', 'feed-enabled'].forEach((id) => {
    $(id).addEventListener('change', () => void saveToggles());
  });
}

async function saveToggles(): Promise<void> {
  // If we're in the editing window and user makes a change, start the 30-min enjoy period.
  const state = getUnlockState(settings.password);
  settings = {
    ...settings,
    enabled: $<HTMLInputElement>('enabled').checked,
    feedFilter: {
      ...settings.feedFilter,
      enabled: $<HTMLInputElement>('feed-enabled').checked,
    },
  };
  if (state.kind === 'editing') {
    settings = withEnjoyStarted(settings);
  }
  await setSettings(settings);
}

async function revealChannel(): Promise<void> {
  detected = await detectChannelOnActiveTab();
  renderChannelCard();
  wireChannelButtons();
}

async function detectChannelOnActiveTab(): Promise<DetectedChannel | null> {
  const tabs = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });
  const tab = tabs[0];
  if (!tab?.id || !tab.url) return null;
  if (!/^https?:\/\/(www\.)?youtube\.com\//.test(tab.url)) return null;
  try {
    const result = (await browser.tabs.sendMessage(tab.id, {
      type: 'getCurrentChannel',
    })) as DetectedChannel | null;
    return result ?? null;
  } catch {
    return null;
  }
}

function renderChannelCard(): void {
  const hasChannel = !!detected && (!!detected.handle || !!detected.id);
  $('channel-empty').hidden = hasChannel;
  $('channel-detail').hidden = !hasChannel;
  if (!hasChannel || !detected) return;
  $('channel-name').textContent =
    detected.displayName || detected.handle || detected.id || '(unknown)';
  $('channel-handle').textContent = detected.handle
    ? `@${detected.handle}`
    : (detected.id ?? '');
  refreshActionButtons();
}

function refreshActionButtons(): void {
  if (!detected) return;
  const allowBtn = $<HTMLButtonElement>('add-allow');
  const blockBtn = $<HTMLButtonElement>('add-block');
  const onAllow = isOnList('allow');
  const onBlock = isOnList('block');
  allowBtn.disabled = false;
  blockBtn.disabled = false;
  allowBtn.textContent = onAllow ? '✓ Allowed' : 'Allow';
  blockBtn.textContent = onBlock ? '✓ Blocked' : 'Block';
  allowBtn.classList.toggle('selected', onAllow);
  blockBtn.classList.toggle('selected', onBlock);
}

function isOnList(kind: Kind): boolean {
  if (!detected) return false;
  const list =
    kind === 'allow'
      ? settings.feedFilter.allowlist
      : settings.feedFilter.blocklist;
  return list.some((c) => matchesDetected(c));
}

function matchesDetected(c: AllowlistChannel): boolean {
  if (!detected) return false;
  if (detected.id && c.id && c.id === detected.id) return true;
  if (detected.handle && c.handle === detected.handle) return true;
  return false;
}

function wireChannelButtons(): void {
  $('add-allow').addEventListener('click', () => void toggle('allow'));
  $('add-block').addEventListener('click', () => void toggle('block'));
}

async function toggle(kind: Kind): Promise<void> {
  if (!detected) return;
  const status = $('channel-status');
  const button = $<HTMLButtonElement>(kind === 'allow' ? 'add-allow' : 'add-block');

  if (isOnList(kind)) {
    settings = removeFromList(settings, kind);
    const state = getUnlockState(settings.password);
    if (state.kind === 'editing') settings = withEnjoyStarted(settings);
    await setSettings(settings);
    status.textContent = `Removed from ${labelFor(kind)}`;
    status.className = 'ok';
    refreshActionButtons();
    return;
  }

  button.disabled = true;
  status.textContent = 'Adding…';
  status.className = '';

  const channel = await buildChannelEntry();
  if (!channel) {
    status.textContent = `Couldn't resolve channel.`;
    status.className = 'error';
    button.disabled = false;
    return;
  }

  const other: Kind = kind === 'allow' ? 'block' : 'allow';
  settings = removeFromList(settings, other);
  settings = addToList(settings, kind, channel);
  const state = getUnlockState(settings.password);
  if (state.kind === 'editing') settings = withEnjoyStarted(settings);
  await setSettings(settings);
  status.textContent = `Added to ${labelFor(kind)}`;
  status.className = 'ok';
  refreshActionButtons();
}

async function buildChannelEntry(): Promise<AllowlistChannel | null> {
  if (!detected) return null;
  if (detected.handle) {
    const result = await resolveHandle(detected.handle);
    if (result.ok) return result.channel;
  }
  if (detected.id) {
    return {
      id: detected.id,
      handle: detected.id.toLowerCase(),
      displayName: detected.displayName || detected.id,
      addedAt: Date.now(),
    };
  }
  return null;
}

function addToList(
  s: Settings,
  kind: Kind,
  ch: AllowlistChannel,
): Settings {
  const current =
    kind === 'allow' ? s.feedFilter.allowlist : s.feedFilter.blocklist;
  if (current.some((c) => (c.id && c.id === ch.id) || c.handle === ch.handle)) {
    return s;
  }
  const next = [...current, ch];
  return {
    ...s,
    feedFilter: {
      ...s.feedFilter,
      ...(kind === 'allow' ? { allowlist: next } : { blocklist: next }),
    },
  };
}

function removeFromList(s: Settings, kind: Kind): Settings {
  if (!detected) return s;
  const filterOut = (c: AllowlistChannel) => !matchesDetected(c);
  return {
    ...s,
    feedFilter: {
      ...s.feedFilter,
      allowlist:
        kind === 'allow'
          ? s.feedFilter.allowlist.filter(filterOut)
          : s.feedFilter.allowlist,
      blocklist:
        kind === 'block'
          ? s.feedFilter.blocklist.filter(filterOut)
          : s.feedFilter.blocklist,
    },
  };
}

function labelFor(kind: Kind): string {
  return kind === 'allow' ? 'allowlist' : 'blocklist';
}

void init();
