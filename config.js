/* ============================================================
 * BCF ระบบแจ้งลา — config.js — v1.0 — 2026-06-29
 * ⚙️ ไฟล์ที่แก้บ่อยสุด: ถ้า deploy Web app ใหม่ ให้แก้ API_URL
 * ============================================================ */
window.BCF_VER = window.BCF_VER || {};
window.BCF_VER.config = '1.0';

/* 🔗 Web app URL (ลงท้ายด้วย /exec) — แก้ตรงนี้ถ้า URL เปลี่ยน */
const API_URL = "https://script.google.com/macros/s/AKfycby_VgmDX7CqKEJDNEafTc6Pl7CzPgv8Z6Lj42cQJ7yxEXPHk_3qVKZouN4VFcmOxzhs/exec";

/* ช่วงเวลาทำงาน (ต้องตรงกับ Code.gs) — 12:00-13:00 พักเที่ยง ไม่นับ */
const TIME_SLOTS = ['08:00-09:00','09:00-10:00','10:00-11:00','11:00-12:00','13:00-14:00','14:00-15:00','15:00-16:00','16:00-17:00'];

/* ลำดับบล็อกในไทม์ไลน์ (รวมพักเที่ยงไว้โชว์) */
const DAY_BLOCKS = [
  {v:'08:00-09:00'},{v:'09:00-10:00'},{v:'10:00-11:00'},{v:'11:00-12:00'},
  {lunch:true,label:'12:00-13:00'},
  {v:'13:00-14:00'},{v:'14:00-15:00'},{v:'15:00-16:00'},{v:'16:00-17:00'}
];

console.log('[BCF] config.js v' + window.BCF_VER.config);
