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
  ReviewMode.jsx - optimized + race-fix
   - dynamic import hanzi-writer when needed
   - reservoir sampling for selecting random subset
   - avoid rendering huge <select> by using range + number input
   - memoize lists and handlers
   - FIX: use questionsRef and immediate update of currentIndexRef to avoid race condition
*/

const normalize = s => (s || '').toLowerCase().trim().replace(/\s+/g, ' ');

export default function ReviewMode() {
  /* Data & settings */
  const [flatList, setFlatList] = useState([]);
  const [progressIndex, setProgressIndex] = useState(0);
  const [reviewMode, setReviewMode] = useState('mixed'); // read|write|mixed
  const [questionCount, setQuestionCount] = useState(10);
  const [timeLimit, setTimeLimit] = useState(0);

  /* Game state */
  const [status, setStatus] = useState('setup'); // setup|playing|finished
  const [questions, setQuestions] = useState([]);
  const questionsRef = useRef([]); // <-- FIX: keep ref in sync with questions
  const [currentIndex, setCurrentIndex] = useState(0);
  const currentIndexRef = useRef(0);
  const [results, setResults] = useState([]);
  const [score, setScore] = useState(0);

  /* Per-question UI */
  const [userInput, setUserInput] = useState('');
  const [feedback, setFeedback] = useState(null); // 'correct'|'wrong'|null
  const [showHint, setShowHint] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);

  /* Meaning display */
  const [showMeaning, setShowMeaning] = useState(false);

  /* HanziWriter refs */
  const writerRef = useRef(null);
  const writerInstance = useRef(null);
  const hanziModuleRef = useRef(null);
  const [writerLoading, setWriterLoading] = useState(false);

  /* Locks */
  const lockRef = useRef(false);

  /* Responsive writer size state */
  const [writerSize, setWriterSize] = useState(() => {
    const w =
      typeof window !== 'undefined'
        ? Math.floor(window.innerWidth * 0.72)
        : 260;
    return Math.max(140, Math.min(360, w));
  });

  /* Load categories once */
  useEffect(() => {
    const cats = loadCharCategories() || [];
    const flattened = [];
    let idx = 0;
    cats.forEach(cat => {
      (cat.items || []).forEach(item => {
        flattened.push({
          ...item,
          categoryName: cat.label,
          globalIndex: idx++,
        });
      });
    });
    setFlatList(flattened);
    if (flattened.length > 0) setProgressIndex(flattened.length - 1);
  }, []);

  /* keep refs in sync */
  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    questionsRef.current = questions; // <-- FIX: keep questionsRef updated
  }, [questions]);

  /* Responsive: update writerSize on resize */
  useEffect(() => {
    const onResize = () => {
      const w = Math.floor(window.innerWidth * 0.72);
      const newSize = Math.max(140, Math.min(360, w));
      setWriterSize(newSize);
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  /* Memoized pool (slice once) */
  const pool = useMemo(() => {
    return flatList.slice(0, progressIndex + 1);
  }, [flatList, progressIndex]);

  /* Utility: reservoir sampling to pick k random items without shuffling entire arr */
  const pickRandomSubset = useCallback((arr, k) => {
    const n = arr.length;
    if (k >= n) return arr.slice();
    const reservoir = arr.slice(0, k);
    for (let i = k; i < n; i++) {
      const r = Math.floor(Math.random() * (i + 1));
      if (r < k) reservoir[r] = arr[i];
    }
    return reservoir;
  }, []);

  /* Start quiz
     NOTE: setStatus('playing') deferred slightly to avoid race with setQuestions */
  const startQuiz = useCallback(() => {
    if (!pool || pool.length === 0) {
      alert('Chưa có dữ liệu để ôn tập');
      return;
    }
    const useCount = Math.max(1, Math.min(questionCount || 1, pool.length));
    const picked = pickRandomSubset(pool, useCount);
    const quiz = picked.map(item => {
      let type = reviewMode;
      if (reviewMode === 'mixed') type = Math.random() < 0.5 ? 'read' : 'write';
      return { ...item, type };
    });

    // Reset states
    setResults([]);
    setScore(0);
    setCurrentIndex(0);
    currentIndexRef.current = 0; // immediate update

    // Set questions then start playing in next tick to avoid race
    setQuestions(quiz);
    setTimeout(() => {
      // only set playing if questionsRef has items
      if (quiz && quiz.length > 0) {
        setStatus('playing');
      }
    }, 0);
  }, [pool, questionCount, reviewMode, pickRandomSubset]);

  /* Destroy writer instance and clear DOM */
  const destroyWriter = useCallback(() => {
    try {
      if (writerInstance.current) {
        if (typeof writerInstance.current.cancelQuiz === 'function') {
          try {
            writerInstance.current.cancelQuiz();
          } catch {}
        }
        if (typeof writerInstance.current.clear === 'function') {
          try {
            writerInstance.current.clear();
          } catch {}
        }
      }
      if (writerRef.current) writerRef.current.innerHTML = '';
    } catch (e) {
      // ignore
    }
    writerInstance.current = null;
  }, []);

  /* Prepare question */
  const prepareQuestionForIndex = useCallback(
    index => {
      setUserInput('');
      setFeedback(null);
      setShowHint(false);
      setShowMeaning(false);
      setTimeLeft(timeLimit > 0 ? timeLimit : 0);

      // cleanup writer before init
      destroyWriter();

      const q = questionsRef.current[index]; // use ref for safe access
      if (!q) return;
      if (q.type === 'write') {
        // small delay for DOM settling
        setTimeout(() => initWriterForQuestion(q), 60);
      } else {
        if (writerRef.current) writerRef.current.innerHTML = '';
      }
    },
    [timeLimit, destroyWriter],
  );

  /* Init writer with dynamic import if needed */
  const initWriterForQuestion = useCallback(
    async q => {
      if (!writerRef.current) return;

      // cleanup previous
      destroyWriter();

      // dynamic import hanzi-writer if not loaded
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

      // safety: ensure q still current
      if (!q) return;

      const HanziWriter = hanziModuleRef.current;
      const size = writerSize;
      const base = 260;
      const scale = size / base;
      const drawingWidth = Math.max(8, Math.round(18 * scale));
      const padding = Math.max(4, Math.round(8 * scale));

      try {
        writerInstance.current = HanziWriter.create(
          writerRef.current,
          q.value,
          {
            width: size,
            height: size,
            padding,
            showOutline: false,
            showCharacter: false,
            strokeColor: '#222222',
            radicalColor: '#16a34a',
            outlineColor: '#cccccc',
            drawingWidth,
            highlightOnComplete: true,
            delayBetweenStrokes: Math.max(120, Math.round(260 * (1 / scale))),
          },
        );

        writerInstance.current.quiz({
          onMistake: () => {
            // optional visual feedback
          },
          onComplete: () => {
            // use questionsRef/currentIndexRef to ensure we reference latest state
            handleAnswer(true, q);
          },
        });
      } catch (err) {
        console.error('Init writer failed', err);
      }
    },
    [writerSize, destroyWriter],
  );

  /* If writerSize changes while playing and current is write -> re-init */
  useEffect(() => {
    if (status !== 'playing') return;
    const q = questionsRef.current[currentIndex];
    if (!q) return;
    if (q.type === 'write') {
      initWriterForQuestion(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [writerSize]);

  /* Effect: prepare when playing/currentIndex/questions changes */
  useEffect(() => {
    if (status !== 'playing') return;
    if (!questionsRef.current || questionsRef.current.length === 0) return;
    if (currentIndex < 0 || currentIndex >= questionsRef.current.length) return;
    prepareQuestionForIndex(currentIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, currentIndex /*questions*/]);

  /* Timer */
  useEffect(() => {
    if (status !== 'playing') return;
    if (timeLimit <= 0) return;

    setTimeLeft(timeLimit);
    let timerId = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerId);
          const q = questionsRef.current[currentIndexRef.current];
          if (q) handleAnswer(false, q);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timerId);
  }, [currentIndex, status, timeLimit]);

  /* Handle answer
     Use questionsRef and immediate update of currentIndexRef to avoid race. */
  const handleAnswer = useCallback(
    (isCorrect, q) => {
      if (lockRef.current) return;
      lockRef.current = true;

      // Use current questions via ref (avoid stale closure)
      const qlist = questionsRef.current || [];

      setResults(prev => [
        ...prev,
        {
          ...q,
          isCorrect,
          userAnswer: q.type === 'read' ? userInput : '(viết)',
        },
      ]);

      if (isCorrect) {
        setScore(s => s + 1);
        setFeedback('correct');
        setShowMeaning(false);
      } else {
        setFeedback('wrong');
        if (q.meaning) setShowMeaning(true);
        if (q.type === 'write') {
          try {
            writerInstance.current?.showCharacter();
          } catch {}
        }
      }

      setTimeout(() => {
        lockRef.current = false;
        const next = currentIndexRef.current + 1;
        if (!qlist || next >= qlist.length) {
          // finish if no more questions
          setStatus('finished');
          destroyWriter();
        } else {
          // update both state and ref immediately
          currentIndexRef.current = next;
          setCurrentIndex(next);
        }
      }, 900);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [userInput, destroyWriter],
  );

  /* Read check */
  const checkReading = useCallback(() => {
    const q = questionsRef.current[currentIndexRef.current];
    if (!q) return;
    const labelNorm = normalize(q.label || '');
    const inputNorm = normalize(userInput || '');
    const ok = inputNorm.length > 0 && labelNorm.includes(inputNorm);
    handleAnswer(ok, q);
  }, [userInput, handleAnswer]);

  /* Skip */
  const skipQuestion = useCallback(() => {
    const q = questionsRef.current[currentIndexRef.current];
    if (!q) return;
    handleAnswer(false, q);
  }, [handleAnswer]);

  /* Toggle meaning view */
  const toggleMeaning = useCallback(() => {
    setShowMeaning(s => !s);
  }, []);

  /* UI: setup view */
  if (status === 'setup') {
    return (
      <div className="review-container">
        <h2>Cài đặt ôn tập</h2>

        <label>Tiến độ ({flatList.length} chữ):</label>

        {/* Use range + number to avoid rendering many DOM nodes */}
        <div
          style={{
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            marginTop: 8,
          }}
        >
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
            min={0}
            max={Math.max(0, flatList.length - 1)}
            value={progressIndex}
            onChange={e => {
              const v = Math.max(
                0,
                Math.min(flatList.length - 1, Number(e.target.value) || 0),
              );
              setProgressIndex(v);
            }}
            style={{ width: 90 }}
          />
        </div>

        <div style={{ marginTop: 6, color: '#374151', fontWeight: 700 }}>
          {flatList[progressIndex] ? (
            <>
              #{progressIndex + 1} -{' '}
              {String(flatList[progressIndex].label).slice(0, 40)}
            </>
          ) : (
            '—'
          )}
        </div>

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

        <div style={{ height: 12 }} />

        <div className="row">
          <div>
            <label>Số câu</label>
            <input
              className="input-field"
              type="number"
              min={1}
              max={Math.max(1, pool.length)}
              value={questionCount}
              onChange={e => {
                const v = Number(e.target.value) || 1;
                setQuestionCount(Math.max(1, Math.min(pool.length || 9999, v)));
              }}
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

        <button
          className="btn-primary"
          onClick={startQuiz}
          style={{ marginTop: 16 }}
        >
          Bắt đầu
        </button>

        <div style={{ marginTop: 10, color: '#6b7280', fontSize: 13 }}>
          Lưu ý: để tránh lag, module viết chữ chỉ được tải khi câu hỏi yêu cầu
          viết.
        </div>
      </div>
    );
  }

  if (status === 'finished') {
    return (
      <div className="review-container center">
        <h2>Kết quả</h2>

        <div className="score-box" style={{ marginTop: 10 }}>
          <span className="score-num">{score}</span>
          <span className="score-total">/ {questionsRef.current.length}</span>
        </div>

        <div className="result-list" style={{ marginTop: 16 }}>
          {results.map((r, i) => (
            <div key={i} className={`result-row ${r.isCorrect ? 'ok' : 'bad'}`}>
              <div className="char-icon">{r.value}</div>
              <div>
                <div style={{ fontWeight: 700 }}>{r.label}</div>
                <div style={{ color: '#6b7280' }}>
                  {r.reading ? `(${r.reading})` : ''}{' '}
                  {r.meaning ? `— ${r.meaning}` : ''}
                </div>
              </div>
            </div>
          ))}
        </div>

        <button
          className="btn-primary"
          onClick={() => {
            setStatus('setup');
            destroyWriter();
          }}
          style={{ marginTop: 18 }}
        >
          Ôn tập lại
        </button>
      </div>
    );
  }

  const q = questionsRef.current[currentIndex] || {};

  return (
    <div className="review-container playing">
      <div className="quiz-header">
        <div>
          Câu {currentIndex + 1} / {questionsRef.current.length}
        </div>
        {timeLimit > 0 && (
          <div className={timeLeft < 5 ? 'timer-danger' : 'timer-normal'}>
            ⏱ {timeLeft}s
          </div>
        )}
      </div>

      {q.type === 'read' ? (
        <>
          <div className="big-char">{q.value}</div>

          <div style={{ textAlign: 'center', marginBottom: 8 }}>
            <button className="btn-small" onClick={toggleMeaning}>
              {showMeaning ? 'Ẩn giải nghĩa' : 'Giải nghĩa'}
            </button>
          </div>

          {showMeaning && q.meaning && (
            <div
              className="feedback-msg"
              style={{
                background: 'transparent',
                border: '1px solid #e6eef0',
                color: '#374151',
                fontWeight: 600,
              }}
            >
              {q.meaning}
            </div>
          )}

          <div style={{ height: 8 }} />

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
                ? 'Chính xác!'
                : `Sai rồi! Đáp án: ${q.label}${
                    q.reading ? ' (' + q.reading + ')' : ''
                  }`}
            </div>
          )}
        </>
      ) : (
        <>
          <div
            style={{
              textAlign: 'center',
              marginBottom: 6,
              color: '#374151',
              fontWeight: 700,
            }}
          >
            {q.reading ? `${q.reading}` : '—'}
          </div>

          <div style={{ textAlign: 'center', marginBottom: 8 }}>
            <button className="btn-small" onClick={toggleMeaning}>
              {showMeaning ? 'Ẩn giải nghĩa' : 'Xem giải nghĩa'}
            </button>
          </div>

          {(showMeaning || feedback === 'wrong') && q.meaning && (
            <div
              className="feedback-msg"
              style={{
                background: 'transparent',
                border: '1px solid #e6eef0',
                color: '#374151',
                fontWeight: 600,
                marginBottom: 8,
              }}
            >
              {q.meaning}
            </div>
          )}

          <div
            className="writer-box"
            style={{
              width: writerSize,
              height: writerSize,
              maxWidth: '90vw',
              maxHeight: '90vw',
            }}
          >
            <div ref={writerRef} style={{ width: '100%', height: '100%' }} />
            {writerLoading && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                Đang tải mẫu...
              </div>
            )}
          </div>

          {!feedback ? (
            <div className="controls-row" style={{ marginTop: 8 }}>
              <button
                className="btn-small"
                onClick={() => {
                  try {
                    writerInstance.current?.animateCharacter();
                  } catch {}
                }}
                disabled={writerLoading}
              >
                Xem mẫu
              </button>
              <button className="btn-small danger" onClick={skipQuestion}>
                Bỏ qua
              </button>
            </div>
          ) : (
            <div
              className={`feedback-msg ${feedback}`}
              style={{ marginTop: 8 }}
            >
              {feedback === 'correct' ? 'Đúng rồi!' : 'Sai rồi!'}
            </div>
          )}
        </>
      )}
    </div>
  );
}
