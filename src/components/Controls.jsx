import React from 'react';
import { clamp } from '../utils/misc';

export default function Controls(props) {
  const {
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
    gridEnabled,
    setGridEnabled,
  } = props;

  return (
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
            setSize(clamp(parseInt(e.target.value) || 420, 120, 420))
          }
        />
      </div>

      <div className="row">
        <label>Màu nét</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            className="input"
            type="color"
            value={strokeColor}
            onChange={e => setStrokeColor(e.target.value)}
          />
          <input
            className="input"
            style={{
              width: 96,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              textTransform: 'uppercase',
            }}
            value={String(strokeColor || '').toUpperCase()}
            onChange={e => {
              const v = e.target.value.trim();
              if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) setStrokeColor(v);
            }}
            placeholder="#111111"
          />
        </div>
      </div>

      <div className="row">
        <label>Màu bộ thủ</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            className="input"
            type="color"
            value={radicalColor}
            onChange={e => setRadicalColor(e.target.value)}
          />
          <input
            className="input"
            style={{
              width: 96,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              textTransform: 'uppercase',
            }}
            value={String(radicalColor || '').toUpperCase()}
            onChange={e => {
              const v = e.target.value.trim();
              if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) setRadicalColor(v);
            }}
            placeholder="#888888"
          />
        </div>
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
          onChange={e => setDelayBetweenStrokes(parseInt(e.target.value) || 0)}
        />
      </div>
      <div className="row">
        <label>Lưới căn nét</label>
        <label>
          <input
            className="checkbox"
            type="checkbox"
            checked={gridEnabled}
            onChange={e => setGridEnabled(e.target.checked)}
          />{' '}
          Hiện lưới (áp dụng cho animation, video, PDF)
        </label>
      </div>

      <details className="advanced" about="Cài đặt nâng cao">
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
      </details>

      {busyMsg && <div className="muted">{busyMsg}</div>}
      {error && <div className="bad">{error}</div>}
    </div>
  );
}
