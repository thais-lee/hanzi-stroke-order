// utils/video.js
import HanziWriter from 'hanzi-writer';
import { loadCharData } from './hanzi';
import { makeCompositeCanvas, drawGridOnCtx, CHAR_BOX_SCALE, GRID_DEFAULTS } from './misc';
import { convertToMp4WithFFmpeg } from './ffmpeg';
import JSZip from 'jszip';

// Ưu tiên mp4 nếu trình duyệt hỗ trợ
export function pickMp4Mime() {
  const prefs = ['video/mp4;codecs=h264', 'video/mp4'];
  for (const t of prefs) if (window.MediaRecorder?.isTypeSupported(t)) return t;
  return null;
}

// Ghi 1 ký tự -> Blob video (mp4 nếu support, ko thì webm)
export async function recordCharToVideoBlob(ch, hiddenMountRef, cfg) {
  const {
    size,
    exportMult,
    showOutline,
    showChar,
    speed,
    delayBetweenStrokes,
    strokeColor,
    radicalColor,
    exportFps,
    exportBitrateKbps,
    gridEnabled = true,
    gridOpts = GRID_DEFAULTS,
  } = cfg;

  const outDim = Math.round(size * exportMult);
  const pad = Math.round((outDim * (1 - CHAR_BOX_SCALE)) / 2);

  // Writer hi-res dùng canvas
  const mnt = hiddenMountRef.current;
  mnt.innerHTML = '';
  const writer = HanziWriter.create(mnt, ch, {
    width: outDim,
    height: outDim,
    padding: pad,
    showOutline,
    showCharacter: showChar,
    strokeAnimationSpeed: speed,
    delayBetweenStrokes,
    strokeColor,
    radicalColor,
    renderer: 'canvas',
    charDataLoader: (c, done) => loadCharData(c).then(done),
  });

  const srcCanvas = mnt.querySelector('canvas');
  if (!srcCanvas) throw new Error('NO_CANVAS');

  // Canvas tổng hợp để captureStream (ta sẽ tự vẽ nền + lưới + glyph)
  const { comp, ctx } = makeCompositeCanvas(srcCanvas, outDim);
  const stream = comp.captureStream(exportFps);

  const mp4Mime = pickMp4Mime();
  const mime =
    mp4Mime ||
    (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm');

  const rec = new MediaRecorder(stream, {
    mimeType: mime,
    videoBitsPerSecond:
      Math.max(2000, Math.min(50000, exportBitrateKbps)) * 1000,
  });

  const chunks = [];
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  const stopped = new Promise(res => (rec.onstop = res));

  // Vòng vẽ: NỀN TRẮNG + LƯỚI (mỗi frame) + glyph từ srcCanvas
  let recording = true;
  //   const drawLoop = () => {
  //     if (!recording) return;
  //     drawGridOnCtx(ctx, outDim, {
  //       bg: '#ffffff',
  //       majorColor: '#BFCAE4', // đường chính (ô 3×3)
  //       minorColor: '#D5DDEF', // đường con bên trong từng ô
  //       borderColor: '#BFCAE4',
  //       sameThickness: false, // đường con mảnh hơn
  //       minorDash: [2, 6], // nét đứt như animation
  //       borderRadius: 16, // nếu muốn bo viền giống Stage; 0 = vuông
  //     });
  //     ctx.drawImage(srcCanvas, 0, 0, outDim, outDim);
  //     requestAnimationFrame(drawLoop);
  //   };
  const drawLoop = () => {
    if (!recording) return;
    // vẽ nền + lưới giống animation (hoặc chỉ nền nếu tắt lưới)
    drawGridOnCtx(ctx, outDim, {
      ...(gridOpts || GRID_DEFAULTS),
      enabled: gridEnabled,
    });
    ctx.drawImage(srcCanvas, 0, 0, outDim, outDim);
    requestAnimationFrame(drawLoop);
  };

  rec.start();
  requestAnimationFrame(drawLoop);
  await writer.animateCharacter();
  setTimeout(() => {
    recording = false;
    rec.stop();
  }, 120);
  await stopped;

  return {
    blob: new Blob(chunks, { type: mime }),
    mime,
    filenameBase: `hanzi-${ch}-${outDim}px-${exportFps}fps`,
    outDim,
    mp4Mime,
  };
}

// Xuất hàng loạt & ZIP (tên có số thứ tự)
export async function batchExportMP4Zip(chars, hiddenMountRef, cfg, progress) {
  const files = [];
  const digits = Math.max(2, String(chars.length).length);
  const mp4Mime = pickMp4Mime();

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    progress?.onItem?.({
      index: i,
      total: chars.length,
      label: `Ghi "${ch}"`,
      convert: 0,
    });

    const {
      blob,
      mp4Mime: directMp4,
      filenameBase,
    } = await recordCharToVideoBlob(ch, hiddenMountRef, cfg);

    let outBlob = blob;
    if (!directMp4 && !mp4Mime) {
      progress?.onItem?.({
        index: i,
        total: chars.length,
        label: `Convert "${ch}"`,
        convert: 0,
      });
      outBlob = await convertToMp4WithFFmpeg(blob, cfg.exportFps, p =>
        progress?.onItem?.({
          index: i,
          total: chars.length,
          label: `Convert "${ch}"`,
          convert: p,
        }),
      );
    } else {
      progress?.onItem?.({
        index: i,
        total: chars.length,
        label: `Convert "${ch}"`,
        convert: 100,
      });
    }

    const base = (filenameBase ?? String(ch)).replace(/[\\/:*?"<>|]/g, '');
    const idx = String(i + 1).padStart(digits, '0');
    files.push({ name: `${idx}_${base}.mp4`, blob: outBlob });
  }

  progress?.onZip?.(0);
  const zip = new JSZip();
  for (const f of files) zip.file(f.name, f.blob);

  const zipBlob = await zip.generateAsync({ type: 'blob' }, meta => {
    const p = Math.max(0, Math.min(100, Math.round(meta.percent)));
    progress?.onZip?.(p);
  });

  return zipBlob;
}
