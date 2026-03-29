#!/bin/bash
# =============================================================
# Voxta Start Script — LocalTunnel
# =============================================================
# NOTE: LocalTunnel shows an anti-phishing page that requires
# typing an IP. For zero-friction tunnels, use deploy.sh instead
# (Cloudflare tunnels — no warning pages).
# =============================================================

echo "Cleaning up old processes..."
lsof -i :8000 -t 2>/dev/null | xargs kill -9 2>/dev/null || true
lsof -i :5174 -t 2>/dev/null | xargs kill -9 2>/dev/null || true

echo "Starting Backend (FastAPI on :8000)..."
cd backend
source venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000 > /tmp/api.log 2>&1 &
cd ..

sleep 3

echo "Creating LocalTunnel for backend..."
npx -y localtunnel --port 8000 --subdomain voxta-backend-ws > /tmp/lt_api.log 2>&1 &

sleep 5
BACKEND_URL="voxta-backend-ws.loca.lt"

# Update .env BEFORE starting Vite so it picks up the correct URL
echo "VITE_BACKEND_URL=$BACKEND_URL" > .env
echo "Updated .env with VITE_BACKEND_URL=$BACKEND_URL"

echo "Starting Frontend (Vite on :5174)..."
npm run dev > /tmp/vite.log 2>&1 &

sleep 3

echo "Creating LocalTunnel for frontend..."
npx -y localtunnel --port 5174 --subdomain voxta-frontend-client > /tmp/lt_ui.log 2>&1 &

echo ""
echo "====================================================="
echo "  VOXTA DEPLOYED!"
echo ""
echo "  SHARE THIS LINK:"
echo "  https://voxta-frontend-client.loca.lt"
echo ""
echo "  Backend: wss://voxta-backend-ws.loca.lt"
echo ""
echo "  NOTE: Friends must type the IP shown on the"
echo "  LocalTunnel warning page to get past it."
echo "  For zero-friction deploy, use ./deploy.sh instead."
echo "====================================================="
echo ""
echo "Press Ctrl+C to stop."
wait
