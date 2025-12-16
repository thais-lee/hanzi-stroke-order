/* eslint-disable no-useless-escape */
// src/utils/charLists.js

/**
 * Tách 1 mục (token) theo format:
 *  - Mới: "1. 萬-vạn-tượng hình con bọ cạp"
 *  - Cũ:  "1. 萬vạn"
 *
 * Trả về:
 * {
 *   label: chuỗi hiển thị đầy đủ,
 *   value: ký tự Hán,
 *   reading: phiên âm Hán Việt (nếu có),
 *   meaning: ý nghĩa ban đầu (nếu có)
 * }
 */
function parseItem(token) {
  const label = token.trim();
  if (!label) return null;

  // Bỏ số thứ tự phía trước: "1. ", "2 .", ...
  const clean = label.replace(/^\d+\s*[\.\)]\s*/, '');

  // Ưu tiên format mới: Hán - âm - nghĩa
  const parts = clean.split('-').map(s => s.trim());

  let han = null;
  let reading = null;
  let meaning = null;

  if (parts.length >= 2) {
    // phần 1: Hán tự (lấy ký tự Han đầu tiên)
    const m = parts[0].match(/\p{Script=Han}/u);
    if (m) han = m[0];

    reading = parts[1] || null;
    meaning = parts.slice(2).join(' - ') || null;
  } else {
    // fallback dữ liệu cũ
    const m = clean.match(/\p{Script=Han}/u);
    if (m) han = m[0];
  }

  if (!han) return null;

  return {
    label, // hiển thị đầy đủ
    value: han, // dùng cho HanziWriter
    reading, // phiên âm Hán Việt
    meaning, // ý nghĩa ban đầu
  };
}

/**
 * Parse nội dung 1 file .txt
 */
export function parseCategoryText(text, fileId = 'unknown') {
  const lines = (text || '')
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(Boolean);

  if (!lines.length) return null;

  const label = lines[0]; // dòng đầu: tên nhóm

  const rest = lines.slice(1).join(' ');
  const rawTokens = rest
    .split(/;+/)
    .map(s => s.trim())
    .filter(Boolean);

  const items = [];
  for (const tk of rawTokens) {
    const it = parseItem(tk);
    if (it) items.push(it);
  }

  // Danh sách chữ Hán không trùng
  const seen = new Set();
  const chars = [];
  for (const it of items) {
    if (!seen.has(it.value)) {
      seen.add(it.value);
      chars.push(it.value);
    }
  }

  return { id: fileId, label, items, chars };
}

/**
 * Load tất cả file .txt trong src/data (Vite)
 */
export function loadCharCategories() {
  const files = import.meta.glob('/src/data/*.txt', {
    as: 'raw',
    eager: true,
  });

  const out = [];

  for (const fullPath in files) {
    const text = files[fullPath];
    const id = fullPath
      .split('/')
      .pop()
      .replace(/\.txt$/i, '');

    const cat = parseCategoryText(text, id);
    if (cat && cat.items.length) out.push(cat);
  }

  return out;
}
