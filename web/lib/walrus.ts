const AGGREGATOR_URL = "https://aggregator.walrus-testnet.walrus.space";

export async function uploadToWalrus(file: File | Blob): Promise<string> {
  const useMock = process.env.NEXT_PUBLIC_WALRUS_USE_MOCK === '1';
  const url = process.env.NEXT_PUBLIC_WALRUS_PUBLISHER_URL;

  async function toMock(): Promise<string> {
    const name = (file as any).name || (file.type ? file.type.replace(/\W+/g, '_') : 'blob');
    const size = (file as any).size ?? 0;
    const mockId = `MOCK_${name}_${size}_${Date.now()}`;
    if (typeof window !== 'undefined') {
      const reader = new FileReader();
      reader.onload = () => {
        try { localStorage.setItem(mockId, reader.result as string); } catch { /* ignore quota errors */ }
      };
      // Prefer text for json/text, otherwise DataURL for binary safety
      const isText = (file as any).type?.includes('json') || (file as any).type?.includes('text');
      if (isText) reader.readAsText(file); else reader.readAsDataURL(file);
    }
    await new Promise((r) => setTimeout(r, 400));
    return mockId;
  }

  if (useMock || !url) {
    return toMock();
  }

  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/v1/store`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
      },
      body: await file.arrayBuffer(),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn(`Walrus store failed (${res.status}). Falling back to mock.`, text);
      return toMock();
    }
    const data = await res.json().catch(() => ({} as any));
    return data.newlyCreated?.blobObject?.blobId || data.blobId || data.blob_id || data.id || 'UNKNOWN_BLOB_ID';
  } catch (err) {
    console.warn('Walrus store fetch error, falling back to mock:', err);
    return toMock();
  }
}

export async function uploadMetadata(meta: any): Promise<string> {
  const blob = new Blob([JSON.stringify(meta)], { type: "application/json" });
  return uploadToWalrus(blob);
}

export async function readMetadata(blobId: string): Promise<any> {
  if (blobId.startsWith("MOCK_")) {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(blobId);
      if (stored) {
        try {
          return JSON.parse(stored);
        } catch {
          return { description: stored };
        }
      }
    }
    return { name: "Mock Asset", description: "This is a mock asset description.", contentBlobId: blobId };
  }

  const res = await fetch(`${AGGREGATOR_URL}/v1/${blobId}`);
  if (!res.ok) return null;
  return res.json();
}

// Utility to fetch raw bytes from aggregator for encrypted content
export async function readBlobBytes(blobId: string): Promise<ArrayBuffer | null> {
  if (blobId.startsWith('MOCK_')) {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(blobId);
      if (stored) {
        try {
          // If DataURL, decode to bytes; otherwise assume UTF-8 text
          if (stored.startsWith('data:')) {
            const comma = stored.indexOf(',');
            const b64 = stored.slice(comma + 1);
            const bin = atob(b64);
            const out = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
            return out.buffer;
          }
          const enc = new TextEncoder();
          return enc.encode(stored).buffer;
        } catch {
          return null;
        }
      }
    }
    return null;
  }
  const res = await fetch(`${AGGREGATOR_URL}/v1/${blobId}`);
  if (!res.ok) return null;
  return res.arrayBuffer();
}
