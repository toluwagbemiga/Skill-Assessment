# REChain — System Lifecycle: what exists today, and where payments attach

> Read this before building anything in [`PAYMENTS_ARCHITECTURE.md`](PAYMENTS_ARCHITECTURE.md).
> Everything below was read out of the codebase, not assumed.

---

## 1. The headline

**REChain is a listings and lead-generation portal. It is not a transaction platform.**

There is no purchase, offer, checkout, order, invoice, escrow or payment concept anywhere in
the codebase — I grepped the models, routes, controllers and the whole React tree. The only
hits are marketing copy ("From offer to keys, our digital platform handles paperwork,
negotiations, and closing logistics" on the homepage) and the blockchain files we just added.

The business today ends at **"a buyer requests a viewing and the seller gets an email."**
Everything after that — negotiation, payment, title transfer — happens off-platform.

That is good news for the payments work: there is no legacy money code to untangle. It also
means the buyer side is a **greenfield build**, not an extension.

---

## 2. What exists today

### 2.1 Seller lifecycle — mostly built

```
Sign up ──► Verify email ──► /add-property ──► status: 'pending'
                                                     │
                                        admin reviews │
                            ┌────────────────────────┼────────────────────┐
                            ▼                        ▼                    ▼
                       'active'                 'rejected'            'expired'
                   (live on site,          (+ rejectionReason,      (passed expiresAt)
                    expiresAt set)          shown to seller)
                            │
                            ▼
                   Buyer books a viewing ──► email to seller ──► ends here
```

`/my-listings` ([`MyListingsPage.tsx`](../frontend/src/pages/MyListingsPage.tsx)) gives the
seller counts and cards across all four statuses, rejection reasons, expiry countdowns, edit
and delete. It is a real seller dashboard — it just has nothing to say about money.

Backed by `POST/GET/PUT/DELETE /user/properties`, all correctly behind `protect`.

### 2.2 Buyer lifecycle — barely exists

```
Browse /properties ──► /property/:id ──► "Schedule Viewing" form ──► email sent
                                                                        │
                                                                        ▼
                                                                   (off-platform)
```

That is the entire buyer journey. Specifically, a buyer has:

- **No account area at all.** There are 13 routes in `App.tsx`; not one is a buyer dashboard.
- **No saved/favourite properties.**
- **No way to see their own viewing requests** in the UI.
- **No offers, no negotiation, no purchase.**

`Appointment` is the only buyer-side record, and it supports guest bookings — so the platform
does not even require a buyer to have an account.

### 2.3 Admin lifecycle

`adminController.js`, `adminRoutes.js` and `adminActivityLogModel.js` exist, and `adminProtect`
middleware exists. But **the admin app itself is not in this repo** — the root README describes
a monorepo of `admin/`, `backend/`, `frontend/` and only the latter two are present. Worth
knowing before planning the listing company's console.

### 2.4 The AI layer (your GPT-4.1 question)

[`backend/services/aiService.js`](../backend/services/aiService.js):

- `gpt-4.1-mini` primary, `gpt-4.1-nano` fallback
- Served over **GitHub Models / Azure AI Inference** (`models.inference.ai.azure.com`), not the
  OpenAI API directly
- Wrapped in circuit breakers, timeouts, a distributed rate limiter (10 AI searches/IP/hour)
  and a MongoDB response cache
- Paired with `firecrawlService.js` for scraping

**It powers natural-language property search only.** It touches no money, no ownership and no
authorisation — and it must stay that way. An LLM must never sit on a code path that decides
who gets paid; keep it firmly on the discovery side of the line drawn in §5.

The engineering around it (circuit breaker, cache, fallback chain) is genuinely well built.
The models are dated and the free GitHub Models endpoint is rate-limited, so that is worth
revisiting for cost and latency at some point — but it is a search-quality question, entirely
independent of the payments work.

---

## 3. Gap table

| Capability | Today | Needed for payments |
|---|---|---|
| Seller lists a property | ✅ with admin approval | + on-chain registration |
| Seller sees own listings | ✅ 4-state dashboard | + deal state, proceeds, withdraw |
| Buyer browses | ✅ | ✅ |
| Buyer books a viewing | ✅ (guest allowed) | ✅ |
| **Buyer account area** | ❌ none | **required** |
| **Offer / negotiation** | ❌ none | **required** |
| **Purchase flow** | ❌ none | **required** |
| **Wallet ↔ account link** | ❌ none | **required** |
| **Money movement** | ❌ none | **required** |
| **Listing-company console** | ⚠️ backend only, app missing | required |
| Admin approval queue | ✅ backend | ✅ |

---

## 4. Security findings in the current off-chain layer

These matter more than they look, because **the backend is what would decide who the buyer and
seller of a deal are.** A permeable off-chain layer makes on-chain hardening beside the point —
an attacker does not need to break the contract if they can change who the contract is told to
pay.

In [`backend/routes/appointmentRoutes.js`](../backend/routes/appointmentRoutes.js), eight routes
have **no auth middleware at all**, despite `protect` and `adminProtect` both existing and
being used correctly elsewhere:

| Route | Problem |
|---|---|
| `GET /appointments/user` | Reads `req.user._id`, but `req.user` is never populated — this endpoint **crashes on every call** |
| `PUT /appointments/cancel/:id` | The ownership check is `if (appointment.userId && req.user && ...)`. With no `protect`, `req.user` is always undefined, so **the check is skipped entirely** — anyone with an appointment id can cancel it |
| `PUT /appointments/feedback/:id` | Same pattern |
| `GET /appointments/all` | **Unauthenticated dump of every appointment**, including guest names, emails and phone numbers |
| `GET /appointments/stats` | Unauthenticated |
| `PUT /appointments/status` | Unauthenticated state change |
| `PUT /appointments/update-meeting` | Unauthenticated |

The fix is small — add `protect` / `adminProtect` to those seven lines — but it should land
**before** any payments work, because the same class of mistake on a settlement route moves
money rather than meeting links.

I have not touched these; they are outside the assessment scope. Flagging, not fixing.

---

## 5. Isolating payments — six rules

You said you want payments isolated from what exists. Here is what isolation should actually
mean, in descending order of importance.

### Rule 1 — The backend never holds a key and never moves funds

**This is the single most important decision in the whole design.**

Every money-moving transaction is signed by the user's own wallet in their browser. The
backend has **no hot wallet, no signer, no private key**. Its relationship to the chain is
read-only.

The consequence is that a *total* backend compromise — every finding in §4 exploited at once,
full database access, arbitrary code execution — still cannot steal a single dollar. The
attacker can lie about listings; they cannot make the escrow pay them, because the escrow only
listens to signatures the backend cannot produce.

Given §4, do not treat this as optional.

### Rule 2 — The chain is the ledger; MongoDB is a cache

Money state lives on chain. Mongo mirrors it for query speed, and the sync is **one-directional
only: chain → Mongo**, driven by events.

Nothing written to Mongo can cause money to move. If Mongo and the chain disagree, the chain is
right and Mongo is rebuilt. A nightly reconciliation job should assert
`sum(mirrored credits) == on-chain credits` and page someone on drift.

This also kills the `localStorage` shim in the current `BlockchainCard`.

### Rule 3 — Separate the identity domains, and link them with a signature

The app has `User` (email + password + JWT). The chain has wallet addresses. These are
different identities and must be linked deliberately, using **SIWE / EIP-4361**: the user signs
a nonce, the backend verifies the signature recovers to the claimed address.

Never accept a wallet address from a request body as proof of anything. Without a signature
check, anyone can claim any wallet — and then claim its proceeds.

One `User` should be able to link several wallets; store them as a subdocument with the
verification timestamp.

### Rule 4 — Separate bounded context

Payments do not go into `propertyController.js`. New module — own models (`Deal`, `WalletLink`,
`ChainEvent`), own routes, own rate limits, own structured-log channel, own alerting.

Behind a **feature flag**, so payments can be switched off without taking the listings site
down with them. And ideally its own deployment, so a payments incident cannot exhaust the
web tier.

### Rule 5 — Never put personal data on chain

The chain is permanent and unerasable, which collides directly with GDPR/NDPR erasure rights.
Contract calldata carries ids, hashes and amounts — never names, emails, phone numbers, or
free-text addresses that identify a person.

Note this applies to what we already shipped: `PropertyRegistry` stores the listing address
string publicly and forever. That is fine for a property address, but it is the boundary — do
not extend it.

### Rule 6 — Keep the state machines separate

Do not overload the existing `Property.status` enum (`pending`/`active`/`rejected`/`expired`)
with deal states. They are orthogonal: a property can be `active` off chain and `InEscrow` on
chain simultaneously.

```
Property (Mongo)          ← moderation lifecycle, unchanged
   └── onChainId: Number?  ← the only new field. Null until registered.

Deal (Mongo, mirrored from chain events)   ← commercial lifecycle, new collection
```

One nullable field on `Property`. Everything else is new.

---

## 6. The unified lifecycle

What the whole thing looks like once payments exist. **Off-chain** steps are Mongo + JWT;
**on-chain** steps are wallet-signed.

```
 SELLER                                          BUYER
   │                                               │
   │ list property            (off-chain)          │ browse            (off-chain)
   ▼                                               ▼
 pending ──admin approves──► active                view property
   │                                               │
   │ register on chain          [ON-CHAIN]         │ book viewing      (off-chain)
   ▼                                               ▼
 Registered (registry)                           viewing happens    (off-platform)
   │                                               │
   │                                               │ make offer       (off-chain)
   │                          ◄────────────────────┘
   │ accept offer             (off-chain)
   ▼
 nominate escrow as owner      [ON-CHAIN]  initiateTransfer
   │
   ▼
 createDeal                    [ON-CHAIN]  escrow accepts custody
   │                                               │
   │                                               │ deposit USDC     [ON-CHAIN]
   │                          ◄────────────────────┘  (permit: 1 tx)
   ▼
 Funded ──────────────────────────────────────────────────────┐
   │                                                          │
   │ completion happens off-platform (deeds, notary, keys)    │
   ▼                                                          ▼
 buyer confirms              [ON-CHAIN]        OR   inspection window expires
   │                                                          │
   └──────────────────────► Settled ◄─────────────────────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
      seller credited   treasury credited   property → buyer
              │                │
              ▼                ▼
        withdraw()       withdraw()          [ON-CHAIN, pull]
```

Two things to notice:

**Negotiation stays off chain.** Offers and counter-offers are cheap, high-volume, private and
frequently abandoned — exactly the wrong shape for a blockchain. Only the *agreed* deal goes on
chain. This is a deliberate cost and privacy decision, and it is where most of the gas saving
in the whole system comes from.

**The off-chain/on-chain boundary is crossed exactly four times**, all wallet-signed: register,
create deal, deposit, confirm. Every crossing is a place to test hard.

---

## 7. UI to build

### 7.1 Seller — extend `/my-listings`

Additive; the four-status dashboard stays as is.

- **On-chain badge per listing card** — Not registered / Registered / In escrow / Sold
- **"Register on chain"** moved here from the public detail page (it belongs to the owner's
  workspace, not to every visitor's view)
- **Offers inbox** — offers received, accept/decline
- **Deal panel** — buyer, amount, inspection countdown, current state
- **Proceeds panel** — available to withdraw per token, one-click `withdraw()`, history

### 7.2 Buyer — new `/my-purchases`, built from scratch

- **Saved properties** (also missing today, and cheap to add)
- **My viewing requests** — the data exists; the UI never shipped
- **My offers** — sent, accepted, declined
- **My deals** — the important one, driven by the on-chain state machine:

```
Awaiting deposit ──► Deposit (permit → 1 tx) ──► Funded
                                                   │
                                    inspection countdown ticking
                                                   │
                                    ┌──────────────┴──────────────┐
                                    ▼                             ▼
                            Confirm completion              Raise dispute
                                    │                             │
                                    ▼                             ▼
                                 Settled                      Disputed
                              (property yours)            (admin reviews)
```

- **Transaction history** with Polygonscan links

### 7.3 Listing company — new console

The admin app is missing from this repo entirely (§2.3), so this is greenfield too: commission
dashboard, treasury balance and withdraw, dispute queue, Safe transaction proposals.

### 7.4 Cross-cutting

- **Wallet connect in the navbar**, not buried in a card — it is now global state
- **SIWE linking flow** in account settings
- **Network guard banner** — wrong chain is a global condition
- **Pending-transaction toast tray** — deals span minutes; a single card cannot own that state

The current `useWallet` hook is per-component. It should be promoted to a context provider
alongside `AuthContext` before the buyer UI is built.

---

## 8. Audit plan

You asked for a full audit after. What that should mean:

**Before an external auditor is worth paying:**
1. 100% branch coverage on the escrow (`solidity-coverage`)
2. Foundry **invariant tests** — the accounting identity from
   `PAYMENTS_ARCHITECTURE.md` §8 is the one that matters
3. **Slither** and **Aderyn** clean, or every finding explicitly triaged in writing
4. **Fork tests** against real USDC/USDT on a Polygon fork, not mocks
5. A written threat model — the "admin CANNOT" table with a test citation per row
6. Internal review by someone who did not write the code

**Then:** a firm that audits escrow specifically. Budget $15–40k and 2–3 weeks for a contract
this size. Do not deploy to mainnet without it.

**Also in scope, and frequently forgotten:** the off-chain layer. §4 shows the backend is the
softer target. An audit of the contract alone would have missed every finding in that section.

---

## 9. Suggested build order

Ordered so that each step is useful on its own and nothing is blocked on a decision that has
not been made.

| # | Step | Why here |
|---|---|---|
| 0 | Fix the §4 auth holes | Cheap, and the same mistake on a payments route moves money |
| 1 | Wallet context + SIWE linking | Everything else needs a verified wallet ↔ account link |
| 2 | Event indexer (chain → Mongo) | Rule 2. Also deletes the `localStorage` shim |
| 3 | Seller on-chain badges in `/my-listings` | First visible win, no money involved |
| 4 | Offers (pure off-chain) | Exercises the buyer UI with zero financial risk |
| 5 | Buyer `/my-purchases` shell | Ready before there is anything to put in it |
| 6 | `PropertyEscrow` v2a — USDC, no disputes | The money step, in isolation |
| 7 | Disputes + timelock + USDT + `permit` | v2b |
| 8 | Listing-company console | Needs real settled deals to be worth building |

Steps 0–5 carry **no financial risk at all** and make the platform materially better on their
own. That is deliberate: it means the payments work can take the time it needs without the
rest of the roadmap waiting on it.
