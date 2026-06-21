#!/bin/bash
APP_DIR="/Users/macbookm1/Library/Application Support/Claude/local-agent-mode-sessions/a7059031-8b15-4a18-8c21-a266a1e24748/dd775ff5-27ff-41f2-924c-ee37b73aad4f/local_79ba5d3d-a1ac-4016-8f54-9ae513cdd5f1/outputs/real-estate-app"

cd "$APP_DIR" || { echo "❌ ไม่พบโฟลเดอร์"; exit 1; }

echo "================================================"
echo "  REBOMS - ระบบนายหน้าอสังหาริมทรัพย์"
echo "  Dir: $APP_DIR"  
echo "================================================"

if [ ! -d "node_modules/express" ]; then
  echo "📦 ติดตั้ง dependencies..."
  npm install
fi

echo ""
echo "🚀 Server: http://localhost:3000"
echo "[ Ctrl+C เพื่อหยุด ]"
echo "================================================"

(sleep 3 && open http://localhost:3000) &
node --experimental-sqlite server.js
