/**
 * Chain + contract configuration for the on-chain property registry.
 *
 * The address is injected at build time via VITE_PROPERTY_REGISTRY_ADDRESS. Running
 * `npm run deploy:amoy` in ../contracts prints the value to paste into frontend/.env.
 */

export const POLYGON_AMOY_CHAIN_ID = 80002;

/** Hex form expected by EIP-3085 / EIP-3326 wallet RPC calls. */
export const POLYGON_AMOY_CHAIN_ID_HEX = '0x13882';

export const POLYGON_AMOY_RPC_URL =
  import.meta.env.VITE_AMOY_RPC_URL || 'https://rpc-amoy.polygon.technology';

export const POLYGON_AMOY_EXPLORER = 'https://amoy.polygonscan.com';

/** Passed to wallet_addEthereumChain when the user does not have Amoy configured yet. */
export const POLYGON_AMOY_PARAMS = {
  chainId: POLYGON_AMOY_CHAIN_ID_HEX,
  chainName: 'Polygon Amoy Testnet',
  nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
  rpcUrls: [POLYGON_AMOY_RPC_URL],
  blockExplorerUrls: [POLYGON_AMOY_EXPLORER],
} as const;

export const PROPERTY_REGISTRY_ADDRESS: string =
  import.meta.env.VITE_PROPERTY_REGISTRY_ADDRESS || '';

/** False until the deployed address is wired up, so the UI can explain itself instead of throwing. */
export const isRegistryConfigured = (): boolean => /^0x[a-fA-F0-9]{40}$/.test(PROPERTY_REGISTRY_ADDRESS);

export const explorerTxUrl = (txHash: string): string => `${POLYGON_AMOY_EXPLORER}/tx/${txHash}`;

export const explorerAddressUrl = (address: string): string =>
  `${POLYGON_AMOY_EXPLORER}/address/${address}`;

/**
 * The contract stores prices as an integer in the smallest unit (like wei), packed into a
 * uint96. Listing prices are plain numbers, so we encode them with 18 decimals — the same
 * fixed-point convention as ether — and decode symmetrically when reading back.
 */
export const PRICE_DECIMALS = 18;
