let ffmpegReady = false;
let ffmpegInstance = null;

export async function ensureFFmpegLoaded() {
  if (ffmpegReady) return ffmpegInstance;
  const { FFmpeg } = await import('@ffmpeg/ffmpeg');
  const { toBlobURL } = await import('@ffmpeg/util');
  const base = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
  const ffmpeg = new FFmpeg();
  await ffmpeg.load({
    coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
    workerURL: await toBlobURL(
      `${base}/ffmpeg-core.worker.js`,
      'text/javascript',
    ),
  });
  ffmpegReady = true;
  ffmpegInstance = ffmpeg;
  return ffmpeg;
}

export async function convertToMp4WithFFmpeg(webmBlob, fps, onProgress) {
  const ffmpeg = await ensureFFmpegLoaded();
  const { fetchFile } = await import('@ffmpeg/util');

  ffmpeg.on('progress', p => {
    if (typeof onProgress === 'function' && p?.progress != null) {
      onProgress(Math.round(p.progress * 100));
    }
  });

  await ffmpeg.writeFile('in.webm', await fetchFile(webmBlob));
  await ffmpeg.exec([
    '-i',
    'in.webm',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    '-r',
    String(fps),
    'out.mp4',
  ]);
  const data = await ffmpeg.readFile('out.mp4');
  return new Blob([data.buffer], { type: 'video/mp4' });
}
