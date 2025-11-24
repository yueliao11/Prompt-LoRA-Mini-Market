"use client";
import { useEffect, useMemo, useState } from "react";
import { useCurrentAccount, useSuiClient } from "@mysten/dapp-kit";
import fakeAssets from "../data/fake_assets.json";
import { readMetadata, readBlobBytes } from "@/lib/walrus";
import { unwrapKeyWithPassphrase, decryptAesGcmToBlob } from "@/lib/crypto";

export default function ProfilePage() {
    const account = useCurrentAccount();
    const client = useSuiClient();
    const [activeTab, setActiveTab] = useState<'listings' | 'purchases'>('listings');
    const [loading, setLoading] = useState(false);
    const [objects, setObjects] = useState<any[]>([]); // purchases
    const [listings, setListings] = useState<any[]>([]); // my listings (on-chain)
    const [metaMap, setMetaMap] = useState<Record<string, any>>({});
    const [digestMap, setDigestMap] = useState<Record<string, string>>({});
    const [decryptBusy, setDecryptBusy] = useState<string | null>(null);

    // Fake data for profile (listings only)
    const myAddress = account?.address || "0x1234...5678";
    const myListings = fakeAssets.slice(0, 3);

    const pkgId = process.env.NEXT_PUBLIC_PACKAGE_ID as string;
    const type = useMemo(() => pkgId ? `${pkgId}::prompt_market::Asset` : undefined, [pkgId]);

    async function loadPurchases() {
        if (!pkgId || !account?.address) {
            setObjects([]);
            setMetaMap({});
            return;
        }
        try {
            setLoading(true);
            const evType = `${pkgId}::prompt_market::AssetListed`;
            const evRes: any = await (client as any).queryEvents({ query: { MoveEventType: evType }, limit: 100 });
            const ids: string[] = (evRes?.data ?? [])
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
            const owned = fetched.filter(Boolean).filter((o: any) => {
                const owner = o?.data?.content?.fields?.owner as string | undefined;
                return !!owner && account?.address && owner.toLowerCase() === account.address.toLowerCase();
            });
            setObjects(owned);
            owned.forEach(async (o: any) => {
                const walrusId = (o?.data?.content?.fields?.walrus_id || []) as number[];
                const metaId = typeof walrusId?.length === 'number' ? new TextDecoder().decode(new Uint8Array(walrusId)) : '';
                if (!metaId || metaId.length < 10 || /^(DEMO_|fake_|blob_)/i.test(metaId)) return;
                try { const meta = await readMetadata(metaId); if (meta) setMetaMap(prev => ({ ...prev, [o.data.objectId]: meta })); } catch {}
            });
        } finally {
            setLoading(false);
        }
    }

    async function loadListings() {
        if (!pkgId || !account?.address) {
            setListings([]);
            return;
        }
        try {
            setLoading(true);
            // Read AssetListed events, then fetch objects and filter by creator
            const evType = `${pkgId}::prompt_market::AssetListed`;
            const evRes: any = await (client as any).queryEvents({ query: { MoveEventType: evType }, limit: 100 });
            const ids: string[] = (evRes?.data ?? [])
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
            const mine = fetched.filter(Boolean).filter((o: any) => {
                const creator = o?.data?.content?.fields?.creator as string | undefined;
                return !!creator && account?.address && creator.toLowerCase() === account.address.toLowerCase();
            });

            // Materialize minimal listing items to match UI expectation
            const items: any[] = [];
            for (const o of mine) {
                const objectId = o?.data?.objectId as string;
                const f = o?.data?.content?.fields || {};
                const walBytes: number[] = (f.walrus_id || []) as number[];
                let metaId = '';
                try { metaId = new TextDecoder().decode(new Uint8Array(walBytes)); } catch {}
                let meta: any = null;
                if (metaId && metaId.length > 10 && !/^fake_/i.test(metaId)) {
                    try { meta = await readMetadata(metaId); } catch {}
                }
                let name = '';
                try { name = new TextDecoder().decode(new Uint8Array(f.name || [])); } catch {}
                items.push({
                    id: objectId,
                    name: meta?.name || name || (objectId?.slice(0, 8) + '...'),
                    price: Number(f.price || 0),
                    sold: !!f.sold,
                    kind: Number(f.kind || 0),
                    imageUrl: meta?.imageUrl || undefined,
                });
                if (meta) setMetaMap(prev => ({ ...prev, [objectId]: meta }));
            }
            setListings(items);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        if (activeTab === 'purchases') loadPurchases();
        if (activeTab === 'listings') loadListings();
    }, [activeTab, account?.address, pkgId]);

    return (
        <main>
            {/* Profile Header */}
            <div style={{
                display: "flex",
                gap: "32px",
                marginBottom: "48px",
                flexWrap: "wrap"
            }}>
                {/* Profile Card */}
                <div className="gradient-border" style={{ flex: "1", minWidth: "300px" }}>
                    <div className="gradient-border-content" style={{ textAlign: "center" }}>
                        <div style={{
                            width: "100px",
                            height: "100px",
                            borderRadius: "50%",
                            background: "linear-gradient(135deg, #3b82f6, #a855f7)",
                            margin: "0 auto 20px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "40px",
                            border: "4px solid rgba(255, 255, 255, 0.1)"
                        }}>
                            👤
                        </div>
                        <h2 style={{ fontSize: "24px", fontWeight: 700, marginBottom: "8px", color: "white" }}>
                            Wallet Address
                        </h2>
                        <div style={{
                            background: "rgba(0, 0, 0, 0.3)",
                            padding: "8px 16px",
                            borderRadius: "20px",
                            fontSize: "14px",
                            color: "var(--text-secondary)",
                            fontFamily: "monospace",
                            marginBottom: "24px",
                            display: "inline-block"
                        }}>
                            {myAddress.slice(0, 6)}...{myAddress.slice(-4)}
                        </div>

                        <div style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr 1fr",
                            gap: "16px",
                            borderTop: "1px solid rgba(255, 255, 255, 0.1)",
                            paddingTop: "24px"
                        }}>
                            <div>
                                <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "4px" }}>Created</div>
                                <div style={{ fontSize: "20px", fontWeight: 700, color: "#d8b4fe" }}>8</div>
                            </div>
                            <div>
                                <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "4px" }}>Purchased</div>
                                <div style={{ fontSize: "20px", fontWeight: 700, color: "#67e8f9" }}>12</div>
                            </div>
                            <div>
                                <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "4px" }}>Sales</div>
                                <div style={{ fontSize: "20px", fontWeight: 700, color: "#93c5fd" }}>2029</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Stats Card */}
                <div className="glass-card" style={{ flex: "1", minWidth: "300px", padding: "32px" }}>
                    <h3 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "24px", color: "white" }}>
                        Account Statistics
                    </h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                        <div>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "14px" }}>
                                <span style={{ color: "var(--text-secondary)" }}>Asset Created</span>
                                <span style={{ color: "white", fontWeight: 600 }}>17.39</span>
                            </div>
                            <div style={{ height: "6px", background: "rgba(255, 255, 255, 0.1)", borderRadius: "3px", overflow: "hidden" }}>
                                <div style={{ width: "70%", height: "100%", background: "linear-gradient(90deg, #3b82f6, #a855f7)" }} />
                            </div>
                        </div>
                        <div>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "14px" }}>
                                <span style={{ color: "var(--text-secondary)" }}>Asset Purchased</span>
                                <span style={{ color: "white", fontWeight: 600 }}>49.50</span>
                            </div>
                            <div style={{ height: "6px", background: "rgba(255, 255, 255, 0.1)", borderRadius: "3px", overflow: "hidden" }}>
                                <div style={{ width: "45%", height: "100%", background: "linear-gradient(90deg, #a855f7, #ec4899)" }} />
                            </div>
                        </div>
                        <div>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "14px" }}>
                                <span style={{ color: "var(--text-secondary)" }}>Total Volume</span>
                                <span style={{ color: "white", fontWeight: 600 }}>6400</span>
                            </div>
                            <div style={{ height: "6px", background: "rgba(255, 255, 255, 0.1)", borderRadius: "3px", overflow: "hidden" }}>
                                <div style={{ width: "85%", height: "100%", background: "linear-gradient(90deg, #06b6d4, #3b82f6)" }} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div style={{ marginBottom: "32px" }}>
                <div style={{
                    display: "flex",
                    gap: "24px",
                    borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
                    paddingBottom: "16px"
                }}>
                    <button
                        onClick={() => setActiveTab('listings')}
                        style={{
                            background: "none",
                            border: "none",
                            fontSize: "18px",
                            fontWeight: 700,
                            color: activeTab === 'listings' ? "white" : "var(--text-secondary)",
                            cursor: "pointer",
                            padding: "8px 16px",
                            position: "relative",
                            transition: "all 0.3s ease"
                        }}
                    >
                        My Listings
                        {activeTab === 'listings' && (
                            <div style={{
                                position: "absolute",
                                bottom: "-17px",
                                left: 0,
                                width: "100%",
                                height: "3px",
                                background: "linear-gradient(90deg, #3b82f6, #a855f7)",
                                borderRadius: "3px 3px 0 0"
                            }} />
                        )}
                    </button>
                    <button
                        onClick={() => setActiveTab('purchases')}
                        style={{
                            background: "none",
                            border: "none",
                            fontSize: "18px",
                            fontWeight: 700,
                            color: activeTab === 'purchases' ? "white" : "var(--text-secondary)",
                            cursor: "pointer",
                            padding: "8px 16px",
                            position: "relative",
                            transition: "all 0.3s ease"
                        }}
                    >
                        My Purchases
                        {activeTab === 'purchases' && (
                            <div style={{
                                position: "absolute",
                                bottom: "-17px",
                                left: 0,
                                width: "100%",
                                height: "3px",
                                background: "linear-gradient(90deg, #ec4899, #a855f7)",
                                borderRadius: "3px 3px 0 0"
                            }} />
                        )}
                    </button>
                </div>
            </div>

            {/* Grid */}
            <div className="card-grid">
                {(activeTab === 'listings' ? (listings.length ? listings : myListings) : objects).map((item: any) => {
                    const isListing = activeTab === 'listings';
                    const objectId = isListing ? item.id : item?.data?.objectId;
                    const fields = isListing ? item : (item?.data?.content?.fields || {});
                    const meta = isListing ? null : metaMap[objectId] || null;
                    const displayName = isListing ? item.name : (meta?.name || (function(){
                        try { const nameBytes = new Uint8Array(fields?.name || []); return new TextDecoder().decode(nameBytes) || objectId?.slice(0,8)+"..."; } catch { return objectId?.slice(0,8)+"..."; }
                    })());
                    const kind = Number(fields?.kind ?? (isListing ? item.kind : 0));
                    const priceMist = Number(fields?.price ?? (isListing ? item.price : 0));
                    const imageUrl = isListing ? item.imageUrl : (meta?.imageUrl || undefined);
                    const sealed = !!(meta && meta.sealed);

                    return (
                        <div key={objectId} className="asset-card">
                            <div className="asset-image-placeholder" style={{
                                backgroundImage: imageUrl ? `url(${imageUrl})` : undefined,
                                backgroundSize: "cover",
                                backgroundPosition: "center",
                                position: "relative"
                            }}>
                                {!imageUrl && (kind === 1 ? "🤖" : "🎨")}
                                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "50%", background: "linear-gradient(to top, rgba(20, 20, 30, 0.9), transparent)", borderRadius: "0 0 16px 16px" }} />
                            </div>
                            <div style={{ padding: "0 8px" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                                    <h3 style={{ fontSize: "16px", fontWeight: 700, color: "white", margin: 0 }}>{displayName}</h3>
                                    <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                                        {sealed && <span className="badge" style={{ border:'1px solid rgba(192,132,252,0.5)', color:'#c084fc' }}>Sealed</span>}
                                        <span className={kind === 1 ? "badge badge-lora" : "badge badge-prompt"}>{kind === 1 ? "LoRA" : "Prompt"}</span>
                                    </div>
                                </div>
                                {!isListing && (
                                    <div style={{ color:'var(--text-secondary)', fontSize:12, minHeight:18, marginBottom:6 }}>
                                        {sealed ? (meta?.description?.slice(0, 80) || 'Encrypted until decryption') : (meta?.description || '')}
                                    </div>
                                )}

                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
                                    <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                                        {isListing ? (
                                            item.sold ? <span style={{ color: '#6ee7b7' }}>Sold</span> : <span>{parseInt(item.price) / 1_000_000_000} SUI</span>
                                        ) : (
                                            <span>Owner: You</span>
                                        )}
                                    </div>
                                </div>

                                {/* Purchases: decrypt/download actions */}
                                {!isListing && (
                                    <div style={{ marginTop: 12, display:'flex', flexDirection:'column', gap:8 }}>
                                        {!sealed ? (
                                            <a
                                                href={meta?.contentBlobId ? `https://aggregator.walrus-testnet.walrus.space/v1/${meta.contentBlobId}` : '#'}
                                                target="_blank"
                                                className="btn btn-outline"
                                                style={{ textDecoration:'none', textAlign:'center' }}
                                            >
                                                Download
                                            </a>
                                        ) : (
                                            <>
                                                <input
                                                    className="input"
                                                    placeholder="Paste your purchase tx digest"
                                                    value={digestMap[objectId] || ''}
                                                    onChange={(e)=>setDigestMap(prev=>({ ...prev, [objectId]: e.target.value }))}
                                                />
                                                <button
                                                    className="btn"
                                                    disabled={decryptBusy === objectId}
                                                    onClick={async ()=>{
                                                        if (!meta?.contentBlobId) { alert('Missing encrypted blob id'); return; }
                                                        const txDigest = digestMap[objectId];
                                                        if (!txDigest) { alert('Missing tx digest'); return; }
                                                        try {
                                                            setDecryptBusy(objectId);
                                                            let keyB64: string | null = null;
                                                            if (meta?.keyBox) {
                                                                keyB64 = await unwrapKeyWithPassphrase(meta.keyBox, txDigest, `salt:${meta.contentBlobId}`);
                                                            } else if (meta?.requiresTxDigest && meta?.keyBoxLegacy) {
                                                                const res = await fetch('/api/seal/release', {
                                                                    method: 'POST',
                                                                    headers: { 'Content-Type': 'application/json' },
                                                                    body: JSON.stringify({ metaId: 'N/A', contentBlobId: meta.contentBlobId, txDigest, keyBoxLegacy: meta.keyBoxLegacy })
                                                                });
                                                                if (!res.ok) throw new Error(`Seal release failed (${res.status})`);
                                                                const data = await res.json().catch(()=>null);
                                                                keyB64 = data?.keyB64 || null;
                                                            } else if (meta?.keyBoxLegacy) {
                                                                // legacy fallback
                                                                keyB64 = await unwrapKeyWithPassphrase(meta.keyBoxLegacy, 'TX_DIGEST_REQUIRED', `salt:${meta.contentBlobId}`);
                                                            } else {
                                                                throw new Error('No keyBox present in metadata');
                                                            }
                                                            if (!keyB64) throw new Error('Failed to unwrap key');
                                                            const bytes = await readBlobBytes(meta.contentBlobId);
                                                            if (!bytes) throw new Error('Failed to fetch encrypted content');
                                                            const blob = await decryptAesGcmToBlob(bytes, keyB64);
                                                            const url = URL.createObjectURL(blob);
                                                            const a = document.createElement('a');
                                                            a.href = url;
                                                            a.download = (meta?.name || 'content');
                                                            document.body.appendChild(a);
                                                            a.click();
                                                            a.remove();
                                                            URL.revokeObjectURL(url);
                                                        } catch (err:any) {
                                                            console.error(err);
                                                            alert(err?.message || 'Decrypt failed');
                                                        } finally {
                                                            setDecryptBusy(null);
                                                        }
                                                    }}
                                                >
                                                    {decryptBusy === objectId ? 'Decrypting...' : 'Decrypt & Download'}
                                                </button>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </main>
    );
}
