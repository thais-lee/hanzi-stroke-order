// src/App.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import './styles.css';

import Stage from './components/Stage';
import StepsGrid from './components/StepsGrid';
import PDFPanel from './components/PDFPanel';
import ProgressBars from './components/ProgressBars';
import SettingsModal from './components/SettingsModal';

import { GRID_DEFAULTS } from './utils/misc';
import { loadCharCategories } from './utils/charLists';

import {
  batchExportMP4Zip,
  recordCharToVideoBlob,
  pickMp4Mime,
} from './utils/videoExport';

// === NEW: PDF batch helpers
import {
  generatePracticePDFCombined,
  generatePracticePDFZip,
  saveBlob,
} from './utils/pdfGen';

export default function App() {
  // ===== Nguồn ký tự =====
  const [charSource, setCharSource] = useState('manual'); // 'manual' | 'list'

  // --- Nhập tay ---
  const [inputStr, setInputStr] = useState('佛法僧');
  const manualChars = useMemo(() => {
    const filtered = Array.from(inputStr || '').filter(ch => ch.trim());
    const unique = [];
    for (const ch of filtered) if (!unique.includes(ch)) unique.push(ch);
    return unique;
  }, [inputStr]);

  // --- Từ các file .txt trong src/data ---
  const categories = useMemo(() => loadCharCategories(), []);
  const [selectedCatId, setSelectedCatId] = useState('');

  useEffect(() => {
    if (!selectedCatId && categories.length) {
      setSelectedCatId(categories[0].id);
    }
  }, [categories, selectedCatId]);

  const currentCat = useMemo(
    () => categories.find(c => c.id === selectedCatId),
    [categories, selectedCatId],
  );

  const fileChars = useMemo(() => currentCat?.chars || [], [currentCat]);

  // Mảng ký tự dùng chung cho toàn app
  const chars = useMemo(
    () => (charSource === 'manual' ? manualChars : fileChars),
    [charSource, manualChars, fileChars],
  );

  // Ký tự đang hiển thị/animate
  const [selected, setSelected] = useState('佛');

  useEffect(() => {
    if (chars.length && !chars.includes(selected)) setSelected(chars[0]);
    if (!chars.length && selected) setSelected('');
  }, [chars, selected]);

  // ===== Tuỳ chọn hiển thị/xuất =====
  const [size, setSize] = useState(420);
  const [strokeColor, setStrokeColor] = useState('#111111');
  const [radicalColor, setRadicalColor] = useState('#168F16');
  const [showOutline, setShowOutline] = useState(true);
  const [showChar, setShowChar] = useState(false);
  const [speed, setSpeed] = useState(0.2);
  const [delayBetweenStrokes, setDelayBetweenStrokes] = useState(0);
  const [renderer, setRenderer] = useState('svg');
  const [gridEnabled, setGridEnabled] = useState(true);

  // Export
  const [exportMult, setExportMult] = useState(3);
  const [exportFps, setExportFps] = useState(30);
  const [exportBitrateKbps, setExportBitrateKbps] = useState(12000);

  const [busyMsg, setBusyMsg] = useState('');

  // Modal nâng cao
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Batch ZIP (video)
  const [batching, setBatching] = useState(false);
  const [overallCount, setOverallCount] = useState({ i: 0, n: 0 });
  const [convPct, setConvPct] = useState(0);
  const [batchMsg, setBatchMsg] = useState('');
  const [zipPct, setZipPct] = useState(0);

  // ===== PDF =====
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
  const [pdfFaintAlpha, setPdfFaintAlpha] = useState(0.2);
  const [pdfSourceMode, setPdfSourceMode] = useState('selected');
  const [cjkFontBytes, setCjkFontBytes] = useState(null);
  // NEW: kiểu lưới & chia 4×4
  const [pdfGridMode, setPdfGridMode] = useState('3x3'); // '3x3' | '2x2' | 'mi' | 'zhong' | 'hui'
  const [pdfSubdivide4x4, setPdfSubdivide4x4] = useState(true);

  // Nạp optional CJK font cho PDF footer
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
          /* noop */
        }
      }
    })();
  }, []);

  const basePadding = useMemo(() => Math.round(size * 0.05), [size]);

  // Hidden mount cho recording
  const hiddenMountRef = useRef(null);

  // ===== Export MP4 1 ký tự =====
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
        gridEnabled,
        gridOpts: GRID_DEFAULTS,
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

  // ===== Batch ZIP (video) =====
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
          gridEnabled,
          gridOpts: GRID_DEFAULTS,
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

  // ===== Helpers: build options cho PDF =====
  const buildPdfOpts = () => ({
    pageSize: pdfPageSize,
    orientation: pdfOrientation,
    cols: pdfCols,
    marginMm: pdfMarginMm,
    includeDiagonals: pdfIncludeDiagonals,
    showFaint: pdfShowFaint,
    faintAlpha: pdfFaintAlpha,
    sourceMode: pdfSourceMode,
    title: pdfTitle,
    cjkFontBytes,
    gridEnabled,
    // phần hướng dẫn nét: 30pt + gap 6pt
    guideStepSizePt: 30,
    guideGapPt: 6,
    gridMode: pdfGridMode, // '3x3' | '2x2' | 'mi' | 'zhong' | 'hui'
    subdividePerCell4x4: pdfSubdivide4x4,
  });

  // ===== NEW: Xuất PDF gộp (1 file, nhiều trang) =====
  const exportBatchPdfCombined = async () => {
    if (!chars.length) return;
    setBusyMsg('Đang tạo PDF (gộp)…');
    setBatchMsg('');
    try {
      const { blob, filename, skipped } = await generatePracticePDFCombined(
        chars,
        buildPdfOpts(),
        (i, total, ch) => setBatchMsg(`PDF: ${i}/${total} – ${ch}`),
      );
      saveBlob(blob, filename);
      if (skipped.length) setPdfWarn(`Bỏ qua: ${skipped.join(' ')}`);
    } catch (e) {
      console.error(e);
      alert('Xuất PDF gộp thất bại.');
    } finally {
      setBusyMsg('');
      setBatchMsg('');
    }
  };

  // ===== NEW: Xuất ZIP nhiều PDF =====
  const exportBatchPdfZip = async () => {
    if (!chars.length) return;
    setBusyMsg('Đang tạo ZIP (PDF)…');
    setBatchMsg('');
    try {
      const { blob, filename, skipped } = await generatePracticePDFZip(
        chars,
        buildPdfOpts(),
        (i, total, ch) => setBatchMsg(`PDF: ${i}/${total} – ${ch}`),
      );
      saveBlob(blob, filename);
      if (skipped.length) setPdfWarn(`Bỏ qua: ${skipped.join(' ')}`);
    } catch (e) {
      console.error(e);
      alert('Xuất ZIP PDF thất bại.');
    } finally {
      setBusyMsg('');
      setBatchMsg('');
    }
  };

  // ===== UI =====
  return (
    <div className="app">
      <div className="wrap">
        <h1
          className="h1"
          style={{
            marginBottom: 16,
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

        {/* ===== Hàng chọn nguồn + nhập/chọn ký tự ===== */}
        <div className="section">
          {/* Nguồn ký tự */}
          <div className="row">
            <label>Nguồn ký tự</label>
            <select
              className="select"
              value={charSource}
              onChange={e => setCharSource(e.target.value)}
            >
              <option value="manual">Nhập trực tiếp</option>
              <option value="list">Hán Tự Nhập Môn</option>
            </select>
          </div>

          {/* Cùng hàng: input + dropdown nhóm file */}
          <div className="row" style={{ gap: 8, alignItems: 'center' }}>
            <label>Ký tự</label>
            <input
              className="input"
              style={{
                flex: 1,
                borderWidth: charSource !== 'manual' ? 1 : 2,
                borderColor: charSource !== 'manual' ? '#ccc' : '#888',
              }}
              value={inputStr}
              onChange={e => setInputStr(e.target.value)}
              placeholder="Nhập nhiều ký tự (ví dụ: 佛法僧)"
              disabled={charSource === 'list'}
            />
            <select
              className="select"
              value={selectedCatId}
              onChange={e => setSelectedCatId(e.target.value)}
              style={{
                width: 240,
                borderWidth: charSource !== 'list' ? 1 : 2,
                borderColor: charSource !== 'list' ? '#ccc' : '#888',
              }}
              disabled={!categories.length || charSource !== 'list'}
            >
              {categories.map(g => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </select>
          </div>

          {/* Nếu nhập tay → chips; nếu từ file → dropdown ký tự */}
          {charSource === 'manual' ? (
            !!manualChars.length && (
              <div className="row" style={{ alignItems: 'flex-start' }}>
                <label>Chọn ký tự</label>
                <div className="chips">
                  {manualChars.map(ch => (
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
            )
          ) : (
            <div className="row">
              <label>Ký tự trong nhóm</label>
              <select
                className="select"
                value={selected}
                onChange={e => setSelected(e.target.value)}
              >
                {(currentCat?.items || []).map((it, idx) => (
                  <option key={`${it.value}-${idx}`} value={it.value}>
                    {it.label}
                  </option>
                ))}
              </select>
              <span className="muted">({fileChars.length} ký tự)</span>
            </div>
          )}

          {/* Công tắc lưới nhanh */}
          <div className="row">
            <label>Hiện lưới</label>
            <input
              type="checkbox"
              checked={gridEnabled}
              onChange={e => setGridEnabled(e.target.checked)}
            />
          </div>

          {/* NEW: Kiểu lưới */}
          <div className="row" style={{ gap: 8, alignItems: 'center' }}>
            <label>Kiểu lưới</label>
            <select
              className="select"
              value={pdfGridMode}
              onChange={e => setPdfGridMode(e.target.value)}
              style={{ width: 220 }}
            >
              <option value="3x3">九宫格 (3×3)</option>
              <option value="2x2">田字格 (2×2)</option>
              <option value="mi">米字格 (mễ tự cách)</option>
              <option value="zhong">中宫格 (trung cung)</option>
              <option value="hui">回宫格 (hồi cung)</option>
            </select>

            {(pdfGridMode === '3x3' || pdfGridMode === '2x2') && (
              <>
                <label style={{ marginLeft: 8 }}>Chia 4×4 trong ô con</label>
                <input
                  type="checkbox"
                  checked={pdfSubdivide4x4}
                  onChange={e => setPdfSubdivide4x4(e.target.checked)}
                />
              </>
            )}
          </div>
        </div>

        {/* Nút mở modal nâng cao */}
        <div
          className="section"
          style={{
            display: 'flex',
            gap: 8,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <button className="btn" onClick={() => setSettingsOpen(true)}>
            ⚙️ Cài đặt nâng cao
          </button>
          <div className="muted">Ký tự hiện có: {chars.length}</div>
        </div>

        {/* Modal (các tuỳ chọn chi tiết) */}
        <SettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          inputStr={inputStr}
          setInputStr={setInputStr}
          chars={chars}
          selected={selected}
          setSelected={setSelected}
          size={size}
          setSize={setSize}
          strokeColor={strokeColor}
          setStrokeColor={setStrokeColor}
          radicalColor={radicalColor}
          setRadicalColor={setRadicalColor}
          showOutline={showOutline}
          setShowOutline={setShowOutline}
          showChar={showChar}
          setShowChar={setShowChar}
          speed={speed}
          setSpeed={setSpeed}
          delayBetweenStrokes={delayBetweenStrokes}
          setDelayBetweenStrokes={setDelayBetweenStrokes}
          renderer={renderer}
          setRenderer={setRenderer}
          gridEnabled={gridEnabled}
          setGridEnabled={setGridEnabled}
          exportMult={exportMult}
          setExportMult={setExportMult}
          exportFps={exportFps}
          setExportFps={setExportFps}
          exportBitrateKbps={exportBitrateKbps}
          setExportBitrateKbps={setExportBitrateKbps}
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
          value={{
            inputStr,
            size,
            strokeColor,
            radicalColor,
            showOutline,
            showChar,
            speed,
            delayBetweenStrokes,
            renderer,
            exportMult,
            exportFps,
            exportBitrateKbps,
            gridEnabled,
            pdfPageSize,
            pdfOrientation,
            pdfCols,
            pdfMarginMm,
            pdfIncludeDiagonals,
            pdfShowFaint,
            pdfFaintAlpha,
            pdfSourceMode,
            pdfTitle,
          }}
          onApply={v => {
            setInputStr(v.inputStr);
            setSize(v.size);
            setStrokeColor(v.strokeColor);
            setRadicalColor(v.radicalColor);
            setShowOutline(v.showOutline);
            setShowChar(v.showChar);
            setSpeed(v.speed);
            setDelayBetweenStrokes(v.delayBetweenStrokes);
            setRenderer(v.renderer);
            setExportMult(v.exportMult);
            setExportFps(v.exportFps);
            setExportBitrateKbps(v.exportBitrateKbps);
            setGridEnabled(v.gridEnabled);
            setPdfPageSize(v.pdfPageSize);
            setPdfOrientation(v.pdfOrientation);
            setPdfCols(v.pdfCols);
            setPdfMarginMm(v.pdfMarginMm);
            setPdfIncludeDiagonals(v.pdfIncludeDiagonals);
            setPdfShowFaint(v.pdfShowFaint);
            setPdfFaintAlpha(v.pdfFaintAlpha);
            setPdfSourceMode(v.pdfSourceMode);
            setPdfTitle(v.pdfTitle);
          }}
        />

        {/* Sân khấu animation */}
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
          showGrid={gridEnabled}
          busyMsg={busyMsg}
          gridMode={pdfGridMode}
          subdividePerCell4x4={pdfSubdivide4x4}
          includeDiagonals={pdfIncludeDiagonals}
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

        <StepsGrid
          selected={selected}
          strokeColor={strokeColor}
          gridEnabled={gridEnabled}
          gridMode={pdfGridMode}
          subdividePerCell4x4={false}
          includeDiagonals={pdfIncludeDiagonals}
        />

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
          gridEnabled={gridEnabled}
          setGridEnabled={setGridEnabled}
          pdfGridMode={pdfGridMode}
          setPdfGridMode={setPdfGridMode}
          pdfSubdivide4x4={pdfSubdivide4x4}
          setPdfSubdivide4x4={setPdfSubdivide4x4}
        />

        {/* ===== NEW: Nút tải PDF loạt chữ ===== */}
        <div
          className="section"
          style={{ display: 'flex', gap: 8, justifyContent: 'center' }}
        >
          <button
            className="btn"
            onClick={exportBatchPdfCombined}
            disabled={!chars.length}
          >
            📄 Tải PDF (gộp, {chars.length})
          </button>
          <button
            className="btn secondary"
            onClick={exportBatchPdfZip}
            disabled={!chars.length}
          >
            🗜️ Tải ZIP (PDF, {chars.length})
          </button>
        </div>

        {/* Hidden mount cho xuất video */}
        <div
          ref={hiddenMountRef}
          style={{ position: 'absolute', left: -99999, top: -99999 }}
        />
      </div>
    </div>
  );
}
