// src/utils/hanzi.js

// ─── Cấu hình ────────────────────────────────────────────────────────────────
// Thay YOUR_GITHUB_USERNAME bằng username GitHub của bạn (sau khi fork hanzi-writer-data)
const FORK_CDN = 'https://cdn.jsdelivr.net/gh/thais-lee/hanzi-writer-data@master';

// CDN gốc — fallback cho chữ phổ thông không có trong npm package
const OFFICIAL_CDN = 'https://cdn.jsdelivr.net/npm/hanzi-writer-data@latest';
// ─────────────────────────────────────────────────────────────────────────────

// Tạo loader cho tất cả *.json trong npm package (lazy, không eager)
const pkgModules = import.meta.glob(
  [
    '/hanzi-writer-data/*.json',
    '/hanzi-writer-data/*/*.json',
    '/hanzi-writer-data/*/*/*.json',
  ],
  { eager: false },
);

// Dựng index: { '月': () => import('hanzi-writer-data/月.json'), ... }
const pkgIndex = {};
for (const path in pkgModules) {
  const base = path.split('/').pop();
  const name = base.replace(/\.json$/i, '');
  let charName = name;
  try { charName = decodeURIComponent(name); } catch { /* bỏ qua */ }
  pkgIndex[charName.normalize('NFC')] = pkgModules[path];
}

const charCache = new Map();

/**
 * Tải dữ liệu ký tự theo thứ tự ưu tiên:
 *
 *  1. Cache in-memory (tránh fetch lặp lại)
 *  2. npm package  (hanzi-writer-data đã cài — chữ phổ thông, nhanh nhất)
 *  3. /hanzi-local (public folder — override cục bộ, dev/test)
 *  4. Fork CDN     (github fork của bạn — chữ hiếm/tự vẽ)
 *  5. Official CDN (cdn.jsdelivr.net/npm/hanzi-writer-data — fallback cuối)
 *
 * Để thêm chữ mới: chỉ cần push file .json lên GitHub fork, không cần
 * động vào source code app hay rebuild.
 */
export async function loadCharData(char) {
  const key = char.normalize('NFC');

  // 1) Cache
  if (charCache.has(key)) return charCache.get(key);

  // 2) npm package (bundle sẵn trong node_modules)
  const loader = pkgIndex[key];
  if (loader) {
    const mod = await loader();
    const data = mod.default || mod;
    charCache.set(key, data);
    return data;
  }

  const encoded = encodeURIComponent(key);

  // 3) /hanzi-local — public folder (dùng để override hoặc test nhanh)
  try {
    const res = await fetch(`/hanzi-local/${encoded}.json`, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      charCache.set(key, data);
      return data;
    }
  } catch { /* bỏ qua */ }

  // 4) Fork CDN của bạn (chữ hiếm / chữ tự vẽ)
  try {
    const res = await fetch(`${FORK_CDN}/${encoded}.json`);
    if (res.ok) {
      const data = await res.json();
      charCache.set(key, data);
      return data;
    }
  } catch { /* bỏ qua */ }

  // 5) Official CDN — fallback cuối cùng
  const res = await fetch(`${OFFICIAL_CDN}/${encoded}.json`);
  if (!res.ok) throw new Error(`CHAR_DATA_404: ${key}`);
  const data = await res.json();
  charCache.set(key, data);
  return data;
}