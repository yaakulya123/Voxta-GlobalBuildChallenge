#!/bin/bash
# =============================================================
# Voxta Deploy Script — Cloudflare Quick Tunnels (zero friction)
# =============================================================
# Uses cloudflared quick tunnels: free, no signup, no anti-phishing pages.
# Auto-updates .env so frontend knows the backend URL.
# =============================================================

set -e

echo "Cleaning up old processes..."
lsof -i :8000 -t 2>/dev/null | xargs kill -9 2>/dev/null || true
lsof -i :5174 -t 2>/dev/null | xargs kill -9 2>/dev/null || true
pkill -f "cloudflared tunnel" 2>/dev/null || true

# Check cloudflared is installed
if ! command -v cloudflared &> /dev/null; then
  echo "Installing cloudflared via Homebrew..."
  brew install cloudflared
fi

# ── 1. Start Backend ──────────────────────────────────────────
echo "Starting Backend (FastAPI on :8000)..."
cd backend
source venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000 > /tmp/voxta_api.log 2>&1 &
BACKEND_PID=$!
cd ..

sleep 3

# ── 2. Create Backend Tunnel ─────────────────────────────────
echo "Creating Cloudflare tunnel for backend..."
rm -f /tmp/voxta_cf_backend.log
cloudflared tunnel --url http://localhost:8000 --no-tls-verify > /tmp/voxta_cf_backend.log 2>&1 &
CF_BACKEND_PID=$!

# Wait for the tunnel URL to appear in logs
echo "Waiting for backend tunnel URL..."
BACKEND_URL=""
for i in $(seq 1 30); do
  BACKEND_URL=$(grep -oE "[a-zA-Z0-9-]+\.trycloudflare\.com" /tmp/voxta_cf_backend.log 2>/dev/null | head -n 1)
  if [ -n "$BACKEND_URL" ]; then
    break
  fi
  sleep 1
done

if [ -z "$BACKEND_URL" ]; then
  echo "ERROR: Could not get backend tunnel URL. Check /tmp/voxta_cf_backend.log"
  exit 1
fi

echo "Backend tunnel: https://$BACKEND_URL"

# ── 3. Update .env so Vite picks up the backend URL ──────────
echo "VITE_BACKEND_URL=$BACKEND_URL" > .env
echo "Updated .env with VITE_BACKEND_URL=$BACKEND_URL"

# ── 4. Start Frontend (AFTER .env is updated) ────────────────
echo "Starting Frontend (Vite on :5174)..."
npm run dev > /tmp/voxta_vite.log 2>&1 &
FRONTEND_PID=$!

sleep 3

# ── 5. Create Frontend Tunnel ────────────────────────────────
echo "Creating Cloudflare tunnel for frontend..."
rm -f /tmp/voxta_cf_frontend.log
cloudflared tunnel --url http://localhost:5174 --no-tls-verify > /tmp/voxta_cf_frontend.log 2>&1 &
CF_FRONTEND_PID=$!

echo "Waiting for frontend tunnel URL..."
FRONTEND_URL=""
for i in $(seq 1 30); do
  FRONTEND_URL=$(grep -oE "[a-zA-Z0-9-]+\.trycloudflare\.com" /tmp/voxta_cf_frontend.log 2>/dev/null | head -n 1)
  if [ -n "$FRONTEND_URL" ]; then
    break
  fi
  sleep 1
done

if [ -z "$FRONTEND_URL" ]; then
  echo "ERROR: Could not get frontend tunnel URL. Check /tmp/voxta_cf_frontend.log"
  exit 1
fi

echo ""
echo "====================================================="
echo "  VOXTA DEPLOYED SUCCESSFULLY!"
echo ""
echo "  SHARE THIS LINK WITH YOUR FRIEND:"
echo "  https://$FRONTEND_URL"
echo ""
echo "  Backend WebSocket:"
echo "  wss://$BACKEND_URL"
echo ""
echo "  Both of you enter the SAME room code to join!"
echo "====================================================="
echo ""
echo "Press Ctrl+C to stop everything."

# Trap Ctrl+C to clean up all processes
cleanup() {
  echo ""
  echo "Shutting down..."
  kill $BACKEND_PID $FRONTEND_PID $CF_BACKEND_PID $CF_FRONTEND_PID 2>/dev/null
  exit 0
}
trap cleanup INT TERM

# Keep script running
wait
