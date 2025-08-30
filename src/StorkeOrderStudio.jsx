import React, { useEffect, useMemo, useRef, useState } from 'react';
import HanziWriter from 'hanzi-writer';
import GIF from 'gif.js.optimized'; // direct GIF export
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'; // PDF sheet export + preview + custom font

/**
 * Hanzi Stroke Order – Vertical Layout (Hi-Res Export + PDF Practice Sheets w/ Preview)
 * Top: Controls; Middle: single-row stage (3x3 grid); Bottom: stroke steps; Last: Practice PDF generator
 * NOTE: To render CJK text (e.g., Chinese/Vietnamese) in PDF footer/title, place a CJK font file
 * like NotoSansSC-Regular.otf into /public/fonts/ and the app will auto-detect & embed it.
 */

// ---------- Minimal CSS (no Tailwind) ----------

// ngay trên đầu file (trước các state PDF)
const GLYPH_SCALE = 0.88; // 88% kích thước ô

const styles = `
:root { --bg:#fafafa; --ink:#111; --muted:#6b7280; --br:#e5e7eb; --accent:#3b82f6; }
*{box-sizing:border-box} body{margin:0}
.app{min-height:100vh;background:var(--bg);color:var(--ink);font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,"Helvetica Neue",Arial,"Noto Sans",sans-serif;}
.wrap{max-width:1100px;margin:0 auto;padding:22px}
.h1{font-size:22px;font-weight:600;margin:0 0 14px}
.section{background:#fff;border:1px solid var(--br);border-radius:14px;box-shadow:0 1px 2px rgba(0,0,0,.04);padding:14px;margin-bottom:14px}
.row{display:flex;align-items:center;gap:10px;margin:10px 0}
.row label{min-width:160px;color:#374151;font-size:13px}
.input, .select, .textarea{border:1px solid var(--br);border-radius:10px;padding:8px 10px;font-size:14px}
.textarea{width:100%;min-height:54px;resize:vertical}
.input[type="range"]{width:100%}
.number{width:100px}
.checkbox{transform:translateY(1px)}
.btn{border:1px solid var(--br);background:#111;color:#fff;border-radius:10px;padding:8px 12px;font-size:13px;cursor:pointer}
.btn.secondary{background:#eee;color:#111}
.btn.ghost{background:#fff;color:#111}
.btn:disabled{opacity:.5;cursor:default}
.muted{font-size:12px;color:var(--muted)}
.warn{font-size:12px;color:#92400e;background:#fef3c7;border:1px solid #fde68a;padding:6px 10px;border-radius:8px}
.chips{display:flex;flex-wrap:wrap;gap:6px}
.chip{border:1px solid var(--br);border-radius:999px;padding:6px 10px;font-size:13px;cursor:pointer;background:#fff}
.chip.active{background:var(--accent);color:#fff;border-color:var(--accent)}
.stage{display:flex;align-items:center;justify-content:center;padding:12px}
.stageInner{display:flex;flex-direction:column;align-items:center;gap:10px}
.mount{display:block;border:2px solid #cfe0ff;border-radius:14px;}
.stepTitle{display:flex;align-items:baseline;justify-content:space-between}
.stepsGrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(84px,1fr));gap:10px;margin-top:10px}
.stepBox{border:1px solid var(--br);border-radius:10px}
.bad{color:#b91c1c}
.pdfPrev{width:100%;height:480px;border:1px solid var(--br);border-radius:10px}
`;

function useStyleTag(cssText) {
  useEffect(() => {
    const el = document.createElement('style');
    el.textContent = cssText;
    document.head.appendChild(el);
    return () => {
      el.remove();
    };
  }, [cssText]);
}

// ---------- Fast char data loader (bundle first, CDN fallback) ----------
const charCache = new Map();
async function loadCharData(char) {
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
    /* ignore */
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

// ---------- Canvas helpers for export ----------
function drawGridOnCtx(ctx, size, bg = '#fff', line = '#E5E7EB') {
  ctx.save();
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = line;
  const lw = Math.max(1, Math.round(size / 360));
  ctx.lineWidth = lw;
  const t1 = size / 3,
    t2 = (2 * size) / 3;
  ctx.beginPath();
  ctx.moveTo(t1, 0);
  ctx.lineTo(t1, size);
  ctx.moveTo(t2, 0);
  ctx.lineTo(t2, size);
  ctx.moveTo(0, t1);
  ctx.lineTo(size, t1);
  ctx.moveTo(0, t2);
  ctx.lineTo(size, t2);
  ctx.stroke();
  ctx.restore();
}

// Helpers
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const mmToPt = mm => (mm * 72) / 25.4; // PDF points
// eslint-disable-next-line no-control-regex
const hasNonLatin = s => /[^\x00-\x7F]/.test(s || '');

const asciiOnly = s => (s || '').replace(/[^ -~]/g, '');

export default function HanziStrokeApp() {
  useStyleTag(styles);

  // ---------- Controls ----------
  const [inputStr, setInputStr] = useState('佛法僧');
  const chars = useMemo(() => {
    const filtered = Array.from(inputStr || '').filter(ch => ch.trim());
    const unique = [];
    for (const ch of filtered) if (!unique.includes(ch)) unique.push(ch);
    return unique.slice(0, 32);
  }, [inputStr]);
  const [selected, setSelected] = useState('佛');

  const [size, setSize] = useState(220); // on-screen
  const [strokeColor, setStrokeColor] = useState('#111111');
  const [radicalColor, setRadicalColor] = useState('#168F16');
  const [showOutline, setShowOutline] = useState(true);
  const [showChar, setShowChar] = useState(false);
  const [speed, setSpeed] = useState(1.2);
  const [delayBetweenStrokes, setDelayBetweenStrokes] = useState(0);
  const [renderer, setRenderer] = useState('svg');

  // Export-specific controls
  const [exportMult, setExportMult] = useState(3); // 1x..6x
  const [exportFps, setExportFps] = useState(30); // 24/30/60
  const [exportBitrateKbps, setExportBitrateKbps] = useState(12000); // for WebM

  const [busyMsg, setBusyMsg] = useState('');
  const [error, setError] = useState('');

  // Derived padding (no UI), keeps character centered relative to box
  const basePadding = useMemo(() => Math.round(size * 0.05), [size]);

  // ---------- Main writer ----------
  const mainMountRef = useRef(null);
  const mainWriterRef = useRef(null);
  const stepsRef = useRef(null);
  const hiddenMountRef = useRef(null);

  // PDF: preview + messages + CJK font (optional)
  const [pdfUrl, setPdfUrl] = useState('');
  const [pdfWarn, setPdfWarn] = useState('');
  const [pdfInfo, setPdfInfo] = useState('');
  const [pdfTitle, setPdfTitle] = useState('Bảng luyện viết');
  const [cjkFontBytes, setCjkFontBytes] = useState(null);
  const [cjkFontStatus, setCjkFontStatus] = useState('đang kiểm…');

  useEffect(() => {
    // Try to load a CJK font from /public
    (async () => {
      const candidates = [
        '/fonts/NotoSansSC-Regular.otf',
        '/NotoSansSC-Regular.otf',
        '/fonts/SourceHanSansCN-Regular.otf',
      ];
      for (const p of candidates) {
        try {
          const res = await fetch(p);
          if (res.ok) {
            const ab = await res.arrayBuffer();
            setCjkFontBytes(ab);
            setCjkFontStatus('đã tìm thấy CJK font');
            return;
          }
        } catch {
          /* ignore */
        }
      }
      setCjkFontStatus('không tìm thấy CJK font – dùng Helvetica (ASCII)');
    })();
  }, []);

  // Keep selected valid
  useEffect(() => {
    if (chars.length && !chars.includes(selected)) setSelected(chars[0] || '');
  }, [chars, selected]);

  // Create / update main writer on prop changes
  useEffect(() => {
    if (!selected || !mainMountRef.current) return;
    setError('');
    const mount = mainMountRef.current;
    mount.innerHTML = ''; // clear

    // Build 3x3 background grid (tic-tac-toe)
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));
    svg.classList.add('mount');
    const l = (x1, y1, x2, y2) => {
      const ln = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      ln.setAttribute('x1', x1);
      ln.setAttribute('y1', y1);
      ln.setAttribute('x2', x2);
      ln.setAttribute('y2', y2);
      ln.setAttribute('stroke', '#E5E7EB');
      ln.setAttribute('stroke-width', '1');
      return ln;
    };
    const t1 = size / 3,
      t2 = (2 * size) / 3;
    svg.appendChild(l(t1, 0, t1, size));
    svg.appendChild(l(t2, 0, t2, size));
    svg.appendChild(l(0, t1, size, t1));
    svg.appendChild(l(0, t2, size, t2));
    mount.appendChild(svg);

    // Create writer in the same SVG container
    const writer = HanziWriter.create(svg, selected, {
      width: size,
      height: size,
      padding: basePadding,
      showOutline,
      showCharacter: showChar,
      strokeAnimationSpeed: speed,
      delayBetweenStrokes,
      strokeColor,
      radicalColor,
      renderer,
      charDataLoader: (c, done) => {
        loadCharData(c)
          .then(done)
          .catch(() => setError(`Không tải được dữ liệu cho chữ "${c}"`));
      },
      onLoadCharDataError: () =>
        setError(`Không tải được dữ liệu cho chữ "${selected}"`),
    });
    mainWriterRef.current = writer;

    // nice first animation
    setTimeout(() => {
      try {
        writer.animateCharacter();
      } catch {
        // ignore
      }
    }, 120);
  }, [
    selected,
    size,
    basePadding,
    showOutline,
    showChar,
    speed,
    delayBetweenStrokes,
    strokeColor,
    radicalColor,
    renderer,
  ]);

  // Build steps for selected char
  useEffect(() => {
    if (!selected || !stepsRef.current) return;
    stepsRef.current.innerHTML = '';
    loadCharData(selected)
      .then(charData => {
        const steps = charData.strokes.length;
        for (let i = 0; i < steps; i++) {
          const svgNS = 'http://www.w3.org/2000/svg';
          const box = document.createElementNS(svgNS, 'svg');
          const boxSize = 84;
          box.setAttribute('width', String(boxSize));
          box.setAttribute('height', String(boxSize));
          box.classList.add('stepBox');
          const l = (x1, y1, x2, y2) => {
            const ln = document.createElementNS(svgNS, 'line');
            ln.setAttribute('x1', x1);
            ln.setAttribute('y1', y1);
            ln.setAttribute('x2', x2);
            ln.setAttribute('y2', y2);
            ln.setAttribute('stroke', '#E5E7EB');
            return ln;
          };
          const t1 = boxSize / 3,
            t2 = (2 * boxSize) / 3;
          box.appendChild(l(t1, 0, t1, boxSize));
          box.appendChild(l(t2, 0, t2, boxSize));
          box.appendChild(l(0, t1, boxSize, t1));
          box.appendChild(l(0, t2, boxSize, t2));
          const group = document.createElementNS(svgNS, 'g');
          const tf = HanziWriter.getScalingTransform(boxSize, boxSize, 4);
          group.setAttribute('transform', tf.transform);
          const subset = charData.strokes.slice(0, i + 1);
          subset.forEach(d => {
            const path = document.createElementNS(svgNS, 'path');
            path.setAttribute('d', d);
            path.setAttribute('fill', strokeColor);
            group.appendChild(path);
          });
          box.appendChild(group);
          stepsRef.current.appendChild(box);
        }
      })
      .catch(() => {});
  }, [selected, strokeColor]);

  // ---------- Actions ----------
  const animate = () => {
    const w = mainWriterRef.current;
    if (!w) return;
    try {
      w.hideCharacter();
      w.animateCharacter();
    } catch {
      // ignore
    }
  };
  const loop = () => {
    const w = mainWriterRef.current;
    if (!w) return;
    try {
      w.hideCharacter();
      w.loopCharacterAnimation();
    } catch {
      // ignore
    }
  };

  // Composite helper: render background + writer canvas into a new hi-res canvas
  function makeCompositeCanvas(srcCanvas, outDim) {
    const comp = document.createElement('canvas');
    comp.width = outDim;
    comp.height = outDim;
    const ctx = comp.getContext('2d');
    drawGridOnCtx(ctx, outDim, '#fff');
    ctx.drawImage(srcCanvas, 0, 0, outDim, outDim);
    return { comp, ctx };
  }

  const exportWebM = async () => {
    if (!selected) return;
    setBusyMsg('Đang ghi WebM…');

    const outDim = Math.round(size * exportMult);

    // Hidden hi‑res writer to avoid upscaling
    const mnt = hiddenMountRef.current;
    mnt.innerHTML = '';
    const writer = HanziWriter.create(mnt, selected, {
      width: outDim,
      height: outDim,
      padding: Math.round(basePadding * exportMult),
      showOutline,
      showCharacter: showChar,
      strokeAnimationSpeed: speed,
      delayBetweenStrokes,
      strokeColor,
      radicalColor,
      renderer: 'canvas',
      charDataLoader: (c, done) => {
        loadCharData(c).then(done);
      },
    });
    const srcCanvas = mnt.querySelector('canvas');
    if (!srcCanvas) {
      setBusyMsg('');
      alert('Không tìm thấy canvas để ghi hình');
      return;
    }

    const { comp, ctx } = makeCompositeCanvas(srcCanvas, outDim);
    const stream = comp.captureStream(exportFps);

    const kbps = Math.max(2000, Math.min(50000, exportBitrateKbps));
    const chunks = [];
    let mime = 'video/webm';
    if (!MediaRecorder.isTypeSupported(mime)) mime = 'video/webm;codecs=vp9';
    const rec = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: kbps * 1000,
    });
    rec.ondataavailable = e => e.data.size && chunks.push(e.data);
    const stopped = new Promise(res => (rec.onstop = res));

    let recording = true;
    function compositeLoop() {
      if (!recording) return;
      ctx.clearRect(0, 0, outDim, outDim);
      drawGridOnCtx(ctx, outDim, '#fff');
      ctx.drawImage(srcCanvas, 0, 0, outDim, outDim);
      requestAnimationFrame(compositeLoop);
    }

    rec.start();
    requestAnimationFrame(compositeLoop);
    await writer.animateCharacter();
    setTimeout(() => {
      recording = false;
      rec.stop();
    }, 120);
    await stopped;

    const blob = new Blob(chunks, { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hanzi-${selected}-${outDim}px-${exportFps}fps-${exportBitrateKbps}kbps.webm`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setBusyMsg('');
  };

  const exportGIF = async () => {
    if (!selected) return;
    setBusyMsg('Đang kết xuất GIF…');

    const outDim = Math.round(size * exportMult);

    // Hidden hi‑res writer
    const mnt = hiddenMountRef.current;
    mnt.innerHTML = '';
    const writer = HanziWriter.create(mnt, selected, {
      width: outDim,
      height: outDim,
      padding: Math.round(basePadding * exportMult),
      showOutline,
      showCharacter: showChar,
      strokeAnimationSpeed: speed,
      delayBetweenStrokes,
      strokeColor,
      radicalColor,
      renderer: 'canvas',
      charDataLoader: (c, done) => {
        loadCharData(c).then(done);
      },
    });
    const srcCanvas = mnt.querySelector('canvas');
    if (!srcCanvas) {
      setBusyMsg('');
      alert('Không tìm thấy canvas để xuất GIF');
      return;
    }

    const { comp, ctx } = makeCompositeCanvas(srcCanvas, outDim);
    const fps = exportFps;
    const delayMs = Math.round(1000 / fps);
    const gif = new GIF({
      workers: 2,
      quality: 10,
      width: outDim,
      height: outDim,
    });

    let capturing = true;
    function tick() {
      if (!capturing) return;
      ctx.clearRect(0, 0, outDim, outDim);
      drawGridOnCtx(ctx, outDim, '#fff');
      ctx.drawImage(srcCanvas, 0, 0, outDim, outDim);
      gif.addFrame(comp, { copy: true, delay: delayMs });
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);

    await writer.animateCharacter();
    setTimeout(() => {
      capturing = false;
      gif.render();
    }, 120);

    gif.on('finished', blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `hanzi-${selected}-${outDim}px-${fps}fps.gif`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setBusyMsg('');
    });
  };

  const outDimDisplay = Math.round(size * exportMult);

  // ---------- PRACTICE SHEET (PDF) with PREVIEW ----------
  const [pdfPageSize, setPdfPageSize] = useState('A4'); // A4, Letter
  const [pdfOrientation, setPdfOrientation] = useState('portrait'); // portrait|landscape
  const [pdfCols, setPdfCols] = useState(6);
  const [pdfMarginMm, setPdfMarginMm] = useState(12);
  const [pdfIncludeDiagonals, setPdfIncludeDiagonals] = useState(false);
  const [pdfShowFaint, setPdfShowFaint] = useState(true);
  const [pdfFaintAlpha, setPdfFaintAlpha] = useState(0.18);
  const [pdfSourceMode, setPdfSourceMode] = useState('selected'); // selected | sequence

  const PAGE_SIZES = {
    A4: { w: 595.28, h: 841.89 },
    Letter: { w: 612, h: 792 },
  };

  // VẼ CHỮ -> PNG đúng chiều theo transform của HanziWriter
  async function makeGlyphPngDataUrl(char, px, paddingPx, alpha) {
    const data = await loadCharData(char);

    const canvas = document.createElement('canvas');
    canvas.width = px;
    canvas.height = px;
    const ctx = canvas.getContext('2d');

    // Lấy transform mà HanziWriter dùng cho SVG
    const tf = HanziWriter.getScalingTransform(px, px, paddingPx);

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0); // reset

    // Ưu tiên parse dạng "matrix(...)" nếu có
    let applied = false;
    if (tf && typeof tf.transform === 'string') {
      const m = tf.transform.match(/matrix\(([^)]+)\)/);
      if (m) {
        const nums = m[1].trim().split(/[ ,]+/).map(Number);
        if (nums.length >= 6 && nums.every(n => Number.isFinite(n))) {
          const [a, b, c, d, e, f] = nums;
          ctx.setTransform(a, b, c, d, e, f); // áp đúng ma trận SVG -> Canvas
          applied = true;
        }
      }
      // Nếu không có matrix, parse translate + scale (đúng thứ tự trái→phải)
      if (!applied) {
        let tx = 0,
          ty = 0,
          sx = 1,
          sy = 1;
        const t = tf.transform.match(/translate\(([^)]+)\)/);
        if (t) {
          const p = t[1].trim().split(/[ ,]+/).map(Number);
          tx = p[0] || 0;
          ty = p[1] ?? 0;
        }
        const s = tf.transform.match(/scale\(([^)]+)\)/);
        if (s) {
          const p = s[1].trim().split(/[ ,]+/).map(Number);
          sx = p[0];
          sy = p.length > 1 ? p[1] : sx;
        }
        ctx.translate(tx, ty);
        ctx.scale(sx, sy); // Lưu ý: sy có thể âm (HanziWriter lật trục Y)
        applied = true;
      }
    }

    // Fallback: khi object có x/y/scale hoặc không parse được string
    if (!applied && tf && 'x' in tf && 'y' in tf && 'scale' in tf) {
      // HanziWriter dùng hệ toạ độ Y-ngược trong SVG, nên scale Y âm
      ctx.translate(tf.x, tf.y);
      ctx.scale(tf.scale, -tf.scale);
      applied = true;
    }

    // Fallback cuối cùng (an toàn)
    if (!applied) {
      const inner = px - paddingPx * 2;
      const s = inner / 1024;
      ctx.translate(paddingPx, paddingPx + inner);
      ctx.scale(s, -s);
    }

    // Vẽ các stroke
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#111';
    for (const d of data.strokes) {
      ctx.fill(new Path2D(d));
    }
    ctx.restore();

    return canvas.toDataURL('image/png');
  }

  const makePracticePDF = async (download = false) => {
    try {
      setBusyMsg('Đang tạo PDF…');
      setPdfWarn('');
      setPdfInfo('');
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
        setPdfUrl('');
      }

      const { w: baseW, h: baseH } = PAGE_SIZES[pdfPageSize] || PAGE_SIZES.A4;
      const isPortrait = pdfOrientation === 'portrait';
      const pageW = isPortrait ? baseW : baseH;
      const pageH = isPortrait ? baseH : baseW;
      const margin = mmToPt(pdfMarginMm);
      const cols = Math.max(2, Math.min(12, pdfCols));
      const usableW = pageW - margin * 2;
      const cell = Math.floor(usableW / cols);
      const rows = Math.max(1, Math.floor((pageH - margin * 2) / cell));
      if (cell < 24) throw new Error('CELL_TOO_SMALL');

      const doc = await PDFDocument.create();
      const page = doc.addPage([pageW, pageH]);

      // Build valid char sequence and collect invalids
      const rawSeq =
        pdfSourceMode === 'selected'
          ? [selected]
          : chars.length
          ? chars
          : [selected];
      const checks = await Promise.all(
        rawSeq.map(ch =>
          loadCharData(ch)
            .then(() => ({ ch, ok: true }))
            .catch(() => ({ ch, ok: false })),
        ),
      );
      const validSeq = checks.filter(r => r.ok).map(r => r.ch);
      const invalid = checks.filter(r => !r.ok).map(r => r.ch);
      if (!validSeq.length) throw new Error('NO_VALID_CHARS');
      if (invalid.length)
        setPdfWarn(`Bỏ qua ký tự không có dữ liệu: ${invalid.join(' ')}`);

      // Embed glyph tiles per unique char
      const uniqueSeq = Array.from(new Set(validSeq));
      const glyphMap = new Map();
      const basePx = Math.max(360, Math.round(Math.max(cell * 2.4, 480))); // dynamic DPI
      const pxCap = uniqueSeq.length > 24 ? 600 : 900; // avoid huge memory
      if (pdfShowFaint) {
        for (const ch of uniqueSeq) {
          const px = Math.min(basePx, pxCap);
          const pad = Math.max(0, Math.round((px * (1 - GLYPH_SCALE)) / 2));
          const url = await makeGlyphPngDataUrl(ch, px, pad, pdfFaintAlpha);
          const img = await doc.embedPng(url);
          glyphMap.set(ch, img);
        }
      }

      const lineColor = rgb(0.9, 0.91, 0.94);
      const borderColor = rgb(0.85, 0.88, 0.95);
      const drawLine = (x1, y1, x2, y2, th = 0.8) =>
        page.drawLine({
          start: { x: x1, y: y1 },
          end: { x: x2, y: y2 },
          thickness: th,
          color: lineColor,
        });
      const drawRect = (x, y, w, h, th = 0.8) =>
        page.drawRectangle({
          x,
          y,
          width: w,
          height: h,
          borderWidth: th,
          borderColor: borderColor,
          color: rgb(1, 1, 1),
        });

      let idx = 0;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = margin + c * cell;
          const yTop = margin + r * cell; // from top
          const y = pageH - (yTop + cell); // convert to PDF coord

          // outer cell
          drawRect(x, y, cell, cell, 0.6);

          // 3x3 grid
          const t1x = x + cell / 3,
            t2x = x + (2 * cell) / 3;
          const t1y = y + cell / 3,
            t2y = y + (2 * cell) / 3;
          drawLine(t1x, y, t1x, y + cell, 0.6);
          drawLine(t2x, y, t2x, y + cell, 0.6);
          drawLine(x, t1y, x + cell, t1y, 0.6);
          drawLine(x, t2y, x + cell, t2y, 0.6);
          if (pdfIncludeDiagonals) {
            drawLine(x, y, x + cell, y + cell, 0.5);
            drawLine(x + cell, y, x, y + cell, 0.5);
          }

          // faint glyph
          if (pdfShowFaint && glyphMap.size) {
            const ch = validSeq[idx % validSeq.length];
            const img = glyphMap.get(ch);
            if (img) {
              page.drawImage(img, {
                x,
                y,
                width: cell,
                height: cell,
                opacity: 1,
              });
            }
            idx++;
          }
        }
      }

      // Footer / Title (CJK-safe if font is available)
      const rawFooter = `${
        pdfTitle || 'Practice sheet'
      } • ${new Date().toLocaleDateString()}`;
      let footerText = rawFooter;
      let font;
      try {
        if (cjkFontBytes)
          font = await doc.embedFont(cjkFontBytes, { subset: true });
        else {
          font = await doc.embedFont(StandardFonts.Helvetica);
          if (hasNonLatin(footerText)) footerText = asciiOnly(rawFooter);
        }
      } catch {
        font = await doc.embedFont(StandardFonts.Helvetica);
        footerText = asciiOnly(rawFooter);
      }
      page.drawText(footerText, {
        x: margin,
        y: margin / 2.2,
        size: 9,
        font,
        color: rgb(0.45, 0.47, 0.5),
      });

      const bytes = await doc.save();
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setPdfUrl(url);
      setPdfInfo(
        `${cols} cột × ${Math.max(
          1,
          Math.floor((pageH - margin * 2) / cell),
        )} hàng • ô ~${Math.round(cell)}pt (${Math.round(cell * 0.3528)}mm) • ${
          cjkFontBytes ? 'CJK font' : 'ASCII only'
        }`,
      );

      if (download) {
        const a = document.createElement('a');
        a.href = url;
        a.download = `hanzi-practice-${pdfPageSize}-${pdfOrientation}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      setBusyMsg('');
    } catch (err) {
      console.error(err);
      setBusyMsg('');
      let msg = 'Không thể tạo PDF. ';
      if (String(err?.message).includes('NO_VALID_CHARS'))
        msg += 'Không có ký tự hợp lệ (hanzi-writer-data không có dữ liệu).';
      else if (String(err?.message).includes('CELL_TOO_SMALL'))
        msg += 'Ô quá nhỏ – hãy giảm số cột hoặc lề.';
      else msg += 'Hãy giảm số cột hoặc kiểm tra dữ liệu chữ.';
      alert(msg);
    }
  };

  useEffect(
    () => () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    },
    [pdfUrl],
  );

  return (
    <div className="app">
      <div className="wrap">
        <h1 className="h1">Tra cứu thứ tự nét chữ Hán — cấu trúc dọc</h1>

        {/* TOP: CONTROLS */}
        <div className="section">
          <div className="row">
            <label>Ký tự (có thể nhập nhiều, chọn 1 để xem)</label>
            <input
              className="input"
              value={inputStr}
              onChange={e => setInputStr(e.target.value)}
              placeholder="如: 佛法僧 同学"
            />
          </div>
          {chars.length > 0 && (
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <label>Chọn ký tự</label>
              <div className="chips">
                {chars.map(ch => (
                  <button
                    key={ch}
                    className={'chip' + (selected === ch ? ' active' : '')}
                    onClick={() => setSelected(ch)}
                  >
                    {ch}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="row">
            <label>Kích thước ô ({size}px)</label>
            <input
              className="input"
              type="range"
              min={120}
              max={420}
              step={10}
              value={size}
              onChange={e =>
                setSize(clamp(parseInt(e.target.value) || 220, 120, 420))
              }
            />
          </div>
          <div className="row">
            <label>Màu nét</label>
            <input
              className="input"
              type="color"
              value={strokeColor}
              onChange={e => setStrokeColor(e.target.value)}
            />
          </div>
          <div className="row">
            <label>Màu bộ thủ</label>
            <input
              className="input"
              type="color"
              value={radicalColor}
              onChange={e => setRadicalColor(e.target.value)}
            />
          </div>
          <div className="row">
            <label>Hiển thị Outline</label>
            <input
              className="checkbox"
              type="checkbox"
              checked={showOutline}
              onChange={e => setShowOutline(e.target.checked)}
            />
          </div>
          <div className="row">
            <label>Hiện chữ sẵn</label>
            <input
              className="checkbox"
              type="checkbox"
              checked={showChar}
              onChange={e => setShowChar(e.target.checked)}
            />
          </div>
          <div className="row">
            <label>Tốc độ nét ({speed.toFixed(2)}x)</label>
            <input
              className="input"
              type="range"
              min={0.2}
              max={6}
              step={0.1}
              value={speed}
              onChange={e => setSpeed(parseFloat(e.target.value))}
            />
          </div>
          <div className="row">
            <label>Giãn cách nét ({delayBetweenStrokes}ms)</label>
            <input
              className="input"
              type="range"
              min={0}
              max={1200}
              step={20}
              value={delayBetweenStrokes}
              onChange={e =>
                setDelayBetweenStrokes(parseInt(e.target.value) || 0)
              }
            />
          </div>
          <div className="row">
            <label>Renderer</label>
            <select
              className="select"
              value={renderer}
              onChange={e => setRenderer(e.target.value)}
            >
              <option value="svg">SVG (đẹp, nét)</option>
              <option value="canvas">Canvas (nhẹ, xuất video)</option>
            </select>
          </div>
          {/* Export controls */}
          <div className="row">
            <label>Độ phân giải xuất</label>
            <input
              className="input"
              type="range"
              min={1}
              max={6}
              step={1}
              value={exportMult}
              onChange={e => setExportMult(parseInt(e.target.value) || 1)}
            />
            <span className="muted">
              {exportMult}× (≈ {outDimDisplay}px)
            </span>
          </div>
          <div className="row">
            <label>FPS xuất</label>
            <input
              className="input"
              type="range"
              min={12}
              max={60}
              step={6}
              value={exportFps}
              onChange={e => setExportFps(parseInt(e.target.value) || 30)}
            />
            <span className="muted">{exportFps} fps</span>
          </div>
          <div className="row">
            <label>Bitrate WebM</label>
            <input
              className="input number"
              type="number"
              min={2000}
              max={50000}
              step={500}
              value={exportBitrateKbps}
              onChange={e =>
                setExportBitrateKbps(parseInt(e.target.value) || 12000)
              }
            />
            <span className="muted">kbps (gợi ý: 8k–16k cho 1080p)</span>
          </div>
          {busyMsg && <div className="muted">{busyMsg}</div>}
          {error && <div className="bad">{error}</div>}
        </div>

        {/* MIDDLE: ANIMATION STAGE (single row, buttons/text BELOW) */}
        <div className="section stage">
          <div className="stageInner">
            <div ref={mainMountRef} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" onClick={animate}>
                Animate
              </button>
              <button className="btn secondary" onClick={loop}>
                Loop
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" onClick={exportGIF}>
                Tải GIF
              </button>
              <button className="btn secondary" onClick={exportWebM}>
                Tải WebM
              </button>
            </div>
            <div className="muted">
              Xuất hiện tại kích thước ~{outDimDisplay}px, {exportFps}fps,{' '}
              {exportBitrateKbps}kbps.
            </div>
          </div>
          {/* hidden mount for exports */}
          <div
            ref={hiddenMountRef}
            style={{ position: 'absolute', left: -99999, top: -99999 }}
          />
        </div>

        {/* BOTTOM: STEP-BY-STEP */}
        <div className="section">
          <div className="stepTitle">
            <div style={{ fontWeight: 600 }}>Các bước hoàn thành</div>
            <div className="muted">ký tự: {selected || '—'}</div>
          </div>
          <div ref={stepsRef} className="stepsGrid" />
          <div className="row" style={{ marginTop: 8 }}>
            <div className="muted">
              Gợi ý: dữ liệu tải từ <code>hanzi-writer-data</code> nếu có, dự
              phòng CDN jsDelivr; xuất GIF/WebM có nền trắng + lưới 3×3.
            </div>
          </div>
        </div>

        {/* PRACTICE SHEET PDF GENERATOR + PREVIEW */}
        <div className="section">
          <div style={{ fontWeight: 600, marginBottom: 6 }}>
            Tạo lưới chữ để in (PDF)
          </div>
          <div className="row">
            <label>Khổ giấy</label>
            <select
              className="select"
              value={pdfPageSize}
              onChange={e => setPdfPageSize(e.target.value)}
            >
              <option value="A4">A4 (210×297mm)</option>
              <option value="Letter">Letter (8.5×11in)</option>
            </select>
            <select
              className="select"
              value={pdfOrientation}
              onChange={e => setPdfOrientation(e.target.value)}
            >
              <option value="portrait">Dọc</option>
              <option value="landscape">Ngang</option>
            </select>
          </div>
          <div className="row">
            <label>Số cột</label>
            <input
              className="input"
              type="range"
              min={3}
              max={12}
              step={1}
              value={pdfCols}
              onChange={e => setPdfCols(parseInt(e.target.value) || 6)}
            />
            <span className="muted">{pdfCols} cột (hàng tự tính)</span>
          </div>
          <div className="row">
            <label>Lề (mm)</label>
            <input
              className="input number"
              type="number"
              min={5}
              max={30}
              step={1}
              value={pdfMarginMm}
              onChange={e => setPdfMarginMm(parseInt(e.target.value) || 12)}
            />
          </div>
          <div className="row">
            <label>Tùy chọn lưới</label>
            <label>
              <input
                className="checkbox"
                type="checkbox"
                checked={pdfIncludeDiagonals}
                onChange={e => setPdfIncludeDiagonals(e.target.checked)}
              />{' '}
              Có đường chéo
            </label>
          </div>
          <div className="row">
            <label>Chữ mẫu mờ</label>
            <label>
              <input
                className="checkbox"
                type="checkbox"
                checked={pdfShowFaint}
                onChange={e => setPdfShowFaint(e.target.checked)}
              />{' '}
              In kèm chữ mờ để tô
            </label>
          </div>
          <div className="row">
            <label>Cường độ chữ mờ</label>
            <input
              className="input"
              type="range"
              min={0.08}
              max={0.5}
              step={0.02}
              value={pdfFaintAlpha}
              onChange={e =>
                setPdfFaintAlpha(parseFloat(e.target.value) || 0.18)
              }
            />
            <span className="muted">{Math.round(pdfFaintAlpha * 100)}%</span>
          </div>
          <div className="row">
            <label>Nguồn chữ cho lưới</label>
            <select
              className="select"
              value={pdfSourceMode}
              onChange={e => setPdfSourceMode(e.target.value)}
            >
              <option value="selected">Lặp lại ký tự đang chọn</option>
              <option value="sequence">
                Dùng chuỗi đã nhập (tuần tự, lặp vòng)
              </option>
            </select>
          </div>
          <div className="row">
            <label>Tiêu đề trang (có thể chứa CJK)</label>
            <input
              className="input"
              value={pdfTitle}
              onChange={e => setPdfTitle(e.target.value)}
              placeholder="Bảng luyện viết / 书写练习"
            />
          </div>
          <div className="row">
            <label>Trạng thái font CJK</label>
            <div className="muted">{cjkFontStatus}</div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn" onClick={() => makePracticePDF(false)}>
              Tạo bản xem trước
            </button>
            <button
              className="btn secondary"
              onClick={() => makePracticePDF(true)}
              disabled={!selected}
            >
              Tạo & tải PDF
            </button>
            {pdfUrl && (
              <button
                className="btn ghost"
                onClick={() => {
                  URL.revokeObjectURL(pdfUrl);
                  setPdfUrl('');
                }}
              >
                Xóa preview
              </button>
            )}
          </div>
          {pdfWarn && (
            <div className="row">
              <div className="warn">{pdfWarn}</div>
            </div>
          )}
          {pdfInfo && (
            <div className="row">
              <div className="muted">{pdfInfo}</div>
            </div>
          )}
          {pdfUrl && (
            <div
              className="row"
              style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}
            >
              <label className="muted">
                Xem trước PDF (trượt để xem toàn trang):
              </label>
              <iframe className="pdfPrev" title="preview" src={pdfUrl} />
              <div style={{ display: 'flex', gap: 8 }}>
                <a
                  className="btn"
                  href={pdfUrl}
                  download={`hanzi-practice-${pdfPageSize}-${pdfOrientation}.pdf`}
                >
                  Tải ngay
                </a>
                <div className="muted">
                  Nếu preview không hiện, trình duyệt có thể chặn – hãy nhấn
                  "Tải ngay".
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
