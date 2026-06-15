import { browser } from 'wxt/browser';
import { getSettings, onSettingsChanged, setSettings } from '@/src/background/storage';
import { resolveHandle } from '@/src/sites/youtube/channelResolver';
import type { AllowlistChannel, Settings } from '@/src/shared/types';
import type { DetectedChannel } from '@/entrypoints/youtube.content';

type Kind = 'allow' | 'block';

let settings: Settings;
let detected: DetectedChannel | null = null;
let channelWired = false;
let dmWired = false;
let siteWired = false;
let onYouTube = false;
let onInstagram = false;

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

  // Detect active tab to show context-aware sections
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const url = tabs[0]?.url ?? '';
  onYouTube = /^https?:\/\/(www\.)?youtube\.com\//.test(url);
  onInstagram = /^https?:\/\/(www\.)?instagram\.com\//.test(url);

  renderSiteSection();
  wireSiteInput();

  if (onInstagram) {
    $('dm-section').hidden = false;
    renderDmSection();
    wireDmInput();
  }

  if (onYouTube) {
    $('channel-section').hidden = false;
    void revealChannel();
  }

  onSettingsChanged((s) => {
    settings = s;
    renderSiteSection();
    if (onInstagram) renderDmSection();
  });
}

// --- Blocked sites (always visible) ------------------------------------------

function renderSiteSection(): void {
  const ul = $<HTMLUListElement>('site-list');
  ul.replaceChildren(...settings.blockedSites.map((d) => siteRow(d)));
}

function siteRow(domain: string): HTMLLIElement {
  const li = document.createElement('li');
  const span = document.createElement('span');
  span.className = 'domain';
  span.textContent = domain;
  li.append(span);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = 'Remove';
  btn.addEventListener('click', () => void removeSite(domain));
  li.append(btn);
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

function setStatusText(el: HTMLElement, cls: '' | 'ok' | 'error', msg: string): void {
  el.textContent = msg;
  el.className = cls;
}

async function addSite(): Promise<void> {
  const input = $<HTMLInputElement>('site-input');
  const status = $<HTMLElement>('site-status');
  const domain = normalizeDomain(input.value);
  if (!domain) {
    setStatusText(status, 'error', 'Enter a domain like reddit.com');
    return;
  }
  if (settings.blockedSites.includes(domain)) {
    setStatusText(status, 'error', `${domain} is already blocked`);
    return;
  }
  settings = { ...settings, blockedSites: [...settings.blockedSites, domain] };
  await setSettings(settings);
  input.value = '';
  setStatusText(status, 'ok', `Blocking ${domain}`);
  renderSiteSection();
}

async function removeSite(domain: string): Promise<void> {
  settings = { ...settings, blockedSites: settings.blockedSites.filter((d) => d !== domain) };
  await setSettings(settings);
  renderSiteSection();
}

// --- Hidden DM contacts (shown on Instagram) ---------------------------------

function renderDmSection(): void {
  const ul = $<HTMLUListElement>('dm-list');
  ul.replaceChildren(...settings.hiddenDmContacts.map((name) => dmRow(name)));
}

function dmRow(name: string): HTMLLIElement {
  const li = document.createElement('li');
  const span = document.createElement('span');
  span.className = 'dm-name';
  span.textContent = name;
  li.append(span);
  return li;
}

function wireDmInput(): void {
  if (dmWired) return;
  $('dm-add').addEventListener('click', () => void addDmContact());
  $<HTMLInputElement>('dm-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void addDmContact();
    }
  });
  dmWired = true;
}

async function addDmContact(): Promise<void> {
  const input = $<HTMLInputElement>('dm-input');
  const status = $<HTMLElement>('dm-status');
  const raw = input.value.trim().replace(/^@/, '').toLowerCase();
  if (!raw) {
    setStatusText(status, 'error', 'Enter a username like @cindy.zkx');
    return;
  }
  if (settings.hiddenDmContacts.includes(raw)) {
    setStatusText(status, 'error', `${raw} is already hidden`);
    return;
  }
  settings = { ...settings, hiddenDmContacts: [...settings.hiddenDmContacts, raw] };
  await setSettings(settings);
  input.value = '';
  setStatusText(status, 'ok', `Hiding DMs from ${raw}`);
  renderDmSection();
}

// --- YouTube channel quick-add (shown on YouTube) ----------------------------

async function revealChannel(): Promise<void> {
  detected = await detectChannelOnActiveTab();
  renderChannelCard();
  wireChannelButtons();
}

async function detectChannelOnActiveTab(): Promise<DetectedChannel | null> {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
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
  if (channelWired) return;
  $('add-allow').addEventListener('click', () => void toggle('allow'));
  $('add-block').addEventListener('click', () => void toggle('block'));
  channelWired = true;
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

function addToList(s: Settings, kind: Kind, ch: AllowlistChannel): Settings {
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
