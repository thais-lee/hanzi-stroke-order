// src/utils/hanzi.js

// Tạo loader cho tất cả *.json trong package (lazy, không eager)
// LƯU Ý: Vite cho phép glob vào node_modules.
const pkgModules = import.meta.glob(
  [
    '/hanzi-writer-data/*.json',
    '/hanzi-writer-data/*/*.json',
    '/hanzi-writer-data/*/*/*.json', // dư địa cho vài package build khác nhau
  ],
  { eager: false }, // để Vite chia nhỏ chunk và chỉ tải khi cần
);

// Dựng index: { '月': () => import('hanzi-writer-data/月.json'), ... }
const pkgIndex = {};
for (const path in pkgModules) {
  // path ví dụ: "hanzi-writer-data/%E6%9C%88.json" hoặc "hanzi-writer-data/月.json"
  const base = path.split('/').pop(); // "%E6%9C%88.json" | "月.json"
  const name = base.replace(/\.json$/i, ''); // "%E6%9C%88" | "月"
  let charName = name;
  try {
    charName = decodeURIComponent(name);
  } catch {
    // bỏ qua lỗi
  }
  // chuẩn hoá NFC để tránh sai khác hệ thống tệp
  pkgIndex[charName.normalize('NFC')] = pkgModules[path];
}

const charCache = new Map();

/**
 * Tải dữ liệu ký tự:
 * 1) tìm trong package (node_modules/hanzi-writer-data)
 * 2) (tuỳ chọn) tìm trong /hanzi-local (nếu bạn vẫn muốn hỗ trợ folder local)
 * 3) (tuỳ chọn) fallback CDN — có thể bỏ nếu muốn 100% offline
 */
export async function loadCharData(char) {
  const key = char.normalize('NFC');
  if (charCache.has(key)) return charCache.get(key);

  // 1) thử trong package
  const loader = pkgIndex[key];
  if (loader) {
    const mod = await loader();
    const data = mod.default || mod;
    charCache.set(key, data);
    return data;
  }

  // 2) (tuỳ chọn) thử thư mục local của bạn
  try {
    const resLocal = await fetch(
      `/hanzi-local/${encodeURIComponent(key)}.json`,
      { cache: 'no-store' },
    );
    if (resLocal.ok) {
      const data = await resLocal.json();
      charCache.set(key, data);
      return data;
    }
  } catch {
    // bỏ qua lỗi
  }

  // 3) (tuỳ chọn) CDN fallback — xoá block này nếu muốn tuyệt đối không gọi mạng
  const url = `https://cdn.jsdelivr.net/npm/hanzi-writer-data@latest/${encodeURIComponent(
    key,
  )}.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('CHAR_DATA_404');
  const data = await res.json();
  charCache.set(key, data);
  return data;
}
