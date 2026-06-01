import { browser } from 'wxt/browser';
import { getSettings } from './storage';

const CACHE_KEY = 'classifierCache';
const MODEL = 'claude-haiku-4-5-20251001';
const MAX_CONCURRENT = 4;

let inFlight = 0;
const waiters: Array<() => void> = [];

async function acquireSlot(): Promise<void> {
  if (inFlight < MAX_CONCURRENT) {
    inFlight++;
    return;
  }
  await new Promise<void>((resolve) => waiters.push(resolve));
  inFlight++;
}

function releaseSlot(): void {
  inFlight--;
  waiters.shift()?.();
}

const SYSTEM_PROMPT = `You are classifying YouTube videos for a personal educational content filter.

PASS this video if it is:
- STEM: math, science, engineering, computer science, programming, technical explainers, technology
- Music: music videos, lyric videos, performances, sped-up or slowed-down songs, remixes

BLOCK this video if it is:
- Comedy, reactions, drama, gossip, prank videos
- Vlogs, daily vlogs, lifestyle, fashion, food vlogs
- Gaming (let's plays, streams, gaming highlights, gaming news)
- College decision reactions, admissions-influencer content
- Pure entertainment (MrBeast-style stunts, challenges)
- Sports highlights or commentary

For ambiguous content (podcasts, interviews, documentaries that are also entertaining, expert vlogs, news commentary): respond BLOCK. The user prefers strict filtering.

Respond with exactly one word: PASS or BLOCK. No other output, no punctuation, no explanation.`;

export type Verdict = 'pass' | 'block' | 'error';

export async function classify(
  videoId: string,
  title: string,
  channelName: string,
): Promise<Verdict> {
  const cached = await readCache(videoId);
  if (cached) return cached;

  const settings = await getSettings();
  const apiKey = settings.claude.apiKey.trim();
  if (!apiKey) return 'error';

  await acquireSlot();
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Channel: ${channelName}\nTitle: ${title}`,
          },
        ],
      }),
    });
    if (!resp.ok) return 'error';
    const data = (await resp.json()) as {
      content?: Array<{ text?: string }>;
    };
    const text = (data.content?.[0]?.text ?? '').trim().toUpperCase();
    let verdict: 'pass' | 'block';
    if (text.startsWith('PASS')) verdict = 'pass';
    else if (text.startsWith('BLOCK')) verdict = 'block';
    // Default to block on unparseable response — matches user's strict preference.
    else verdict = 'block';
    await writeCache(videoId, verdict);
    return verdict;
  } catch {
    return 'error';
  } finally {
    releaseSlot();
  }
}

async function readCache(videoId: string): Promise<'pass' | 'block' | null> {
  const stored = await browser.storage.local.get(CACHE_KEY);
  const cache = (stored[CACHE_KEY] ?? {}) as Record<string, 'pass' | 'block'>;
  return cache[videoId] ?? null;
}

async function writeCache(
  videoId: string,
  verdict: 'pass' | 'block',
): Promise<void> {
  const stored = await browser.storage.local.get(CACHE_KEY);
  const cache = (stored[CACHE_KEY] ?? {}) as Record<string, 'pass' | 'block'>;
  cache[videoId] = verdict;
  await browser.storage.local.set({ [CACHE_KEY]: cache });
}
