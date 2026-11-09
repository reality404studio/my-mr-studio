import { useCallback, useEffect, useMemo, useState } from 'react';
import ProjectView from './ProjectView.jsx';
import HumanView from './HumanView.jsx';
import SpecView from './SpecView.jsx';
import DrawerView from './DrawerView.jsx';
import { projectApi, studioApi } from './api.js';
import { useStudioEvents } from './events.js';
import { VIEWS, SHARED_VIEWS, actorLabel, timeAgo, viewHref } from './constants.js';

// 앱 하나를 네 화면으로 본다. 화면마다 같은 studio/ 파일을 읽고, 보여주는 방식만 다르다.
//   사람 화면    결정 대기, 질문, 추정 확인, 영수증, 알림. 사람은 고르고 답하기만 한다
//   명세         scene_spec.yaml 을 칸마다 정해짐 / 추정 / 빈칸 / 모름으로 칠한 빈칸 지도
//   에이전트 장부 단계 > 과업 > 하위 과업 보드. 에이전트의 작업 큐
//   결정 서랍    모든 앱이 함께 쓰는 제약 · 내 눈 · 보류 · 번역표
export default function Workspace({ pid, mode, node }) {
  const isShared = pid === 'shared';
  const api = useMemo(() => projectApi(pid), [pid]);
  const [overview, setOverview] = useState(null);
  const [missing, setMissing] = useState(null);
  const [version, setVersion] = useState(0);

  const loadOverview = useCallback(async () => {
    if (isShared) return;
    try { setOverview(await api.overview()); } catch (e) { setMissing(e.message); }
  }, [api, isShared]);
  useEffect(() => { loadOverview(); }, [loadOverview]);

  const rel = isShared ? 'shared' : `apps/${pid}`;
  const live = useStudioEvents((paths) => {
    if (!paths || paths.some((p) => p.startsWith(`${rel}/`) || p.startsWith('shared/'))) {
      loadOverview();
      setVersion((v) => v + 1);
    }
  });

  if (missing) {
    return (
      <div className="missing">
        <p>{missing}</p>
        <a className="primary" href="#/">홈으로</a>
      </div>
    );
  }

  const badges = overview ? {
    human: overview.decisions.length + overview.questions.length + overview.guesses.filter((g) => g.confidence === 'low').length + overview.receipts.length + overview.alerts.length,
    spec: overview.summary?.verdict === 'thin' ? '!' : 0,
  } : {};
  const nav = <ViewNav pid={pid} mode={mode} badges={badges} alerts={overview?.alerts?.length || 0} />;

  if (mode === 'ledger') return <ProjectView key={`${pid}:${node || ''}`} pid={pid} initialNode={node} nav={nav} />;

  const title = isShared ? '공통' : overview?.project?.name || '';
  return (
    <div className="page">
      <header className="bar">
        <div className="bar__title">
          <nav className="crumb" aria-label="위치">
            <a href="#/">VR 앱 만들기</a>
            <span aria-hidden="true">/</span>
            <span>{isShared ? '공통' : '앱'}</span>
          </nav>
          <h1>{title}</h1>
        </div>
        {nav}
        <div className="bar__actions">
          <span className={`live is-${live}`} title="에이전트가 studio/ 파일을 고치면 바로 반영돼요">
            <span className="dot" aria-hidden="true" />
            {live === 'live' ? (overview?.lastAgent ? `${actorLabel(overview.lastAgent.actor)} ${timeAgo(overview.lastAgent.ts)}` : '실시간 연결됨') : live === 'down' ? '연결 끊김, 다시 시도 중' : '연결 중'}
          </span>
        </div>
      </header>
      <main className="page__body">
        {mode === 'human' && <HumanView pid={pid} api={api} data={overview} reload={loadOverview} />}
        {mode === 'spec' && <SpecView pid={pid} api={api} version={version} />}
        {mode === 'drawer' && <DrawerView pid={pid} version={version} />}
      </main>
    </div>
  );
}

export function ViewNav({ pid, mode, badges = {}, alerts = 0 }) {
  const views = pid === 'shared' ? SHARED_VIEWS : VIEWS;
  return (
    <nav className="viewnav" aria-label="화면">
      {views.map((v) => (
        <a key={v.id} href={viewHref(pid, v.id)} className={`viewnav__item${mode === v.id ? ' is-on' : ''}`} aria-current={mode === v.id ? 'page' : undefined} title={v.hint}>
          <span>{v.label}</span>
          {badges[v.id] ? <span className={`viewnav__badge${v.id === 'human' && alerts ? ' is-alert' : ''}`}>{badges[v.id]}</span> : null}
        </a>
      ))}
    </nav>
  );
}

export { studioApi };
