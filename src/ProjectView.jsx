import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, MarkerType, useNodesState, useEdgesState, useReactFlow } from '@xyflow/react';
import { LaneNode, AddLaneNode, TaskNode, G, taskHeight } from './BoardNodes.jsx';
import Inspector from './Inspector.jsx';
import { projectApi, studioApi } from './api.js';
import { useStudioEvents } from './events.js';
import { TYPES, KINDS, actorLabel, actionLabel, isAgent, timeAgo } from './constants.js';

const nodeTypes = { lane: LaneNode, addLane: AddLaneNode, task: TaskNode };
const laneX = (i) => i * (G.laneW + G.laneGap);

// 단계 = 열, 과업 = 열 안의 카드(순서대로 위에서 아래), 하위 과업 = 카드 안의 행. 위치는 저장하지 않고 매번 계산한다.
function layout(p, selectedId, handlers) {
  const byId = Object.fromEntries(p.nodes.map((n) => [n.id, n]));
  const selected = byId[selectedId];
  const selectedTask = selected?.parent || selected?.id;
  const tasks = [];
  let bottom = 0;
  p.stages.forEach((st, i) => {
    let y = G.laneHead + 12;
    const col = p.nodes.filter((n) => !n.parent && n.stage === st.id).sort((a, b) => a.order - b.order);
    for (const t of col) {
      tasks.push({
        id: t.id, type: 'task', position: { x: laneX(i) + (G.laneW - G.taskW) / 2, y },
        draggable: false, selectable: false, zIndex: 2,
        data: { node: t, subs: (t.children || []).map((c) => byId[c]).filter(Boolean), selected: selectedTask === t.id, selectedSub: selected?.parent === t.id ? selected.id : null, onSelect: handlers.select },
      });
      y += taskHeight(t) + G.taskGap;
    }
    bottom = Math.max(bottom, y);
  });
  const height = Math.max(bottom + G.pad, 480);
  const lanes = p.stages.map((st, i) => {
    const col = p.nodes.filter((n) => !n.parent && n.stage === st.id);
    return {
      id: `lane:${st.id}`, type: 'lane', position: { x: laneX(i), y: 0 },
      draggable: false, selectable: false, focusable: false, zIndex: 0,
      data: { stage: st, index: i, total: p.stages.length, count: col.length, done: col.filter((n) => n.status === 'done').length, height, onAdd: handlers.add, onEdit: handlers.editStage },
    };
  });
  const addLane = { id: 'lane:+', type: 'addLane', position: { x: laneX(p.stages.length), y: 0 }, draggable: false, selectable: false, focusable: false, data: { height: Math.min(height, 200), onAddStage: handlers.addStage } };
  return [...lanes, addLane, ...tasks];
}

function toEdges(p) {
  const status = Object.fromEntries(p.nodes.map((n) => [n.id, n.status]));
  return p.edges.map((e) => {
    const feedback = e.kind === 'feedback';
    const live = !feedback && status[e.target] === 'doing';
    return {
      id: e.id, source: e.source, target: e.target, label: e.label, type: 'smoothstep', zIndex: 1,
      animated: live,
      className: feedback ? 'is-feedback' : live ? 'is-live' : '',
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
    };
  });
}

export default function ProjectView(props) {
  return (
    <ReactFlowProvider>
      <Project {...props} />
    </ReactFlowProvider>
  );
}

function Project({ pid, initialNode }) {
  const api = useMemo(() => projectApi(pid), [pid]);
  const isShared = pid === 'shared';
  const [pipeline, setPipeline] = useState(null);
  const [missing, setMissing] = useState(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedId, setSelectedId] = useState(initialNode || null);
  const [detail, setDetail] = useState(null);
  const [log, setLog] = useState([]);
  const [panel, setPanel] = useState(null); // 'next' | 'log' | null
  const [error, setError] = useState(null);
  const [addFor, setAddFor] = useState(null); // 과업을 추가할 단계 id
  const [modes, setModes] = useState({});
  const [sharedNodes, setSharedNodes] = useState([]);
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  const flow = useReactFlow();
  const placed = useRef(false);

  const loadPipeline = useCallback(async () => {
    try {
      const p = await api.pipeline();
      setPipeline(p);
      document.title = `${p.project?.name || pid} · VR 앱 만들기`;
    } catch (e) { setMissing(e.message); }
  }, [api, pid]);

  const loadDetail = useCallback(async (id = selectedRef.current) => {
    if (!id) return setDetail(null);
    try { setDetail(await api.node(id)); }
    catch { setDetail(null); setSelectedId(null); }
  }, [api]);

  const loadLog = useCallback(async () => {
    try { setLog(await api.log(40)); } catch {}
  }, [api]);

  const loadShared = useCallback(async () => {
    if (isShared) return;
    try { setSharedNodes((await projectApi('shared').pipeline()).nodes.filter((n) => !n.parent)); } catch {}
  }, [isShared]);

  useEffect(() => { loadPipeline(); loadLog(); loadShared(); }, [loadPipeline, loadLog, loadShared]);
  useEffect(() => { loadDetail(selectedId); }, [selectedId, loadDetail]);
  useEffect(() => {
    studioApi.templates().then((ts) => setModes(Object.fromEntries(ts.map((t) => [t.id, t])))).catch(() => {});
  }, []);

  const handlers = useMemo(() => ({
    select: (id) => setSelectedId(id),
    add: (stageId) => setAddFor(stageId),
    addStage: async () => {
      const title = window.prompt('새 단계 이름');
      if (!title?.trim()) return;
      try { await api.addStage({ title: title.trim() }); } catch (e) { setError(e.message); }
    },
    editStage: async (id, action) => {
      try {
        if (action === 'rename') {
          const st = pipeline?.stages.find((s) => s.id === id);
          const title = window.prompt('단계 이름', st?.title || '');
          if (title === null) return;
          const goal = window.prompt('이 단계의 목표 (한 줄)', st?.goal || '');
          await api.updateStage(id, { title, ...(goal !== null ? { goal } : {}) });
        } else if (action === 'left' || action === 'right') await api.updateStage(id, { move: action });
        else if (action === 'delete' && window.confirm('빈 단계를 지울까요?')) await api.deleteStage(id);
      } catch (e) { setError(e.message); }
    },
  }), [api, pipeline]);

  useEffect(() => {
    if (!pipeline) return;
    setNodes(layout(pipeline, selectedId, handlers));
    setEdges(toEdges(pipeline));
    if (!placed.current) {
      placed.current = true;
      requestAnimationFrame(() => {
        const target = initialNode && pipeline.nodes.find((n) => n.id === initialNode);
        const top = target?.parent ? pipeline.nodes.find((n) => n.id === target.parent) : target;
        const i = top ? pipeline.stages.findIndex((s) => s.id === top.stage) : 0;
        flow.setViewport({ x: 24 - Math.max(0, i - 1) * (G.laneW + G.laneGap) * 0.9, y: 16, zoom: 0.9 });
      });
    }
  }, [pipeline, selectedId, handlers, setNodes, setEdges, flow, initialNode]);

  const live = useStudioEvents((paths) => {
    if (!paths) { loadPipeline(); return; }
    const rel = pipeline?.relDir || (isShared ? 'shared' : `apps/${pid}`);
    const mine = paths.some((p) => p.startsWith(`${rel}/`));
    const sharedChanged = !isShared && paths.some((p) => p === 'shared/pipeline.json');
    const appsChanged = isShared && paths.some((p) => /^apps\/[^/]+\/pipeline\.json$/.test(p));
    if (mine || sharedChanged || appsChanged) loadPipeline();
    if (mine) loadLog();
    if (sharedChanged) loadShared();
    const sel = selectedRef.current;
    if (sel && (sharedChanged || appsChanged || paths.some((p) => p === `${rel}/pipeline.json` || p.startsWith(`${rel}/nodes/${sel}/`)))) loadDetail(sel);
  });

  const nodesById = useMemo(() => Object.fromEntries((pipeline?.nodes || []).map((n) => [n.id, n])), [pipeline]);

  const onConnect = useCallback((c) => api.addEdge(c.source, c.target).catch((e) => setError(e.message)), [api]);
  const onEdgeClick = useCallback((_e, edge) => {
    const from = nodesById[edge.source]?.title || edge.source;
    const to = nodesById[edge.target]?.title || edge.target;
    if (window.confirm(`"${from}" → "${to}" 연결을 지울까요?`)) api.deleteEdge(edge.id).catch((e) => setError(e.message));
  }, [api, nodesById]);

  const addTask = async (type) => {
    const stage = addFor;
    setAddFor(null);
    try {
      const n = await api.createNode(type === 'shared'
        ? { type, title: '', ref: '', stage }
        : { type, title: `새 ${TYPES[type].label} 과업`, stage });
      setSelectedId(n.id);
    } catch (e) { setError(e.message); }
  };

  const tops = useMemo(() => (pipeline?.nodes || []).filter((n) => !n.parent), [pipeline]);
  const counts = useMemo(() => {
    const c = { total: 0, done: 0, doing: 0, review: 0, blocked: 0 };
    for (const n of tops) { c.total++; if (c[n.status] !== undefined) c[n.status]++; }
    return c;
  }, [tops]);
  const next = pipeline?.next || [];

  const lastAgent = log.find((l) => isAgent(l.actor));
  const mode = modes[pipeline?.project?.template];
  const addTypes = Object.entries(TYPES).filter(([k]) => !(isShared && k === 'shared'));
  const addStageTitle = pipeline?.stages.find((s) => s.id === addFor)?.title;

  if (missing) {
    return (
      <div className="missing">
        <p>{missing}</p>
        <a className="primary" href="#/">홈으로</a>
      </div>
    );
  }

  return (
    <div className={`app${detail ? ' has-inspector' : ''}`}>
      <header className="bar">
        <div className="bar__title">
          <nav className="crumb" aria-label="위치">
            <a href="#/">VR 앱 만들기</a>
            <span aria-hidden="true">/</span>
            {isShared ? <span>공통</span> : mode ? <span className={`mode-tag mode--${mode.id}`}>{mode.name}</span> : <span>앱</span>}
          </nav>
          <h1>{pipeline?.project?.name || ''}</h1>
          {pipeline?.project?.subtitle && <p>{pipeline.project.subtitle}</p>}
        </div>
        <div className="bar__summary" aria-label="진행 요약">
          <span>과업 <strong>{counts.done}</strong>/{counts.total} 완료</span>
          {counts.doing > 0 && <span className="is-doing">진행 중 {counts.doing}</span>}
          {counts.review > 0 && <span className="is-review">확인 필요 {counts.review}</span>}
          {counts.blocked > 0 && <span className="is-blocked">막힘 {counts.blocked}</span>}
        </div>
        <div className="bar__actions">
          <span className={`live is-${live}`} title="에이전트가 studio/ 파일을 고치면 바로 반영돼요">
            <span className="dot" aria-hidden="true" />
            {live === 'live' ? (lastAgent ? `${actorLabel(lastAgent.actor)} ${timeAgo(lastAgent.ts)}` : '실시간 연결됨') : live === 'down' ? '연결 끊김, 다시 시도 중' : '연결 중'}
          </span>
          <button className={`ghost${panel === 'next' ? ' is-on' : ''}`} onClick={() => setPanel((v) => (v === 'next' ? null : 'next'))} aria-expanded={panel === 'next'}>지금 할 일 {next.length}</button>
          <button className={`ghost${panel === 'log' ? ' is-on' : ''}`} onClick={() => setPanel((v) => (v === 'log' ? null : 'log'))} aria-expanded={panel === 'log'}>기록</button>
          <button className="primary" onClick={() => setAddFor(pipeline?.stages[0]?.id || null)}>과업 추가</button>
        </div>
      </header>

      <main className="canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_e, n) => (n.id.startsWith('lane:') ? setSelectedId(null) : setSelectedId(n.id))}
          onPaneClick={() => setSelectedId(null)}
          onEdgeClick={onEdgeClick}
          nodesDraggable={false}
          deleteKeyCode={null}
          panOnScroll
          zoomOnScroll={false}
          minZoom={0.25}
          maxZoom={1.4}
          attributionPosition="bottom-center"
        >
          <Background gap={24} size={1.2} color="var(--grid)" />
          <MiniMap pannable zoomable nodeColor={(n) => (n.type === 'task' ? `var(--status-${n.data?.node?.status || 'todo'})` : 'transparent')} nodeStrokeColor={(n) => (n.type === 'lane' ? 'var(--grid)' : 'transparent')} maskColor="var(--minimap-mask)" />
          <Controls showInteractive={false} />
        </ReactFlow>

        {addFor && (
          <div className="add-pop" role="dialog" aria-label="과업 추가">
            <div className="add-pop__head">
              <span>추가할 단계</span>
              <select value={addFor} onChange={(e) => setAddFor(e.target.value)} aria-label="단계">
                {pipeline?.stages.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
              </select>
              <button className="icon-btn" onClick={() => setAddFor(null)} aria-label="닫기">✕</button>
            </div>
            <ul className="add__menu is-static" role="menu" aria-label={`${addStageTitle} 단계에 추가`}>
              {addTypes.map(([k, t]) => (
                <li key={k}><button role="menuitem" className={`add__item node--${k}`} onClick={() => addTask(k)}><span className="swatch" aria-hidden="true" /><strong>{t.label}</strong><span>{t.hint}</span></button></li>
              ))}
            </ul>
          </div>
        )}

        {panel === 'next' && (
          <section className="side-panel" aria-label="지금 할 일">
            <h2>지금 할 일</h2>
            <p className="hint">앞 과업이 끝났고, 과업 안에서 순서상 차례인 하위 과업이에요. 에이전트는 <code>npm run studio -- next --app {pid}</code> 로 같은 목록을 봐요.</p>
            {next.length === 0 && <p className="hint">지금 시작할 수 있는 일이 없어요.</p>}
            {['agent', 'human'].map((by) => {
              const items = next.filter((x) => x.by === by);
              if (!items.length) return null;
              return (
                <div key={by} className="next-group">
                  <h3>{by === 'agent' ? '에이전트' : '사람'}</h3>
                  <ol>
                    {items.map((it) => (
                      <li key={it.id}>
                        <button className={`next-item is-${it.status}`} onClick={() => setSelectedId(it.id)}>
                          <span className="dot" aria-hidden="true" />
                          <span className="next-item__body">
                            <span className="next-item__title">{it.kind && <span className={`kind kind--${it.kind}`}>{KINDS[it.kind]}</span>}{it.title}</span>
                            <span className="next-item__where">{it.stage} · {it.taskTitle}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ol>
                </div>
              );
            })}
          </section>
        )}

        {panel === 'log' && (
          <section className="side-panel" aria-label="최근 기록">
            <h2>최근 기록</h2>
            {log.length === 0 && <p className="hint">아직 기록이 없어요.</p>}
            <ol className="log-list">
              {log.map((l, i) => (
                <li key={`${l.ts}-${i}`}>
                  <span className={isAgent(l.actor) ? 'who is-agent' : 'who'}>{actorLabel(l.actor)}</span>
                  <span className="what">
                    {actionLabel(l.action)}
                    {l.nodeId && <button className="link" onClick={() => setSelectedId(l.nodeId)}>{nodesById[l.nodeId]?.title || l.nodeId}</button>}
                    {l.detail && <span className="detail">{l.detail}</span>}
                  </span>
                  <time dateTime={l.ts}>{timeAgo(l.ts)}</time>
                </li>
              ))}
            </ol>
          </section>
        )}

        {error && (
          <div className="toast" role="alert">
            {error}
            <button className="icon-btn" onClick={() => setError(null)} aria-label="닫기">✕</button>
          </div>
        )}
      </main>

      {detail && (
        <Inspector
          key={detail.node.id}
          api={api}
          isShared={isShared}
          detail={detail}
          stages={pipeline?.stages || []}
          nodesById={nodesById}
          sharedNodes={sharedNodes}
          onSelect={setSelectedId}
          onClose={() => setSelectedId(null)}
          onError={setError}
          onArchived={() => setSelectedId(detail.node.parent || null)}
        />
      )}
    </div>
  );
}
