const DEFAULT_ITERATIONS = 100_000;
const HASH_BYTES = 32;
const SALT_BYTES = 16;

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function derivePassword(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    baseKey,
    HASH_BYTES * 8,
  );
  return new Uint8Array(bits);
}

function timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

export interface PasswordRecord {
  hash: string;
  salt: string;
  iterations: number;
}

export async function hashPassword(password: string, iterations = DEFAULT_ITERATIONS): Promise<PasswordRecord> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derivePassword(password, salt, iterations);
  return { hash: toBase64Url(hash), salt: toBase64Url(salt), iterations };
}

export async function verifyPassword(
  password: string,
  storedHash: string,
  storedSalt: string,
  iterations: number,
): Promise<boolean> {
  const expected = fromBase64Url(storedHash);
  const actual = await derivePassword(password, fromBase64Url(storedSalt), iterations);
  return timingSafeEqual(actual, expected);
}

export async function hashSessionToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return toBase64Url(new Uint8Array(digest));
}

export function createSessionToken(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}
