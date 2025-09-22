// src/utils/charLists.js
// Đọc tất cả .txt trong src/data theo format:
// Dòng 1: tên nhóm
// Các dòng sau: "1. 萬vạn; 2. 龜quy; ..." (ngăn cách bằng dấu ';')

/**
 * Tách 1 mục (token) -> { label: hiển thị đầy đủ, value: ký tự Hán đầu tiên }
 * - Giữ nguyên label (không bỏ số thứ tự, khoảng trắng, phiên âm)
 * - Lấy value là ký tự Hán đầu tiên trong chuỗi
 */
function parseItem(token) {
  const label = token.trim();
  if (!label) return null;

  // Lấy ký tự Hán đầu tiên (Unicode Script=Han)
  const m = label.match(/\p{Script=Han}/u);
  const value = m ? m[0] : null;
  if (!value) return null;

  return { label, value };
}

/**
 * Parse nội dung 1 file .txt -> { id, label, items, chars }
 * - id lấy từ tên file (không đuôi)
 * - label = dòng đầu tiên
 * - items = mảng {label, value}
 * - chars = mảng ký tự Hán (value) đã khử trùng lặp
 */
export function parseCategoryText(text, fileId = 'unknown') {
  const lines = (text || '')
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(Boolean);

  if (!lines.length) return null;

  const label = lines[0]; // dòng 1 là tên nhóm

  // nối các dòng còn lại -> tách theo dấu ;  (cho phép ; dính hoặc có khoảng trắng)
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
 * Load tất cả file .txt trong src/data (Vite bundler)
 * Trả về: [{ id, label, items, chars }, ...]
 */
export function loadCharCategories() {
  // đọc raw text các file trong /src/data
  const files = import.meta.glob('/src/data/*.txt', { as: 'raw', eager: true });
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

  // Sắp xếp theo tên nhóm (tùy thích)
  // out.sort((a, b) => a.label.localeCompare(b.label, 'vi'));
  return out;
}
