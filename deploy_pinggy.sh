#!/bin/bash
echo "Cleaning up..."
lsof -i :8000 -t | xargs kill -9 2>/dev/null
lsof -i :5174 -t | xargs kill -9 2>/dev/null
pkill -f "a.pinggy.io" 2>/dev/null

echo "Starting Backend..."
cd backend
source venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000 > /tmp/api.log 2>&1 &
cd ..

echo "Starting Backend Tunnel..."
rm -f /tmp/pinggy_api.log
ssh -p 443 -R0:localhost:8000 -o StrictHostKeyChecking=no -o ServerAliveInterval=30 a.pinggy.io > /tmp/pinggy_api.log 2>&1 &

sleep 6
# Extract the pinggy URL
BACKEND_URL=$(grep -oE "[a-zA-Z0-9.-]+\.pinggy\.link" /tmp/pinggy_api.log | head -n 1)
echo "Backend URL: $BACKEND_URL"

echo "Updating .env..."
echo "VITE_BACKEND_URL=$BACKEND_URL" > .env

echo "Starting Frontend..."
npm run dev > /tmp/vite.log 2>&1 &

echo "Starting Frontend Tunnel..."
rm -f /tmp/pinggy_ui.log
ssh -p 443 -R0:localhost:5174 -o StrictHostKeyChecking=no -o ServerAliveInterval=30 a.pinggy.io > /tmp/pinggy_ui.log 2>&1 &

sleep 6
FRONTEND_URL=$(grep -oE "[a-zA-Z0-9.-]+\.pinggy\.link" /tmp/pinggy_ui.log | head -n 1)

echo "====================================="
echo "FRONTEND: https://$FRONTEND_URL"
echo "BACKEND: wss://$BACKEND_URL"
echo "====================================="
echo "$FRONTEND_URL" > /tmp/final_frontend.txt
