import type { AllowlistChannel } from '@/src/shared/types';

export type ResolveResult =
  | { ok: true; channel: AllowlistChannel }
  | { ok: false; reason: 'invalid-input' | 'not-found' | 'network' | 'parse' };

export async function resolveHandle(input: string): Promise<ResolveResult> {
  const handle = normalizeHandle(input);
  if (!handle) return { ok: false, reason: 'invalid-input' };

  let html: string;
  try {
    const resp = await fetch(`https://www.youtube.com/@${handle}`, {
      headers: { 'Accept-Language': 'en-US,en;q=0.9' },
      credentials: 'omit',
    });
    if (resp.status === 404) return { ok: false, reason: 'not-found' };
    if (!resp.ok) return { ok: false, reason: 'network' };
    html = await resp.text();
  } catch {
    return { ok: false, reason: 'network' };
  }

  const id = extractChannelId(html);
  const displayName = extractDisplayName(html);
  if (!id) return { ok: false, reason: 'parse' };

  return {
    ok: true,
    channel: {
      id,
      handle,
      displayName: displayName || handle,
      addedAt: Date.now(),
    },
  };
}

export function normalizeHandle(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  // Accept @handle, handle, or full URLs like youtube.com/@handle
  const urlMatch = trimmed.match(/youtube\.com\/@([A-Za-z0-9._-]+)/i);
  const raw = urlMatch?.[1] ?? trimmed.replace(/^@/, '');
  if (!/^[A-Za-z0-9._-]+$/.test(raw)) return null;
  return raw.toLowerCase();
}

function firstGroup(html: string, re: RegExp): string | null {
  const m = html.match(re);
  return m?.[1] ?? null;
}

function extractChannelId(html: string): string | null {
  return (
    firstGroup(
      html,
      /<meta[^>]+itemprop=["'](?:identifier|channelId)["'][^>]+content=["'](UC[A-Za-z0-9_-]{20,})["']/i,
    ) ??
    firstGroup(
      html,
      /<link[^>]+rel=["']canonical["'][^>]+href=["'][^"']*\/channel\/(UC[A-Za-z0-9_-]{20,})["']/i,
    ) ??
    firstGroup(html, /"channelId":\s*"(UC[A-Za-z0-9_-]{20,})"/) ??
    firstGroup(html, /"browseId":\s*"(UC[A-Za-z0-9_-]{20,})"/)
  );
}

function extractDisplayName(html: string): string | null {
  const raw =
    firstGroup(
      html,
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
    ) ??
    firstGroup(
      html,
      /<meta[^>]+itemprop=["']name["'][^>]+content=["']([^"']+)["']/i,
    );
  return raw ? decodeHtmlEntities(raw) : null;
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
