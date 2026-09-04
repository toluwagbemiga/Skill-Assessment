#!/usr/bin/env bash
#
# Runs once, after the dev container is created.
# Installs dependencies for all three workspaces and writes starter .env files.
set -euo pipefail

echo "==> Installing dependencies"
(cd backend  && npm install --no-audit --no-fund)
(cd frontend && npm install --no-audit --no-fund)
(cd contracts && npm install --no-audit --no-fund)

# ── backend/.env ───────────────────────────────────────────────────────────
if [ ! -f backend/.env ]; then
  echo "==> Creating backend/.env"
  JWT=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  cat > backend/.env <<EOF
PORT=4000
NODE_ENV=development

# MongoDB runs as a Compose service; "mongo" is its hostname on the container network.
MONGO_URI=mongodb://mongo:27017/rechain

JWT_SECRET=${JWT}

# Filled in by you once the ports are forwarded — see docs/CLOUD_SANDBOX.md
FRONTEND_URL=
WEBSITE_URL=
EXTRA_ALLOWED_ORIGINS=

# Optional third-party services. Leaving these empty disables email, image
# upload and AI search; nothing else is affected.
BREVO_API_KEY=
EMAIL_USER=noreply@rechain.local
IMAGEKIT_PUBLIC_KEY=
IMAGEKIT_PRIVATE_KEY=
IMAGEKIT_URL_ENDPOINT=
FIRECRAWL_API_KEY=
GITHUB_MODELS_API_KEY=
EOF
fi

# ── frontend/.env ──────────────────────────────────────────────────────────
if [ ! -f frontend/.env ]; then
  echo "==> Creating frontend/.env"
  cp frontend/.env.example frontend/.env
fi

# ── contracts/.env ─────────────────────────────────────────────────────────
if [ ! -f contracts/.env ]; then
  echo "==> Creating contracts/.env"
  cp contracts/.env.example contracts/.env
fi

# ── Wait for Mongo, then seed demo listings ────────────────────────────────
echo "==> Waiting for MongoDB"
for i in $(seq 1 30); do
  if node -e "
    const net=require('net');
    const s=net.connect(27017,'mongo');
    s.on('connect',()=>{s.destroy();process.exit(0)});
    s.on('error',()=>process.exit(1));
  " 2>/dev/null; then
    echo "    MongoDB is up"
    break
  fi
  sleep 2
done

echo "==> Seeding demo properties"
(cd backend && node scripts/seedProperties.js) || echo "    (seed skipped — run it manually later)"

cat <<'EOF'

────────────────────────────────────────────────────────────
Setup complete. To start everything:

  Terminal 1:  cd backend  && npm start
  Terminal 2:  cd frontend && npm run dev -- --host 0.0.0.0

Then read docs/CLOUD_SANDBOX.md § "Wiring the forwarded URLs"
before the frontend will be able to reach the API.
────────────────────────────────────────────────────────────
EOF
