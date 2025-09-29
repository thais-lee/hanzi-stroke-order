// src/components/SettingsModal.jsx
import React, { useState } from 'react';
import Modal from './Modal';
import CharacterPicker from './CharacterPicker';

export default function SettingsModal({ open, onClose, value, onApply }) {
  // value = object hiện tại (inputStr, tốc độ, màu sắc, …)
  const [v, setV] = useState(value);
  const [tab, setTab] = useState('basic');
  const [pickerOpen, setPickerOpen] = useState(false);

  function set(part) {
    setV(prev => ({ ...prev, ...part }));
  }
  function apply() {
    onApply?.(v);
    onClose?.();
  }

  return (
    <>
      <Modal open={open} onClose={onClose} title="Cài đặt">
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <button
            className={'chip' + (tab === 'basic' ? ' active' : '')}
            onClick={() => setTab('basic')}
          >
            Cơ bản
          </button>
          <button
            className={'chip' + (tab === 'adv' ? ' active' : '')}
            onClick={() => setTab('adv')}
          >
            Nâng cao
          </button>
          <button
            className={'chip' + (tab === 'pdf' ? ' active' : '')}
            onClick={() => setTab('pdf')}
          >
            PDF
          </button>
        </div>

        {tab === 'basic' && (
          <div className="section" style={{ border: 'none', padding: 0 }}>
            <div className="row">
              <label>Ký tự (nhập trực tiếp)</label>
              <input
                className="input"
                value={v.inputStr}
                onChange={e => set({ inputStr: e.target.value })}
                placeholder="Nhập chuỗi ký tự…"
              />
            </div>
            <div className="row">
              <label>Chọn từ danh sách</label>
              <button className="btn" onClick={() => setPickerOpen(true)}>
                Mở danh sách chữ
              </button>
            </div>

            <div className="row">
              <label>Hiển thị lưới</label>
              <input
                className="checkbox"
                type="checkbox"
                checked={v.gridEnabled}
                onChange={e => set({ gridEnabled: e.target.checked })}
              />
              &nbsp;
              <span className="muted">Áp dụng cho Animation + Video + PDF</span>
            </div>

            <div className="row">
              <label>Kích thước ô ({v.size}px)</label>
              <input
                type="range"
                className="input"
                min={120}
                max={420}
                step={10}
                value={v.size}
                onChange={e => set({ size: parseInt(e.target.value) || 220 })}
              />
            </div>

            <div className="row">
              <label>Màu nét</label>
              <input
                type="color"
                className="input"
                value={v.strokeColor}
                onChange={e => set({ strokeColor: e.target.value })}
              />
            </div>

            <div className="row">
              <label>Màu bộ thủ</label>
              <input
                type="color"
                className="input"
                value={v.radicalColor}
                onChange={e => set({ radicalColor: e.target.value })}
              />
            </div>

            <div className="row">
              <label>Hiển thị Outline</label>
              <input
                type="checkbox"
                className="checkbox"
                checked={v.showOutline}
                onChange={e => set({ showOutline: e.target.checked })}
              />
            </div>

            <div className="row">
              <label>Hiện chữ sẵn</label>
              <input
                type="checkbox"
                className="checkbox"
                checked={v.showChar}
                onChange={e => set({ showChar: e.target.checked })}
              />
            </div>

            <div className="row">
              <label>Tốc độ nét ({v.speed.toFixed(2)}x)</label>
              <input
                type="range"
                className="input"
                min={0.2}
                max={6}
                step={0.1}
                value={v.speed}
                onChange={e => set({ speed: parseFloat(e.target.value) })}
              />
            </div>

            <div className="row">
              <label>Giãn cách nét ({v.delayBetweenStrokes}ms)</label>
              <input
                type="range"
                className="input"
                min={0}
                max={1200}
                step={20}
                value={v.delayBetweenStrokes}
                onChange={e =>
                  set({ delayBetweenStrokes: parseInt(e.target.value) || 0 })
                }
              />
            </div>

            <div className="row">
              <label>Renderer</label>
              <select
                className="select"
                value={v.renderer}
                onChange={e => set({ renderer: e.target.value })}
              >
                <option value="svg">SVG (đẹp, nét)</option>
                <option value="canvas">Canvas (nhẹ, xuất video)</option>
              </select>
            </div>
          </div>
        )}

        {tab === 'adv' && (
          <div className="section" style={{ border: 'none', padding: 0 }}>
            <div className="row">
              <label>Độ phân giải xuất</label>
              <input
                type="range"
                className="input"
                min={1}
                max={6}
                step={1}
                value={v.exportMult}
                onChange={e =>
                  set({ exportMult: parseInt(e.target.value) || 1 })
                }
              />
              <span className="muted">
                {v.exportMult}× (~{Math.round(v.size * v.exportMult)}px)
              </span>
            </div>
            <div className="row">
              <label>FPS xuất</label>
              <input
                type="range"
                className="input"
                min={12}
                max={60}
                step={6}
                value={v.exportFps}
                onChange={e =>
                  set({ exportFps: parseInt(e.target.value) || 30 })
                }
              />
              <span className="muted">{v.exportFps} fps</span>
            </div>
            <div className="row">
              <label>Bitrate WebM</label>
              <input
                type="number"
                className="input number"
                min={2000}
                max={50000}
                step={500}
                value={v.exportBitrateKbps}
                onChange={e =>
                  set({ exportBitrateKbps: parseInt(e.target.value) || 12000 })
                }
              />
              <span className="muted">kbps (gợi ý 8k–16k cho 1080p)</span>
            </div>
          </div>
        )}

        {tab === 'pdf' && (
          <div className="section" style={{ border: 'none', padding: 0 }}>
            <div className="row">
              <label>Khổ giấy</label>
              <select
                className="select"
                value={v.pdfPageSize}
                onChange={e => set({ pdfPageSize: e.target.value })}
              >
                <option value="A4">A4</option>
                <option value="Letter">Letter</option>
              </select>
              <select
                className="select"
                value={v.pdfOrientation}
                onChange={e => set({ pdfOrientation: e.target.value })}
              >
                <option value="portrait">Dọc</option>
                <option value="landscape">Ngang</option>
              </select>
            </div>
            <div className="row">
              <label>Số cột</label>
              <input
                type="range"
                className="input"
                min={3}
                max={12}
                step={1}
                value={v.pdfCols}
                onChange={e => set({ pdfCols: parseInt(e.target.value) || 6 })}
              />
              <span className="muted">{v.pdfCols} cột</span>
            </div>
            <div className="row">
              <label>Lề (mm)</label>
              <input
                type="number"
                className="input number"
                min={5}
                max={30}
                step={1}
                value={v.pdfMarginMm}
                onChange={e =>
                  set({ pdfMarginMm: parseInt(e.target.value) || 12 })
                }
              />
            </div>
            <div className="row">
              <label>Chữ mẫu mờ</label>
              <label>
                <input
                  type="checkbox"
                  className="checkbox"
                  checked={v.pdfShowFaint}
                  onChange={e => set({ pdfShowFaint: e.target.checked })}
                />
                &nbsp;In kèm chữ mờ để tô
              </label>
            </div>
            <div className="row">
              <label>Cường độ chữ mờ</label>
              <input
                type="range"
                className="input"
                min={0.08}
                max={1.00}
                step={0.05}
                value={v.pdfFaintAlpha}
                onChange={e =>
                  set({ pdfFaintAlpha: parseFloat(e.target.value) || 0.2 })
                }
              />
              <span className="muted">
                {Math.round(v.pdfFaintAlpha * 100)}%
              </span>
            </div>
            <div className="row">
              <label>Nguồn chữ cho lưới</label>
              <select
                className="select"
                value={v.pdfSourceMode}
                onChange={e => set({ pdfSourceMode: e.target.value })}
              >
                <option value="selected">Lặp lại ký tự đang chọn</option>
                <option value="sequence">
                  Dùng chuỗi đã nhập (tuần tự, lặp vòng)
                </option>
              </select>
            </div>
            <div className="row">
              <label>Tiêu đề trang</label>
              <input
                className="input"
                value={v.pdfTitle}
                onChange={e => set({ pdfTitle: e.target.value })}
                placeholder="Bảng luyện viết / 书写练习"
              />
            </div>
          </div>
        )}

        <div
          style={{
            display: 'flex',
            gap: 8,
            justifyContent: 'flex-end',
            marginTop: 12,
          }}
        >
          <button className="btn ghost" onClick={onClose}>
            Huỷ
          </button>
          <button className="btn" onClick={apply}>
            Lưu cài đặt
          </button>
        </div>
      </Modal>

      <CharacterPicker
        open={pickerOpen}
        initial={v.inputStr}
        onClose={() => setPickerOpen(false)}
        onApply={chars => {
          set({ inputStr: chars });
          setPickerOpen(false);
        }}
      />
    </>
  );
}
