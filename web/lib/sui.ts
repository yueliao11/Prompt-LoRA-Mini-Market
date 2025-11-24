import { SuiClient, getFullnodeUrl } from "@mysten/sui.js/client";
import { TransactionBlock } from "@mysten/sui.js/transactions";

export const suiClient = new SuiClient({ url: getFullnodeUrl("testnet") });

export type ListAssetArgs = {
  packageId: string;
  walrusId: string;
  priceMist: number;
  kind: 0 | 1;
  name: string;
};

export function stringToBytes(s: string): number[] {
  return Array.from(new TextEncoder().encode(s));
}

export async function buildListAssetTx(args: ListAssetArgs) {
  const tx = new TransactionBlock();
  tx.moveCall({
    target: `${args.packageId}::prompt_market::list_asset`,
    arguments: [
      tx.pure(stringToBytes(args.walrusId)),
      tx.pure(args.priceMist),
      tx.pure(args.kind),
      tx.pure(stringToBytes(args.name)),
    ],
  });
  return tx;
}

export async function buildBuyAssetTx(packageId: string, assetId: string, priceMist: number) {
  const tx = new TransactionBlock();
  tx.moveCall({
    target: `${packageId}::prompt_market::buy_asset`,
    arguments: [tx.object(assetId), tx.splitCoins(tx.gas, [tx.pure(priceMist)])],
  });
  return tx;
}

