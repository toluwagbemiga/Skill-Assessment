# REChain — Stablecoin Payments Architecture (v2 design)

> **Status:** design, not built. `PropertyRegistry` (v1) is deployed and tested; nothing in
> this document is implemented yet.
> **Scope:** USDT/USDC purchases, seller payouts, listing-company commission, multisig admin,
> and the gas/latency budget for all of it.
>
> ⚠️ **Superseded on disputes.** §2.2 and §4 below describe the platform admin as the dispute
> arbiter. That was revised — see [`DESIGN_DECISIONS.md`](DESIGN_DECISIONS.md) §2, which moves
> arbitration to a **per-deal arbiter agreed by both parties at deal creation**, so no global
> admin holds discretion over anyone's funds. Everything else here stands.

---

## 1. What v1 is, and why it stays untouched

`PropertyRegistry` holds **no funds and has no admin**. That is the reason it is safe, and it
is worth protecting. Everything in this document therefore goes into a **separate contract**.

The registry already has the one primitive an escrow needs: two-step transfer
(`initiateTransfer` → `acceptTransfer`). The escrow takes custody of a property by being
nominated and accepting, and releases it by calling `transferOwnership`. **No registry
changes, no new registry roles, no operator/approval concept.**

```
PropertyRegistry (immutable, no admin, no funds)   ← unchanged
        ▲
        │ initiateTransfer / acceptTransfer / transferOwnership
        │
PropertyEscrow (holds stablecoins + property custody)
        ▲
        │ bounded admin calls
        │
Gnosis Safe (3-of-5)  ──through──►  TimelockController (48h, parameters only)
```

One thing to be explicit about: **v1's "no reentrancy surface" property does not survive into
v2.** Once ERC-20s move, there are external calls. v2 needs CEI ordering *and* a guard.

---

## 2. Money flow

### 2.1 Roles

| Role | Address type | What it can do |
|---|---|---|
| Seller | EOA | Lists a property into escrow, claims proceeds |
| Buyer | EOA | Deposits stablecoins, confirms or disputes |
| Treasury | Safe | Receives commission, withdraws like anyone else |
| Admin | Gnosis Safe 3-of-5 | Bounded — see §4 |

### 2.2 Deal lifecycle

```
        createDeal()              deposit()            confirmCompletion()
Draft ──────────────► AwaitingDeposit ──────► Funded ─────────────────────► Settled
 (seller)                  │                    │  (buyer)
                           │                    │
                    cancelDeal()          claimAfterInspection()  ── seller, after
                    (seller, pre-deposit)      │                     inspectionEnd
                           ▼                   │
                       Cancelled          dispute() (buyer, before inspectionEnd)
                                               ▼
                                           Disputed ──resolveDispute()──► Settled | Refunded
                                                        (admin, bounded)
```

**Why an inspection window rather than plain "seller confirms".** Property completion happens
off chain — deeds, notary, keys. Neither party should be able to hold the other hostage:

- The buyer confirming instantly releases funds (happy path, one transaction).
- If the buyer goes quiet, the seller can claim after `inspectionEnd` — the buyer cannot
  freeze the seller's money by doing nothing.
- If something is genuinely wrong, the buyer disputes before `inspectionEnd`, and only then
  does a human (the Safe) get involved.

The admin is on the *exception* path only. Normal sales never touch it.

### 2.3 Commission split

Fee is taken from proceeds, so there is exactly one deposit amount and no surprise top-up
for the buyer:

```
seller credit   = amount − (amount × feeBps / 10_000)
treasury credit = amount × feeBps / 10_000
```

Two rules that matter more than they look:

1. **`feeBps` is frozen into the deal at creation.** It is *not* read from a mutable global at
   settlement. Otherwise the admin could raise the fee after a buyer has already deposited.
2. **`MAX_FEE_BPS = 1000` is a `constant`.** Even a fully compromised Safe cannot set a 100%
   commission, because the cap is in bytecode, not storage.

Splitting the fee further (listing agent vs. platform) is a v3 concern: point `treasury` at a
`PaymentSplitter` and the escrow needs no changes.

### 2.4 Withdrawals — pull, never push

```solidity
mapping(address token => mapping(address account => uint256)) private _credits;

function withdraw(address token) external nonReentrant;
```

Settlement **credits balances**; it never transfers. Sellers and the listing company use the
identical `withdraw` path — one mechanism, one set of tests.

This is not a stylistic preference. **USDC and USDT both have blacklists.** If settlement
pushed funds to a blacklisted seller, the token transfer reverts, the whole settlement
reverts, and the *buyer's* funds are trapped alongside the seller's. With credits, each
withdrawal fails independently and nothing else is affected.

It is also cheaper: a seller with five completed sales does **one** ERC-20 transfer, not five.

---

## 3. Token handling

| Concern | Decision |
|---|---|
| Which tokens | Strict allowlist — USDC and USDT on Polygon only. Arbitrary tokens mean fee-on-transfer, rebasing and ERC-777 reentrancy. |
| Decimals | **6, not 18.** Never assume 18 anywhere. Prices are a `(token, amount)` pair; the frontend formats per token. |
| USDT's ABI | USDT does not return a bool from `transfer`. Use OpenZeppelin **`SafeERC20`** everywhere. |
| Amount actually received | Measure `balanceAfter − balanceBefore` rather than trusting the argument. Costs ~5k gas, removes an entire bug class, and lets the allowlist widen later without a rewrite. |
| Approvals | **EIP-2612 `permit` for USDC** (`depositWithPermit`) — deletes a whole `approve` transaction. USDT has no permit; it keeps the two-step `approve` → `deposit` path. |

`permit` is the single highest-value change on this list: it is both the biggest gas saving
and the biggest latency saving, and it is the difference between a two-transaction and a
one-transaction checkout.

---

## 4. Multisig admin — powers, and hard limits

**Use Gnosis Safe. Do not write a multisig.** It is audited, deployed on Polygon, has a UI
your non-technical stakeholders can actually use, and hand-rolled multisigs are a well-worn
path to losing funds. The escrow just stores `address admin` that happens to be a Safe.

Recommended: **3-of-5**, signers on separate hardware, behind a **48-hour `TimelockController`
for parameter changes** (not for dispute resolution, which needs to be responsive).

### What the admin CAN do

| Power | Bound |
|---|---|
| Pause **new deals and deposits** | Cannot pause withdrawals — see below |
| Allowlist / delist a token | Delisting never touches existing credits |
| Set `feeBps` | Capped at `MAX_FEE_BPS`, timelocked, applies to *future* deals only |
| Set `treasury` | Timelocked |
| Resolve a dispute | Splits that deal's escrowed amount between **that deal's** buyer and seller only |
| Hand over admin | Two-step (`transferAdmin` → `acceptAdmin`), same pattern as v1 |

### What the admin CANNOT do — enforced in code

- **Withdraw to an arbitrary address.** `resolveDispute(dealId, buyerRefundBps)` takes a
  *percentage*, not a recipient. The two payees are read from the deal's storage. There is no
  code path that sends escrowed funds to an address the admin supplies.
- **Pause withdrawals.** Deposits pause; credits already earned are always claimable. A pause
  that can freeze user funds is a hostage vector, not a safety feature.
- **Touch a settled deal**, change an amount, or alter `feeBps` on an existing deal.
- **Take ownership of a property.** Property custody only ever moves escrow → buyer, or
  escrow → seller on cancellation.
- **Upgrade the contract.** See below.

### Upgradeability

**Recommend: not upgradeable for the MVP.** A proxy hands the admin the ability to replace
every rule above, which quietly undoes the entire table. Deploy versioned escrows and migrate
new deals to the new one; the registry is permanent, so listing history survives a migration
intact. If governance later insists on upgradeability, UUPS behind the timelock — but take
that decision deliberately, not by default.

---

## 5. Gas budget

### 5.1 Storage packing

The `Deal` struct is the hot path. Naive layout is six slots; packed is three — roughly
**60,000 gas saved per deal created** (~20k per slot avoided).

```solidity
struct Deal {
    // slot 0 — 256 bits exactly
    address buyer;          // 160
    uint64  inspectionEnd;  //  64
    uint8   status;         //   8   enum
    uint8   tokenId;        //   8   index into the allowlist, NOT a 20-byte address
    // slot 1 — 256 bits exactly
    address seller;         // 160
    uint96  amount;         //  96   6-decimal USDC/USDT: ceiling ~7.9e22 tokens
    // slot 2
    uint64  propertyId;     //  64
    uint16  feeBps;         //  16   frozen at creation
}
```

The `tokenId` trick is what makes slot 0 fit: storing a `uint8` index into the token allowlist
instead of a 20-byte address frees 12 bytes and collapses a slot.

### 5.2 Other wins

| Technique | Saving | Note |
|---|---|---|
| Pull payments | ~30k per extra sale | One transfer per withdrawal, not per sale |
| `permit` deposit | ~46k | Removes the entire `approve` transaction |
| Custom errors | ~2k per revert + deploy | Already the v1 convention |
| `immutable` registry address | ~2.1k per read | Set once in the constructor |
| Events over storage | ~20k per field | Anything the contract does not need to *read* |
| `unchecked` increments | ~120 each | Only where overflow is provably impossible |
| `_credits` accumulation | ~15k | Warm slot on repeat settlements |

### 5.3 What not to do

Skip `viaIR` and assembly for the MVP. The gain is single-digit percent on a chain where a
transaction costs a fraction of a cent, and both make the code materially harder to audit —
which is the wrong trade when the code is holding other people's money.

---

## 6. Latency budget

Worth being blunt: **the contract is not your latency problem.** Polygon blocks are ~2s. Almost
all perceived slowness is RPC and UI.

| Change | Impact | Effort |
|---|---|---|
| **Replace the public Amoy RPC** with Alchemy/Infura | Seconds → ~100ms. The public endpoint is rate-limited and slow. | 10 min |
| **Multicall3** to batch reads | The current card does two sequential round trips (`propertyIdByAddress` → `getProperty`). One call instead. | 1 hour |
| **Optimistic UI** — render from `tx.hash` immediately, reconcile on receipt | Perceived latency → ~0. Never block a spinner on `tx.wait()`. | 2 hours |
| **`tx.wait(1)`**, not more confirmations | Already correct; do not raise it on an L2 | — |
| **Backend event indexer** → MongoDB | Lists and dashboards read Mongo, never RPC. Removes RPC from every page that is not a live action. | 1–2 days |
| **WebSocket event subscription** instead of polling | Live status with no poll loop | 3 hours |
| `permit` | One wallet round trip instead of two | included above |

The indexer is the structural one: the backend already exists (Express + MongoDB), so
`PropertyRegistered` / `DealSettled` events should be consumed there and written alongside the
listing. That also removes the `localStorage` mapping shim currently in the frontend.

---

## 7. Contract surface (sketch)

```solidity
interface IPropertyEscrow {
    // ── seller ──────────────────────────────────────────────
    function createDeal(
        uint64  propertyId,   // seller must already own it in the registry
        address buyer,        // named buyer; open listings are a v3 concern
        uint8   tokenId,      // index into the allowlist
        uint96  amount,       // in token units (6 decimals)
        uint64  inspectionPeriod
    ) external returns (uint256 dealId);

    function cancelDeal(uint256 dealId) external;              // pre-deposit only
    function claimAfterInspection(uint256 dealId) external;    // after inspectionEnd, undisputed

    // ── buyer ───────────────────────────────────────────────
    function deposit(uint256 dealId) external;
    function depositWithPermit(uint256 dealId, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external;
    function confirmCompletion(uint256 dealId) external;        // happy path
    function dispute(uint256 dealId) external;                  // before inspectionEnd
    function refund(uint256 dealId) external;                   // deal expired unfunded/unsettled

    // ── anyone ──────────────────────────────────────────────
    function withdraw(address token) external;                  // seller AND treasury use this
    function creditsOf(address token, address account) external view returns (uint256);
    function getDeal(uint256 dealId) external view returns (DealView memory);

    // ── admin (Gnosis Safe) ─────────────────────────────────
    function resolveDispute(uint256 dealId, uint16 buyerRefundBps, bool propertyToBuyer) external;
    function setTokenAllowed(address token, bool allowed) external;   // timelocked
    function setFeeBps(uint16 feeBps) external;                       // timelocked, <= MAX_FEE_BPS
    function setTreasury(address treasury) external;                  // timelocked
    function pauseDeposits(bool paused) external;                     // never pauses withdraw()
    function transferAdmin(address newAdmin) external;                // two-step
}
```

Events for everything: `DealCreated`, `Deposited`, `Settled`, `Disputed`, `DisputeResolved`,
`Refunded`, `Withdrawn`, `FeeChanged`, `TokenAllowed`, `AdminTransferred`. The indexer in §6
depends on these being complete.

---

## 8. Test plan

v1 is at 43 tests. v2 needs materially more, because money moves:

- **Happy paths** — deposit → confirm → withdraw, for both tokens, both decimals.
- **Accounting invariant** (the important one) — for every sequence of operations,
  `sum(credits) + escrowed == contract token balance`. Worth writing as a **Foundry invariant
  test**; this is the single class of bug that loses funds.
- **Reentrancy** — malicious token and malicious recipient against `withdraw` and `settle`.
- **Blacklist simulation** — a seller who cannot receive; assert the buyer and treasury are
  unaffected.
- **Admin bounds** — a test per row of the "CANNOT" table in §4. These are the tests that
  prove the security claims rather than asserting them.
- **Fee immutability** — admin raises `feeBps` mid-deal; the funded deal settles at the old rate.
- **Fuzzing** — amounts, fee splits, rounding. Check no wei is ever stranded or double-credited.
- **Fork test** against real USDC/USDT on a Polygon fork, not mocks — this is what catches the
  USDT return-value issue for real.

---

## 9. Phasing

| Phase | Contents | Estimate |
|---|---|---|
| **v1 — done** | `PropertyRegistry`, 43 tests, frontend integration | shipped |
| **v2a** | `PropertyEscrow` — USDC only, credits, withdraw, fee split, Safe admin, no disputes | ~1 week |
| **v2b** | Disputes + timelock + USDT + `permit` | ~1 week |
| **v2c** | Event indexer in the existing Express backend; drop the `localStorage` shim | ~3 days |
| **v3** | Open listings, fee splitter, fractional ownership | later |

**Do not deploy v2 to mainnet without an external audit.** Escrow holding real money is not
the place to rely on a self-review, however good the test suite is.

---

## 10. Open decisions

Three things that need a human answer before v2a starts:

1. **Who bears gas?** Buyer paying is simplest. A relayer/paymaster (ERC-2771 or Account
   Abstraction) is much better UX for non-crypto-native buyers, but it is a meaningful chunk
   of work and a new trust assumption. *Recommendation: buyer pays for v2a; revisit at v3.*
2. **Named buyer or open listing?** The sketch above assumes the seller names the buyer at deal
   creation, which matches how property actually sells. Open listings need front-running
   protection. *Recommendation: named buyer.*
3. **KYC/compliance boundary.** Stablecoin real-estate settlement carries real regulatory
   weight in most jurisdictions. The `registerProperty` notary role and the token allowlist are
   the natural enforcement points, but the *policy* needs a legal answer, not an engineering
   one. Worth raising early rather than late.
