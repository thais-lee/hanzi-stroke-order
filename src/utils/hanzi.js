// Tải nhanh dữ liệu nét
const charCache = new Map();

export async function loadCharData(char) {
  if (charCache.has(char)) return charCache.get(char);
  try {
    const mod = await import(
      /* @vite-ignore */ `hanzi-writer-data/${char}.json`
    ).catch(() => null);
    if (mod && (mod.default || mod)) {
      const data = mod.default || mod;
      charCache.set(char, data);
      return data;
    }
  } catch {
    // bỏ qua lỗi
  }
  const url = `https://cdn.jsdelivr.net/npm/hanzi-writer-data@latest/${encodeURIComponent(
    char,
  )}.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('CHAR_DATA_404');
  const data = await res.json();
  charCache.set(char, data);
  return data;
}
