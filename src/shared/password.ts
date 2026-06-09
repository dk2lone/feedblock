import type { PasswordLock } from './types';

const ITERATIONS = 200_000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;

export interface HashedPassword {
  hash: string;
  salt: string;
  iterations: number;
}

export async function hashPassword(plain: string): Promise<HashedPassword> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(plain, salt, ITERATIONS);
  return {
    hash: toHex(hash),
    salt: toHex(salt),
    iterations: ITERATIONS,
  };
}

export async function verifyPassword(
  plain: string,
  stored: PasswordLock,
): Promise<boolean> {
  if (!stored.hash || !stored.salt || stored.iterations <= 0) return false;
  const salt = fromHex(stored.salt);
  const expected = fromHex(stored.hash);
  const candidate = await derive(plain, salt, stored.iterations);
  return timingSafeEqual(candidate, expected);
}

async function derive(
  plain: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(plain),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: salt as BufferSource,
      iterations,
    },
    keyMaterial,
    HASH_BYTES * 8,
  );
  return new Uint8Array(bits);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}
