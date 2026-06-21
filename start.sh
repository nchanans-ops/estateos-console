#!/bin/bash
# REBOMS - Real Estate Back Office Management System
# สคริปต์เริ่มต้นระบบ

cd "$(dirname "$0")"

# Check Node.js version (requires v22+)
NODE_VER=$(node --version 2>/dev/null | sed 's/v//')
NODE_MAJOR=$(echo "$NODE_VER" | cut -d. -f1)
if [ -z "$NODE_MAJOR" ] || [ "$NODE_MAJOR" -lt 22 ]; then
  echo "❌ ต้องการ Node.js เวอร์ชัน 22 ขึ้นไป (ปัจจุบัน: $NODE_VER)"
  echo "   ดาวน์โหลดได้ที่ https://nodejs.org"
  exit 1
fi

# Install dependencies if needed
if [ ! -d "node_modules/express" ]; then
  echo "📦 ติดตั้ง dependencies..."
  npm install
fi

echo "🏠 กำลังเริ่มต้น REBOMS..."
echo "   URL: http://localhost:3000"
echo "   กด Ctrl+C เพื่อหยุด"
echo ""

node --experimental-sqlite server.js
