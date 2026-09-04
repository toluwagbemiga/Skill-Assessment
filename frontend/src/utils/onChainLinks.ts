/**
 * Links a database property (_id) to the id it was given on chain.
 *
 * The contract assigns its own sequential ids and knows nothing about MongoDB, so
 * something has to hold the mapping. The assessment is frontend-only, so it lives in
 * localStorage; in production this belongs in the properties collection alongside the
 * transaction hash, written by the backend after it observes the PropertyRegistered event.
 */

const STORAGE_KEY = 'REChain_onchain_properties';

export interface OnChainLink {
  propertyId: string;
  txHash: string;
  blockNumber: number;
  registeredAt: string;
}

type LinkMap = Record<string, OnChainLink>;

function readAll(): LinkMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as LinkMap) : {};
  } catch {
    // Corrupt or unavailable storage should never break the page.
    return {};
  }
}

export function getOnChainLink(dbId: string): OnChainLink | null {
  return readAll()[dbId] ?? null;
}

export function saveOnChainLink(dbId: string, link: Omit<OnChainLink, 'registeredAt'>): OnChainLink {
  const entry: OnChainLink = { ...link, registeredAt: new Date().toISOString() };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readAll(), [dbId]: entry }));
  } catch {
    // Non-fatal: the caller still has the result of the transaction in hand.
  }
  return entry;
}

export function clearOnChainLink(dbId: string): void {
  try {
    const all = readAll();
    delete all[dbId];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}
