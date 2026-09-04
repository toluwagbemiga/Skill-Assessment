# REChain — Contract Design Decisions

> Decision record for the on-chain layer. Supersedes the dispute-resolution sections of
> [`PAYMENTS_ARCHITECTURE.md`](PAYMENTS_ARCHITECTURE.md) §2.2 and §4.
> Companion documents: [`SYSTEM_LIFECYCLE.md`](SYSTEM_LIFECYCLE.md) (what exists today),
> [`PAYMENTS_ARCHITECTURE.md`](PAYMENTS_ARCHITECTURE.md) (the payment layer design).

---

## 0. The reframe: what the contract is actually for

> *"I think the contract is just for managing listing and purchase lifecycle."*

That is the right way to think about it, and it should drive the architecture. The contract's
job is to be a **referee**, not a bank:

- Who owns this property?
- What state is this deal in?
- Who is allowed to move it to the next state?

Money movement is an **effect of a state transition**, not the purpose of the system.

### The nuance that matters

Custody is what makes the lifecycle *binding*. A lifecycle contract that holds no funds is a
shared spreadsheet — a buyer could mark a deal "completed" without ever having paid, and the
contract has no way to care.

So the accurate statement is:

> **The contract manages the lifecycle. Holding the funds is what gives the lifecycle teeth.**

Payment is not decoration bolted onto the state machine, and it is not the point of the state
machine either. It is the **enforcement mechanism** for exactly two transitions: `Funded` and
`Settled`. Everything else in the lifecycle is pure state.

### Why this framing pays off

| Consequence | Why it matters |
|---|---|
| The listing half ships **without** payments and is still useful | Exactly the two-track plan — v1 stands alone today |
| Negotiation stays off chain naturally | Offers aren't states, they're noise *before* a state |
| Payment becomes a module attached to two transitions | Not a rewrite; the state machine is unchanged |
| The security question sharpens | "Who can trigger which transition" — one question, testable |

---

## 1. Decision: who administers the contract

### Where v1 stands

`PropertyRegistry` **has no owner, no admin, and no roles.** There is nothing for a Safe to
own. That is deliberate, and it is the single strongest security property the contract has —
there is no key whose compromise matters.

Any admin discussion applies only to the future escrow.

### Options

| Option | Pros | Cons |
|---|---|---|
| **No admin at all** (v1 today) | Nothing to compromise, steal, or lose. No governance overhead. Simplest possible audit. | No emergency stop. No way to resolve a genuine dispute. Unworkable once funds are custodied. |
| **Single EOA admin** | Trivial to set up. Instant response in an incident. | One key = one point of total failure. Phishing, device loss, or a rogue employee ends it. Unacceptable over other people's money. |
| **Gnosis Safe (3-of-5)** ✅ | No single point of failure. Audited, battle-tested, deployed on Polygon. Non-technical stakeholders get a real UI. Signers can be revoked. | Slower to act (needs quorum). Extra operational discipline. Patchy tooling on Amoy testnet. |
| **Safe + Timelock** ✅ for parameters | Users can *see* a parameter change coming and exit before it lands. Kills the "rug via config" vector. | Delay is real — 48h to fix a bad fee. Wrong for disputes, which need to be responsive. |
| Hand-rolled multisig | Full control over semantics. | A well-known way to lose funds. Weeks of work and an audit to reach what Safe already gives you free. **Don't.** |

### Recommendation

**Safe 3-of-5, with a 48h timelock on parameter changes only** — never on dispute resolution,
which must stay responsive. Keep v1 admin-free, forever.

### Technical caveats when the admin is a Safe

A Safe is a **smart contract account**, not an EOA. Four things follow:

| Caveat | Consequence for our design |
|---|---|
| Any `msg.sender == tx.origin` check locks a Safe out | We have none. Never add one. |
| Safes sign via **EIP-1271**, not raw ECDSA | Fine for admin calls. Matters if a Safe is ever a *buyer* — needed for corporate buyers later. |
| `.transfer()`'s 2300-gas stipend **fails** to a Safe | Another reason pull payments + `SafeERC20` are not optional. |
| A mistyped Safe address, or one that only exists on another chain, is unrecoverable | **Two-step admin handover is mandatory**, not a nicety. It forces the Safe to prove it can execute. |

For the assessment demo, stay on an EOA — there is no admin in v1, and Safe tooling on Amoy
adds friction for no gain.

---

## 2. Decision: the bank model

> *"No one has control over anyone's money. It is split as at when due, and you can only
> access what is yours — whether you are an owner, a buyer, or a seller."*

This is the correct standard, and it is **stricter than the original design**. Stating the gap
plainly: `resolveDispute` as first designed let the admin decide how to split a disputed
deal. Bounded to that deal's two parties, but still discretion over someone else's funds.

### The invariant

Everything reduces to one testable rule:

> **No function can move value to an address that is not either:**
> **(a) `msg.sender` withdrawing their own credit, or**
> **(b) one of the two parties named in that specific deal at its creation.**

This is a Foundry invariant test, not a promise in a README. It is also the single best line to
say out loud when explaining the design.

### What already satisfies it

```solidity
mapping(address token => mapping(address account => uint256)) private _credits;

function withdraw(address token) external nonReentrant {
    uint256 amount = _credits[token][msg.sender];   // only ever msg.sender
    _credits[token][msg.sender] = 0;                // effects before interactions
    IERC20(token).safeTransfer(msg.sender, amount); // paid to msg.sender, nobody else
}
```

- Once credited, funds are **absolutely** yours. No admin function reads or reduces a credit.
- **The platform's commission obeys the same rule.** The treasury calls the identical
  `withdraw()`. There is no privileged path to funds — that is the "even the owner" part.
- Splitting happens **at settlement**, mechanically, using the `feeBps` frozen into the deal at
  creation. Not at withdrawal, and not at anyone's discretion.

### The remaining question: disputes

| Model | Pros | Cons |
|---|---|---|
| **A. Fully deterministic, no arbiter ever**<br>confirm → seller paid; window expires → seller paid; dispute → automatic full refund | Perfectly satisfies the invariant with zero discretion. Nothing to audit socially. Cheapest. | Hands the buyer a **free cancellation option** after the seller has paid for deeds, legal and survey. Griefable. Needs a forfeitable buyer bond to be fair. |
| **B. Per-deal arbiter, agreed by both parties at creation** ✅ | No global admin exists. Both parties **opted in** to that specific arbiter — consent, not imposition. Matches how escrow works legally. Arbiter still can only split between the two parties. | Someone must choose an arbiter per deal. Slightly more state. A colluding arbiter can still favour one side (bounded to those two). |
| **C. Platform Safe as default arbiter, opt-in** | Practical default for users who don't want to choose. Keeps B's consent property. | Concentrates arbitration on the platform in practice, even if not in code. |

**Recommendation: B, with C as the suggested default.** Real estate has genuine disputes —
undisclosed liens, title defects, a seller withholding keys. With pure determinism (A) someone
always loses unfairly. But the arbiter should be something both parties **agreed to**, not a
power the platform simply holds.

Either way, the arbiter can never name a recipient: `resolveDispute(dealId, buyerRefundBps)`
takes a percentage, and both payees are read from the deal's own storage.

---

## 3. Decision: where payment fits into the lifecycle

Money touches exactly **two** of the eight transitions. Everything else is pure state.

```
STATE                    TRANSITION              WHO         MONEY?
─────────────────────────────────────────────────────────────────────
(off chain)          ──► registerProperty    ──► Seller      no
Registered           ──► initiateTransfer    ──► Seller      no
                     ──► createDeal          ──► Seller      no    ← escrow takes custody
                                                                      of the PROPERTY only
AwaitingDeposit      ──► deposit             ──► Buyer       ★ IN   ← funds enter
Funded               ──► confirmCompletion   ──► Buyer       no
                     ──► claimAfterInspect.  ──► Seller      no
                     ──► dispute             ──► Buyer       no
Settled                  (credits assigned mechanically)     ─── split happens here
                     ──► withdraw            ──► Anyone      ★ OUT  ← funds leave
```

Two observations worth carrying into the video:

**Only two transitions move tokens** — `deposit` and `withdraw`. Settlement itself moves
nothing; it just updates a ledger. That is what makes the blacklist and reentrancy surface so
small, and it is why a seller with five sales pays for one transfer, not five.

**The split is computed at `Settled`, not at `withdraw`.** By the time anyone withdraws, the
arithmetic is long settled and immutable. Withdrawal is a dumb function that pays out a number
someone else already earned.

### Pros and cons of coupling payment to the lifecycle at all

| | |
|---|---|
| **Pros** | The state machine becomes *enforceable* rather than advisory. Buyer cannot claim completion without having paid. Seller cannot be paid without releasing the property. Neither party needs to trust the other or the platform. Settlement is atomic with the ownership transfer. |
| **Cons** | The contract now custodies real money — audit cost, regulatory weight, and reentrancy surface all appear. v1's "nothing to loot" property is gone. Buyers need POL for gas as well as USDC. Mistakes become expensive rather than embarrassing. |

That cost is exactly why the payment layer is being **specified now and built later**.

---

## 4. Decision: abstract the payment layer for now

| | |
|---|---|
| **Pros** | Ships the listing lifecycle immediately, fully tested, with zero financial risk. Keeps `PropertyRegistry` genuinely admin-free and fund-free — a claim that is *true*, not aspirational. Lets the escrow take the audit time it actually needs. The interface can be fixed now so nothing is redesigned later. |
| **Cons** | The platform cannot transact end to end yet. Two deployments and a migration later instead of one. Risk of the interface drifting from what implementation reveals. |

**Recommendation: abstract.** Concretely that means *fix the interface, skip the
implementation*:

- `IPropertyEscrow.sol` — documented, compiling, with the §2 invariant in NatSpec
- **No** payment coupling in `PropertyRegistry` — no imports, no hooks, no `onlyEscrow`
- The escrow attaches via the existing two-step transfer, which needs no registry changes

That last point is the payoff of the §0 framing: because the registry manages *state* and not
*money*, the payment layer bolts on without touching it.

---

## 5. Cost of the decisions

Measured on the deployed contract (Polygon at 30 gwei, POL at $0.20):

| Action | Gas | Cost | Decision it reflects |
|---|---|---|---|
| Deploy `PropertyRegistry` | 1,022,087 | $0.0061 | one-off |
| `registerProperty` (45-char address) | 165,528 | $0.0010 | string length dominates — hence the 256-byte cap |
| `transferOwnership` (direct) | 32,182 | $0.0002 | fast path |
| `initiateTransfer` + `acceptTransfer` | 78,531 | $0.0005 | **2.4× the direct cost** for recipient-proves-key safety |
| Full sale, all 7 transactions (est. with escrow) | ~704,000 | ~$0.0042 | — |

The two-step transfer costing 2.4× more is the clearest example of a deliberate
security-over-gas trade in the codebase. At $0.0005 it is not a real trade at all.

**The whole on-chain cost of a property sale is under half a cent**, against 1–2% for
traditional escrow — $2,500 on a $250,000 property. The cost argument is not close.

Which reframes the "who pays gas" question: it was never about the $0.004. The friction is
that **a buyer paying in USDC must also hold POL** — a second token to acquire, for a fee
smaller than a rounding error. That is the real argument for an ERC-4337 paymaster at v3: not
to save money, but to delete the "go get some POL first" step.

---

## 6. Summary

| # | Decision | Choice | Status |
|---|---|---|---|
| 1 | Contract's purpose | Lifecycle referee; custody is what makes it binding | settled |
| 2 | v1 admin | **None at all** | shipped |
| 3 | v2 admin | Gnosis Safe 3-of-5 + 48h timelock on parameters only | agreed |
| 4 | Admin handover | Two-step, mandatory | in v1 pattern |
| 5 | Fund model | Credits ledger; `withdraw()` pays `msg.sender` only | designed |
| 6 | Commission | Treasury uses the identical `withdraw()`, no privileged path | designed |
| 7 | Disputes | Per-deal arbiter agreed by both parties (was: platform admin) | **revised** |
| 8 | Fee mutability | Frozen into the deal at creation, capped in bytecode | designed |
| 9 | Payment layer | Interface now, implementation after audit | agreed |
| 10 | Registry coupling | None — escrow attaches via existing two-step transfer | settled |

### Open, needs a human answer

1. **Who bears gas** — buyer pays for v2a; paymaster at v3. The issue is POL acquisition, not cost.
2. **Named buyer or open listing** — recommend named buyer; open listings need front-running protection.
3. **KYC/compliance boundary** — a legal answer, not an engineering one. Raise early.

### What this means for the current submission

`PropertyRegistry` is complete, tested (43 tests) and integrated. Nothing in this document
changes it — the revisions above all land in a contract that does not exist yet. The payment
layer is specified rather than half-built, which is the correct state for code that will one
day hold other people's money.
