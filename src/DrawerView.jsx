import { useCallback, useEffect, useState } from 'react';
import { studioApi } from './api.js';
import { DRAWER_KINDS, STATUSES, actorLabel, timeAgo, viewHref } from './constants.js';

// 결정 서랍: 결정을 수명으로 나눈다. 모든 앱이 함께 쓴다 (studio/shared/drawer.json).
//   제약    거의 안 바뀜. 공통 보드의 과업도 여기에 보인다
//   내 눈   고르거나 버린 이유. 사람 화면에서 고를 때 자동으로 쌓인다
//   보류    지금은 안 함. 다시 볼 조건이 붙는다
//   번역표  내 말 → 실제로 바꾸는 것
const FIELDS = {
  constraint: [['text', '조건', 'Quest 3S 독립형, 72fps 유지'], ['why', '이유 (선택)', '']],
  taste: [['text', '고르거나 버린 이유', '반투명 겹침은 탁해 보여서 싫음'], ['why', '무엇을 볼 때였나 (선택)', '구름 셰이더 비교']],
  hold: [['text', '지금 안 하는 것', '반투명 구름 겹침'], ['until', '다시 볼 조건', 'Quest 4 나오면'], ['why', '이유 (선택)', '3S에서 무거움']],
  vocab: [['text', '내가 쓰는 말', '부드럽게'], ['means', '실제로 바꾸는 것', '이징 0.2초 늘림, 대비는 유지']],
};

export default function DrawerView({ pid, version }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(async () => {
    try { setData(await studioApi.drawer()); } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load, version]);

  if (!data) return <p className="hint page__loading">{error || '불러오는 중…'}</p>;
  const appId = pid === 'shared' ? '' : pid;

  return (
    <div className="drawer">
      <p className="hint drawer__intro">모든 앱이 함께 쓰는 결정이에요. 에이전트는 변종을 만들기 전에 이걸 읽고, 이미 버린 방향이면 그때 이유를 같이 알려요. 파일: <code>{data.path}</code></p>
      <div className="drawer__grid">
        {Object.entries(DRAWER_KINDS).map(([kind, meta]) => {
          const items = data.items.filter((x) => x.kind === kind);
          const active = items.filter((x) => x.status !== 'retired');
          const retired = items.filter((x) => x.status === 'retired');
          return (
            <section key={kind} className={`drawer-col drawer--${kind}`} aria-label={meta.label}>
              <header>
                <h2>{meta.label}</h2>
                <p className="hint">{meta.hint}</p>
              </header>
              {kind === 'constraint' && data.sharedTasks.length > 0 && (
                <ul className="drawer-list">
                  {data.sharedTasks.map((t) => (
                    <li key={t.id} className="drawer-item is-shared">
                      <a href={viewHref('shared', 'ledger', t.id)}>{t.title}</a>
                      {t.preview && <p>{t.preview}</p>}
                      <span className="drawer-item__meta">공통 보드 · {STATUSES[t.status]}{t.usedBy?.length ? ` · 앱 ${t.usedBy.length}개가 사용` : ''}</span>
                    </li>
                  ))}
                </ul>
              )}
              <ul className="drawer-list">
                {active.map((it) => <Item key={it.id} it={it} onChange={load} onError={setError} />)}
                {!active.length && kind !== 'constraint' && <li className="hint">아직 없어요.</li>}
              </ul>
              <AddForm kind={kind} app={appId} onAdded={load} onError={setError} />
              {retired.length > 0 && (
                <details className="more">
                  <summary>내린 것 {retired.length}개</summary>
                  <ul className="drawer-list">{retired.map((it) => <Item key={it.id} it={it} onChange={load} onError={setError} />)}</ul>
                </details>
              )}
            </section>
          );
        })}
      </div>
      {error && (
        <div className="toast" role="alert">
          {error}
          <button className="icon-btn" onClick={() => setError(null)} aria-label="닫기">✕</button>
        </div>
      )}
    </div>
  );
}

function Item({ it, onChange, onError }) {
  const retired = it.status === 'retired';
  const toggle = async () => {
    try { await studioApi.updateDrawer(it.id, { status: retired ? 'active' : 'retired' }); onChange(); } catch (e) { onError(e.message); }
  };
  return (
    <li className={`drawer-item${retired ? ' is-retired' : ''}`}>
      <div className="drawer-item__text">
        {it.kind === 'vocab' ? <><strong>“{it.text}”</strong> <span aria-hidden="true">→</span> {it.means}</> : it.text}
      </div>
      {it.until && <p className="drawer-item__until">다시 볼 조건: {it.until}</p>}
      {it.why && <p>{it.kind === 'taste' ? `볼 때: ${it.why}` : `이유: ${it.why}`}</p>}
      <span className="drawer-item__meta">
        {it.id} · {actorLabel(it.by)} · {timeAgo(it.at)}
        {it.app && <> · <a href={viewHref(it.app, it.task ? 'ledger' : 'human', it.task || undefined)}>{it.app}</a></>}
        <button className="link" onClick={toggle}>{retired ? '다시 쓰기' : '내리기'}</button>
      </span>
    </li>
  );
}

function AddForm({ kind, app, onAdded, onError }) {
  const fields = FIELDS[kind];
  const empty = Object.fromEntries(fields.map(([k]) => [k, '']));
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(empty);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!v.text.trim()) { setErr(`${fields[0][1]}을 적어 주세요.`); return; }
    if (kind === 'vocab' && !v.means.trim()) { setErr('실제로 무엇을 바꾸는지 적어 주세요.'); return; }
    if (kind === 'hold' && !v.until.trim()) { setErr('언제 다시 볼지 조건을 적어 주세요.'); return; }
    setBusy(true);
    try { await studioApi.addDrawer({ kind, ...v, app }); setV(empty); setOpen(false); setErr(''); onAdded(); }
    catch (x) { onError(x.message); }
    finally { setBusy(false); }
  };

  if (!open) return <button className="ghost drawer-add" onClick={() => setOpen(true)}>{DRAWER_KINDS[kind].label}에 넣기</button>;
  return (
    <form className="drawer-form" onSubmit={submit}>
      {fields.map(([k, label, ph]) => (
        <label key={k} className="field">
          <span>{label}</span>
          <input value={v[k]} placeholder={ph} onChange={(x) => { setV({ ...v, [k]: x.target.value }); setErr(''); }} />
        </label>
      ))}
      {err && <p className="form-error">{err}</p>}
      <div className="entry__actions">
        <button className="primary" disabled={busy}>넣기</button>
        <button type="button" className="ghost" onClick={() => { setOpen(false); setErr(''); }}>취소</button>
      </div>
    </form>
  );
}
