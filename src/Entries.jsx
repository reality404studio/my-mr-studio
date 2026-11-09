import { useState } from 'react';
import { ENTRY_TYPES, CONFIDENCE, ENTRY_STATUS, viewHref } from './constants.js';

// 세 칸 항목(가정 · 타협 · 모름) 하나. 사람 화면과 명세 화면이 같이 쓴다.
//   모름  → 답하기
//   가정  → 맞아요 / 아니에요 (이유, 과업 다시 열기)
//   타협  → 괜찮아요 / 다시 하기 (이유, 과업 다시 열기)
export function EntryCard({ pid, entry: e, api, onChanged, onError, showWhere = true }) {
  const [mode, setMode] = useState(null); // 'answer' | 'reject' | 'redo'
  const [text, setText] = useState('');
  const [reopen, setReopen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const open = e.status === 'open';

  const run = async (fn) => {
    setBusy(true);
    try { await fn(); setMode(null); setText(''); onChanged?.(); }
    catch (x) { onError?.(x.message); }
    finally { setBusy(false); }
  };

  const submit = () => {
    if (!text.trim()) { setErr(mode === 'answer' ? '답을 적어 주세요.' : '이유를 한 줄 적어 주세요.'); return; }
    setErr('');
    if (mode === 'answer') return run(() => api.resolveKnowledge(e.id, 'answer', { answer: text.trim() }));
    const action = mode === 'reject' ? 'reject' : 'reopen';
    return run(async () => {
      await api.resolveKnowledge(e.id, action, { note: text.trim() });
      if (reopen && e.task) await api.reopen(e.task, { because: `${ENTRY_TYPES[e.type]} ${e.id}: ${text.trim()}` });
    });
  };

  return (
    <article className={`entry entry--${e.type}${e.type === 'assume' ? ` entry--conf-${e.confidence}` : ''}${open ? '' : ' is-closed'}`}>
      <div className="entry__head">
        <span className="entry__type">{ENTRY_TYPES[e.type]}</span>
        {e.type === 'assume' && <span className={`conf conf--${e.confidence}`}>{CONFIDENCE[e.confidence]}</span>}
        {e.type === 'compromise' && e.gate && <span className="gate">게이트 {e.gate}</span>}
        {!open && <span className="entry__status">{ENTRY_STATUS[e.status] || e.status}</span>}
        <span className="entry__id">{e.id}</span>
      </div>
      <p className="entry__text">{e.text}</p>
      {(e.field || (showWhere && e.task)) && (
        <p className="entry__where">
          {e.field && <code>{e.field}</code>}
          {showWhere && e.task && <a href={viewHref(pid, 'ledger', e.task)}>{e.where || e.taskTitle || e.task}</a>}
          {e.by && <span>{e.by}</span>}
        </p>
      )}
      {e.answer && <p className="entry__answer">답: {e.answer}</p>}
      {e.note && <p className="entry__answer">메모: {e.note}</p>}

      {open && !mode && (
        <div className="entry__actions">
          {e.type === 'unknown' && <button className="primary" onClick={() => setMode('answer')}>답하기</button>}
          {e.type === 'assume' && (
            <>
              <button className="ghost" disabled={busy} onClick={() => run(() => api.resolveKnowledge(e.id, 'confirm'))}>맞아요</button>
              <button className="ghost" onClick={() => setMode('reject')}>아니에요</button>
            </>
          )}
          {e.type === 'compromise' && (
            <>
              <button className="ghost" disabled={busy} onClick={() => run(() => api.resolveKnowledge(e.id, 'accept'))}>괜찮아요</button>
              <button className="ghost" onClick={() => setMode('redo')}>다시 하기</button>
            </>
          )}
        </div>
      )}
      {open && mode && (
        <div className="entry__form">
          <textarea
            rows={2}
            autoFocus
            value={text}
            placeholder={mode === 'answer' ? '답을 적어 주세요' : mode === 'reject' ? '실제로는 어떤지' : '무엇이 안 괜찮은지'}
            onChange={(x) => { setText(x.target.value); setErr(''); }}
            onKeyDown={(x) => { if (x.key === 'Enter' && (x.metaKey || x.ctrlKey)) submit(); }}
            aria-label={mode === 'answer' ? '답' : '이유'}
          />
          {err && <p className="form-error">{err}</p>}
          {mode !== 'answer' && e.task && (
            <label className="check"><input type="checkbox" checked={reopen} onChange={(x) => setReopen(x.target.checked)} /> 이 과업 다시 열기</label>
          )}
          <div className="entry__actions">
            <button className="primary" disabled={busy} onClick={submit}>{mode === 'answer' ? '답 남기기' : mode === 'reject' ? '틀렸다고 남기기' : '다시 하라고 남기기'}</button>
            <button className="ghost" onClick={() => { setMode(null); setErr(''); }}>취소</button>
          </div>
        </div>
      )}
    </article>
  );
}

// 빈칸 지도 요약 막대: 정해짐 · 추정 · 빈칸 · 모름
export function BlankBar({ summary }) {
  if (!summary || summary.error) return null;
  const parts = [['settled', summary.settled], ['inferred', summary.inferred], ['empty', summary.empty], ['unknown', summary.unknown]];
  const total = Math.max(1, summary.fields);
  return (
    <div className="blankbar" role="img" aria-label={`칸 ${summary.fields}개 중 정해짐 ${summary.settled}, 추정 ${summary.inferred}, 빈칸 ${summary.empty}, 모름 ${summary.unknown}`}>
      {parts.map(([k, n]) => (n ? <span key={k} className={`blankbar__seg state--${k}`} style={{ flexGrow: n / total }} /> : null))}
    </div>
  );
}
