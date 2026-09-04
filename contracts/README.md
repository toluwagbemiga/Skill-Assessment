# PropertyRegistry — on-chain property registry for REChain

A minimal Solidity registry that anchors a listing's **address, owner and price** to
Polygon Amoy, plus the React/ethers.js integration on the property detail page.

| | |
|---|---|
| Contract | [`contracts/PropertyRegistry.sol`](contracts/PropertyRegistry.sol) |
| Tests | [`test/PropertyRegistry.test.js`](test/PropertyRegistry.test.js) — 43 passing |
| Toolchain | Hardhat 2 + ethers v6, Solidity 0.8.24, optimizer on (200 runs) |
| Network | Polygon Amoy testnet (chainId **80002**) |
| Frontend | [`frontend/src/components/property-details/BlockchainCard.tsx`](../frontend/src/components/property-details/BlockchainCard.tsx) |

---

## Quick start

```bash
# 1. Contracts
cd contracts
npm install
npm test                       # 43 tests
cp .env.example .env           # then fill in PRIVATE_KEY

# 2. Deploy to Polygon Amoy (fund the deployer first: faucet.polygon.technology)
npm run deploy:amoy            # prints the address and syncs the ABI to the frontend

# 3. Frontend
cd ../frontend
npm install
cp .env.example .env           # paste the printed VITE_PROPERTY_REGISTRY_ADDRESS
npm run dev                    # open any property → "Blockchain Record" card
```

`deploy:amoy` writes the fresh ABI to `frontend/src/contracts/PropertyRegistry.abi.json`
and records the deployment in `contracts/deployments/amoy.json`, so the app can never drift
from the bytecode that is actually on chain.

---

## The contract

```solidity
function registerProperty(string memory _address, uint256 _price) external returns (uint256 propertyId);
function transferOwnership(uint256 _propertyId, address _newOwner) external;
function getProperty(uint256 _propertyId) external view
    returns (string memory physicalAddress, address owner, uint256 price, uint256 registeredAt);
```

Plus, beyond the brief: `initiateTransfer` / `acceptTransfer` / `cancelTransfer` (two-step
handover), `ownerOf`, `pendingOwnerOf`, `propertyCount`, `isRegistered`,
`propertyIdByAddress`, and a paginated `getProperties`.

Events: `PropertyRegistered`, `OwnershipTransferred`, `TransferInitiated`, `TransferCancelled`.

### Design decisions

**Ids are 1-based.** `0` therefore means "never registered", which makes the existence check
a single storage read (`owner != address(0)`) with no extra flag to keep in sync.

**Storage is packed.** `address owner` (20 bytes) and `uint96 price` (12 bytes) share one
slot, saving an SSTORE per registration versus the naive `uint256` layout. The price ceiling
this buys is `type(uint96).max`; `registerProperty` rejects anything above it rather than
silently truncating.

**Custom errors, not revert strings.** Cheaper to deploy and to revert, and the frontend
switches on the decoded error name to show a specific message instead of a hex blob.

**The id is emitted, not just returned.** A transaction receipt cannot carry a return value,
so the frontend reads `propertyId` out of the `PropertyRegistered` log.

---

## Security model

There is no admin key, no upgrade path and no custody of funds, so the usual "looting"
paths do not exist. What remains is per-property authorisation, and that is enforced on
every state-changing call.

| Concern | How it is handled |
|---|---|
| **Someone seizing another user's property** | `onlyPropertyOwner` reads the owner from storage and compares it to `msg.sender` on every transfer. Owning property #2 grants nothing over property #1. Covered by *"isolates properties: owning one grants no rights over another"*. |
| **Draining the contract** | No `payable` function, no `receive`, no `fallback`. Plain POL transfers to the contract revert; there is nothing to withdraw and no withdrawal code to exploit. A test asserts the ABI exposes **zero** payable functions. |
| **Privileged-key compromise** | There are no roles at all — no owner, pauser, minter or upgrader. Nothing to compromise. |
| **Reentrancy** | No function makes an external call or moves value, so there is no reentrancy surface. State is still written before events are emitted. |
| **`tx.origin` phishing** | `tx.origin` is never read. Authorisation is `msg.sender` only. |
| **Claiming a property someone else already registered** | Registrations are keyed on `keccak256(address string)`; a duplicate reverts with `AddressAlreadyRegistered(existingId)` and leaves the original record untouched. |
| **Losing a property to a typo'd recipient** | `transferOwnership` moves it immediately as specified, but `initiateTransfer` + `acceptTransfer` is also available: the property only moves once the recipient proves they hold the key. Any pending nomination is cleared whenever ownership changes, so a stale one can never be redeemed against the new owner. |
| **Burning a property** | `_validateNewOwner` rejects `address(0)` (which would break the existence invariant), the registry's own address, and a no-op transfer to the current owner. |
| **Storage / gas griefing** | The address string is capped at 256 bytes, so no caller can inflate another reader's costs. `getProperties` clamps its page to 100. |
| **Integer overflow / truncation** | Solidity 0.8 checked arithmetic throughout. The one `unchecked` block is the id increment, which cannot realistically overflow at one per transaction. The `uint96` downcast is guarded by an explicit range check. |

### Known limitation, stated plainly

This is a **permissionless** registry. It proves who registered a string and who controls
it on chain — it cannot prove real-world legal title. Duplicate address strings are
rejected, but nothing stops a first-mover from registering an address they do not own. A
production deployment would gate `registerProperty` behind a verified-notary role and
attest the record off chain; that is a policy layer, deliberately out of scope here.

---

## Tests

43 tests covering the three required behaviours and the hardening above:

```
registerProperty          10 tests   storage, event, returned id, sequential ids, validation
input bounds               2 tests   address length cap
a property cannot be
  claimed twice            2 tests   duplicate registration, attacker re-registration
transferOwnership          4 tests   moves owner, emits, leaves fields intact, chains
only the owner can
  transfer                 8 tests   non-owner, attacker seizure, cross-property isolation,
                                     revoked previous owner, zero address, self, unknown id
two-step transfer          7 tests   nominate/accept/cancel, stale nomination, replacement
contract holds no value    2 tests   plain transfers revert, zero payable functions
getProperty                3 tests   public readability, unknown id, id 0
pagination                 3 tests   offset, clamping, out-of-range
```

```bash
npm test                # run them
REPORT_GAS=true npm test  # with a gas table
```

Every revert path was also verified end-to-end against a live node to confirm the frontend
decodes each custom error into a specific message (`NotPropertyOwner`,
`AddressAlreadyRegistered`, `ZeroPrice`, `EmptyPhysicalAddress`, `PhysicalAddressTooLong`,
`PropertyDoesNotExist`, `NoPendingTransfer`).

---

## Frontend integration

Everything lives on the property detail page, in the right-hand column under the viewing
form. No backend involved.

| File | Role |
|---|---|
| `frontend/src/config/web3.ts` | Chain constants, contract address, explorer URLs |
| `frontend/src/services/blockchain.ts` | ethers bindings: connect, network switch, read, write, error decoding |
| `frontend/src/hooks/useWallet.ts` | Wallet connection state, follows `accountsChanged` / `chainChanged` |
| `frontend/src/utils/onChainLinks.ts` | Remembers listing `_id` → on-chain id |
| `frontend/src/components/property-details/BlockchainCard.tsx` | The UI |

The card:

- shows the on-chain status (**On chain** / **Not registered** / **Checking**),
- renders a **Register on Blockchain** button that connects the wallet, switches to Amoy
  (adding it via `wallet_addEthereumChain` if the user has never used it), and sends the
  transaction,
- displays the **transaction hash** with a link to Amoy Polygonscan once mined,
- shows the on-chain id, owner, registration date and contract address, and
- offers **Transfer Ownership** to whoever the contract says is the current owner.

**Reads need no wallet.** Status is fetched over a plain JSON-RPC provider, so a visitor
without MetaMask still sees whether a property is registered.

**Status is resolved from the chain, not from local state.** `localStorage` only caches the
listing `_id` → on-chain id mapping; the source of truth is `propertyIdByAddress`, so the
card is correct on a fresh browser or after someone else registered the listing. In
production that mapping belongs in the properties collection, written by the backend when
it observes the `PropertyRegistered` event — the assessment scope is frontend-only.

**Address strings are normalised** (trimmed, whitespace collapsed, zero-width characters
stripped) before hashing, so the contract's uniqueness check is not defeated by invisible
differences from a copy/paste.

**ethers is code-split.** `BlockchainCard` is lazy-loaded, keeping the detail page chunk at
23 kB instead of 321 kB; the ~180 kB web3 bundle only loads on that route.
