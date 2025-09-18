// src/components/CharacterPicker.jsx
import React, { useMemo, useState } from 'react';
import Modal from './Modal';
import { loadCharCategories } from '../utils/charLists';

export default function CharacterPicker({
  open,
  onClose,
  initial = '',
  onApply,
}) {
  const [q, setQ] = useState('');
  const [tab, setTab] = useState(0);
  const groups = useMemo(() => loadCharCategories(), []);
  const [picked, setPicked] = useState(
    Array.from(initial || '').filter(Boolean),
  );

  function toggle(ch) {
    setPicked(prev => {
      const i = prev.indexOf(ch);
      if (i >= 0) {
        const c = prev.slice();
        c.splice(i, 1);
        return c;
      }
      return [...prev, ch];
    });
  }

  const filtered = useMemo(() => {
    const g = groups[tab] || { chars: [] };
    const f = q.trim();
    if (!f) return g.chars;
    return g.chars.filter(ch => ch.includes(f));
  }, [groups, tab, q]);

  return (
    <Modal open={open} onClose={onClose} title="Chọn ký tự" maxWidth={900}>
      {/* Tabs */}
      <div
        style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}
      >
        {groups.map((g, i) => (
          <button
            key={g.id}
            className={'chip' + (tab === i ? ' active' : '')}
            onClick={() => setTab(i)}
            title={`${g.name} • ${g.chars.length}`}
          >
            {g.name}
          </button>
        ))}
      </div>

      {/* Search */}
      <div style={{ display: 'flex', gap: 10, margin: '6px 0 12px' }}>
        <input
          className="input"
          style={{ flex: 1 }}
          placeholder="Tìm ký tự…"
          value={q}
          onChange={e => setQ(e.target.value)}
        />
        <span className="muted">{filtered.length} ký tự</span>
      </div>

      {/* Grid of chars */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill,minmax(44px,1fr))',
          gap: 8,
          marginBottom: 12,
        }}
      >
        {filtered.map(ch => {
          const active = picked.includes(ch);
          return (
            <button
              key={ch}
              onClick={() => toggle(ch)}
              className={'chip' + (active ? ' active' : '')}
              title={ch}
              style={{ height: 44, fontSize: 20 }}
            >
              {ch}
            </button>
          );
        })}
      </div>

      {/* Actions */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div className="muted">Đã chọn: {picked.length} ký tự</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn ghost" onClick={() => setPicked([])}>
            Xoá chọn
          </button>
          <button className="btn" onClick={() => onApply?.(picked.join(''))}>
            Dùng các ký tự này
          </button>
        </div>
      </div>
    </Modal>
  );
}
