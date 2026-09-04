/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_ENABLE_AI_HUB: string;
  /** Deployed PropertyRegistry address on Polygon Amoy (printed by `npm run deploy:amoy`). */
  readonly VITE_PROPERTY_REGISTRY_ADDRESS: string;
  /** Optional Amoy RPC override; falls back to the public endpoint. */
  readonly VITE_AMOY_RPC_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
