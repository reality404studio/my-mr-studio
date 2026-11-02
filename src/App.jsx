import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ReactFlow, Background, Controls, MiniMap, MarkerType, useNodesState, useEdgesState, useReactFlow } from '@xyflow/react';
import StudioNode from './StudioNode.jsx';
import Inspector from './Inspector.jsx';
import { api } from './api.js';
import { TYPES, actorLabel, actionLabel, isAgent, timeAgo } from './constants.js';

const nodeTypes = { studio: StudioNode };

function toFlowNodes(pipeline, selectedId) {
  return pipeline.nodes.map((n) => ({ id: n.id, type: 'studio', position: n.position || { x: 0, y: 0 }, data: n, selected: n.id === selectedId }));
}

function toFlowEdges(pipeline) {
  const status = Object.fromEntries(pipeline.nodes.map((n) => [n.id, n.status]));
  return pipeline.edges.map((e) => {
    const live = status[e.target] === 'doing';
    return {
      id: e.id, source: e.source, target: e.target, label: e.label, type: 'smoothstep',
      animated: live,
      className: live ? 'edge is-live' : 'edge',
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
    };
  });
}

export default function App() {
  const [pipeline, setPipeline] = useState(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [log, setLog] = useState([]);
  const [showLog, setShowLog] = useState(false);
  const [live, setLive] = useState('connecting');
  const [error, setError] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const dragging = useRef(false);
  const selectedRef = useRef(null);
  selectedRef.current = selectedId;
  const flow = useReactFlow();
  const fitted = useRef(false);

  const loadPipeline = useCallback(async () => {
    try {
      const p = await api.pipeline();
      setPipeline(p);
      if (!dragging.current) setNodes(toFlowNodes(p, selectedRef.current));
      setEdges(toFlowEdges(p));
      if (!fitted.current) { fitted.current = true; requestAnimationFrame(() => flow.fitView({ padding: 0.12, maxZoom: 1 })); }
    } catch (e) { setError(e.message); }
  }, [flow, setNodes, setEdges]);

  const loadDetail = useCallback(async (id = selectedRef.current) => {
    if (!id) return setDetail(null);
    try { setDetail(await api.node(id)); }
    catch { setDetail(null); setSelectedId(null); }
  }, []);

  const loadLog = useCallback(async () => {
    try { setLog(await api.log(40)); } catch {}
  }, []);

  useEffect(() => { loadPipeline(); loadLog(); }, [loadPipeline, loadLog]);
  useEffect(() => { loadDetail(selectedId); }, [selectedId, loadDetail]);

  // 파일이 바뀌면(사람이든 에이전트든) 서버가 알려준다.
  useEffect(() => {
    let es;
    let retry;
    const connect = () => {
      es = new EventSource('/api/events');
      es.onopen = () => setLive('live');
      es.onerror = () => { setLive('down'); es.close(); retry = setTimeout(connect, 2000); };
      es.onmessage = (msg) => {
        const ev = JSON.parse(msg.data);
        if (ev.type === 'hello') { loadPipeline(); return; }
        if (ev.type !== 'change') return;
        loadPipeline();
        loadLog();
        const sel = selectedRef.current;
        if (sel && ev.paths.some((p) => p === 'pipeline.json' || p.startsWith(`nodes/${sel}/`) || p.startsWith(`nodes${'\\'}${sel}${'\\'}`))) loadDetail(sel);
      };
    };
    connect();
    return () => { clearTimeout(retry); es?.close(); };
  }, [loadPipeline, loadLog, loadDetail]);

  const nodesById = useMemo(() => Object.fromEntries((pipeline?.nodes || []).map((n) => [n.id, n])), [pipeline]);

  const onConnect = useCallback((c) => api.addEdge(c.source, c.target).catch((e) => setError(e.message)), []);
  const onNodeDragStart = () => { dragging.current = true; };
  const onNodeDragStop = useCallback((_e, _node, dragged) => {
    dragging.current = false;
    for (const n of dragged) {
      api.updateNode(n.id, { position: { x: Math.round(n.position.x), y: Math.round(n.position.y) } }).catch((e) => setError(e.message));
    }
  }, []);
  const onEdgeClick = useCallback((_e, edge) => {
    const from = nodesById[edge.source]?.title || edge.source;
    const to = nodesById[edge.target]?.title || edge.target;
    if (window.confirm(`"${from}" → "${to}" 연결을 지울까요?`)) api.deleteEdge(edge.id).catch((e) => setError(e.message));
  }, [nodesById]);

  const addNode = async (type) => {
    setAddOpen(false);
    const pane = document.querySelector('.canvas')?.getBoundingClientRect();
    const center = pane ? flow.screenToFlowPosition({ x: pane.left + pane.width / 2, y: pane.top + pane.height / 2 }) : { x: 0, y: 0 };
    // 화면 가운데에 놓되, 다른 노드와 겹치면 비어 있는 자리까지 비켜 놓는다.
    let pos = { x: Math.round(center.x - 130), y: Math.round(center.y - 60) };
    const taken = (pipeline?.nodes || []).map((n) => n.position);
    for (let i = 0; i < 24 && taken.some((t) => Math.abs(t.x - pos.x) < 280 && Math.abs(t.y - pos.y) < 170); i++) {
      pos = { x: pos.x + 40, y: pos.y + 180 };
    }
    try {
      const n = await api.createNode({ type, title: `새 ${TYPES[type].label}`, position: pos });
      setSelectedId(n.id);
    } catch (e) { setError(e.message); }
  };

  const counts = useMemo(() => {
    const c = { total: 0, done: 0, doing: 0, review: 0, blocked: 0 };
    for (const n of pipeline?.nodes || []) { c.total++; if (c[n.status] !== undefined) c[n.status]++; }
    return c;
  }, [pipeline]);

  const lastAgent = log.find((l) => isAgent(l.actor));

  return (
    <div className={`app${detail ? ' has-inspector' : ''}`}>
      <header className="bar">
        <div className="bar__title">
          <h1>{pipeline?.project?.name || 'MR 스튜디오'}</h1>
          {pipeline?.project?.subtitle && <p>{pipeline.project.subtitle}</p>}
        </div>
        <div className="bar__summary" aria-label="진행 요약">
          <span><strong>{counts.done}</strong>/{counts.total} 완료</span>
          {counts.doing > 0 && <span className="is-doing">진행 중 {counts.doing}</span>}
          {counts.review > 0 && <span className="is-review">확인 필요 {counts.review}</span>}
          {counts.blocked > 0 && <span className="is-blocked">막힘 {counts.blocked}</span>}
        </div>
        <div className="bar__actions">
          <span className={`live is-${live}`} title="에이전트가 studio/ 파일을 고치면 바로 반영돼요">
            <span className="dot" aria-hidden="true" />
            {live === 'live' ? (lastAgent ? `${actorLabel(lastAgent.actor)} ${timeAgo(lastAgent.ts)}` : '실시간 연결됨') : live === 'down' ? '연결 끊김, 다시 시도 중' : '연결 중'}
          </span>
          <button className="ghost" onClick={() => setShowLog((v) => !v)} aria-expanded={showLog}>기록</button>
          <div className="add">
            <button className="primary" onClick={() => setAddOpen((v) => !v)} aria-expanded={addOpen}>단계 추가</button>
            {addOpen && (
              <ul className="add__menu" role="menu">
                {Object.entries(TYPES).map(([k, t]) => (
                  <li key={k}><button role="menuitem" className={`add__item node--${k}`} onClick={() => addNode(k)}><span className="swatch" aria-hidden="true" /><strong>{t.label}</strong><span>{t.hint}</span></button></li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </header>

      <main className="canvas" onClick={() => addOpen && setAddOpen(false)}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_e, n) => setSelectedId(n.id)}
          onPaneClick={() => setSelectedId(null)}
          onNodeDragStart={onNodeDragStart}
          onNodeDragStop={onNodeDragStop}
          onEdgeClick={onEdgeClick}
          deleteKeyCode={null}
          minZoom={0.2}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={24} size={1.4} color="var(--grid)" />
          <MiniMap pannable zoomable nodeColor={(n) => `var(--status-${n.data?.status || 'todo'})`} maskColor="var(--minimap-mask)" />
          <Controls showInteractive={false} />
        </ReactFlow>

        {pipeline && pipeline.nodes.length === 0 && (
          <div className="empty">
            <p>아직 단계가 없어요.</p>
            <button className="primary" onClick={() => addNode('reference')}>무드보드부터 시작하기</button>
          </div>
        )}

        {showLog && (
          <section className="log" aria-label="최근 기록">
            <h2>최근 기록</h2>
            {log.length === 0 && <p className="hint">아직 기록이 없어요.</p>}
            <ol>
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
          detail={detail}
          nodesById={nodesById}
          onSelect={(id) => { setSelectedId(id); const n = nodesById[id]; if (n) flow.setCenter(n.position.x + 130, n.position.y + 80, { zoom: flow.getZoom(), duration: 300 }); }}
          onClose={() => setSelectedId(null)}
          onError={setError}
          onArchived={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
