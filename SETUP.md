# REBOMS — คู่มือติดตั้ง (Google Sheets + GitHub Pages)

ทั้งระบบฟรี ไม่ต้องมี server

---

## ขั้นตอนที่ 1 — สร้าง Google Spreadsheet

1. ไปที่ [sheets.google.com](https://sheets.google.com) → สร้าง Spreadsheet ใหม่
2. ตั้งชื่อว่า **REBOMS Database**
3. Copy **Spreadsheet ID** จาก URL:
   ```
   https://docs.google.com/spreadsheets/d/[COPY_THIS_PART]/edit
   ```

---

## ขั้นตอนที่ 2 — สร้าง Google Drive Folder

1. ไปที่ [drive.google.com](https://drive.google.com) → สร้าง Folder ใหม่
2. ตั้งชื่อว่า **REBOMS Images**
3. คลิกขวา Folder → **Get link** → Copy ID จาก URL:
   ```
   https://drive.google.com/drive/folders/[COPY_THIS_PART]
   ```

---

## ขั้นตอนที่ 3 — Deploy Google Apps Script

1. ใน Spreadsheet → **Extensions → Apps Script**
2. ลบโค้ดเดิมออกทั้งหมด
3. Copy โค้ดจากไฟล์ **`Code.gs`** วางลงไป
4. แก้ไขบรรทัดที่ 8-9:
   ```javascript
   const SPREADSHEET_ID  = 'วาง_ID_Spreadsheet_ที่นี่';
   const DRIVE_FOLDER_ID = 'วาง_ID_Drive_Folder_ที่นี่';
   ```
5. กด **Save** (Ctrl+S)
6. **รันฟังก์ชัน `initSheets` ครั้งแรก:**
   - เลือก `initSheets` จาก dropdown
   - กด ▶ Run
   - อนุญาต permissions ที่ขอ (Google จะถามครั้งแรก)
   - รอจนเห็น "✅ Sheets initialized" ใน log
7. **Deploy เป็น Web App:**
   - Deploy → **New deployment**
   - Type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - กด **Deploy**
8. **Copy Web App URL** (จะมีหน้าตาแบบนี้):
   ```
   https://script.google.com/macros/s/AKfycb.../exec
   ```

---

## ขั้นตอนที่ 4 — ตั้งค่า Frontend

1. เปิดไฟล์ **`index.html`**
2. แก้บรรทัดที่ 7:
   ```javascript
   window.GAS_URL = 'วาง_Web_App_URL_ที่นี่';
   ```
   เป็น:
   ```javascript
   window.GAS_URL = 'https://script.google.com/macros/s/AKfycb.../exec';
   ```

---

## ขั้นตอนที่ 5 — Deploy ขึ้น GitHub Pages

1. สร้าง GitHub Repository ใหม่ (ตั้งค่าเป็น Public)
2. อัปโหลดไฟล์ทั้งหมด:
   ```
   index.html
   css/style.css
   js/app.js
   ```
3. ไปที่ Settings → **Pages**
4. Source: **Deploy from a branch** → Branch: **main** → Folder: **/ (root)**
5. กด Save → รอ 2-3 นาที
6. เว็บจะพร้อมใช้ที่: `https://username.github.io/repository-name`

---

## โครงสร้างไฟล์

```
reboms-sheets/
├── Code.gs          ← วางใน Apps Script
├── index.html       ← หน้าเว็บหลัก
├── css/
│   └── style.css    ← สไตล์
└── js/
    └── app.js       ← โค้ด frontend
```

---

## เมื่อแก้ไข Code.gs และ Deploy ใหม่

ทุกครั้งที่แก้ Code.gs ต้อง Deploy ใหม่:
- Deploy → **Manage deployments** → **Edit (ดินสอ)** → Version: **New version** → Deploy

---

## หมายเหตุ

- **ความเร็ว**: Apps Script ช้ากว่า server ปกติ ~1-2 วินาที/request เป็นเรื่องปกติ
- **Quota ฟรี**: 6 นาที/ครั้ง, 90 นาที/วัน ใช้งานทีมเล็กได้สบาย
- **รูปภาพ**: เก็บใน Google Drive ฟรี 15GB
- **ข้อมูล**: เปิด Spreadsheet ดูและแก้ไขได้โดยตรง
