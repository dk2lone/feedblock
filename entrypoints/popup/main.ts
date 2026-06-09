import { browser } from 'wxt/browser';
import { getSettings, setSettings } from '@/src/background/storage';
import { verifyPassword } from '@/src/shared/password';
import { resolveHandle } from '@/src/sites/youtube/channelResolver';
import type { AllowlistChannel, Settings } from '@/src/shared/types';
import type { DetectedChannel } from '@/entrypoints/youtube.content';

type Kind = 'allow' | 'block';

let settings: Settings;
let detected: DetectedChannel | null = null;

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
  if (settings.password.enabled) {
    showLock();
  } else {
    await reveal();
  }
}

function showLock(): void {
  $('lock-section').hidden = false;
  $('toggles-section').hidden = true;
  $('channel-section').hidden = true;
  $('unlock-form').addEventListener('submit', onUnlockSubmit);
  $<HTMLInputElement>('unlock-password').focus();
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
  $('lock-section').hidden = true;
  await reveal();
}

async function reveal(): Promise<void> {
  $('toggles-section').hidden = false;
  $('channel-section').hidden = false;
  renderToggles();
  wireToggles();
  detected = await detectChannelOnActiveTab();
  renderChannelCard();
  wireChannelButtons();
}

function renderToggles(): void {
  $<HTMLInputElement>('enabled').checked = settings.enabled;
  $<HTMLInputElement>('feed-enabled').checked = settings.feedFilter.enabled;
  $<HTMLInputElement>('claude-enabled').checked = settings.claude.enabled;
}

function wireToggles(): void {
  ['enabled', 'feed-enabled', 'claude-enabled'].forEach((id) => {
    $(id).addEventListener('change', () => void saveToggles());
  });
}

async function saveToggles(): Promise<void> {
  settings = {
    ...settings,
    enabled: $<HTMLInputElement>('enabled').checked,
    feedFilter: {
      ...settings.feedFilter,
      enabled: $<HTMLInputElement>('feed-enabled').checked,
    },
    claude: {
      ...settings.claude,
      enabled: $<HTMLInputElement>('claude-enabled').checked,
    },
  };
  await setSettings(settings);
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
    // Content script may not be ready (page still loading, or non-YT subdomain)
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

  // Adding to one list removes from the other — mutual exclusion.
  const other: Kind = kind === 'allow' ? 'block' : 'allow';
  settings = removeFromList(settings, other);
  settings = addToList(settings, kind, channel);
  await setSettings(settings);
  status.textContent = `Added to ${labelFor(kind)}`;
  status.className = 'ok';
  refreshActionButtons();
}

async function buildChannelEntry(): Promise<AllowlistChannel | null> {
  if (!detected) return null;
  // Best path: we have a handle, so call resolveHandle to get a canonical
  // {id, handle, displayName} the same way the Options "Add" flow does.
  if (detected.handle) {
    const result = await resolveHandle(detected.handle);
    if (result.ok) return result.channel;
    // Fall through to id-only fallback below.
  }
  // Channel-id-only fallback (e.g. /channel/UC... pages that didn't expose
  // a handle). Store the id with the id as a placeholder handle so storage
  // normalization accepts it; matching is id-or-handle.
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
