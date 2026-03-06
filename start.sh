#!/usr/bin/env bash
set -euo pipefail

cleanup() {
  echo ""
  echo "==> Shutting down..."
  kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
  wait $BACKEND_PID $FRONTEND_PID 2>/dev/null
  echo "==> Stopped."
}
trap cleanup EXIT INT TERM

echo "==> Installing backend dependencies..."
cd backend && npm install
echo "==> Building backend..."
npm run build
cd ..

echo "==> Installing frontend dependencies..."
cd frontend && npm install
echo "==> Building frontend..."
npm run build
cd ..

echo ""
echo "==> Starting backend on http://localhost:4000"
cd backend && npm run dev &
BACKEND_PID=$!
cd ..

echo "==> Starting frontend on http://localhost:5173"
cd frontend && npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "==> Both services running. Press Ctrl+C to stop."
wait
