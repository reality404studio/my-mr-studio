import { useState } from 'react';
import { EntryCard, BlankBar } from './Entries.jsx';
import { studioApi } from './api.js';
import { KINDS, FIELD_STATES, VERDICT, ATTEMPT_RESULTS, actorLabel, timeAgo, viewHref } from './constants.js';

const REASON_CHIPS = ['안 예뻐', '어색해', '상상과 달라', '불편해', '이게 맞아'];

// 사람 화면: 사람은 과정을 추적하지 않고, 고르고 답하기만 한다.
// 위에서부터 급한 순서: 알림 → 질문 → 확신 낮은 추정 → 결정·확인 → 영수증. 나머지는 접어 둔다.
export default function HumanView({ pid, api, data, reload }) {
  const [error, setError] = useState(null);
  if (!data) return <p className="hint page__loading">불러오는 중…</p>;

  const low = data.guesses.filter((g) => g.confidence === 'low');
  const rest = data.guesses.filter((g) => g.confidence !== 'low');
  const nothing = !data.alerts.length && !data.questions.length && !low.length && !data.decisions.length && !data.receipts.length;

  return (
    <div className="human">
      <StatusLine pid={pid} data={data} />

      {data.alerts.length > 0 && (
        <section className="alerts" aria-label="알림">
          {data.alerts.map((a) => (
            <div key={`${a.kind}:${a.id}`} className={`alert alert--${a.kind}`}>
              <div>
                <strong>{a.kind === 'stuck' ? '헤매는 중일 수 있어요' : a.kind === 'over' ? '토큰 상한 초과' : '토큰 상한에 가까워요'}</strong>
                <span className="alert__where">{a.title}</span>
              </div>
              <p>{a.text}</p>
              {a.detail?.length > 0 && <ul>{a.detail.map((d) => <li key={d}>{d}</li>)}</ul>}
              <a className="ghost" href={viewHref(pid, 'ledger', a.id)}>장부에서 보기</a>
            </div>
          ))}
        </section>
      )}

      <div className="human__grid">
        <section className="human__main" aria-label="결정 대기">
          <h2>결정 대기 {nothing ? '' : <span className="count">{data.questions.length + low.length + data.decisions.length}</span>}</h2>
          {nothing && (
            <div className="empty">
              <strong>지금 당신이 할 일은 없어요</strong>
              <p>에이전트가 질문이나 고를 것을 남기면 여기에 떠요. {data.nextAgent.length ? `에이전트 다음 차례: ${data.nextAgent[0].title}` : ''}</p>
            </div>
          )}

          {data.questions.length > 0 && <h3 className="group-title">답이 필요한 질문</h3>}
          {data.questions.map((e) => <EntryCard key={e.id} pid={pid} entry={e} api={api} onChanged={reload} onError={setError} />)}

          {low.length > 0 && <h3 className="group-title">확신 낮은 추정: 맞는지만 봐 주세요</h3>}
          {low.map((e) => <EntryCard key={e.id} pid={pid} entry={e} api={api} onChanged={reload} onError={setError} />)}

          {data.decisions.length > 0 && <h3 className="group-title">고르거나 확인할 것</h3>}
          {data.decisions.map((d) => <DecisionCard key={d.id} pid={pid} item={d} api={api} onChanged={reload} onError={setError} />)}

          {rest.length > 0 && (
            <details className="more">
              <summary>확신 중·상 추정 {rest.length}개 (급하지 않음)</summary>
              {rest.map((e) => <EntryCard key={e.id} pid={pid} entry={e} api={api} onChanged={reload} onError={setError} />)}
            </details>
          )}
        </section>

        <aside className="human__side">
          {data.hasSpec && data.summary && !data.summary.error && (
            <a className="card summary-card" href={viewHref(pid, 'spec')}>
              <span className="card__label">빈칸 지도</span>
              <strong className={`verdict verdict--${data.summary.verdict}`}>{VERDICT[data.summary.verdict].label}</strong>
              <BlankBar summary={data.summary} />
              <ul className="legend">
                {Object.entries(FIELD_STATES).map(([k, s]) => <li key={k}><span className={`swatch state--${k}`} aria-hidden="true" />{s.label} {data.summary[k]}</li>)}
              </ul>
              <span className="card__more">명세에서 칸별로 보기 →</span>
            </a>
          )}
          {data.summary?.error && <p className="form-error">{data.summary.error}</p>}

          <section className="card" aria-label="영수증">
            <span className="card__label">영수증: 조건을 맞추려고 낮춘 것</span>
            {data.receipts.length === 0 && <p className="hint">열린 타협이 없어요.</p>}
            {data.receipts.map((e) => <EntryCard key={e.id} pid={pid} entry={e} api={api} onChanged={reload} onError={setError} />)}
          </section>

          {data.recentReopens.length > 0 && (
            <section className="card" aria-label="최근 되돌림">
              <span className="card__label">최근 되돌림</span>
              <ul className="plain">
                {data.recentReopens.map((r) => (
                  <li key={`${r.id}${r.at}`}><a href={viewHref(pid, 'ledger', r.id)}>{r.title}</a> · {r.because} <time>{timeAgo(r.at)}</time></li>
                ))}
              </ul>
            </section>
          )}
        </aside>
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

// 한 줄 상태: 지금 누가 무엇을 하는지, 시도 몇 번째인지, 토큰. 과정은 장부에 두고 여기는 요약만.
function StatusLine({ pid, data }) {
  const w = data.working.filter((x) => x.by !== 'human');
  return (
    <div className="statusline" aria-label="지금 상태">
      <span className={`dot${w.length ? ' is-doing' : ''}`} aria-hidden="true" />
      {w.length ? (
        <span>
          {w.slice(0, 2).map((x, i) => (
            <span key={x.id}>
              {i > 0 && ' · '}
              <strong>{actorLabel(x.updatedBy || x.owner || 'agent')}</strong> <a href={viewHref(pid, 'ledger', x.id)}>{x.title}</a> 하는 중
              {x.attempts ? ` · 시도 ${x.attempts}` : ''}
              {x.lastAttempt ? ` (마지막 ${ATTEMPT_RESULTS[x.lastAttempt.result]})` : ''}
            </span>
          ))}
          {w.length > 2 && ` 외 ${w.length - 2}개`}
        </span>
      ) : (
        <span>지금 진행 중인 에이전트 작업이 없어요{data.nextAgent.length ? ` · 다음 차례: ${data.nextAgent[0].title}` : ''}</span>
      )}
      {data.tokens > 0 && <span className="statusline__tokens">기록된 토큰 {data.tokens.toLocaleString('en-US')}</span>}
    </div>
  );
}

// 사람 차례인 하위 과업이나 확인 대기 결과. 이유는 칩 하나로 남기고, 결정 서랍의 "내 눈"에 쌓인다.
function DecisionCard({ pid, item, api, onChanged, onError }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const isReview = item.kind === 'review';

  const save = async (pass) => {
    if (!pass && !reason.trim()) { setErr('왜 다시 하는지 한 줄 적어 주세요.'); return; }
    setBusy(true);
    try {
      if (reason.trim()) {
        await studioApi.addDrawer({ kind: 'taste', text: reason.trim(), why: item.title, app: pid, task: item.id });
        await api.appendNote(item.task, `${pass ? '결정' : '다시'}: ${reason.trim()}`);
      }
      if (pass) await api.updateNode(item.id, { status: 'done' });
      else await api.reopen(item.id, { because: reason.trim() });
      setReason('');
      onChanged();
    } catch (x) { onError(x.message); }
    finally { setBusy(false); }
  };

  return (
    <article className={`decision decision--${item.kind}`}>
      <div className="entry__head">
        <span className="entry__type">{isReview ? '확인' : '결정'}</span>
        {item.subKind && <span className={`kind kind--${item.subKind}`}>{KINDS[item.subKind]}</span>}
        <span className="entry__id">{item.where}</span>
      </div>
      <h4>{item.title}</h4>
      {item.how && <p className="decision__how">{item.how}</p>}
      {item.thumbs?.length > 0 && (
        <div className={`compare compare--${Math.min(item.thumbs.length, 4)}`}>
          {item.thumbs.map((t) => (
            <a key={t.url} href={t.url} target="_blank" rel="noreferrer" className="compare__item">
              <img src={t.url} alt={t.memo || t.file} loading="lazy" />
              <span>{t.memo || t.file}</span>
            </a>
          ))}
        </div>
      )}
      {item.attempts?.length > 0 && (
        <ul className="plain attempts">
          {item.attempts.map((a) => <li key={a.n}><span className={`result result--${a.result}`}>{ATTEMPT_RESULTS[a.result]}</span> {a.label}{a.why ? ` — ${a.why}` : ''}</li>)}
        </ul>
      )}
      <div className="chips" role="group" aria-label="이유 고르기">
        {REASON_CHIPS.map((c) => (
          <button key={c} className={`chip${reason === c ? ' is-on' : ''}`} onClick={() => { setReason(reason === c ? '' : c); setErr(''); }}>{c}</button>
        ))}
      </div>
      <input
        className="reason"
        value={reason}
        onChange={(x) => { setReason(x.target.value); setErr(''); }}
        placeholder="이유를 한 줄로 (결정 서랍 '내 눈'에 쌓여요)"
        aria-label="이유"
      />
      {err && <p className="form-error">{err}</p>}
      <div className="entry__actions">
        <button className="primary" disabled={busy} onClick={() => save(true)}>{isReview ? '통과' : '결정했어요'}</button>
        {isReview && <button className="ghost" disabled={busy} onClick={() => save(false)}>다시 하기</button>}
        <a className="ghost" href={viewHref(pid, 'ledger', item.id)}>장부에서 열기</a>
      </div>
    </article>
  );
}
