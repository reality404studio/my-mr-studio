import { useCallback, useEffect, useMemo, useState } from 'react';
import { EntryCard, BlankBar } from './Entries.jsx';
import { FIELD_STATES, CONFIDENCE, VERDICT, ENTRY_TYPES } from './constants.js';

// 명세 = 진실의 원천. scene_spec.yaml 의 칸마다 정해짐 / 추정 / 빈칸 / 모름을 칠한 빈칸 지도.
// 칸을 누르면 그 칸에 걸린 가정 · 타협 · 모름이 열리고, 거기서 바로 답하거나 확인한다.
export default function SpecView({ pid, api, version }) {
  const [spec, setSpec] = useState(null);
  const [error, setError] = useState(null);
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [openPath, setOpenPath] = useState(null);

  const load = useCallback(async () => {
    try { setSpec(await api.spec()); setError(null); } catch (e) { setError(e.message); }
  }, [api]);
  useEffect(() => { load(); }, [load, version]);

  const byId = useMemo(() => Object.fromEntries((spec?.entries || []).map((e) => [e.id, e])), [spec]);
  if (error && !spec) return <p className="form-error page__loading">{error}</p>;
  if (!spec) return <p className="hint page__loading">불러오는 중…</p>;

  const s = spec.summary;
  const loose = spec.loose.map((id) => byId[id]).filter(Boolean);
  const looseOpen = loose.filter((e) => e.status === 'open');
  const closed = spec.entries.filter((e) => e.status !== 'open');

  return (
    <div className="spec">
      <section className="spec__head">
        <div>
          <span className="card__label">빈칸 지도 · <code>{spec.path}</code></span>
          <h2 className={`verdict verdict--${s.verdict}`}>{VERDICT[s.verdict].label}</h2>
          <p className="hint">{VERDICT[s.verdict].hint}. 칸 {s.fields}개 중 정해짐 {s.settled}, 추정 {s.inferred}{s.lowInferred ? `(확신 하 ${s.lowInferred})` : ''}, 빈칸 {s.empty}, 모름 {s.unknown}.</p>
        </div>
        <BlankBar summary={s} />
        <div className="spec__tools">
          <ul className="legend">
            {Object.entries(FIELD_STATES).map(([k, st]) => <li key={k} title={st.hint}><span className={`swatch state--${k}`} aria-hidden="true" />{st.label}</li>)}
          </ul>
          <label className="check"><input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} /> 정해지지 않은 칸만</label>
        </div>
      </section>

      <div className="spec__blocks">
        {spec.blocks.map((b) => {
          const fields = onlyOpen ? b.fields.filter((f) => f.state !== 'settled' || f.entries.some((id) => byId[id]?.status === 'open')) : b.fields;
          if (!fields.length) return null;
          const counts = Object.fromEntries(Object.keys(FIELD_STATES).map((k) => [k, b.fields.filter((f) => f.state === k).length]));
          return (
            <section key={b.key} className="spec-block">
              <header>
                <h3><code>{b.key}</code></h3>
                <span className="spec-block__counts">
                  {Object.entries(counts).filter(([, n]) => n).map(([k, n]) => <span key={k} className={`mini state--${k}`}>{FIELD_STATES[k].label} {n}</span>)}
                </span>
              </header>
              <ol className="fields">
                {fields.map((f) => {
                  const rel = f.entries.map((id) => byId[id]).filter(Boolean);
                  const openRel = rel.filter((e) => e.status === 'open');
                  const expanded = openPath === f.path;
                  return (
                    <li key={f.path} className={`field-row state--${f.state}${expanded ? ' is-open' : ''}`}>
                      <button className="field-row__main" onClick={() => setOpenPath(expanded ? null : f.path)} aria-expanded={expanded} disabled={!rel.length}>
                        <span className="field-row__state">{FIELD_STATES[f.state].label}{f.confidence ? ` · ${CONFIDENCE[f.confidence].replace('확신 ', '')}` : ''}</span>
                        <code className="field-row__path">{f.path.slice(b.key.length + 1) || b.key}</code>
                        <span className="field-row__value">{f.value === null ? '—' : short(f.value)}</span>
                        <span className="field-row__tags">
                          {openRel.map((e) => <span key={e.id} className={`tag tag--${e.type}`}>{ENTRY_TYPES[e.type]} {e.id}</span>)}
                          {!openRel.length && rel.length > 0 && <span className="tag">기록 {rel.length}</span>}
                        </span>
                      </button>
                      {expanded && (
                        <div className="field-row__entries">
                          {rel.map((e) => <EntryCard key={e.id} pid={pid} entry={e} api={api} onChanged={load} onError={setError} />)}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            </section>
          );
        })}
      </div>

      {(onlyOpen ? looseOpen : loose).length > 0 && (
        <section className="spec-block">
          <header><h3>칸에 연결되지 않은 항목</h3><span className="hint">에이전트가 <code>--field</code> 없이 남긴 가정 · 타협 · 모름</span></header>
          <div className="entry-list">
            {(onlyOpen ? looseOpen : loose).map((e) => <EntryCard key={e.id} pid={pid} entry={e} api={api} onChanged={load} onError={setError} />)}
          </div>
        </section>
      )}

      {!onlyOpen && closed.length > 0 && (
        <details className="more">
          <summary>닫힌 항목 {closed.length}개</summary>
          <div className="entry-list">{closed.map((e) => <EntryCard key={e.id} pid={pid} entry={e} api={api} onChanged={load} onError={setError} />)}</div>
        </details>
      )}

      {error && (
        <div className="toast" role="alert">
          {error}
          <button className="icon-btn" onClick={() => setError(null)} aria-label="닫기">✕</button>
        </div>
      )}
    </div>
  );
}

function short(v) {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > 90 ? `${s.slice(0, 88)}…` : s;
}
