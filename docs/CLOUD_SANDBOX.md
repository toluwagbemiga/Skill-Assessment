# Running REChain in a free cloud sandbox

> **Why this exists.** The local machine is on a restricted corporate network. Three separate
> things break there:
>
> | Symptom | Cause |
> |---|---|
> | `rpc-amoy.polygon.technology` → `ENOTFOUND` | DNS filtered |
> | MongoDB Atlas `mongodb+srv://` → `ENOTFOUND` | SRV record lookups blocked entirely |
> | API accepts TCP then never responds | Endpoint security interfering with `node.exe` sockets |
>
> A cloud sandbox sidesteps all three: it runs on someone else's network, with normal DNS and
> no endpoint agent. Everything in this repo — backend, frontend, MongoDB, Hardhat, and the
> Polygon Amoy deployment — runs there without workarounds.

---

## 1. Which sandbox

| Option | Free tier | MongoDB | Verdict |
|---|---|---|---|
| **GitHub Codespaces** ✅ | 60 core-hours/month, 15 GB storage (personal accounts) | Yes — real Mongo container | **Recommended.** Full Linux VM, Docker, VS Code in browser, port forwarding |
| Gitpod | ~10 hours/month | Yes, via Docker | Good fallback, smaller allowance |
| CodeSandbox Devboxes | Limited free credits | Yes, Docker-based | Workable; free tier is tight |
| Replit | Limited free compute | ✗ no local Mongo — needs Atlas | Awkward for this stack |
| StackBlitz | Unlimited (browser-only) | ✗ **no native binaries** | **Won't work** — cannot run MongoDB |
| Render / Railway | Deploy targets, not sandboxes | via add-on | Wrong tool for interactive testing |

Free-tier limits change; check current allowances before relying on them.

**Use GitHub Codespaces.** You are already pushing this repo to GitHub, it gives you a real
container with Docker, and 60 core-hours on the 2-core default is ~30 hours of wall clock —
far more than you need.

Everything below assumes Codespaces. §7 covers Gitpod.

---

## 2. What is already committed for you

I added a dev container definition, so the sandbox builds itself:

```
.devcontainer/
├── devcontainer.json     # Node 20 image, forwards ports 5173 + 4000
├── docker-compose.yml    # app container + mongo:7 container with a named volume
└── setup.sh              # installs all deps, writes .env files, seeds demo data
```

`setup.sh` runs automatically on first create and will:

1. `npm install` in `backend/`, `frontend/` and `contracts/`
2. Write `backend/.env` with a random `JWT_SECRET` and `MONGO_URI=mongodb://mongo:27017/rechain`
3. Copy `.env.example` → `.env` for `frontend/` and `contracts/`
4. Wait for MongoDB, then seed four demo properties

MongoDB runs as its own container. Data persists in a named Docker volume across restarts,
and the port is deliberately **not** published to the host — only the app container reaches it.

---

## 3. Starting the Codespace

1. Push this repo to your GitHub fork (`.devcontainer/` must be committed).
2. On the repo page: **Code ▾ → Codespaces → Create codespace on main**.
3. Wait 2–4 minutes for the first build. Watch the terminal for `Setup complete`.

If it finishes before `setup.sh` does, run it by hand:

```bash
bash .devcontainer/setup.sh
```

---

## 4. Wiring the forwarded URLs

**This is the step people get wrong, so read it carefully.**

Your browser runs on your laptop; the servers run in the container. Codespaces bridges them by
giving each port a public HTTPS URL like:

```
https://<codespace-name>-5173.app.github.dev     ← frontend
https://<codespace-name>-4000.app.github.dev     ← backend API
```

`http://localhost:4000` means nothing to your browser in this setup, so the frontend has to be
told the real API URL, and the API has to allow the frontend's origin.

### 4.1 Make port 4000 public

In the **Ports** panel (bottom of VS Code), right-click port **4000** → **Port Visibility** →
**Public**.

Leave it private and the browser gets a GitHub login page instead of JSON, which surfaces as a
CORS error that looks nothing like the real problem.

### 4.2 Point the frontend at the API

Edit `frontend/.env`:

```env
VITE_API_BASE_URL=https://<codespace-name>-4000.app.github.dev
VITE_PROPERTY_REGISTRY_ADDRESS=0x83d8180680593a7770557C1fa5BBea95A3D6a353
VITE_AMOY_RPC_URL=https://polygon-amoy-bor-rpc.publicnode.com
```

No trailing slash — `api.ts` appends `/api` itself.

### 4.3 Let the API accept that origin

Edit `backend/.env`:

```env
FRONTEND_URL=https://<codespace-name>-5173.app.github.dev
WEBSITE_URL=https://<codespace-name>-5173.app.github.dev
EXTRA_ALLOWED_ORIGINS=https://<codespace-name>-5173.app.github.dev
```

`server.js` builds its CORS allowlist from these. Restart the backend after changing them —
they are read at startup.

---

## 5. Running it

Two terminals in the Codespace:

```bash
# Terminal 1 — API
cd backend && npm start

# Terminal 2 — frontend  (--host is required, Vite binds loopback by default
#                          and the forwarder cannot see it)
cd frontend && npm run dev -- --host 0.0.0.0
```

Open the forwarded **5173** URL. You should see the homepage, `/properties` listing four
seeded Lagos properties, and a working property detail page.

### Useful commands

```bash
# Contracts
cd contracts
npm test                      # 45 tests
npx hardhat coverage          # 100% statements / branches / functions / lines
REPORT_GAS=true npm test      # gas table
npm run deploy:amoy           # only if you want a fresh deployment

# Backend helpers
cd backend
node scripts/seedProperties.js --force   # reset demo listings
node scripts/verifyUser.js --list        # list registered users
node scripts/verifyUser.js --all         # mark all users email-verified
```

`verifyUser.js` matters because registration sends a verification email through Brevo, and
without a `BREVO_API_KEY` no email goes out — so new accounts cannot log in until you flip
the flag manually.

---

## 6. MetaMask and the blockchain demo

This works normally, and is the main reason Codespaces beats a local VM.

- The page is served over **HTTPS** from `app.github.dev`, so MetaMask injects as usual.
- The MetaMask extension runs in **your** browser, not the container — your keys never go near
  the sandbox.
- Contract **reads** go straight from your browser to the Amoy RPC. **Writes** are signed by
  your local MetaMask. The container is not in the path for either.
- The `PropertyRegistry` at `0x83d8180680593a7770557C1fa5BBea95A3D6a353` is already live on
  Amoy — no redeployment needed.

Open any property page, scroll to **Blockchain Record** in the right column, and click
**Register on Blockchain**.

> **Never put your deployer private key in `contracts/.env` inside a Codespace** unless it is a
> throwaway testnet key. Codespaces are convenient, not a secrets vault. You only need that key
> to deploy, and the contract is already deployed.

---

## 7. Gitpod fallback

Gitpod reads `.gitpod.yml`, not `.devcontainer/`. If you go this route, add:

```yaml
image: gitpod/workspace-mongodb

tasks:
  - name: Setup
    init: |
      cd backend && npm install
      cd ../frontend && npm install
      cd ../contracts && npm install
    command: |
      mongod --dbpath /workspace/.mongo-data --fork --logpath /workspace/mongo.log
      cd backend && npm start

  - name: Frontend
    command: cd frontend && npm run dev -- --host 0.0.0.0

ports:
  - port: 5173
    onOpen: open-preview
  - port: 4000
    visibility: public
```

Create `/workspace/.mongo-data` first, and set `MONGO_URI=mongodb://127.0.0.1:27017/rechain`
(Gitpod runs Mongo in the same container, so `localhost` is correct there — unlike the
Codespaces setup, where the hostname is `mongo`).

---

## 8. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Frontend loads, properties don't | Port 4000 still private | Ports panel → 4000 → Visibility → Public |
| CORS error in console | `EXTRA_ALLOWED_ORIGINS` unset or backend not restarted | §4.3, then restart the backend |
| GitHub login page instead of JSON | Same — port 4000 is private | As above |
| `ECONNREFUSED mongo:27017` | Mongo container not up yet | `docker compose ps`; wait, or rebuild the container |
| Forwarded 5173 URL 404s | Vite bound to loopback | Restart with `-- --host 0.0.0.0` |
| "Contract address is not configured" | `VITE_PROPERTY_REGISTRY_ADDRESS` missing | §4.2, then restart Vite (env is read at build) |
| MetaMask shows the wrong network | Not on Amoy | The card offers a switch button; it adds the chain if needed |
| Codespace hours running low | 60 core-hours/month | Stop it when idle — Codespaces bills wall-clock while running |

**Always restart Vite after editing `frontend/.env`.** Vite inlines env vars at build time; a
hot reload will not pick up changes.

---

## 9. Cost control

Codespaces bills wall-clock time while the container runs, not CPU used.

- Default idle timeout is 30 minutes — set it lower in Settings → Codespaces.
- **Stop** the codespace when you finish (Command Palette → *Codespaces: Stop Current
  Codespace*). Stopped costs nothing; storage counts against the 15 GB allowance.
- Delete it once the video is recorded.
- Check usage at Settings → Billing → Plans and usage.

A 2-core codespace burns 2 core-hours per wall-clock hour, so the free 60 gives you roughly
30 hours. Recording a 15-minute video with rehearsals will not come close.
