// Minimal demo Seal release endpoint.
// Accepts txDigest and keyBoxLegacy, returns unwrapped data key (base64).
// NOTE: Demo only — no real KMS or strict on-chain validation here.

import { NextRequest } from 'next/server'

export const runtime = 'nodejs'

function b64decode(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, 'base64'))
}

function b64encode(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  return Buffer.from(arr).toString('base64')
}

async function deriveWrapKey(passphrase: string, salt: string): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode(salt),
      iterations: 100_000,
      hash: 'SHA-256',
    },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  )
}

async function unwrapLegacyKey(keyBoxB64: string, salt: string): Promise<string> {
  const wrapKey = await deriveWrapKey('TX_DIGEST_REQUIRED', salt)
  const enc = b64decode(keyBoxB64)
  if (enc.length < 13) throw new Error('Invalid keyBox')
  const iv = enc.slice(0, 12)
  const data = enc.slice(12)
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, wrapKey, data)
  return b64encode(pt)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const { metaId, contentBlobId, txDigest, keyBoxLegacy } = body || {}

    if (!contentBlobId || typeof contentBlobId !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing contentBlobId' }), { status: 400 })
    }
    if (!txDigest || typeof txDigest !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing txDigest' }), { status: 400 })
    }
    if (!keyBoxLegacy || typeof keyBoxLegacy !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing keyBoxLegacy' }), { status: 400 })
    }

    // Demo approval gate: optionally enforce extra checks here (env-guarded)
    // For now, require a non-empty txDigest string and proceed.

    const keyB64 = await unwrapLegacyKey(keyBoxLegacy, `salt:${contentBlobId}`)
    return new Response(JSON.stringify({ keyB64, metaId }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'Internal error' }), { status: 500 })
  }
}

