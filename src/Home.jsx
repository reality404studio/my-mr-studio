import { useCallback, useEffect, useMemo, useState } from 'react';
import { studioApi } from './api.js';
import { useStudioEvents } from './events.js';
import { STATUSES, actorLabel, isAgent, timeAgo } from './constants.js';

export default function Home() {
  const [data, setData] = useState(null);
  const [modes, setModes] = useState([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try { setData(await studioApi.projects()); } catch (e) { setError(e.message); }
  }, []);

  useEffect(() => {
    document.title = 'VR 앱 만들기';
    load();
    studioApi.templates().then(setModes).catch((e) => setError(e.message));
  }, [load]);

  const live = useStudioEvents((paths) => {
    if (!paths || paths.some((p) => p.endsWith('pipeline.json') || p.endsWith('log.jsonl') || p.startsWith('templates/'))) load();
    if (paths?.some((p) => p.startsWith('templates/'))) studioApi.templates().then(setModes).catch(() => {});
  });

  const modeById = useMemo(() => Object.fromEntries(modes.map((m) => [m.id, m])), [modes]);
  const studio = data?.studio || { name: 'VR 앱 만들기' };

  return (
    <div className="home">
      <header className="home__head">
        <div>
          <h1>{studio.name}</h1>
          {studio.subtitle && <p>{studio.subtitle}</p>}
        </div>
        <span className={`live is-${live}`}><span className="dot" aria-hidden="true" />{live === 'live' ? '실시간 연결됨' : live === 'down' ? '연결 끊김' : '연결 중'}</span>
      </header>

      {data?.shared && <SharedBand shared={data.shared} />}

      <section className="home__apps" aria-labelledby="apps-title">
        <div className="section-head">
          <h2 id="apps-title">앱</h2>
          <p>앱마다 보드가 하나씩 있어요. 만들 때 고른 모드에 따라 단계와 과업이 미리 깔려요.</p>
        </div>
        <ul className="app-grid">
          {data?.apps.map((app) => <AppCard key={app.id} app={app} mode={modeById[app.template]} />)}
          <li>
            <button className="app-card app-card--new" onClick={() => setCreating(true)}>
              <span className="plus" aria-hidden="true">+</span>
              <strong>새 앱 만들기</strong>
              <span>모드를 골라 시작해요</span>
            </button>
          </li>
        </ul>
      </section>

      {creating && <NewAppDialog modes={modes} existing={data?.apps.map((a) => a.id) || []} onClose={() => setCreating(false)} />}

      {error && (
        <div className="toast" role="alert">
          {error}
          <button className="icon-btn" onClick={() => setError(null)} aria-label="닫기">✕</button>
        </div>
      )}
    </div>
  );
}

function Strip({ nodes }) {
  return (
    <span className="strip" aria-hidden="true">
      {nodes.map((n) => <span key={n.id} className={`strip__seg is-${n.status}`} title={`${n.title} · ${STATUSES[n.status] || n.status}`} />)}
    </span>
  );
}

function summary(nodes) {
  const c = { done: 0, doing: 0, review: 0, blocked: 0 };
  for (const n of nodes) if (c[n.status] !== undefined) c[n.status]++;
  return c;
}

function SharedBand({ shared }) {
  const c = summary(shared.nodes);
  return (
    <section className="shared-band" aria-labelledby="shared-title">
      <div className="shared-band__text">
        <h2 id="shared-title"><a href="#/shared">{shared.name || '공통'}</a></h2>
        <p>{shared.subtitle}</p>
        <p className="shared-band__count">
          {c.done}/{shared.nodes.length} 완료
          {c.review > 0 && <span className="is-review"> · 확인 필요 {c.review}</span>}
          {c.doing > 0 && <span className="is-doing"> · 진행 중 {c.doing}</span>}
        </p>
      </div>
      <ul className="shared-band__nodes">
        {shared.nodes.map((n) => {
          const users = shared.usage?.[n.id] || [];
          return (
            <li key={n.id}>
              <a className={`shared-chip node--${n.type} is-${n.status}`} href={`#/shared?node=${encodeURIComponent(n.id)}`}>
                <span className="dot" aria-hidden="true" />
                <span className="shared-chip__title">{n.title}</span>
                {users.length > 0 && <span className="shared-chip__use">앱 {users.length}</span>}
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function AppCard({ app, mode }) {
  const c = summary(app.nodes);
  const next = app.next?.[0];
  return (
    <li>
      <a className="app-card" href={`#/app/${encodeURIComponent(app.id)}`}>
        <span className={`mode-tag mode--${app.template}`}>{mode?.name || app.template || '모드 없음'}</span>
        <h3>{app.name}</h3>
        {app.subtitle && <p className="app-card__sub">{app.subtitle}</p>}
        <Strip nodes={app.nodes} />
        <p className="app-card__count">
          과업 {c.done}/{app.nodes.length} 완료
        </p>
        {next && (
          <p className="app-card__next">
            <span className={`by by--${next.by}`}>{next.by === 'human' ? '사람' : 'AI'}</span>
            <span>지금 할 일: <strong>{next.title}</strong></span>
          </p>
        )}
        {app.last && (
          <p className={isAgent(app.last.actor) ? 'app-card__last is-agent' : 'app-card__last'}>
            {actorLabel(app.last.actor)} · {timeAgo(app.last.ts)}
          </p>
        )}
      </a>
    </li>
  );
}

function slugify(name) {
  return name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

function NewAppDialog({ modes, existing, onClose }) {
  const [name, setName] = useState('');
  const [id, setId] = useState('');
  const [idTouched, setIdTouched] = useState(false);
  const [subtitle, setSubtitle] = useState('');
  const [template, setTemplate] = useState(modes[0]?.id || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => { if (!template && modes[0]) setTemplate(modes[0].id); }, [modes, template]);
  useEffect(() => { if (!idTouched) setId(slugify(name)); }, [name, idTouched]);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const idError = !id ? '영문 id를 적어 주세요. 폴더 이름이 돼요.'
    : !/^[a-z0-9][a-z0-9_-]*$/.test(id) ? '영문 소문자, 숫자, - 만 쓸 수 있어요.'
    : existing.includes(id) ? '이미 있는 id예요.'
    : null;

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim() || idError || !template) return;
    setBusy(true);
    try {
      const r = await studioApi.createApp({ id, name, subtitle, template });
      window.location.hash = `#/app/${encodeURIComponent(r.id)}`;
    } catch (e2) { setErr(e2.message); setBusy(false); }
  };

  return (
    <div className="dialog-back" onClick={onClose}>
      <form className="dialog" role="dialog" aria-modal="true" aria-labelledby="new-app-title" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="dialog__head">
          <h2 id="new-app-title">새 앱 만들기</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="닫기">✕</button>
        </div>

        <label className="field">
          <span>앱 이름</span>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 책상 위 꿈" />
        </label>
        <label className="field">
          <span>id <em>폴더 이름. 나중에 바꾸기 어려워요</em></span>
          <input value={id} onChange={(e) => { setIdTouched(true); setId(e.target.value.toLowerCase()); }} placeholder="예: desk-dream" aria-invalid={!!(name && idError)} />
          {name && idError && <small className="field__err">{idError}</small>}
        </label>
        <label className="field">
          <span>한 줄 소개 <em>선택</em></span>
          <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="사용자가 무엇을 겪는지" />
        </label>

        <fieldset className="modes">
          <legend>어디서 출발할까요?</legend>
          {modes.map((m) => (
            <label key={m.id} className={`mode-card mode--${m.id}${template === m.id ? ' is-on' : ''}`}>
              <input type="radio" name="template" value={m.id} checked={template === m.id} onChange={() => setTemplate(m.id)} />
              <span className="mode-card__name">{m.name}</span>
              {m.startsFrom && <span className="mode-card__from">출발점: {m.startsFrom}</span>}
              <span className="mode-card__desc">{m.description}</span>
              <ol className="mode-card__stages">
                {m.stages.map((st, i) => (
                  <li key={st.id}>
                    <span className="mode-card__stage">{i + 1}. {st.title}</span>
                    <span className="mode-card__tasks">{st.tasks.map((t) => t.title).join(', ') || (m.uses.length ? '공통 모듈' : '')}</span>
                  </li>
                ))}
              </ol>
              {m.uses?.length > 0 && <span className="mode-card__uses">공통에서 가져옴: {m.uses.map((u) => u.title).join(', ')}</span>}
            </label>
          ))}
        </fieldset>

        {err && <p className="field__err">{err}</p>}
        <div className="dialog__foot">
          <button type="button" className="ghost" onClick={onClose}>취소</button>
          <button type="submit" className="primary" disabled={busy || !name.trim() || !!idError || !template}>{busy ? '만드는 중' : '앱 만들기'}</button>
        </div>
      </form>
    </div>
  );
}
