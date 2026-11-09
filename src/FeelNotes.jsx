import { useState } from 'react';
import { timeAgo, actorLabel } from './constants.js';

const HOW = { gaze: '보던 것', point: '가리킨 것', none: '' };

// 헤드셋 메모: 헤드셋을 쓴 채로 남긴 말과 그 순간 보던 것·거리·각도.
// 에이전트가 읽고 명세의 가정으로 옮긴다. 사람이 할 일은 받아쓰기가 비었을 때 녹음을 듣고 적는 것뿐이다.
export function FeelCard({ pid, api, data, onChanged, onError }) {
  const feel = data.feel || { fresh: [], recent: [], total: 0 };
  const xrHref = `/xr.html?app=${encodeURIComponent(pid)}`;
  return (
    <section className="card feel" aria-label="헤드셋 메모">
      <span className="card__label">헤드셋 메모</span>
      {feel.fresh.length === 0 && (
        <p className="hint">
          {feel.total ? '새 메모가 없어요. 에이전트가 모두 읽었어요.' : '헤드셋 안에서 왼손 손바닥을 보고 빨간 버튼을 찌르면, 말과 그 순간 보던 것이 여기로 와요.'}
        </p>
      )}
      {feel.fresh.map((n) => <FeelNote key={n.id} n={n} api={api} onChanged={onChanged} onError={onError} />)}
      {feel.recent.length > 0 && (
        <details className="more">
          <summary>지난 메모 {feel.recent.length}개</summary>
          <ul className="plain feel__recent">
            {feel.recent.map((n) => (
              <li key={n.id}>
                <span className="entry__id">{n.id}</span> {n.text ? `“${n.text}”` : '(녹음)'}
                {n.status === 'translated' && n.links?.length > 0 && <span className="feel__link"> → 가정 {n.links.join(', ')}</span>}
                {n.status === 'dismissed' && <span className="feel__link"> 버림{n.why ? `: ${n.why}` : ''}</span>}
                <time>{timeAgo(n.at)}</time>
              </li>
            ))}
          </ul>
        </details>
      )}
      <a className="card__more" href={xrHref} target="_blank" rel="noreferrer">헤드셋 그레이박스 열기 →</a>
    </section>
  );
}

function FeelNote({ n, api, onChanged, onError }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const needsText = !n.text;

  const run = async (fn) => {
    setBusy(true);
    try { await fn(); setText(''); onChanged(); }
    catch (x) { onError(x.message); }
    finally { setBusy(false); }
  };

  return (
    <article className={`feel__note${needsText ? ' is-needs-text' : ''}`}>
      <div className="entry__head">
        <span className="entry__type">메모</span>
        <span className="entry__id">{n.id}</span>
        <time className="feel__time">{timeAgo(n.at)}</time>
      </div>
      {n.text ? <p className="entry__text">“{n.text}”</p> : <p className="entry__text feel__empty">받아쓰기가 없어요. 들어 보고 한 줄로 적어 주세요.</p>}
      {n.summary && (
        <p className="entry__where">
          <span>{n.target?.how && HOW[n.target.how] ? `${HOW[n.target.how]}: ` : ''}{n.summary}</span>
          {n.pose?.frame === 'session' && <span title="책상을 맞추기 전에 남긴 메모라 위치는 그 세션에서만 의미가 있어요">세션 좌표</span>}
        </p>
      )}
      {n.audioUrl && <audio className="feel__audio" controls preload="none" src={n.audioUrl} />}
      {needsText && (
        <div className="feel__fill">
          <input className="reason" value={text} onChange={(e) => setText(e.target.value)} placeholder="들은 말을 한 줄로" aria-label={`${n.id} 받아쓰기`} />
          <button className="primary" disabled={busy || !text.trim()} onClick={() => run(() => api.feelAction(n.id, { action: 'text', text: text.trim() }))}>적기</button>
        </div>
      )}
      <div className="entry__actions">
        <span className="hint">{n.source === 'cli' ? `${actorLabel(n.by)}가 대신 적음` : '에이전트가 아직 안 읽었어요'}</span>
        <button className="link" disabled={busy} onClick={() => run(() => api.feelAction(n.id, { action: 'dismiss', why: '사람이 버림' }))}>버리기</button>
      </div>
    </article>
  );
}
