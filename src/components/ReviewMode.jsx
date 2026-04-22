/* eslint-disable no-empty */
/* eslint-disable no-unused-vars */
import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from 'react';
import { loadCharCategories } from '../utils/charLists';

/*
  ReviewMode.jsx — v2 nâng cấp
  ─────────────────────────────────────────────────────────────────
  CẢI TIẾN CHÍNH:
  1. Spaced-repetition nhẹ: ưu tiên những chữ sai nhiều (mistakeMap)
  2. Chế độ "Ôn từ sai" — chỉ lấy những chữ đã từng sai trong session
  3. Setup UX: gợi ý chiến lược ôn tập (nhanh / sâu / từ sai)
  4. Kết quả đẹp: tỉ lệ đúng, phân loại Giỏi/Ổn/Yếu, nút "Ôn từ sai"
  5. Progress bar đẹp trong khi làm bài
  6. Hiển thị category và stroke count khi làm bài
  7. Animation stagger khi setup và kết quả
  8. checkReading dùng normalize linh hoạt hơn (chấp nhận âm đọc phụ)
  ─────────────────────────────────────────────────────────────────
*/

/* ── helpers ─────────────────────────────────────────────────────── */
const normalize = s => (s || '').toLowerCase().trim().replace(/\s+/g, ' ');

/** Chuẩn hoá và so sánh linh hoạt — chấp nhận bất kỳ âm nào trong label */
const checkReadingMatch = (q, input) => {
  const inp = normalize(input);
  if (!inp) return false;
  // label có thể là "tín / tín tức" — tách và so sánh từng phần
  const parts = (q.label || '')
    .toLowerCase()
    .split(/[/,;|]+/)
    .map(p => p.trim());
  return parts.some(p => p === inp || p.includes(inp) || inp.includes(p));
};

/** Reservoir sampling */
const reservoirSample = (arr, k) => {
  const n = arr.length;
  if (k >= n) return arr.slice();
  const res = arr.slice(0, k);
  for (let i = k; i < n; i++) {
    const r = Math.floor(Math.random() * (i + 1));
    if (r < k) res[r] = arr[i];
  }
  return res;
};

/**
 * Weighted sampling: những từ sai nhiều hơn có xác suất được chọn cao hơn
 * mistakeMap: { [globalIndex]: sai_bao_nhieu_lan }
 */
const weightedSample = (arr, k, mistakeMap) => {
  if (!mistakeMap || Object.keys(mistakeMap).length === 0)
    return reservoirSample(arr, k);
  const weights = arr.map(item => 1 + (mistakeMap[item.globalIndex] || 0) * 2);
  const total = weights.reduce((a, b) => a + b, 0);
  const picked = [];
  const used = new Set();
  const safeLimit = k * 10;
  let tries = 0;
  while (picked.length < k && picked.length < arr.length && tries < safeLimit) {
    tries++;
    let r = Math.random() * total;
    for (let i = 0; i < arr.length; i++) {
      r -= weights[i];
      if (r <= 0 && !used.has(i)) {
        used.add(i);
        picked.push(arr[i]);
        break;
      }
    }
  }
  // fill nếu thiếu
  if (picked.length < k) {
    for (let i = 0; i < arr.length && picked.length < k; i++) {
      if (!used.has(i)) picked.push(arr[i]);
    }
  }
  return picked;
};

/* ── Màu sắc grade ─────────────────────────────────────────────── */
const gradeColor = pct =>
  pct >= 80 ? '#16a34a' : pct >= 50 ? '#d97706' : '#dc2626';
const gradeLabel = pct =>
  pct >= 80 ? '🎉 Xuất sắc!' : pct >= 50 ? '👍 Ổn!' : '💪 Cần luyện thêm!';

/* ── STRATEGY CARDS ─────────────────────────────────────────────── */
const STRATEGIES = [
  {
    id: 'quick',
    emoji: '⚡',
    title: 'Ôn nhanh',
    desc: '10 câu, hỗn hợp, không giới hạn thời gian',
    mode: 'mixed',
    count: 10,
    time: 0,
  },
  {
    id: 'deep',
    emoji: '🧠',
    title: 'Ôn sâu',
    desc: '30 câu, hỗn hợp, có tính điểm',
    mode: 'mixed',
    count: 30,
    time: 0,
  },
  {
    id: 'speed',
    emoji: '⏱',
    title: 'Luyện tốc độ',
    desc: '20 câu, chỉ đọc, 8 giây / câu',
    mode: 'read',
    count: 20,
    time: 8,
  },
  {
    id: 'write',
    emoji: '✍️',
    title: 'Luyện viết',
    desc: '15 câu, chỉ viết',
    mode: 'write',
    count: 15,
    time: 0,
  },
];

/* ════════════════════════════════════════════════════════════════════
   COMPONENT
   ════════════════════════════════════════════════════════════════════ */
export default function ReviewMode() {
  /* ── Data ─────────────────────────────────────────────────────── */
  const [flatList, setFlatList] = useState([]);
  const [categories, setCategories] = useState([]); // raw cats array
  const [progressIndex, setProgressIndex] = useState(0);

  /* ── Scope: 'all' | 'range' | 'categories' ──────────────────── */
  const [selectionMode, setSelectionMode] = useState('all');
  const [rangeStart, setRangeStart] = useState(0);
  const [rangeEnd, setRangeEnd] = useState(0);
  const [selectedCats, setSelectedCats] = useState(new Set());

  /* ── Settings ─────────────────────────────────────────────────── */
  const [reviewMode, setReviewMode] = useState('mixed');
  const [questionCount, setQuestionCount] = useState(10);
  const [timeLimit, setTimeLimit] = useState(0);
  const [selectedStrategy, setSelectedStrategy] = useState('quick');

  /* ── Mistake memory (persists across sessions within page load) ── */
  const [mistakeMap, setMistakeMap] = useState({}); // { globalIndex: count }
  const [mistakePool, setMistakePool] = useState([]); // items sai lần trước

  /* ── Game state ──────────────────────────────────────────────── */
  const [status, setStatus] = useState('setup');
  const [questions, setQuestions] = useState([]);
  const questionsRef = useRef([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const currentIndexRef = useRef(0);
  const [results, setResults] = useState([]);
  const [score, setScore] = useState(0);

  /* ── Per-question UI ─────────────────────────────────────────── */
  const [userInput, setUserInput] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [showHint, setShowHint] = useState(false);
  const [showMeaning, setShowMeaning] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);

  /* ── HanziWriter ─────────────────────────────────────────────── */
  const writerRef = useRef(null);
  const writerInstance = useRef(null);
  const hanziModuleRef = useRef(null);
  const [writerLoading, setWriterLoading] = useState(false);

  /* ── Locks ───────────────────────────────────────────────────── */
  const lockRef = useRef(false);

  /* ── Writer size ─────────────────────────────────────────────── */
  const [writerSize, setWriterSize] = useState(() => {
    const w =
      typeof window !== 'undefined'
        ? Math.floor(window.innerWidth * 0.72)
        : 260;
    return Math.max(140, Math.min(360, w));
  });

  /* ── Load data ───────────────────────────────────────────────── */
  useEffect(() => {
    const cats = loadCharCategories() || [];
    const flattened = [];
    let idx = 0;
    cats.forEach(cat => {
      (cat.items || []).forEach(item => {
        flattened.push({ ...item, categoryName: cat.label, globalIndex: idx++ });
      });
    });
    setFlatList(flattened);
    setCategories(cats);
    if (flattened.length > 0) {
      setProgressIndex(flattened.length - 1);
      setRangeEnd(flattened.length - 1);
    }
    // default: select all categories
    setSelectedCats(new Set(cats.map(c => c.label)));
  }, []);

  /* ── Sync refs ───────────────────────────────────────────────── */
  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);
  useEffect(() => { questionsRef.current = questions; }, [questions]);

  /* ── Resize ──────────────────────────────────────────────────── */
  useEffect(() => {
    const onResize = () => {
      const w = Math.floor(window.innerWidth * 0.72);
      setWriterSize(Math.max(140, Math.min(360, w)));
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  /* ── Pool — filtered by selectionMode ───────────────────────── */
  const pool = useMemo(() => {
    if (selectionMode === 'range') {
      const lo = Math.min(rangeStart, rangeEnd);
      const hi = Math.max(rangeStart, rangeEnd);
      return flatList.filter(item => item.globalIndex >= lo && item.globalIndex <= hi);
    }
    if (selectionMode === 'categories') {
      return flatList.filter(item => selectedCats.has(item.categoryName));
    }
    // 'all': respect progressIndex
    return flatList.slice(0, progressIndex + 1);
  }, [flatList, selectionMode, rangeStart, rangeEnd, selectedCats, progressIndex]);

  /* ── Apply strategy preset ───────────────────────────────────── */
  const applyStrategy = useCallback(
    s => {
      setSelectedStrategy(s.id);
      setReviewMode(s.mode);
      setQuestionCount(Math.min(s.count, pool.length || s.count));
      setTimeLimit(s.time);
    },
    [pool.length],
  );

  /* ── Start quiz ──────────────────────────────────────────────── */
  const startQuiz = useCallback(
    (fromMistakes = false) => {
      const sourcePool = fromMistakes ? mistakePool : pool;
      if (!sourcePool || sourcePool.length === 0) {
        alert(
          fromMistakes
            ? 'Chưa có từ sai để ôn lại!'
            : 'Chưa có dữ liệu để ôn tập',
        );
        return;
      }
      const useCount = Math.max(
        1,
        Math.min(questionCount || 1, sourcePool.length),
      );
      const picked = fromMistakes
        ? reservoirSample(sourcePool, useCount) // mistake pool: uniform
        : weightedSample(sourcePool, useCount, mistakeMap); // ưu tiên từ sai

      const quiz = picked.map(item => {
        let type = reviewMode;
        if (reviewMode === 'mixed') type = Math.random() < 0.5 ? 'read' : 'write';
        return { ...item, type };
      });

      setResults([]);
      setScore(0);
      setCurrentIndex(0);
      currentIndexRef.current = 0;
      setQuestions(quiz);
      setTimeout(() => {
        if (quiz && quiz.length > 0) setStatus('playing');
      }, 0);
    },
    [pool, mistakePool, questionCount, reviewMode, mistakeMap],
  );

  /* ── Destroy writer ──────────────────────────────────────────── */
  const destroyWriter = useCallback(() => {
    try {
      if (writerInstance.current) {
        try { writerInstance.current.cancelQuiz?.(); } catch {}
        try { writerInstance.current.clear?.(); } catch {}
      }
      if (writerRef.current) writerRef.current.innerHTML = '';
    } catch {}
    writerInstance.current = null;
  }, []);

  /* ── Init writer ─────────────────────────────────────────────── */
  const initWriterForQuestion = useCallback(
    async q => {
      if (!writerRef.current) return;
      destroyWriter();

      if (!hanziModuleRef.current) {
        setWriterLoading(true);
        try {
          const mod = await import('hanzi-writer');
          hanziModuleRef.current = mod.default || mod;
        } catch (err) {
          console.error('Không thể tải hanzi-writer:', err);
          setWriterLoading(false);
          return;
        } finally {
          setWriterLoading(false);
        }
      }
      if (!q) return;

      const HanziWriter = hanziModuleRef.current;
      const size = writerSize;
      const scale = size / 260;
      const drawingWidth = Math.max(8, Math.round(18 * scale));
      const padding = Math.max(4, Math.round(8 * scale));

      try {
        writerInstance.current = HanziWriter.create(writerRef.current, q.value, {
          width: size,
          height: size,
          padding,
          showOutline: false,
          showCharacter: false,
          strokeColor: '#1e3a5f',
          radicalColor: '#16a34a',
          outlineColor: '#d1d5db',
          drawingWidth,
          highlightOnComplete: true,
          delayBetweenStrokes: Math.max(120, Math.round(260 / scale)),
        });
        writerInstance.current.quiz({
          onMistake: () => {},
          onComplete: () => handleAnswer(true, q),
        });
      } catch (err) {
        console.error('Init writer failed', err);
      }
    },
    [writerSize, destroyWriter],
  );

  /* ── Prepare question ────────────────────────────────────────── */
  const prepareQuestionForIndex = useCallback(
    index => {
      setUserInput('');
      setFeedback(null);
      setShowHint(false);
      setShowMeaning(false);
      setTimeLeft(timeLimit > 0 ? timeLimit : 0);
      destroyWriter();

      const q = questionsRef.current[index];
      if (!q) return;
      if (q.type === 'write') {
        setTimeout(() => initWriterForQuestion(q), 60);
      } else {
        if (writerRef.current) writerRef.current.innerHTML = '';
      }
    },
    [timeLimit, destroyWriter, initWriterForQuestion],
  );

  /* ── Re-init on resize ───────────────────────────────────────── */
  useEffect(() => {
    if (status !== 'playing') return;
    const q = questionsRef.current[currentIndex];
    if (q?.type === 'write') initWriterForQuestion(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [writerSize]);

  /* ── Prepare on index/status change ─────────────────────────── */
  useEffect(() => {
    if (status !== 'playing') return;
    if (!questionsRef.current?.length) return;
    if (currentIndex < 0 || currentIndex >= questionsRef.current.length) return;
    prepareQuestionForIndex(currentIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, currentIndex]);

  /* ── Timer ───────────────────────────────────────────────────── */
  useEffect(() => {
    if (status !== 'playing' || timeLimit <= 0) return;
    setTimeLeft(timeLimit);
    let id = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(id);
          const q = questionsRef.current[currentIndexRef.current];
          if (q) handleAnswer(false, q);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, status, timeLimit]);

  /* ── Handle answer ───────────────────────────────────────────── */
  const handleAnswer = useCallback(
    (isCorrect, q) => {
      if (lockRef.current) return;
      lockRef.current = true;

      const qlist = questionsRef.current || [];

      /* Cập nhật mistakeMap nếu sai */
      if (!isCorrect) {
        setMistakeMap(prev => ({
          ...prev,
          [q.globalIndex]: (prev[q.globalIndex] || 0) + 1,
        }));
        setMistakePool(prev => {
          const exists = prev.find(x => x.globalIndex === q.globalIndex);
          return exists ? prev : [...prev, q];
        });
      }

      setResults(prev => [
        ...prev,
        { ...q, isCorrect, userAnswer: q.type === 'read' ? userInput : '(viết)' },
      ]);

      if (isCorrect) {
        setScore(s => s + 1);
        setFeedback('correct');
        setShowMeaning(false);
      } else {
        setFeedback('wrong');
        if (q.meaning) setShowMeaning(true);
        if (q.type === 'write') {
          try { writerInstance.current?.showCharacter(); } catch {}
        }
      }

      setTimeout(() => {
        lockRef.current = false;
        const next = currentIndexRef.current + 1;
        if (!qlist || next >= qlist.length) {
          setStatus('finished');
          destroyWriter();
        } else {
          currentIndexRef.current = next;
          setCurrentIndex(next);
        }
      }, 1100);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userInput, destroyWriter],
  );

  /* ── Check reading ───────────────────────────────────────────── */
  const checkReading = useCallback(() => {
    const q = questionsRef.current[currentIndexRef.current];
    if (!q) return;
    const ok = checkReadingMatch(q, userInput);
    handleAnswer(ok, q);
  }, [userInput, handleAnswer]);

  /* ── Skip ────────────────────────────────────────────────────── */
  const skipQuestion = useCallback(() => {
    const q = questionsRef.current[currentIndexRef.current];
    if (!q) return;
    handleAnswer(false, q);
  }, [handleAnswer]);

  /* ── Toggle meaning ──────────────────────────────────────────── */
  const toggleMeaning = useCallback(() => setShowMeaning(s => !s), []);

  /* ════════════════════════════════════════════════════════════════
     RENDER — SETUP
     ════════════════════════════════════════════════════════════════ */
  if (status === 'setup') {
    return (
      <div className="review-container">
        <h2>Cài đặt ôn tập</h2>

        {/* ── Strategy cards ── */}
        <div className="strategy-grid">
          {STRATEGIES.map(s => (
            <button
              key={s.id}
              className={`strategy-card${selectedStrategy === s.id ? ' selected' : ''}`}
              onClick={() => applyStrategy(s)}
              title={s.desc}
            >
              <span className="strategy-emoji">{s.emoji}</span>
              <span className="strategy-title">{s.title}</span>
              <span className="strategy-desc">{s.desc}</span>
            </button>
          ))}
        </div>

        {/* ── Mistake pool shortcut ── */}
        {mistakePool.length > 0 && (
          <button
            className="btn-mistake"
            onClick={() => startQuiz(true)}
            style={{ marginBottom: 12 }}
          >
            🔴 Ôn từ sai ({mistakePool.length} chữ)
          </button>
        )}

        {/* ══════════════════════════════════════════════════════
             PHẠM VI ÔN TẬP
             ══════════════════════════════════════════════════════ */}
        <div className="scope-section">
          <div className="scope-label">📚 Phạm vi ôn tập</div>

          {/* Tab switcher */}
          <div className="scope-tabs">
            {[
              { id: 'all',        icon: '🗂', text: 'Toàn bộ' },
              { id: 'range',      icon: '🔢', text: 'Khoảng số' },
              { id: 'categories', icon: '📁', text: 'Theo chủ đề' },
            ].map(tab => (
              <button
                key={tab.id}
                className={`scope-tab${selectionMode === tab.id ? ' active' : ''}`}
                onClick={() => setSelectionMode(tab.id)}
              >
                {tab.icon} {tab.text}
              </button>
            ))}
          </div>

          {/* ── ALL: progress slider ── */}
          {selectionMode === 'all' && (
            <div className="scope-body">
              <div className="scope-info">
                Ôn tất cả từ #1 đến #{progressIndex + 1}
                {' '}({progressIndex + 1} chữ)
              </div>
              <div className="range-row">
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, flatList.length - 1)}
                  value={progressIndex}
                  onChange={e => setProgressIndex(Number(e.target.value))}
                  style={{ flex: 1 }}
                />
                <input
                  type="number"
                  min={1}
                  max={flatList.length}
                  value={progressIndex + 1}
                  onChange={e => {
                    const v = Math.max(1, Math.min(flatList.length, Number(e.target.value) || 1));
                    setProgressIndex(v - 1);
                  }}
                  style={{ width: 68 }}
                />
              </div>
              {flatList[progressIndex] && (
                <div className="scope-char-preview">
                  #{progressIndex + 1} — {String(flatList[progressIndex].label).slice(0, 48)}
                </div>
              )}
            </div>
          )}

          {/* ── RANGE: from–to picker ── */}
          {selectionMode === 'range' && (
            <div className="scope-body">
              <div className="scope-info">
                Chọn khoảng từ #{rangeStart + 1} → #{rangeEnd + 1}
                {' '}({Math.abs(rangeEnd - rangeStart) + 1} chữ)
              </div>
              <div className="range-from-to">
                <div className="range-bound">
                  <span className="bound-label">Từ #</span>
                  <input
                    type="number"
                    min={1}
                    max={flatList.length}
                    value={rangeStart + 1}
                    onChange={e => {
                      const v = Math.max(1, Math.min(flatList.length, Number(e.target.value) || 1));
                      setRangeStart(v - 1);
                    }}
                  />
                  {flatList[rangeStart] && (
                    <span className="bound-char">{flatList[rangeStart].value}</span>
                  )}
                </div>
                <span className="range-arrow">→</span>
                <div className="range-bound">
                  <span className="bound-label">Đến #</span>
                  <input
                    type="number"
                    min={1}
                    max={flatList.length}
                    value={rangeEnd + 1}
                    onChange={e => {
                      const v = Math.max(1, Math.min(flatList.length, Number(e.target.value) || 1));
                      setRangeEnd(v - 1);
                    }}
                  />
                  {flatList[rangeEnd] && (
                    <span className="bound-char">{flatList[rangeEnd].value}</span>
                  )}
                </div>
              </div>
              <div className="range-slider-group">
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, flatList.length - 1)}
                  value={rangeStart}
                  onChange={e => setRangeStart(Number(e.target.value))}
                  style={{ flex: 1, accentColor: '#22c55e' }}
                />
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, flatList.length - 1)}
                  value={rangeEnd}
                  onChange={e => setRangeEnd(Number(e.target.value))}
                  style={{ flex: 1, accentColor: '#16a34a' }}
                />
              </div>
            </div>
          )}

          {/* ── CATEGORIES: checkbox list ── */}
          {selectionMode === 'categories' && (
            <div className="scope-body">
              <div className="cat-toolbar">
                <button className="cat-btn-all" onClick={() =>
                  setSelectedCats(new Set(categories.map(c => c.label)))
                }>✓ Tất cả</button>
                <button className="cat-btn-none" onClick={() =>
                  setSelectedCats(new Set())
                }>✗ Bỏ hết</button>
                <span className="cat-count">{selectedCats.size}/{categories.length} chủ đề · {pool.length} chữ</span>
              </div>
              <div className="cat-list">
                {categories.map(cat => {
                  const checked = selectedCats.has(cat.label);
                  const itemCount = (cat.items || []).length;
                  return (
                    <label key={cat.label} className={`cat-item${checked ? ' checked' : ''}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setSelectedCats(prev => {
                            const next = new Set(prev);
                            if (checked) next.delete(cat.label);
                            else next.add(cat.label);
                            return next;
                          });
                        }}
                      />
                      <span className="cat-item-name">{cat.label}</span>
                      <span className="cat-item-count">{itemCount} chữ</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ══════════════════════════════════════════════════════
             TUỲ CHỈNH CHẾ ĐỘ & SỐ CÂU
             ══════════════════════════════════════════════════════ */}
        <details className="manual-config" open={false}>
          <summary>⚙️ Tuỳ chỉnh chế độ & số câu</summary>

          <label style={{ marginTop: 12 }}>Chế độ</label>
          <select
            className="select-box"
            value={reviewMode}
            onChange={e => setReviewMode(e.target.value)}
          >
            <option value="read">Đọc (nhìn chữ → gõ âm)</option>
            <option value="write">Viết (nhìn âm → viết chữ)</option>
            <option value="mixed">Hỗn hợp</option>
          </select>

          <div className="row" style={{ marginTop: 12 }}>
            <div>
              <label>Số câu</label>
              <input
                className="input-field"
                type="number"
                min={1}
                max={Math.max(1, pool.length)}
                value={questionCount}
                onChange={e =>
                  setQuestionCount(
                    Math.max(1, Math.min(pool.length || 9999, Number(e.target.value) || 1)),
                  )
                }
              />
            </div>
            <div>
              <label>Giây / câu (0 = vô hạn)</label>
              <input
                className="input-field"
                type="number"
                min={0}
                value={timeLimit}
                onChange={e => setTimeLimit(Number(e.target.value) || 0)}
              />
            </div>
          </div>
        </details>

        <button
          className="btn-primary"
          onClick={() => startQuiz(false)}
          style={{ marginTop: 16 }}
        >
          Bắt đầu
        </button>

        <div className="hint-text">
          Lưu ý: module viết chữ chỉ tải khi cần — tránh lag khi bắt đầu.
        </div>
      </div>
    );
  }

  /* ════════════════════════════════════════════════════════════════
     RENDER — FINISHED
     ════════════════════════════════════════════════════════════════ */
  if (status === 'finished') {
    const total = questionsRef.current.length;
    const pct = total > 0 ? Math.round((score / total) * 100) : 0;
    const wrongItems = results.filter(r => !r.isCorrect);

    return (
      <div className="review-container center">
        <h2>Kết quả</h2>

        {/* Score ring */}
        <div className="score-ring" style={{ '--pct': pct, '--color': gradeColor(pct) }}>
          <svg viewBox="0 0 120 120" width="120" height="120">
            <circle cx="60" cy="60" r="50" fill="none" stroke="#e5e7eb" strokeWidth="10" />
            <circle
              cx="60" cy="60" r="50" fill="none"
              stroke={gradeColor(pct)} strokeWidth="10"
              strokeDasharray={`${(pct / 100) * 314} 314`}
              strokeLinecap="round"
              transform="rotate(-90 60 60)"
              style={{ transition: 'stroke-dasharray 0.8s ease' }}
            />
          </svg>
          <div className="score-inner">
            <span className="score-num" style={{ color: gradeColor(pct) }}>{score}</span>
            <span className="score-denom">/{total}</span>
          </div>
        </div>

        <div className="grade-label" style={{ color: gradeColor(pct) }}>
          {gradeLabel(pct)} ({pct}%)
        </div>

        {/* Stats bar */}
        <div className="stats-row">
          <div className="stat-chip ok">✓ {score} đúng</div>
          <div className="stat-chip bad">✗ {total - score} sai</div>
        </div>

        {/* Ôn từ sai shortcut */}
        {wrongItems.length > 0 && (
          <button
            className="btn-mistake"
            style={{ marginBottom: 12 }}
            onClick={() => {
              setReviewMode('mixed');
              setQuestionCount(wrongItems.length);
              startQuiz(true);
            }}
          >
            🔴 Ôn lại {wrongItems.length} từ sai ngay
          </button>
        )}

        {/* Result list */}
        <div className="result-list">
          {results.map((r, i) => (
            <div key={i} className={`result-row ${r.isCorrect ? 'ok' : 'bad'}`}>
              <div className="char-icon">{r.value}</div>
              <div className="result-info">
                <div className="result-label">{r.label}</div>
                <div className="result-sub">
                  {r.reading ? `(${r.reading})` : ''}
                  {r.meaning ? ` — ${r.meaning}` : ''}
                </div>
                {!r.isCorrect && r.userAnswer && r.type === 'read' && (
                  <div className="result-wrong-ans">Bạn nhập: "{r.userAnswer}"</div>
                )}
              </div>
              <div className="result-badge">{r.isCorrect ? '✓' : '✗'}</div>
            </div>
          ))}
        </div>

        <div className="btn-row" style={{ marginTop: 18 }}>
          <button
            className="btn-secondary"
            onClick={() => {
              setStatus('setup');
              destroyWriter();
            }}
          >
            Cài đặt lại
          </button>
          <button
            className="btn-primary"
            onClick={() => startQuiz(false)}
          >
            Làm lại
          </button>
        </div>
      </div>
    );
  }

  /* ════════════════════════════════════════════════════════════════
     RENDER — PLAYING
     ════════════════════════════════════════════════════════════════ */
  const q = questionsRef.current[currentIndex] || {};
  const totalQ = questionsRef.current.length;
  const progressPct = totalQ > 0 ? ((currentIndex) / totalQ) * 100 : 0;
  const timerPct = timeLimit > 0 ? (timeLeft / timeLimit) * 100 : 100;
  const timerColor = timeLeft < 5 ? '#dc2626' : timeLeft < 10 ? '#d97706' : '#16a34a';

  return (
    <div className="review-container playing">
      {/* ── Header ── */}
      <div className="quiz-header">
        <div className="quiz-counter">
          <span className="counter-cur">{currentIndex + 1}</span>
          <span className="counter-sep">/</span>
          <span className="counter-total">{totalQ}</span>
        </div>
        {q.categoryName && (
          <div className="quiz-category">{q.categoryName}</div>
        )}
        {timeLimit > 0 && (
          <div className="timer-badge" style={{ color: timerColor, borderColor: timerColor }}>
            ⏱ {timeLeft}s
          </div>
        )}
      </div>

      {/* ── Progress bars ── */}
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${progressPct}%` }} />
      </div>
      {timeLimit > 0 && (
        <div className="timer-track">
          <div
            className="timer-fill"
            style={{ width: `${timerPct}%`, background: timerColor }}
          />
        </div>
      )}

      {/* ── Type badge ── */}
      <div className="type-badge">
        {q.type === 'read' ? '👁 Nhìn → Gõ âm' : '✍️ Nghe → Viết chữ'}
      </div>

      {/* ── READ mode ── */}
      {q.type === 'read' ? (
        <>
          <div className="big-char">{q.value}</div>

          <div style={{ textAlign: 'center', marginBottom: 8 }}>
            <button className="btn-small" onClick={toggleMeaning}>
              {showMeaning ? '🙈 Ẩn nghĩa' : '💡 Xem nghĩa'}
            </button>
          </div>

          {showMeaning && q.meaning && (
            <div className="meaning-box">{q.meaning}</div>
          )}

          {!feedback ? (
            <div className="input-group">
              <input
                autoFocus
                className="input-field big-input"
                placeholder="Nhập âm Hán Việt..."
                value={userInput}
                onChange={e => setUserInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && checkReading()}
              />
              <button className="btn-check" onClick={checkReading}>
                Kiểm tra
              </button>
            </div>
          ) : (
            <div className={`feedback-msg ${feedback}`}>
              {feedback === 'correct'
                ? '✓ Chính xác!'
                : `✗ Sai! Đáp án: ${q.label}${q.reading ? ' (' + q.reading + ')' : ''}`}
            </div>
          )}
        </>
      ) : (
        /* ── WRITE mode ── */
        <>
          <div className="write-prompt">
            <div className="write-reading">{q.reading || q.label || '—'}</div>
            {q.label && q.reading && (
              <div className="write-label-hint">{q.label}</div>
            )}
          </div>

          <div style={{ textAlign: 'center', marginBottom: 8 }}>
            <button className="btn-small" onClick={toggleMeaning}>
              {showMeaning ? '🙈 Ẩn nghĩa' : '💡 Xem nghĩa'}
            </button>
          </div>

          {(showMeaning || feedback === 'wrong') && q.meaning && (
            <div className="meaning-box">{q.meaning}</div>
          )}

          <div
            className="writer-box"
            style={{ width: writerSize, height: writerSize, maxWidth: '90vw', maxHeight: '90vw' }}
          >
            <div ref={writerRef} style={{ width: '100%', height: '100%' }} />
            {writerLoading && (
              <div className="writer-loading">Đang tải mẫu...</div>
            )}
          </div>

          {!feedback ? (
            <div className="controls-row" style={{ marginTop: 8 }}>
              <button
                className="btn-small"
                onClick={() => {
                  try { writerInstance.current?.animateCharacter(); } catch {}
                }}
                disabled={writerLoading}
              >
                🎬 Xem mẫu
              </button>
              <button className="btn-small danger" onClick={skipQuestion}>
                ⏭ Bỏ qua
              </button>
            </div>
          ) : (
            <div className={`feedback-msg ${feedback}`} style={{ marginTop: 8 }}>
              {feedback === 'correct' ? '✓ Đúng rồi!' : '✗ Sai rồi! Xem lại nét chữ phía trên.'}
            </div>
          )}
        </>
      )}
    </div>
  );
}
