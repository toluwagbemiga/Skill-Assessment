import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useWallet } from '../../hooks/useWallet';
import {
  describeContractError,
  getProperty,
  lookupPropertyIdByAddress,
  registerProperty,
  transferPropertyOwnership,
  type OnChainProperty,
} from '../../services/blockchain';
import {
  explorerAddressUrl,
  explorerTxUrl,
  isRegistryConfigured,
  PROPERTY_REGISTRY_ADDRESS,
} from '../../config/web3';
import { getOnChainLink, saveOnChainLink } from '../../utils/onChainLinks';

interface BlockchainCardProps {
  /** MongoDB _id of the listing — the key the on-chain id is remembered against. */
  dbId: string;
  title: string;
  location: string;
  price: number;
}

const shortenAddress = (address: string): string =>
  `${address.slice(0, 6)}...${address.slice(-4)}`;

/**
 * The string committed to the registry. Title and location together make the listing
 * identifiable, and the contract rejects a duplicate of this exact string.
 */
const buildPhysicalAddress = (title: string, location: string): string =>
  `${title} — ${location}`.slice(0, 256);

const BlockchainCard: React.FC<BlockchainCardProps> = ({ dbId, title, location, price }) => {
  const wallet = useWallet();

  const [onChain, setOnChain] = useState<OnChainProperty | null>(null);
  const [txHash, setTxHash] = useState<string | null>(getOnChainLink(dbId)?.txHash ?? null);
  const [checking, setChecking] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showTransfer, setShowTransfer] = useState(false);
  const [newOwner, setNewOwner] = useState('');

  const physicalAddress = buildPhysicalAddress(title, location);
  const configured = isRegistryConfigured();

  /**
   * Resolves the current on-chain state. The locally remembered id is only a hint — the
   * address lookup is the source of truth, so the status stays correct on a fresh browser
   * or after someone else registered the same listing.
   */
  const refresh = useCallback(async () => {
    if (!configured) {
      setChecking(false);
      return;
    }

    setChecking(true);
    setError(null);
    try {
      const knownId = getOnChainLink(dbId)?.propertyId;
      const propertyId = knownId ?? (await lookupPropertyIdByAddress(physicalAddress));
      setOnChain(propertyId ? await getProperty(propertyId) : null);
    } catch (err) {
      setError(describeContractError(err));
    } finally {
      setChecking(false);
    }
  }, [configured, dbId, physicalAddress]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleRegister = async () => {
    setError(null);

    const account = wallet.account ?? (await wallet.connect());
    if (!account) return;

    setSubmitting(true);
    try {
      const result = await registerProperty(physicalAddress, price);

      saveOnChainLink(dbId, result);
      setTxHash(result.txHash);
      setOnChain(await getProperty(result.propertyId));

      toast.success('Property registered on Polygon Amoy', {
        description: `On-chain ID #${result.propertyId} · block ${result.blockNumber}`,
      });
    } catch (err) {
      const message = describeContractError(err);
      setError(message);
      toast.error('Registration failed', { description: message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleTransfer = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!onChain) return;

    setError(null);
    setSubmitting(true);
    try {
      const { txHash: hash } = await transferPropertyOwnership(onChain.propertyId, newOwner.trim());

      setTxHash(hash);
      setNewOwner('');
      setShowTransfer(false);
      setOnChain(await getProperty(onChain.propertyId));

      toast.success('Ownership transferred', { description: `Tx ${shortenAddress(hash)}` });
    } catch (err) {
      const message = describeContractError(err);
      setError(message);
      toast.error('Transfer failed', { description: message });
    } finally {
      setSubmitting(false);
    }
  };

  const isOwner =
    Boolean(wallet.account && onChain) &&
    wallet.account!.toLowerCase() === onChain!.owner.toLowerCase();

  return (
    <div className="bg-white border border-[#E6E0DA] rounded-2xl p-6 shadow-sm mt-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <span className="material-icons text-[#D4755B]">link</span>
          <h3 className="font-syne text-lg text-[#0F172A]">Blockchain Record</h3>
        </div>
        <StatusPill checking={checking} registered={Boolean(onChain)} configured={configured} />
      </div>

      <p className="font-manrope font-extralight text-sm text-[#64748B] mb-5">
        Anchor this listing to the{' '}
        <span className="font-normal text-[#374151]">PropertyRegistry</span> contract on the
        Polygon Amoy testnet, so its address, price and owner are publicly verifiable.
      </p>

      {!configured ? (
        <Notice icon="settings" tone="warning">
          The registry address is not configured. Deploy the contract and set{' '}
          <code className="font-mono text-xs">VITE_PROPERTY_REGISTRY_ADDRESS</code> in{' '}
          <code className="font-mono text-xs">frontend/.env</code>.
        </Notice>
      ) : (
        <>
          {/* On-chain details */}
          {onChain && (
            <dl className="border border-[#E6E0DA] rounded-xl divide-y divide-[#E6E0DA] mb-5">
              <Row label="On-chain ID" value={`#${onChain.propertyId}`} />
              <Row
                label="Owner"
                value={shortenAddress(onChain.owner)}
                href={explorerAddressUrl(onChain.owner)}
                badge={isOwner ? 'You' : undefined}
              />
              <Row label="Registered" value={onChain.registeredAt.toLocaleDateString()} />
              <Row
                label="Contract"
                value={shortenAddress(PROPERTY_REGISTRY_ADDRESS)}
                href={explorerAddressUrl(PROPERTY_REGISTRY_ADDRESS)}
              />
            </dl>
          )}

          {/* Transaction hash */}
          {txHash && (
            <div className="bg-[#F2EFE9] border border-[#E6E0DA] rounded-xl p-4 mb-5">
              <p className="font-manrope text-xs uppercase tracking-wide text-[#64748B] mb-1">
                Transaction hash
              </p>
              <a
                href={explorerTxUrl(txHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs text-[#D4755B] hover:underline break-all"
              >
                {txHash}
              </a>
              <p className="font-manrope font-extralight text-xs text-[#64748B] mt-2">
                View on Polygonscan (Amoy)
              </p>
            </div>
          )}

          {/* Wallet / network prompts */}
          {!wallet.hasWallet && (
            <Notice icon="account_balance_wallet" tone="warning">
              No wallet detected.{' '}
              <a
                href="https://metamask.io/download/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#D4755B] hover:underline"
              >
                Install MetaMask
              </a>{' '}
              to register this property.
            </Notice>
          )}

          {wallet.hasWallet && wallet.account && !wallet.isCorrectNetwork && (
            <Notice icon="swap_horiz" tone="warning">
              Your wallet is on the wrong network.{' '}
              <button onClick={wallet.switchNetwork} className="text-[#D4755B] hover:underline">
                Switch to Polygon Amoy
              </button>
            </Notice>
          )}

          {(error || wallet.error) && (
            <Notice icon="error_outline" tone="error">
              {error || wallet.error}
            </Notice>
          )}

          {/* Primary action */}
          {!onChain ? (
            <button
              onClick={handleRegister}
              disabled={submitting || checking || !wallet.hasWallet}
              className="w-full bg-[#D4755B] text-white font-manrope font-bold px-6 py-3 rounded-lg hover:bg-[#B86851] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <span className="material-icons animate-spin text-base">progress_activity</span>
                  Confirm in your wallet...
                </>
              ) : (
                <>
                  <span className="material-icons text-base">add_link</span>
                  {wallet.account ? 'Register on Blockchain' : 'Connect Wallet & Register'}
                </>
              )}
            </button>
          ) : (
            isOwner && (
              <div>
                {!showTransfer ? (
                  <button
                    onClick={() => setShowTransfer(true)}
                    className="w-full border border-[#D4755B] text-[#D4755B] font-manrope font-bold px-6 py-3 rounded-lg hover:bg-[#FDF6F3] transition-all flex items-center justify-center gap-2"
                  >
                    <span className="material-icons text-base">swap_horiz</span>
                    Transfer Ownership
                  </button>
                ) : (
                  <form onSubmit={handleTransfer} className="space-y-3">
                    <label
                      htmlFor="new-owner"
                      className="block font-manrope text-sm text-[#374151]"
                    >
                      New owner wallet address
                    </label>
                    <input
                      id="new-owner"
                      value={newOwner}
                      onChange={(e) => setNewOwner(e.target.value)}
                      placeholder="0x..."
                      pattern="^0x[a-fA-F0-9]{40}$"
                      required
                      className="w-full border border-[#E6E0DA] rounded-lg px-4 py-2.5 font-mono text-sm focus:outline-none focus:border-[#D4755B]"
                    />
                    <div className="flex gap-3">
                      <button
                        type="submit"
                        disabled={submitting}
                        className="flex-1 bg-[#D4755B] text-white font-manrope font-bold px-6 py-2.5 rounded-lg hover:bg-[#B86851] transition-all disabled:opacity-50"
                      >
                        {submitting ? 'Transferring...' : 'Confirm Transfer'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowTransfer(false)}
                        className="px-6 py-2.5 font-manrope text-sm text-[#64748B] hover:text-[#374151]"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )
          )}

          {wallet.account && (
            <p className="font-manrope font-extralight text-xs text-[#64748B] mt-3 text-center">
              Connected as {shortenAddress(wallet.account)}
            </p>
          )}
        </>
      )}
    </div>
  );
};

// ── Presentational helpers ───────────────────────────────────

const StatusPill: React.FC<{ checking: boolean; registered: boolean; configured: boolean }> = ({
  checking,
  registered,
  configured,
}) => {
  if (!configured) {
    return <Pill tone="neutral" icon="help_outline" label="Not configured" />;
  }
  if (checking) {
    return <Pill tone="neutral" icon="hourglass_empty" label="Checking..." />;
  }
  return registered ? (
    <Pill tone="success" icon="verified" label="On chain" />
  ) : (
    <Pill tone="neutral" icon="radio_button_unchecked" label="Not registered" />
  );
};

const Pill: React.FC<{ tone: 'success' | 'neutral'; icon: string; label: string }> = ({
  tone,
  icon,
  label,
}) => (
  <span
    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-manrope text-xs font-semibold ${
      tone === 'success' ? 'bg-[#DCFCE7] text-[#15803D]' : 'bg-[#F1F5F9] text-[#64748B]'
    }`}
  >
    <span className="material-icons text-sm">{icon}</span>
    {label}
  </span>
);

const Row: React.FC<{ label: string; value: string; href?: string; badge?: string }> = ({
  label,
  value,
  href,
  badge,
}) => (
  <div className="flex items-center justify-between px-4 py-3">
    <dt className="font-manrope text-sm text-[#64748B]">{label}</dt>
    <dd className="flex items-center gap-2">
      {badge && (
        <span className="bg-[#FDF6F3] text-[#D4755B] font-manrope text-xs font-semibold px-2 py-0.5 rounded">
          {badge}
        </span>
      )}
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-sm text-[#D4755B] hover:underline"
        >
          {value}
        </a>
      ) : (
        <span className="font-mono text-sm text-[#0F172A]">{value}</span>
      )}
    </dd>
  </div>
);

const Notice: React.FC<{
  icon: string;
  tone: 'warning' | 'error';
  children: React.ReactNode;
}> = ({ icon, tone, children }) => (
  <div
    className={`flex items-start gap-2 rounded-xl p-3 mb-4 font-manrope text-sm ${
      tone === 'error' ? 'bg-[#FEF2F2] text-[#B91C1C]' : 'bg-[#FEFCE8] text-[#854D0E]'
    }`}
  >
    <span className="material-icons text-base leading-5">{icon}</span>
    <span>{children}</span>
  </div>
);

export default BlockchainCard;
