import { useEffect, useState } from 'react';
import { studioApi } from './api.js';
import { timeAgo } from './constants.js';

const POLL_MS = 5000;

function useSessions() {
  const [sessions, setSessions] = useState([]);
  useEffect(() => {
    let alive = true;
    const load = () => studioApi.sessions().then((s) => alive && setSessions(s)).catch(() => {});
    load();
    const t = setInterval(load, POLL_MS);
    return () => { alive = false; clearInterval(t); };
  }, []);
  return sessions;
}

const cardHref = (last) => `#/${last.app === 'shared' ? 'shared' : `app/${encodeURIComponent(last.app)}`}?node=${encodeURIComponent(last.nodeId)}`;

// pid: 지금 열린 보드. 같은 보드의 카드면 onSelect 로 바로 연다
export default function SessionStrip({ pid, onSelect }) {
  const sessions = useSessions();
  if (!sessions.length) return null;
  return (
    <section className="sessions" aria-label="활성 세션">
      <span className="sessions__label">활성 세션</span>
      <ul className="sessions__list">
        {sessions.map((s) => {
          const last = s.last?.nodeId ? s.last : null;
          const here = last && last.app === pid && onSelect;
          return (
            <li key={s.name} className={`session-chip is-${s.status}`} title={`${s.cwd} · ${s.status === 'busy' ? '작업 중' : '대기'}`}>
              <span className="dot" aria-hidden="true" />
              <strong>{s.name}</strong>
              <span className="session-chip__ago">{timeAgo(s.statusUpdatedAt)}</span>
              {last && (
                <a
                  className="session-chip__card"
                  href={cardHref(last)}
                  onClick={here ? (e) => { e.preventDefault(); onSelect(last.nodeId); } : undefined}
                  title={`${last.app} · ${last.action} · ${timeAgo(last.ts)}`}
                >
                  {last.app === pid ? '' : `${last.app}/`}{last.nodeId}
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
