// src/components/CharSourceBar.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { loadCharsetFiles } from '../utils/charsets';

const MODE_MANUAL = 'manual';
const MODE_FILE = 'file';

export default function CharSourceBar({
  // manual
  inputStr,
  setInputStr,
  // selection
  selected,
  setSelected,
  // expose computed active chars lên App
  setActiveCharsExternal,
}) {
  const [mode, setMode] = useState(MODE_MANUAL);
  const [{ list, map }, setData] = useState({ list: [], map: {} });
  const [fileId, setFileId] = useState('');

  useEffect(() => {
    // load danh sách file một lần
    const { list, map } = loadCharsetFiles();
    setData({ list, map });
    if (list.length && !fileId) setFileId(list[0].id);
  }, []);

  // chars thủ công
  const manualChars = useMemo(() => {
    const arr = Array.from((inputStr || '').replace(/\s+/g, '')).filter(
      Boolean,
    );
    const uniq = [];
    for (const ch of arr) if (!uniq.includes(ch)) uniq.push(ch);
    return uniq.slice(0, 32);
  }, [inputStr]);

  // chars từ file
  const fileChars = useMemo(() => {
    if (!fileId || !map[fileId]) return [];
    return map[fileId].chars.slice(0, 32);
  }, [fileId, map]);

  // danh sách “đang dùng thực tế”
  const activeChars = mode === MODE_FILE ? fileChars : manualChars;

  // thông báo lên App để App dùng cho ZIP/PDF…
  useEffect(() => {
    setActiveCharsExternal?.(activeChars);
  }, [activeChars, setActiveCharsExternal]);

  // luôn giữ selected hợp lệ
  useEffect(() => {
    if (!activeChars.length) return;
    if (!activeChars.includes(selected)) {
      setSelected(activeChars[0]);
    }
  }, [activeChars, selected, setSelected]);

  return (
    <div className="section" style={{ display: 'grid', gap: 10 }}>
      {/* Dòng 1: nhập + chọn nguồn */}
      <div className="row" style={{ alignItems: 'center', gap: 10 }}>
        <label style={{ minWidth: 130 }}>Ký tự</label>
        <input
          className="input"
          style={{ flex: 1 }}
          value={inputStr}
          onChange={e => {
            setMode(MODE_MANUAL);
            setInputStr(e.target.value);
          }}
          placeholder="Nhập trực tiếp: 佛法僧..."
        />
        <select
          className="select"
          value={mode === MODE_MANUAL ? '' : fileId}
          onChange={e => {
            const val = e.target.value;
            if (!val) {
              setMode(MODE_MANUAL);
            } else {
              setMode(MODE_FILE);
              setFileId(val);
            }
          }}
          style={{ minWidth: 220 }}
          title="Chọn từ file .txt (trong src/charsets)"
        >
          <option value="">— Từ bàn phím —</option>
          {list.map(f => (
            <option key={f.id} value={f.id}>
              {f.label} ({f.chars.length})
            </option>
          ))}
        </select>
      </div>

      {/* Dòng 2: khu vực chọn ký tự */}
      {mode === MODE_MANUAL ? (
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <label style={{ minWidth: 130 }}>Chọn ký tự</label>
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
      ) : (
        <div className="row" style={{ alignItems: 'center', gap: 10 }}>
          <label style={{ minWidth: 130 }}>Chọn ký tự</label>
          <select
            className="select"
            value={selected || ''}
            onChange={e => setSelected(e.target.value)}
            style={{ minWidth: 220 }}
          >
            {fileChars.map(ch => (
              <option key={ch} value={ch}>
                {ch}
              </option>
            ))}
          </select>
          <span className="muted">({fileChars.length} ký tự)</span>
        </div>
      )}
    </div>
  );
}
