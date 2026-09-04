/**
 * ethers.js bindings for the PropertyRegistry contract on Polygon Amoy.
 *
 * Reads go through a plain JSON-RPC provider so that on-chain status is visible to every
 * visitor, wallet or not. Writes require an injected EIP-1193 wallet (MetaMask).
 */
import {
  BrowserProvider,
  Contract,
  Interface,
  JsonRpcProvider,
  formatUnits,
  parseUnits,
  type Eip1193Provider,
  type Log,
} from 'ethers';
import PropertyRegistryABI from '../contracts/PropertyRegistry.abi.json';
import {
  POLYGON_AMOY_CHAIN_ID,
  POLYGON_AMOY_CHAIN_ID_HEX,
  POLYGON_AMOY_PARAMS,
  POLYGON_AMOY_RPC_URL,
  PRICE_DECIMALS,
  PROPERTY_REGISTRY_ADDRESS,
  isRegistryConfigured,
} from '../config/web3';

// ── Types ────────────────────────────────────────────────────

export interface OnChainProperty {
  propertyId: string;
  physicalAddress: string;
  owner: string;
  /** Decoded back to a human readable listing price. */
  price: string;
  registeredAt: Date;
}

export interface RegistrationResult {
  propertyId: string;
  txHash: string;
  blockNumber: number;
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider & {
      on?: (event: string, handler: (...args: any[]) => void) => void;
      removeListener?: (event: string, handler: (...args: any[]) => void) => void;
    };
  }
}

// ── Wallet plumbing ──────────────────────────────────────────

export const isWalletAvailable = (): boolean =>
  typeof window !== 'undefined' && Boolean(window.ethereum);

function requireWallet() {
  if (!isWalletAvailable()) {
    throw new Error('No Ethereum wallet detected. Install MetaMask to continue.');
  }
  return window.ethereum!;
}

function requireRegistryAddress(): string {
  if (!isRegistryConfigured()) {
    throw new Error(
      'Contract address is not configured. Set VITE_PROPERTY_REGISTRY_ADDRESS in frontend/.env'
    );
  }
  return PROPERTY_REGISTRY_ADDRESS;
}

/**
 * Makes sure the wallet is pointed at Amoy, adding the network first if the user
 * has never used it. Error 4902 is the standard "unrecognised chain" response.
 */
export async function ensureAmoyNetwork(): Promise<void> {
  const ethereum = requireWallet();

  const currentChainId: string = await ethereum.request({ method: 'eth_chainId' });
  if (parseInt(currentChainId, 16) === POLYGON_AMOY_CHAIN_ID) return;

  try {
    await ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: POLYGON_AMOY_CHAIN_ID_HEX }],
    });
  } catch (error: any) {
    if (error?.code === 4902 || error?.data?.originalError?.code === 4902) {
      await ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [POLYGON_AMOY_PARAMS],
      });
      return;
    }
    throw error;
  }
}

/** Prompts for account access and returns the selected address. */
export async function connectWallet(): Promise<string> {
  const ethereum = requireWallet();
  const accounts: string[] = await ethereum.request({ method: 'eth_requestAccounts' });

  if (!accounts?.length) throw new Error('No account was returned by the wallet.');

  await ensureAmoyNetwork();
  return accounts[0];
}

/** Returns the already-authorised account without prompting, or null. */
export async function getConnectedAccount(): Promise<string | null> {
  if (!isWalletAvailable()) return null;
  try {
    const accounts: string[] = await window.ethereum!.request({ method: 'eth_accounts' });
    return accounts?.[0] ?? null;
  } catch {
    return null;
  }
}

export async function getWalletChainId(): Promise<number | null> {
  if (!isWalletAvailable()) return null;
  try {
    const chainId: string = await window.ethereum!.request({ method: 'eth_chainId' });
    return parseInt(chainId, 16);
  } catch {
    return null;
  }
}

// ── Contract instances ───────────────────────────────────────

/** Read-only instance backed by the public RPC — works with no wallet installed. */
function getReadContract(): Contract {
  const provider = new JsonRpcProvider(POLYGON_AMOY_RPC_URL, POLYGON_AMOY_CHAIN_ID, {
    staticNetwork: true,
  });
  return new Contract(requireRegistryAddress(), PropertyRegistryABI, provider);
}

/** Signer-backed instance for transactions. */
async function getWriteContract(): Promise<Contract> {
  const ethereum = requireWallet();
  await ensureAmoyNetwork();

  const provider = new BrowserProvider(ethereum);
  const signer = await provider.getSigner();
  return new Contract(requireRegistryAddress(), PropertyRegistryABI, signer);
}

// ── Price encoding ───────────────────────────────────────────

export const encodePrice = (price: number): bigint =>
  parseUnits(String(Math.max(0, Math.trunc(price))), PRICE_DECIMALS);

export const decodePrice = (price: bigint): string => formatUnits(price, PRICE_DECIMALS);

// ── Contract calls ───────────────────────────────────────────

/**
 * The contract enforces uniqueness on the exact bytes of the address string, so every
 * caller has to agree on one spelling. Trim, collapse runs of whitespace, and drop the
 * zero-width characters that survive a copy/paste out of a listing.
 */
/** U+200B..U+200D and U+FEFF — invisible, but they change the keccak hash. */
const ZERO_WIDTH_CHARS = /[​-‍﻿]/g;

export const normalizePhysicalAddress = (physicalAddress: string): string =>
  physicalAddress.replace(ZERO_WIDTH_CHARS, '').replace(/\s+/g, ' ').trim();

/** Returns the on-chain id registered against an address string, or null if it is free. */
export async function lookupPropertyIdByAddress(physicalAddress: string): Promise<string | null> {
  const contract = getReadContract();
  const id: bigint = await contract.propertyIdByAddress(normalizePhysicalAddress(physicalAddress));
  // BigInt(0) rather than a 0n literal: the Vite build targets es2015, which cannot lower one.
  return id === BigInt(0) ? null : id.toString();
}

/**
 * Registers a property and resolves once the transaction is mined, pulling the assigned
 * id out of the PropertyRegistered event (a transaction receipt cannot carry return values).
 */
export async function registerProperty(
  physicalAddress: string,
  price: number
): Promise<RegistrationResult> {
  const contract = await getWriteContract();

  const tx = await contract.registerProperty(
    normalizePhysicalAddress(physicalAddress),
    encodePrice(price)
  );
  const receipt = await tx.wait();

  const propertyId = extractPropertyId(contract, receipt.logs);
  if (propertyId === null) {
    throw new Error('Transaction mined but no PropertyRegistered event was found.');
  }

  return {
    propertyId: propertyId.toString(),
    txHash: receipt.hash,
    blockNumber: receipt.blockNumber,
  };
}

function extractPropertyId(contract: Contract, logs: readonly Log[]): bigint | null {
  for (const log of logs) {
    try {
      const parsed = contract.interface.parseLog({ topics: [...log.topics], data: log.data });
      if (parsed?.name === 'PropertyRegistered') return parsed.args.propertyId as bigint;
    } catch {
      // Not one of our events — skip it.
    }
  }
  return null;
}

/** Transfers a property to another wallet. Reverts on chain unless the caller owns it. */
export async function transferPropertyOwnership(
  propertyId: string,
  newOwner: string
): Promise<{ txHash: string }> {
  const contract = await getWriteContract();
  const tx = await contract.transferOwnership(propertyId, newOwner);
  const receipt = await tx.wait();
  return { txHash: receipt.hash };
}

/** Reads a property. Resolves to null when the id has never been registered. */
export async function getProperty(propertyId: string): Promise<OnChainProperty | null> {
  const contract = getReadContract();

  try {
    const [physicalAddress, owner, price, registeredAt] = await contract.getProperty(propertyId);
    return {
      propertyId,
      physicalAddress,
      owner,
      price: decodePrice(price),
      registeredAt: new Date(Number(registeredAt) * 1000),
    };
  } catch (error: any) {
    // PropertyDoesNotExist is an expected outcome, not a failure.
    if (isPropertyDoesNotExistError(error)) return null;
    throw error;
  }
}

function isPropertyDoesNotExistError(error: any): boolean {
  return resolveRevertName(error) === 'PropertyDoesNotExist';
}

export async function getPropertyCount(): Promise<number> {
  const contract = getReadContract();
  return Number(await contract.propertyCount());
}

// ── Error presentation ───────────────────────────────────────

const registryInterface = new Interface(PropertyRegistryABI);

/**
 * Recovers the custom error a revert carried.
 *
 * ethers decodes this into `error.revert` for an `eth_call`, but a write that fails during
 * gas estimation arrives with the raw 4-byte selector and no decoding, so fall back to
 * parsing `error.data` against the ABI ourselves.
 */
function resolveRevertName(error: any): string | null {
  if (error?.revert?.name) return error.revert.name;

  const data =
    error?.data ?? error?.info?.error?.data?.data ?? error?.info?.error?.data ?? error?.error?.data;

  if (typeof data === 'string' && data.startsWith('0x')) {
    try {
      return registryInterface.parseError(data)?.name ?? null;
    } catch {
      // Not one of our errors — fall through to the generic message.
    }
  }
  return null;
}

/** Turns an ethers / wallet error into something worth showing a user. */
export function describeContractError(error: any): string {
  if (!error) return 'Something went wrong.';

  // User dismissed the MetaMask popup.
  if (error.code === 4001 || error.code === 'ACTION_REJECTED') {
    return 'Transaction rejected in your wallet.';
  }
  if (error.code === 'INSUFFICIENT_FUNDS') {
    return 'Not enough POL to cover gas. Top up at faucet.polygon.technology.';
  }

  switch (resolveRevertName(error)) {
    case 'EmptyPhysicalAddress':
      return 'The property address cannot be empty.';
    case 'PhysicalAddressTooLong':
      return 'The property address is too long for the registry (max 256 characters).';
    case 'AddressAlreadyRegistered':
      return 'This property address is already registered on chain.';
    case 'ZeroPrice':
      return 'The property price must be greater than zero.';
    case 'PriceOverflow':
      return 'The property price is too large for the registry.';
    case 'NotPropertyOwner':
      return 'Only the current on-chain owner can transfer this property.';
    case 'InvalidNewOwner':
      return 'Enter a valid wallet address that is not the current owner.';
    case 'PropertyDoesNotExist':
      return 'That property is not registered on chain.';
    case 'NotPendingOwner':
      return 'This property was nominated to a different wallet.';
    case 'NoPendingTransfer':
      return 'There is no pending transfer for this property.';
    default:
      break;
  }

  return error.shortMessage || error.reason || error.message || 'Transaction failed.';
}
