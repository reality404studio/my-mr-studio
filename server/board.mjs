// 보드 구조: 단계(stage) > 과업(task) > 하위 과업(subtask)
//
// - 단계: 왼쪽에서 오른쪽으로 진행하는 열. pipeline.stages 의 순서가 곧 진행 순서
// - 과업: 에이전트가 맡는 작업 묶음. 산출물 하나를 책임진다. node.stage 로 단계에 속함
// - 하위 과업: 과업 안의 행동. node.parent 로 과업에 속함. kind(특성)와 by(사람/에이전트)를 가진다
// - 연결(edge): 과업 사이의 의존. target 과업은 source 과업이 끝나야 시작할 수 있다
//   kind: "feedback" 인 연결(검수 → 구현 같은 되돌림)은 시작을 막지 않는다
//
// 상태 규칙
// - 하위 과업이 있는 과업의 상태는 하위 과업에서 계산한다 (직접 바꾸지 않음)
// - "공통" 과업(type shared)의 상태는 공통 캔버스의 대상 노드를 따른다
// - 하위 과업은 순서대로 진행한다. 앞의 하위 과업이 끝나야 다음 차례가 된다

export const KINDS = {
  decide: '결정',
  collect: '수집',
  analyze: '분석',
  write: '작성',
  make: '생성',
  build: '구현',
  verify: '검증',
};
export const ACTORS = { human: '사람', agent: '에이전트' };
export const STATUSES = ['todo', 'doing', 'review', 'proof', 'done', 'blocked'];

// 증명 게이트: 에이전트 카드(하위 과업이 없는 과업, 또는 하위 과업)는 proof 를 거쳐야 done 이 된다.
// 사람(by human) 카드와 공통 과업은 게이트 밖이다.
export function isGated(node, hasKids) {
  return !hasKids && node.type !== 'shared' && node.by !== 'human';
}

// done 으로 갈 수 없는 이유 목록. 빈 배열이면 통과.
export function proofGaps(node, assets) {
  const gaps = [];
  if (!String(node.success || '').trim()) gaps.push('성공 조건(success)이 비어 있어요. set <id> --success "무엇이 관찰되면 끝인지"');
  if (node.status !== 'proof') gaps.push(`지금 상태가 ${node.status || 'todo'} 예요. 먼저 status <id> proof 로 "증명"에 올리세요`);
  const since = node.proofAt || '';
  const evidence = (assets || []).filter((a) => a.addedAt && a.addedAt >= since && a.check && a.check.exit === 0 && String(a.check.cmd || '').trim());
  if (node.status === 'proof' && evidence.length === 0) gaps.push('증명에 올린 뒤 이 세션이 돌린 검증 명령의 통과 로그가 없어요. check <id> --app <앱> -- <검증 명령>');
  return gaps;
}

// 예전(v2, 자유 배치) 파이프라인을 단계 구조로 바꾼다. 위치의 x 열을 단계로, y 를 순서로 쓴다.
export function normalize(p) {
  p.nodes ||= [];
  p.edges ||= [];
  if (!Array.isArray(p.stages) || p.stages.length === 0) {
    const tops = p.nodes.filter((n) => !n.parent);
    const col = (n) => Math.round((n.position?.x ?? 0) / 165);
    const cols = [...new Set(tops.map(col))].sort((a, b) => a - b);
    p.stages = cols.length ? cols.map((_, i) => ({ id: `stage-${i + 1}`, title: `단계 ${i + 1}` })) : [{ id: 'stage-1', title: '할 일' }];
    for (const n of tops) n.stage = p.stages[Math.max(0, cols.indexOf(col(n)))].id;
    const sorted = [...tops].sort((a, b) => (a.position?.y ?? 0) - (b.position?.y ?? 0));
    sorted.forEach((n, i) => { n.order = i; });
    p.version = 3;
  }
  const stageIds = new Set(p.stages.map((s) => s.id));
  const ids = new Set(p.nodes.map((n) => n.id));
  for (const n of p.nodes) {
    if (n.parent && !ids.has(n.parent)) delete n.parent;
    if (!n.parent && !stageIds.has(n.stage)) n.stage = p.stages[0].id;
    if (typeof n.order !== 'number') n.order = 0;
    delete n.position;
  }
  return p;
}

function combine(statuses) {
  if (statuses.length === 0) return 'todo';
  if (statuses.every((s) => s === 'done')) return 'done';
  if (statuses.includes('blocked')) return 'blocked';
  if (statuses.includes('review')) return 'review';
  if (statuses.includes('proof')) return 'proof';
  if (statuses.includes('doing') || statuses.includes('done')) return 'doing';
  return 'todo';
}

// 계산된 상태, 진행도, 시작 가능 여부, 지금 차례인 하위 과업
export function derive(p, refs) {
  const byId = Object.fromEntries(p.nodes.map((n) => [n.id, n]));
  const kids = {};
  for (const n of p.nodes) if (n.parent) (kids[n.parent] ||= []).push(n);
  for (const k of Object.values(kids)) k.sort((a, b) => a.order - b.order);

  const status = {};
  for (const n of p.nodes) {
    if (n.type === 'shared') status[n.id] = refs?.[n.ref]?.status ?? 'blocked';
    else if (!kids[n.id]) status[n.id] = n.status || 'todo';
  }
  for (const n of p.nodes) if (kids[n.id] && n.type !== 'shared') status[n.id] = combine(kids[n.id].map((c) => status[c.id]));

  const info = {};
  for (const n of p.nodes) {
    if (n.parent) continue;
    const upstream = p.edges.filter((e) => e.target === n.id && e.kind !== 'feedback').map((e) => e.source).filter((s) => byId[s]);
    const waitingOn = upstream.filter((s) => status[s] !== 'done');
    const children = kids[n.id] || [];
    const current = children.find((c) => status[c.id] !== 'done') || null;
    info[n.id] = {
      status: status[n.id],
      children: children.map((c) => c.id),
      progress: { done: children.filter((c) => status[c.id] === 'done').length, total: children.length },
      waitingOn,
      ready: waitingOn.length === 0,
      current: current?.id || null,
    };
  }
  for (const n of p.nodes) {
    if (!n.parent) continue;
    const parent = info[n.parent];
    info[n.id] = { status: status[n.id], isCurrent: parent?.current === n.id, ready: !!parent?.ready && parent?.current === n.id };
  }
  return { info, byId, kids };
}

export function stageOrder(p) {
  const idx = Object.fromEntries(p.stages.map((s, i) => [s.id, i]));
  return (a, b) => (idx[a.stage] ?? 0) - (idx[b.stage] ?? 0) || a.order - b.order;
}

// 지금 시작할 수 있는 일. 의존하는 과업이 끝났고, 하위 과업 순서상 차례인 것
export function nextActions(p, refs) {
  const { info, kids } = derive(p, refs);
  const tops = p.nodes.filter((n) => !n.parent).sort(stageOrder(p));
  const out = [];
  for (const t of tops) {
    const ti = info[t.id];
    if (ti.status === 'done' || t.type === 'shared') continue;
    if (!ti.ready) continue;
    const stage = p.stages.find((s) => s.id === t.stage);
    if (kids[t.id]?.length) {
      const c = kids[t.id].find((k) => k.id === ti.current);
      if (c && info[c.id].status !== 'blocked') out.push({ task: t.id, taskTitle: t.title, stage: stage?.title, id: c.id, title: c.title, kind: c.kind, by: c.by || 'agent', status: info[c.id].status, how: c.how || '' });
    } else if (ti.status !== 'blocked') {
      out.push({ task: t.id, taskTitle: t.title, stage: stage?.title, id: t.id, title: t.title, kind: null, by: t.by || 'agent', status: ti.status, how: t.how || '' });
    }
  }
  return out;
}
