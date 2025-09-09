import React, { useEffect, useMemo, useRef, useState } from 'react';
import './styles.css';

import Controls from './components/Controls';
import Stage from './components/Stage';
import StepsGrid from './components/StepsGrid';
import PDFPanel from './components/PDFPanel';
import ProgressBars from './components/ProgressBars';

import {
  batchExportMP4Zip,
  recordCharToVideoBlob,
  pickMp4Mime,
} from './utils/videoExport';

export default function App() {
  // ===== Controls =====
  const [inputStr, setInputStr] = useState('佛法僧');
  const chars = useMemo(() => {
    const filtered = Array.from(inputStr || '').filter(ch => ch.trim());
    const unique = [];
    for (const ch of filtered) if (!unique.includes(ch)) unique.push(ch);
    return unique.slice(0, 32);
  }, [inputStr]);
  const [selected, setSelected] = useState('佛');

  const [size, setSize] = useState(420);
  const [strokeColor, setStrokeColor] = useState('#111111');
  const [radicalColor, setRadicalColor] = useState('#168F16');
  const [showOutline, setShowOutline] = useState(true);
  const [showChar, setShowChar] = useState(false);
  const [speed, setSpeed] = useState(0.2);
  const [delayBetweenStrokes, setDelayBetweenStrokes] = useState(0);
  const [renderer, setRenderer] = useState('svg');

  // export
  const [exportMult, setExportMult] = useState(3);
  const [exportFps, setExportFps] = useState(30);
  const [exportBitrateKbps, setExportBitrateKbps] = useState(12000);

  const [busyMsg, setBusyMsg] = useState('');
  const [error] = useState('');

  // batching
  const [batching, setBatching] = useState(false);
  const [overallCount, setOverallCount] = useState({ i: 0, n: 0 });
  const [convPct, setConvPct] = useState(0);
  const [batchMsg, setBatchMsg] = useState('');
  const [zipPct, setZipPct] = useState(0);

  // pdf
  const [pdfUrl, setPdfUrl] = useState('');
  const [pdfWarn, setPdfWarn] = useState('');
  const [pdfInfo, setPdfInfo] = useState('');
  const [pdfTitle, setPdfTitle] = useState('AMTBVN - tranet.hanhoc.com');
  const [pdfPageSize, setPdfPageSize] = useState('A4');
  const [pdfOrientation, setPdfOrientation] = useState('portrait');
  const [pdfCols, setPdfCols] = useState(6);
  const [pdfMarginMm, setPdfMarginMm] = useState(12);
  const [pdfIncludeDiagonals, setPdfIncludeDiagonals] = useState(false);
  const [pdfShowFaint, setPdfShowFaint] = useState(true);
  const [pdfFaintAlpha, setPdfFaintAlpha] = useState(0.18);
  const [pdfSourceMode, setPdfSourceMode] = useState('selected');
  const [cjkFontBytes, setCjkFontBytes] = useState(null);

  // load optional CJK font
  useEffect(() => {
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
            return;
          }
        } catch {
          // ignore
        }
      }
    })();
  }, []);

  // keep selected valid
  useEffect(() => {
    if (chars.length && !chars.includes(selected)) setSelected(chars[0] || '');
  }, [chars, selected]);

  // derived
  const basePadding = useMemo(() => Math.round(size * 0.05), [size]);
  const outDimDisplay = Math.round(size * exportMult);

  // hidden mount for exports
  const hiddenMountRef = useRef(null);

  // Single export MP4 (vẫn dùng util record + convert nếu cần)
  const exportMP4 = async () => {
    if (!selected) return;
    setBusyMsg('Đang ghi video…');
    try {
      const result = await recordCharToVideoBlob(selected, hiddenMountRef, {
        size,
        exportMult,
        basePadding,
        showOutline,
        showChar,
        speed,
        delayBetweenStrokes,
        strokeColor,
        radicalColor,
        exportFps,
        exportBitrateKbps,
      });

      let blob = result.blob;
      if (!result.mp4Mime && !pickMp4Mime()) {
        setBusyMsg('Đang chuyển sang MP4…');
        const { convertToMp4WithFFmpeg } = await import('./utils/ffmpeg');
        blob = await convertToMp4WithFFmpeg(result.blob, exportFps);
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${result.filenameBase}.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert('Xuất MP4 thất bại.');
    } finally {
      setBusyMsg('');
    }
  };

  // Batch ZIP
  const exportZip = async () => {
    const list = chars.slice(0);
    if (!list.length) return;

    setBatching(true);
    setOverallCount({ i: 0, n: list.length });
    setConvPct(0);
    setZipPct(0);
    setBatchMsg('Chuẩn bị…');

    try {
      const zipBlob = await batchExportMP4Zip(
        list,
        hiddenMountRef,
        {
          size,
          exportMult,
          basePadding,
          showOutline,
          showChar,
          speed,
          delayBetweenStrokes,
          strokeColor,
          radicalColor,
          exportFps,
          exportBitrateKbps,
        },
        {
          onItem: ({ index, total, label, convert }) => {
            setOverallCount({ i: index, n: total });
            setBatchMsg(label);
            setConvPct(convert ?? 0);
          },
          onZip: p => setZipPct(p),
        },
      );

      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `hanzi-mp4-${ts}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      setBatchMsg('Hoàn tất ZIP!');
      setOverallCount({ i: list.length, n: list.length });
      setZipPct(100);
    } catch (e) {
      console.error(e);
      alert(
        'Xuất ZIP thất bại. Hãy giảm độ phân giải/FPS/số lượng, rồi thử lại.',
      );
    } finally {
      setTimeout(() => {
        setBatching(false);
        setBatchMsg('');
        setConvPct(0);
        setZipPct(0);
      }, 1200);
    }
  };

  // ===== UI =====
  return (
    <div className="app">
      <div className="wrap">
        <h1
          className="h1"
          style={{
            marginBottom: 20,
            fontSize: '2.6rem',
            background: 'linear-gradient(90deg, #ff8a00, #e52e71)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            fontWeight: 'bold',
            textAlign: 'center',
            textShadow: '0 2px 4px rgba(0,0,0,0.1)',
            userSelect: 'none',
            letterSpacing: '0.05em',
            marginTop: '12px',
          }}
        >
          Tra cứu thứ tự nét chữ Hán
        </h1>

        <Controls
          {...{
            inputStr,
            setInputStr,
            chars,
            selected,
            setSelected,
            size,
            setSize,
            strokeColor,
            setStrokeColor,
            radicalColor,
            setRadicalColor,
            showOutline,
            setShowOutline,
            showChar,
            setShowChar,
            speed,
            setSpeed,
            delayBetweenStrokes,
            setDelayBetweenStrokes,
            renderer,
            setRenderer,
            exportMult,
            setExportMult,
            exportFps,
            setExportFps,
            exportBitrateKbps,
            setExportBitrateKbps,
            busyMsg,
            error,
            outDimDisplay,
          }}
        />

        <Stage
          selected={selected}
          size={size}
          basePadding={basePadding}
          showOutline={showOutline}
          showChar={showChar}
          speed={speed}
          delayBetweenStrokes={delayBetweenStrokes}
          strokeColor={strokeColor}
          radicalColor={radicalColor}
          renderer={renderer}
          buttonsRight={
            <>
              <button className="btn" onClick={exportMP4}>
                Tải MP4
              </button>
              <button
                className="btn secondary"
                onClick={exportZip}
                disabled={batching || !chars.length}
              >
                Tải ZIP (MP4, {chars.length})
              </button>
            </>
          }
        />

        {batching && (
          <ProgressBars
            batching={batching}
            batchMsg={batchMsg}
            overallCount={overallCount}
            convPct={convPct}
            zipPct={zipPct}
          />
        )}

        <StepsGrid selected={selected} strokeColor={strokeColor} />

        <PDFPanel
          pdfPageSize={pdfPageSize}
          setPdfPageSize={setPdfPageSize}
          pdfOrientation={pdfOrientation}
          setPdfOrientation={setPdfOrientation}
          pdfCols={pdfCols}
          setPdfCols={setPdfCols}
          pdfMarginMm={pdfMarginMm}
          setPdfMarginMm={setPdfMarginMm}
          pdfIncludeDiagonals={pdfIncludeDiagonals}
          setPdfIncludeDiagonals={setPdfIncludeDiagonals}
          pdfShowFaint={pdfShowFaint}
          setPdfShowFaint={setPdfShowFaint}
          pdfFaintAlpha={pdfFaintAlpha}
          setPdfFaintAlpha={setPdfFaintAlpha}
          pdfSourceMode={pdfSourceMode}
          setPdfSourceMode={setPdfSourceMode}
          pdfTitle={pdfTitle}
          setPdfTitle={setPdfTitle}
          cjkFontBytes={cjkFontBytes}
          selected={selected}
          chars={chars}
          pdfUrl={pdfUrl}
          setPdfUrl={setPdfUrl}
          setBusyMsg={setBusyMsg}
          pdfWarn={pdfWarn}
          setPdfWarn={setPdfWarn}
          pdfInfo={pdfInfo}
          setPdfInfo={setPdfInfo}
        />

        {/* hidden mount for exports */}
        <div
          ref={hiddenMountRef}
          style={{ position: 'absolute', left: -99999, top: -99999 }}
        />
      </div>
    </div>
  );
}
