// Minimal AES-GCM utilities for PromptGuard (Seal-compatible mock)
// - Encrypt: prepends 12-byte IV to ciphertext for single-blob storage
// - Decrypt: reads 12-byte IV header
// - Key wrap: PBKDF2(passphrase+salt) -> AES-GCM for wrapping the data key (keyBox)

function getSubtle(): SubtleCrypto {
  if (typeof window === 'undefined') throw new Error('Crypto not available server-side');
  const subtle = (window.crypto || (window as any).msCrypto)?.subtle;
  if (!subtle) throw new Error('WebCrypto SubtleCrypto not available');
  return subtle;
}

export function b64encode(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]);
  return btoa(binary);
}

export function b64decode(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function sha256(ab: ArrayBuffer): Promise<string> {
  const subtle = getSubtle();
  const digest = await subtle.digest('SHA-256', ab);
  const arr = new Uint8Array(digest);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function generateAesKey(): Promise<{ key: CryptoKey; keyB64: string }>{
  const subtle = getSubtle();
  const key = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const raw = await subtle.exportKey('raw', key);
  return { key, keyB64: b64encode(raw) };
}

export async function importAesKeyFromB64(keyB64: string): Promise<CryptoKey> {
  const subtle = getSubtle();
  const raw = b64decode(keyB64);
  return subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['decrypt']);
}

function randomIv(len = 12): Uint8Array {
  const iv = new Uint8Array(len);
  crypto.getRandomValues(iv);
  return iv;
}

export async function encryptBlobAesGcm(file: Blob): Promise<{ bytes: Uint8Array; keyB64: string; plainSha256: string }>{
  const subtle = getSubtle();
  const ab = await file.arrayBuffer();
  const plainSha256 = await sha256(ab);
  const { key, keyB64 } = await generateAesKey();
  const iv = randomIv(12);
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, key, ab);
  const header = new Uint8Array(iv.length + (ct as ArrayBuffer).byteLength);
  header.set(iv, 0);
  header.set(new Uint8Array(ct as ArrayBuffer), iv.length);
  return { bytes: header, keyB64, plainSha256 };
}

export async function decryptAesGcmToBlob(buffer: ArrayBuffer, keyB64: string, mimeType?: string): Promise<Blob> {
  const subtle = getSubtle();
  const all = new Uint8Array(buffer);
  if (all.length < 13) throw new Error('Invalid ciphertext');
  const iv = all.slice(0, 12);
  const data = all.slice(12);
  const key = await importAesKeyFromB64(keyB64);
  const pt = await subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return new Blob([pt], { type: mimeType || 'application/octet-stream' });
}

// Simple PBKDF2-based wrapper to store the data key as keyBox in manifest
async function deriveWrapKey(passphrase: string, salt: string): Promise<CryptoKey> {
  const subtle = getSubtle();
  const enc = new TextEncoder();
  const base = await subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode(salt),
      iterations: 100_000,
      hash: 'SHA-256',
    },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function wrapKeyWithPassphrase(keyB64: string, passphrase: string, salt: string): Promise<string> {
  const subtle = getSubtle();
  const wrapKey = await deriveWrapKey(passphrase, salt);
  const iv = randomIv(12);
  const data = b64decode(keyB64);
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, wrapKey, data);
  const out = new Uint8Array(iv.length + (ct as ArrayBuffer).byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(ct as ArrayBuffer), iv.length);
  return b64encode(out);
}

export async function unwrapKeyWithPassphrase(keyBoxB64: string, passphrase: string, salt: string): Promise<string> {
  const subtle = getSubtle();
  const wrapKey = await deriveWrapKey(passphrase, salt);
  const enc = b64decode(keyBoxB64);
  if (enc.length < 13) throw new Error('Invalid keyBox');
  const iv = enc.slice(0, 12);
  const data = enc.slice(12);
  const pt = await subtle.decrypt({ name: 'AES-GCM', iv }, wrapKey, data);
  return b64encode(pt);
}

// Simple summary generator (20-50 chars) for text prompts
export async function summarizeForPreview(file: File | Blob, fallback: string): Promise<string> {
  try {
    const type = (file as any).type || '';
    const name = (file as any).name || '';
    const isText = /text|json|markdown/.test(type) || /\.(txt|md|json)$/i.test(name);
    if (!isText) return fallback || '';
    const text = await (file as any).text();
    const clean = text.replace(/\s+/g, ' ').trim();
    const preview = clean.slice(0, 80);
    return preview.length > 0 ? preview : (fallback || '');
  } catch {
    return fallback || '';
  }
}

