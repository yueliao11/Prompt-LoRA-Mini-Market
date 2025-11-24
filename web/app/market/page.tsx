"use client";
import { useEffect, useMemo, useState } from "react";
import { useSuiClient } from "@mysten/dapp-kit";
// Use the new Transaction API compatible with dapp-kit wallet standard
import { Transaction } from "@mysten/sui/transactions";
import { useCurrentAccount, useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import fakeAssets from "../data/fake_assets.json";

type AssetFields = {
  creator: string;
  owner: string;
  walrus_id: number[];
  price: string | number; // u64 serialized
  sold: boolean;
  kind: number; // 0 prompt, 1 lora
  name: number[];
};

function bytesToString(bytes?: number[]): string {
  if (!bytes) return "";
  try {
    return new TextDecoder().decode(new Uint8Array(bytes));
  } catch {
    return "";
  }
}

function formatSui(mist: string | number): string {
  const n = typeof mist === "string" ? parseInt(mist, 10) : mist;
  return (n / 1_000_000_000).toString();
}

import { readMetadata, readBlobBytes } from "@/lib/walrus";
import { unwrapKeyWithPassphrase, decryptAesGcmToBlob, encryptBlobAesGcm, wrapKeyWithPassphrase } from "@/lib/crypto";
import { uploadMetadata } from "@/lib/walrus";

type AssetMetadata = {
  name?: string;
  description?: string;
  contentBlobId?: string;
  imageUrl?: string;
};

export default function MarketPage() {
  const client = useSuiClient();
  const [loading, setLoading] = useState(false);
  const [objects, setObjects] = useState<any[]>([]);
  const [cursor, setCursor] = useState<string | null | undefined>(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [purchaseBlobId, setPurchaseBlobId] = useState<string | null>(null);
  const [purchaseMeta, setPurchaseMeta] = useState<any | null>(null);
  const [purchaseDigest, setPurchaseDigest] = useState<string | null>(null);
  const [decryptBusy, setDecryptBusy] = useState(false);
  const [publisherStatus, setPublisherStatus] = useState<"mock" | "ok" | "down" | "unset">("unset");
  // Store metadata keyed by objectId
  const [metaMap, setMetaMap] = useState<Record<string, AssetMetadata>>({});

  const pkgId = process.env.NEXT_PUBLIC_PACKAGE_ID as string;
  const type = useMemo(() => `${pkgId}::prompt_market::Asset`, [pkgId]);
  const account = useCurrentAccount();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();

  const load = async (nextCursor?: string | null) => {
    // Build fake data list (used only when no package id or on error)
    const fakeObjects = fakeAssets.map(asset => ({
      data: {
        objectId: asset.id,
        content: {
          fields: {
            creator: asset.seller,
            owner: asset.owner,
            walrus_id: [], // Fake, handled in UI
            price: asset.price,
            sold: asset.sold,
            kind: asset.kind,
            name: [] // Fake, handled via metadata
          }
        }
      },
      // Pre-load metadata for fake assets
      _meta: {
        name: asset.name,
        description: asset.description,
        contentBlobId: asset.contentBlobId,
        imageUrl: asset.imageUrl,
        // Optional sealed demo flags from dataset
        sealed: (asset as any).sealed || false,
      }
    }));

    const includeFake = process.env.NEXT_PUBLIC_MARKET_INCLUDE_FAKE === '1';

    if (!pkgId || pkgId === "REPLACE_WITH_YOUR_PACKAGE_ID") {
      setObjects(fakeObjects);
      // Seed sealed demo content for fake objects (local-only, no network)
      const fakeMetaMap: Record<string, AssetMetadata> = {};
      for (const o of fakeObjects) {
        const id = o.data.objectId;
        const m: any = o._meta || {};
        if (m.sealed) {
          try {
            // If contentBlobId not yet a MOCK id, generate encrypted demo bytes and store as DataURL in localStorage
            if (!m.contentBlobId || !String(m.contentBlobId).startsWith('MOCK_')) {
              const demoText = `${m.name || 'Sealed Demo'}\n${m.description || ''}`;
              const ptBlob = new Blob([demoText], { type: 'text/plain' });
              const enc = await encryptBlobAesGcm(ptBlob);
              // Create a mock key to store in localStorage like uploadToWalrus mock
              const mockId = `MOCK_${(m.name || 'sealed').replace(/\W+/g,'_')}_${(demoText.length)}_${Date.now()}`;
              // Store as DataURL
              await new Promise<void>((resolve, reject) => {
                try {
                  const reader = new FileReader();
                  reader.onload = () => { try { localStorage.setItem(mockId, reader.result as string); } catch {} ; resolve(); };
                  reader.onerror = () => resolve();
                  const binBlob = new Blob([enc.bytes], { type: 'application/octet-stream' });
                  reader.readAsDataURL(binBlob);
                } catch { resolve(); }
              });
              // Wrap data key with legacy constant so decrypt flow can use /api/seal/release
              const keyBoxLegacy = await wrapKeyWithPassphrase(enc.keyB64, 'TX_DIGEST_REQUIRED', `salt:${mockId}`);
              m.contentBlobId = mockId;
              m.keyBoxLegacy = keyBoxLegacy;
              m.requiresTxDigest = true;
              m.cipher = 'AES-GCM';
            }
          } catch {}
        }
        fakeMetaMap[id] = m;
      }
      setMetaMap(fakeMetaMap);
      return;
    }

    try {
      setLoading(true);
      // Fallback approach: query events for AssetListed, then fetch each object
      const evType = `${pkgId}::prompt_market::AssetListed`;
      const evRes: any = await (client as any).queryEvents({
        query: { MoveEventType: evType },
        cursor: nextCursor ?? null,
        limit: 10,
      });
      const events = evRes?.data ?? [];
      const ids: string[] = events
        .map((e: any) => e?.parsedJson?.asset_id)
        .filter((x: any) => typeof x === 'string');
      const fetched = await Promise.all(
        ids.map(async (id) => {
          try {
            const obj: any = await (client as any).getObject({ id, options: { showType: true, showOwner: true, showContent: true } });
            return obj;
          } catch {
            return null;
          }
        })
      );
      let newObjects = fetched.filter(Boolean);

      // Optionally append demo items for richer showcase on first page
      if (includeFake && !nextCursor) {
        const target = 20;
        const need = Math.max(0, target - newObjects.length);
        const add = need > 0 ? fakeObjects.slice(0, need) : [];
        newObjects = [...newObjects, ...add];
      }

      if (nextCursor) {
        setObjects((prev) => [...prev, ...newObjects]);
      } else {
        setObjects(newObjects);
      }
      setCursor(evRes?.nextCursor ?? null);
      setHasNextPage(!!evRes?.hasNextPage);

      // Fetch metadata for new real objects asynchronously
      newObjects.forEach(async (o: any) => {
        const fields = o.data?.content?.fields as AssetFields;
        if (!fields) return;
        const metaId = bytesToString(fields.walrus_id);
        // Guard against empty/placeholder ids to avoid 404 on aggregator
        if (!metaId || metaId.length < 10 || /^(DEMO_|fake_|blob_)/i.test(metaId)) return;
        try {
          const meta = await readMetadata(metaId);
          if (meta) {
            setMetaMap((prev) => ({ ...prev, [o.data.objectId]: meta }));
          }
        } catch (err) {
          console.error("Failed to fetch meta for", o.data?.objectId, err);
        }
      });

    } catch (e) {
      console.error(e);
      // Fallback to fake data on error
      setObjects(fakeObjects);
      const fakeMetaMap: Record<string, AssetMetadata> = {};
      fakeObjects.forEach(o => {
        fakeMetaMap[o.data.objectId] = o._meta;
      });
      setMetaMap(fakeMetaMap);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [client, type, pkgId]);

  // Publisher health check (client-side only)
  useEffect(() => {
    const useMock = process.env.NEXT_PUBLIC_WALRUS_USE_MOCK === '1';
    const base = process.env.NEXT_PUBLIC_WALRUS_PUBLISHER_URL;
    if (useMock) {
      setPublisherStatus('mock');
      return;
    }
    if (!base) {
      setPublisherStatus('unset');
      return;
    }
    let aborted = false;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    fetch(`${base.replace(/\/$/, '')}/v1/status`, { signal: ctrl.signal })
      .then((r) => {
        if (aborted) return;
        setPublisherStatus(r.ok ? 'ok' : 'down');
      })
      .catch(() => {
        if (aborted) return;
        setPublisherStatus('down');
      })
      .finally(() => clearTimeout(timer));
    return () => {
      aborted = true;
      clearTimeout(timer);
      ctrl.abort();
    };
  }, []);

  // Diverse Unsplash keyword pools for Prompt(0) / LoRA(1)
  const PROMPT_QUERIES = [
    "prompt,typography,code",
    "watercolor,landscape,pastel",
    "logo,minimal,vector",
    "studio,product,lighting",
    "anime,character,concept",
    "isometric,3d,icons",
    "low poly,3d,render",
  ];
  const LORA_QUERIES = [
    "ai model,lora,neon",
    "synthwave,retro,grid",
    "mecha,robot,industrial",
    "dark fantasy,creature",
    "pixel art,sprite,retro",
    "abstract,fluid,macro",
    "sci-fi,environment,space",
  ];

  function hashSeed(seed: string | number) {
    const s = String(seed);
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h;
  }

  function pickQuery(kind: number, seed: string | number) {
    const pool = kind === 1 ? LORA_QUERIES : PROMPT_QUERIES;
    const h = hashSeed(seed);
    return pool[h % pool.length];
  }

  function getUnsplashFallback(kind: number, seed: string | number) {
    const query = pickQuery(kind, seed);
    const sig = hashSeed(seed);
    return `https://source.unsplash.com/featured/800x600/?${encodeURIComponent(query)}&sig=${sig}`;
  }

  function getUnsplashRandom(kind: number) {
    const pool = kind === 1 ? LORA_QUERIES : PROMPT_QUERIES;
    const query = pool[Math.floor(Math.random() * pool.length)];
    const sig = Math.floor(Math.random() * 1000000);
    return `https://source.unsplash.com/featured/800x600/?${encodeURIComponent(query)}&sig=${sig}`;
  }

  function stringToBytes(s: string): number[] { return Array.from(new TextEncoder().encode(s)); }

  async function listThenBuyFromFake(meta: AssetMetadata | undefined, priceMist: number, kind: number, nameFallback: string) {
    const enriched: any = { ...(meta || {}) };
    // If sealed demo metadata isn't fully prepared (no keyBoxLegacy / mock blob), generate locally now
    if (enriched?.sealed && (!enriched.keyBoxLegacy || !enriched.contentBlobId || !String(enriched.contentBlobId).startsWith('MOCK_'))) {
      try {
        const demoText = `${enriched.name || nameFallback || 'Sealed Demo'}\n${enriched.description || ''}`;
        const ptBlob = new Blob([demoText], { type: 'text/plain' });
        const enc = await encryptBlobAesGcm(ptBlob);
        const mockId = `MOCK_${(enriched.name || 'sealed').replace(/\W+/g,'_')}_${(demoText.length)}_${Date.now()}`;
        await new Promise<void>((resolve) => {
          try {
            const reader = new FileReader();
            reader.onload = () => { try { localStorage.setItem(mockId, reader.result as string); } catch {} ; resolve(); };
            reader.onerror = () => resolve();
            const binBlob = new Blob([enc.bytes], { type: 'application/octet-stream' });
            reader.readAsDataURL(binBlob);
          } catch { resolve(); }
        });
        const keyBoxLegacy = await wrapKeyWithPassphrase(enc.keyB64, 'TX_DIGEST_REQUIRED', `salt:${mockId}`);
        enriched.contentBlobId = mockId;
        enriched.keyBoxLegacy = keyBoxLegacy;
        enriched.requiresTxDigest = true;
        enriched.cipher = 'AES-GCM';
      } catch {}
    }

    const name = enriched?.name || nameFallback;
    const description = enriched?.description || "";
    const contentBlobId = enriched?.contentBlobId || "";
    // 1) Upload metadata to Walrus to obtain a real walrus_id on testnet
    const metaToUpload: any = {
      name,
      description,
      kind,
      contentBlobId,
      imageUrl: (enriched as any)?.imageUrl,
      createdAt: Date.now(),
    };
    if (enriched?.sealed) {
      metaToUpload.sealed = true;
      metaToUpload.cipher = 'AES-GCM';
      metaToUpload.requiresTxDigest = true;
      if ((enriched as any).keyBoxLegacy) metaToUpload.keyBoxLegacy = (enriched as any).keyBoxLegacy;
      if ((enriched as any).keyBox) metaToUpload.keyBox = (enriched as any).keyBox;
    }
    const metaId = await uploadMetadata(metaToUpload);
    // 2) List on-chain
    const txList = new Transaction();
    txList.moveCall({
      target: `${pkgId}::prompt_market::list_asset`,
      arguments: [
        txList.pure.vector('u8', stringToBytes(metaId)),
        txList.pure.u64(BigInt(priceMist)),
        txList.pure.u8(kind as number),
        txList.pure.vector('u8', stringToBytes(name)),
      ],
    });
    const listRes: any = await signAndExecute({ transaction: txList as any });
    const type = `${pkgId}::prompt_market::Asset`;
    let objectId: string | undefined;
    try {
      const txInfo: any = await (client as any).getTransactionBlock({
        digest: listRes?.digest,
        options: { showObjectChanges: true },
      });
      const creations: any[] = txInfo?.objectChanges || [];
      const created = creations.find((c) => c.type === 'created' && c.objectType === type);
      if (created?.objectId) objectId = created.objectId;
    } catch (e) {
      console.warn('Failed to read objectChanges from tx digest; will fallback to events.', e);
    }
    if (!objectId) {
      // Fallback: query latest AssetListed events and pick the most recent
      const evType = `${pkgId}::prompt_market::AssetListed`;
      const evRes: any = await (client as any).queryEvents({ query: { MoveEventType: evType }, limit: 10 });
      const events = evRes?.data ?? [];
      objectId = events?.[0]?.parsedJson?.asset_id;
    }
    if (!objectId) throw new Error("Failed to find listed asset id");
    // 3) Buy it
    const txBuy = new Transaction();
    txBuy.moveCall({
      target: `${pkgId}::prompt_market::buy_asset`,
      arguments: [
        txBuy.object(objectId),
        txBuy.splitCoins(txBuy.gas, [txBuy.pure.u64(BigInt(priceMist))]),
      ],
    });
    const buyRes: any = await signAndExecute({ transaction: txBuy as any });
    setPurchaseDigest(buyRes?.digest || null);
    setPurchaseBlobId(metaId);
    if (enriched) setPurchaseMeta(enriched);
  }

  async function handleBuy(objectId: string, priceMist: number, fakeMeta?: AssetMetadata, kind?: number, name?: string) {
    if (!account) {
      alert("Connect wallet first");
      return;
    }
    try {
      if (String(objectId).startsWith("fake_")) {
        await listThenBuyFromFake(fakeMeta, priceMist, kind ?? 0, name || objectId);
      } else {
        const tx = new Transaction();
        tx.moveCall({
          target: `${pkgId}::prompt_market::buy_asset`,
          arguments: [
            tx.object(objectId),
            tx.splitCoins(tx.gas, [tx.pure.u64(BigInt(priceMist))]),
          ],
        });
        const res = await signAndExecute({ transaction: tx as any });
        console.log("buy res", res);
        setPurchaseDigest(res?.digest || null);
        // Refetch on-chain object to read walrus_id and show download link
        try {
          const obj: any = await (client as any).getObject({ id: objectId, options: { showContent: true }});
          const fields = obj?.data?.content?.fields as AssetFields | undefined;
          const blobId = bytesToString(fields?.walrus_id);
          if (blobId) {
            setPurchaseBlobId(blobId);
            const meta = metaMap[objectId];
            if (meta) {
              setPurchaseMeta(meta);
            } else {
              try { const fresh = await readMetadata(blobId); setPurchaseMeta(fresh || null); } catch { /* ignore */ }
            }
          }
        } catch (e) {
          console.warn("Failed to refetch object for blob id", e);
        }
      }
      // Refresh list to update sold status (best-effort)
      load();
    } catch (e) {
      console.error(e);
      alert("Purchase failed. See console for details.");
    }
  }

  return (
    <>
    <main>
      {/* Page Header */}
      <div className="page-header" style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "48px"
      }}>
        <div>
          <h1 className="page-title">
            Marketplace
          </h1>
          <p className="page-subtitle">
            Discover premium Prompts & LoRA models
          </p>
        </div>
        <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
          <a href="/profile/" className="btn btn-outline" style={{ textDecoration: "none" }}>
            My Profile
          </a>
          <button
            className="btn"
            onClick={() => load()}
            disabled={loading}
            style={{ display: "flex", alignItems: "center", gap: "8px" }}
          >
            {loading && <span className="loading"></span>}
            Refresh
          </button>
        </div>
      </div>

      {/* Warning Message */}
      {!pkgId || pkgId === "REPLACE_WITH_YOUR_PACKAGE_ID" ? (
        <div style={{
          padding: "16px 24px",
          background: "rgba(220, 38, 38, 0.1)",
          border: "1px solid rgba(220, 38, 38, 0.3)",
          borderRadius: "12px",
          color: "#fca5a5",
          marginBottom: "32px",
          display: "flex",
          alignItems: "center",
          gap: "12px"
        }}>
          <span>⚠️</span>
          <span>Demo Mode: Showing fake data. Set NEXT_PUBLIC_PACKAGE_ID to see real assets.</span>
        </div>
      ) : null}

      {/* Publisher Health */}
      <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginBottom: publisherStatus !== 'ok' ? 16 : 8 }}>
        {publisherStatus === 'mock' && (
          <div style={{
            padding: '10px 14px',
            background: 'rgba(147, 51, 234, 0.12)',
            border: '1px solid rgba(147, 51, 234, 0.35)',
            borderRadius: 10,
            color: '#c4b5fd',
          }}>
            Walrus Publisher: Mock Mode (uploads not persisted on testnet)
          </div>
        )}
        {publisherStatus === 'ok' && (
          <div style={{
            padding: '10px 14px',
            background: 'rgba(16, 185, 129, 0.12)',
            border: '1px solid rgba(16, 185, 129, 0.35)',
            borderRadius: 10,
            color: '#86efac',
          }}>
            Walrus Publisher: Connected
          </div>
        )}
        {publisherStatus === 'down' && (
          <div style={{
            padding: '10px 14px',
            background: 'rgba(220, 38, 38, 0.12)',
            border: '1px solid rgba(220, 38, 38, 0.35)',
            borderRadius: 10,
            color: '#fca5a5',
          }}>
            Walrus Publisher: Unreachable (falling back to mock if enabled)
          </div>
        )}
        {publisherStatus === 'unset' && (
          <div style={{
            padding: '10px 14px',
            background: 'rgba(234, 179, 8, 0.12)',
            border: '1px solid rgba(234, 179, 8, 0.35)',
            borderRadius: 10,
            color: '#fde68a',
          }}>
            Walrus Publisher: Not configured
          </div>
        )}
      </div>

      {/* Asset Grid */}
      <div className="card-grid">
        {objects.map((o, index) => {
          const id = o.data?.objectId ?? o.objectId;
          const fields = (o.data?.content?.fields ?? {}) as AssetFields;
          const priceMist = Number(fields.price ?? 0);
          const onChainName = bytesToString(fields.name);
          const meta = metaMap[id] || (o._meta as AssetMetadata | undefined);
          const displayName = meta?.name || onChainName || id.slice(0, 8) + "...";
          const isOwner = account?.address === fields.owner;
          const imageUrl = (meta?.imageUrl && meta.imageUrl.length > 0)
            ? meta.imageUrl
            : getUnsplashFallback(fields.kind, id);

          // Determine card variant
          let variant = "blue";
          if (fields.sold) {
            variant = "green";
          } else if (fields.kind === 1) {
            variant = "purple";
          } else {
            variant = "blue";
          }

          // Determine button text and state
          let btnText = "Buy";
          let btnClass = `cyber-btn cyber-btn-${variant}`;
          let btnDisabled = false;

          if (loading) {
            btnText = "Loading...";
            btnClass = "cyber-btn cyber-btn-loading";
            btnDisabled = true;
          } else if (fields.sold) {
            if (isOwner || fields.sold) {
              btnText = "Access Granted";
              btnClass = "cyber-btn cyber-btn-green";
            }
          } else {
            btnText = "Buy";
          }

          // Image uses "Yeso", "Buy", "Loading...". I'll use "Buy Now" for available, "Access" for sold.

          return (
            <div key={id} className={`cyber-card cyber-card-${variant}`}>
              {/* Image */}
              <div style={{
                width: "100%",
                height: 160,
                borderRadius: 12,
                overflow: "hidden",
                marginBottom: 12,
                border: "1px solid rgba(255,255,255,0.06)",
                background: "#0b1220"
              }}>
                <img
                  src={imageUrl}
                  alt={displayName}
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  loading="lazy"
                  onError={(e) => {
                    const next = getUnsplashRandom(fields.kind);
                    if ((e.currentTarget as HTMLImageElement).src !== next) {
                      (e.currentTarget as HTMLImageElement).src = next;
                    }
                  }}
                />
              </div>
              {/* Header */}
              <div className="cyber-card-header">
                <div>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <h3 className="cyber-card-title">{displayName}</h3>
                    {(meta as any)?.sealed && (
                      <span title="Sealed (PromptGuard)" style={{ fontSize: 11, color:'#c084fc', border:'1px solid rgba(192,132,252,0.5)', padding:'1px 6px', borderRadius:6 }}>Sealed</span>
                    )}
                  </div>
                  <div className="cyber-card-subtitle">
                    {(meta as any)?.sealed ? (meta as any)?.description?.slice(0, 60) || 'Encrypted until purchase' : (meta?.description?.slice(0, 30) || 'No description')}
                    {(meta as any)?.sealed ? '' : '...'}
                  </div>
                </div>
                <div className="cyber-status-icon">
                  {fields.sold ? (
                    <span style={{ color: "#4ade80" }}>✓</span>
                  ) : (
                    <span style={{ color: "#60a5fa" }}>↓</span>
                  )}
                </div>
              </div>

              {/* Data Rows */}
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", margin: "12px 0 24px 0" }}>
                <div className="cyber-card-row">
                  <span>Type</span>
                  <span className="cyber-card-value">{fields.kind === 1 ? "LoRA" : "Prompt"}</span>
                </div>
                <div className="cyber-card-row">
                  <span>Price in SUI</span>
                  <span className="cyber-card-value">{formatSui(priceMist)}</span>
                </div>
                <div className="cyber-card-row">
                  <span>Creator address</span>
                  <span className="cyber-card-value">
                    {fields.creator ? `${fields.creator.slice(0, 6)}...${fields.creator.slice(-4)}` : "Unknown"}
                  </span>
                </div>
                <div className="cyber-card-row">
                  <span>Sold status</span>
                  <span className="cyber-card-value" style={{ color: fields.sold ? "#4ade80" : "#f87171" }}>
                    {fields.sold ? "Yes" : "No"}
                  </span>
                </div>
              </div>

              {/* Button */}
              {fields.sold ? (
                <button className="cyber-btn cyber-btn-loading">
                  Access Granted
                </button>
              ) : (
                <button
                  className={`cyber-btn cyber-btn-${variant}`}
                  onClick={() => handleBuy(id, priceMist, meta, fields.kind, displayName)}
                  disabled={loading}
                  title={'Buy this asset'}
                >
                  {loading ? "Loading..." : 'Buy'}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Empty State */}
      {!loading && objects.length === 0 && (
        <div className="glass-card" style={{
          padding: "64px",
          textAlign: "center",
          maxWidth: "600px",
          margin: "40px auto"
        }}>
          <div style={{ fontSize: "64px", marginBottom: "24px" }}>📦</div>
          <h3 style={{
            fontSize: "24px",
            marginBottom: "12px",
            color: "white"
          }}>
            No assets found
          </h3>
          <p style={{
            color: "var(--text-secondary)",
            marginBottom: "32px",
            fontSize: "16px"
          }}>
            Be the first to list an asset on the marketplace!
          </p>
          <a href="/sell/" className="btn btn-secondary" style={{ textDecoration: "none" }}>
            List an Asset
          </a>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          padding: "64px",
          gap: "16px"
        }}>
          <span className="loading" style={{ width: "32px", height: "32px" }}></span>
          <span style={{ color: "var(--text-secondary)", fontSize: "18px" }}>Loading assets...</span>
        </div>
      )}

      {/* Load More Button */}
      {hasNextPage && !loading && (
        <div style={{ textAlign: "center", marginTop: "48px" }}>
          <button
            className="btn btn-outline"
            onClick={() => load(cursor)}
            style={{ padding: "12px 48px" }}
          >
            Load More
          </button>
        </div>
      )}
    </main>
    {/* Purchase Success Modal */}
    {purchaseBlobId && (
      <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000}} onClick={() => setPurchaseBlobId(null)}>
        <div style={{background:'#111827',border:'1px solid rgba(255,255,255,0.1)',borderRadius:12,padding:24,width:420}} onClick={(e)=>e.stopPropagation()}>
          <h3 style={{marginTop:0,marginBottom:12,color:'#fff'}}>Purchase Successful</h3>
          {!purchaseMeta?.sealed ? (
            <>
              <p style={{color:'#cbd5e1'}}>Your content is ready. You can download it via Walrus aggregator now.</p>
              <div style={{display:'flex',flexDirection:'column',gap:8,marginTop:12}}>
                {/* Show content blob id when available; fall back to meta id */}
                <code style={{background:'#0b1220',padding:'6px 8px',borderRadius:6,wordBreak:'break-all',color:'#93c5fd'}}>
                  {purchaseMeta?.contentBlobId || purchaseBlobId}
                </code>
                <a
                  href={`https://aggregator.walrus-testnet.walrus.space/v1/${purchaseMeta?.contentBlobId || purchaseBlobId}`}
                  target="_blank"
                  className="btn"
                  style={{textDecoration:'none',textAlign:'center'}}
                >
                  Download
                </a>
                {!purchaseMeta && (
                  <div style={{color:'#9ca3af', fontSize:12}}>
                    Note: Metadata not found on Walrus; link points to the on-chain ID. If it 404s, re-list the asset with metadata.
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <p style={{color:'#cbd5e1', marginBottom:8}}>
                This asset is sealed. Decrypt locally to access the content.
              </p>
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                <label style={{color:'#9ca3af', fontSize:12}}>Transaction digest (auto-filled when available)</label>
                <input className="input" value={purchaseDigest || ''} onChange={(e)=>setPurchaseDigest(e.target.value)} placeholder="Paste tx digest" />
                <button className="btn" disabled={decryptBusy} onClick={async ()=>{
                  if (!purchaseMeta?.contentBlobId) { alert('Missing encrypted blob id'); return; }
                  if (!purchaseDigest) { alert('Missing tx digest'); return; }
                  try {
                    setDecryptBusy(true);
                    let keyB64: string | null = null;
                    if (purchaseMeta?.keyBox) {
                      // Preferred path: txDigest-protected keyBox
                      keyB64 = await unwrapKeyWithPassphrase(purchaseMeta.keyBox, purchaseDigest, `salt:${purchaseMeta.contentBlobId}`);
                    } else if ((purchaseMeta as any)?.requiresTxDigest && (purchaseMeta as any)?.keyBoxLegacy) {
                      // Demo Seal service: ask backend to release the data key after txDigest provided
                      const res = await fetch('/api/seal/release', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          metaId: purchaseBlobId,
                          contentBlobId: purchaseMeta.contentBlobId,
                          txDigest: purchaseDigest,
                          keyBoxLegacy: (purchaseMeta as any).keyBoxLegacy,
                        })
                      })
                      if (!res.ok) throw new Error(`Seal release failed (${res.status})`)
                      const data = await res.json().catch(() => null)
                      keyB64 = data?.keyB64 || null
                    } else if ((purchaseMeta as any)?.keyBoxLegacy) {
                      // Legacy fallback: local unwrap using constant (kept for backward compatibility)
                      keyB64 = await unwrapKeyWithPassphrase((purchaseMeta as any).keyBoxLegacy, 'TX_DIGEST_REQUIRED', `salt:${purchaseMeta.contentBlobId}`);
                    } else {
                      throw new Error('No keyBox present in metadata');
                    }
                    if (!keyB64) throw new Error('Failed to unwrap key');
                    const bytes = await readBlobBytes(purchaseMeta.contentBlobId);
                    if (!bytes) throw new Error('Failed to fetch encrypted content');
                    const blob = await decryptAesGcmToBlob(bytes, keyB64);
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = (purchaseMeta?.name || 'content');
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    URL.revokeObjectURL(url);
                  } catch (err:any) {
                    console.error(err);
                    alert(err?.message || 'Decrypt failed');
                  } finally {
                    setDecryptBusy(false);
                  }
                }}>{decryptBusy ? 'Decrypting...' : 'Decrypt & Download'}</button>
                <div style={{color:'#9ca3af', fontSize:12}}>
                  Demo PromptGuard: uses your tx digest to unlock the decryption key locally. Do not share it.
                </div>
              </div>
            </>
          )}
          <div style={{textAlign:'right',marginTop:16}}>
            <button className="btn btn-outline" onClick={() => { setPurchaseBlobId(null); setPurchaseMeta(null); }}>Close</button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
