// 파일 기반 저장소. 웹 서버와 CLI가 같은 함수를 쓴다. 진실의 원천은 studio/ 폴더의 파일들이다.
//
// studio/
//   studio.json                 스튜디오 이름
//   shared/                     공통 층: 모든 VR 앱이 함께 쓰는 조건·결정·모듈 (프로젝트 id "shared")
//   apps/<id>/                  앱 하나 = 보드 하나
//   templates/<mode>/           새 앱을 만들 때 복사하는 모드 (영상 우선, 스토리보드 우선 …)
//   shared/drawer.json          결정 서랍: 제약 · 내 눈 · 보류 · 번역표 (모든 앱이 함께 씀)
//
// 앱의 지식(가정 · 타협 · 모름)은 scene_spec.yaml 안에 산다 (knowledge.mjs). 시도 기록과 다시 열기는 pipeline.json 의 노드에.
//
// 프로젝트(공통 또는 앱) 폴더 구조는 모두 같다:
//   pipeline.json  nodes/<id>/README.md  nodes/<id>/assets/  nodes/<id>/assets.json  log.jsonl  scene_spec.yaml
//
// 보드 구조(단계 > 과업 > 하위 과업)와 상태 규칙은 board.mjs 에 있다.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { KINDS, ACTORS, STATUSES, normalize, derive, nextActions, stageOrder } from './board.mjs';
import { BLOCKS, CONFIDENCE, parseSpec, stringifySpec, readEntries, addEntry, resolveEntry, specMap } from './knowledge.mjs';

export { KINDS, ACTORS, STATUSES, BLOCKS, CONFIDENCE };
export const ATTEMPT_RESULTS = { ok: '통과', fail: '실패', pending: '확인 대기' };
// 결정 서랍: 프로젝트를 넘어 쌓이는 결정. 제약은 공통 보드의 과업에서도 읽어 온다.
export const DRAWER_KINDS = {
  constraint: { label: '제약', hint: '기기·기술 조건. 거의 안 바뀜' },
  taste: { label: '내 눈', hint: '고르거나 버린 이유. 계속 쌓임' },
  hold: { label: '보류', hint: '지금은 안 함. 조건이 바뀌면 다시 꺼냄' },
  vocab: { label: '번역표', hint: '내 말이 실제로 무엇을 바꾸는지' },
};
const STUCK_FAILS = 3;
export const NODE_TYPES = ['reference', 'concept', 'prompt', 'video', 'storyboard', 'spec', 'build', 'review', 'note', 'shared'];
export const SHARED_ID = 'shared';

const RESERVED = new Set([SHARED_ID, 'templates', 'apps', 'new']);

export function createStudio(root) {
  const studioDir = path.resolve(root, 'studio');
  const appsDir = path.join(studioDir, 'apps');
  const sharedDir = path.join(studioDir, 'shared');
  const templatesDir = path.join(studioDir, 'templates');

  migrateLegacy(studioDir, appsDir, sharedDir);

  function projectDir(pid) {
    if (pid === SHARED_ID) return sharedDir;
    const dir = path.join(appsDir, safeId(pid));
    if (!fs.existsSync(path.join(dir, 'pipeline.json'))) {
      const known = listAppIds();
      throw httpError(404, `앱 "${pid}"가 없어요.${known.length ? ` 있는 앱: ${known.join(', ')}` : ''}`);
    }
    return dir;
  }

  function listAppIds() {
    try {
      return fs.readdirSync(appsDir).filter((d) => fs.existsSync(path.join(appsDir, d, 'pipeline.json'))).sort();
    } catch { return []; }
  }

  function readJson(file, fallback) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
  }

  function readBoard(file) {
    return normalize(readJson(file, { nodes: [], edges: [], stages: [] }));
  }

  // 공통 과업 요약 (앱 보드의 "공통" 과업이 가리키는 대상)
  function sharedSummary() {
    const p = readBoard(path.join(sharedDir, 'pipeline.json'));
    const { info } = derive(p, null);
    return Object.fromEntries(p.nodes.filter((n) => !n.parent).map((n) => [n.id, {
      id: n.id, title: n.title, status: info[n.id].status, owner: n.owner, type: n.type,
      updatedAt: n.updatedAt, updatedBy: n.updatedBy, progress: info[n.id].progress,
    }]));
  }

  // 공통 과업을 어떤 앱이 쓰고 있는지
  function sharedUsage() {
    const usage = {};
    for (const id of listAppIds()) {
      const p = readJson(path.join(appsDir, id, 'pipeline.json'), { nodes: [] });
      for (const n of p.nodes) if (n.type === 'shared' && n.ref) (usage[n.ref] ||= []).push({ app: id, name: p.project?.name || id, node: n.id });
    }
    return usage;
  }

  function topTasks(p, refs) {
    const { info } = derive(p, refs);
    return p.nodes.filter((n) => !n.parent).sort(stageOrder(p)).map((n) => ({
      id: n.id, type: n.type, ref: n.ref, stage: n.stage,
      title: n.type === 'shared' ? (n.title || refs?.[n.ref]?.title || n.ref) : n.title,
      status: info[n.id].status, progress: info[n.id].progress,
    }));
  }

  const studio = {
    studioDir,
    SHARED_ID,

    info() {
      return readJson(path.join(studioDir, 'studio.json'), { name: 'VR 앱 만들기' });
    },

    project(pid) {
      return createProjectStore(projectDir(pid), pid, { studioDir, sharedSummary, sharedUsage });
    },

    // ---------- 결정 서랍 (studio/shared/drawer.json) ----------
    drawer() {
      const file = path.join(sharedDir, 'drawer.json');
      const items = readJson(file, { items: [] }).items || [];
      const shared = fs.existsSync(path.join(sharedDir, 'pipeline.json')) ? studio.project(SHARED_ID).pipeline() : null;
      // 공통 보드의 과업은 모든 앱이 따르는 조건과 결정이라 "제약" 칸에 같이 보여준다
      const sharedTasks = (shared?.nodes || []).filter((n) => !n.parent).map((n) => ({
        id: n.id, title: n.title, status: n.status, preview: n.goal || n.notesPreview || '', usedBy: n.usedBy || [],
      }));
      return { kinds: DRAWER_KINDS, items, sharedTasks, path: 'studio/shared/drawer.json' };
    },

    addDrawer(actor, { kind, text, why = '', until = '', means = '', app = '', task = '' } = {}) {
      if (!DRAWER_KINDS[kind]) throw httpError(400, `서랍 칸은 ${Object.keys(DRAWER_KINDS).join(', ')} 중 하나예요.`);
      if (!String(text || '').trim()) throw httpError(400, kind === 'vocab' ? '단어나 표현을 적어 주세요. 예: 부드럽게' : '내용을 적어 주세요.');
      if (kind === 'vocab' && !String(means).trim()) throw httpError(400, '번역표에는 그 말이 실제로 무엇을 바꾸는지(--means)가 필요해요.');
      return withFileLock(path.join(sharedDir, '.drawer.lock'), () => {
        const file = path.join(sharedDir, 'drawer.json');
        const data = readJson(file, { items: [] });
        data.items ||= [];
        const used = data.items.filter((x) => x.kind === kind).map((x) => Number(String(x.id).replace(/^\D+/, '')) || 0);
        const prefix = { constraint: 'k', taste: 't', hold: 'h', vocab: 'v' }[kind];
        const item = { id: `${prefix}${(used.length ? Math.max(...used) : 0) + 1}`, kind, text: String(text).trim(), status: 'active', by: actor, at: new Date().toISOString() };
        if (why) item.why = String(why).trim();
        if (until) item.until = String(until).trim();
        if (means) item.means = String(means).trim();
        if (app) item.app = app;
        if (task) item.task = task;
        data.items.push(item);
        writeJsonFile(file, data);
        fs.appendFileSync(path.join(sharedDir, 'log.jsonl'), JSON.stringify({ ts: item.at, actor, action: 'drawer.add', nodeId: null, detail: `${DRAWER_KINDS[kind].label}: ${item.text.slice(0, 60)}` }) + '\n');
        return item;
      });
    },

    updateDrawer(actor, id, patch = {}) {
      return withFileLock(path.join(sharedDir, '.drawer.lock'), () => {
        const file = path.join(sharedDir, 'drawer.json');
        const data = readJson(file, { items: [] });
        const item = (data.items || []).find((x) => x.id === id);
        if (!item) throw httpError(404, `서랍에 "${id}"가 없어요.`);
        for (const k of ['text', 'why', 'until', 'means']) if (patch[k] !== undefined) item[k] = String(patch[k]);
        if (patch.status !== undefined) {
          if (!['active', 'retired'].includes(patch.status)) throw httpError(400, 'status 는 active 또는 retired 예요.');
          item.status = patch.status;
        }
        item.updatedBy = actor;
        item.updatedAt = new Date().toISOString();
        writeJsonFile(file, data);
        fs.appendFileSync(path.join(sharedDir, 'log.jsonl'), JSON.stringify({ ts: item.updatedAt, actor, action: 'drawer.update', nodeId: null, detail: `${id}: ${item.status}` }) + '\n');
        return item;
      });
    },

    projects() {
      const refs = sharedSummary();
      const summarize = (pid, dir, kind) => {
        const p = readBoard(path.join(dir, 'pipeline.json'));
        const tasks = topTasks(p, kind === 'app' ? refs : null);
        return { id: pid, kind, ...p.project, stages: p.stages, nodes: tasks, next: nextActions(p, kind === 'app' ? refs : null).slice(0, 3), last: readLastLog(path.join(dir, 'log.jsonl')) };
      };
      const shared = fs.existsSync(path.join(sharedDir, 'pipeline.json')) ? summarize(SHARED_ID, sharedDir, 'shared') : null;
      if (shared) shared.usage = sharedUsage();
      const apps = listAppIds().map((id) => summarize(id, path.join(appsDir, id), 'app'))
        .sort((a, b) => String(b.last?.ts || b.createdAt || '').localeCompare(String(a.last?.ts || a.createdAt || '')));
      return { studio: studio.info(), shared, apps };
    },

    templates() {
      let ids = [];
      try { ids = fs.readdirSync(templatesDir).filter((d) => fs.existsSync(path.join(templatesDir, d, 'pipeline.json'))); } catch {}
      const refs = sharedSummary();
      return ids.map((id) => {
        const meta = readJson(path.join(templatesDir, id, 'template.json'), {});
        const p = readBoard(path.join(templatesDir, id, 'pipeline.json'));
        const tops = p.nodes.filter((n) => !n.parent).sort(stageOrder(p));
        const kids = (t) => p.nodes.filter((n) => n.parent === t.id).length;
        const stages = p.stages.map((s) => ({
          id: s.id, title: s.title,
          tasks: tops.filter((t) => t.stage === s.id && t.type !== 'shared').map((t) => ({ id: t.id, type: t.type, title: t.title, subtasks: kids(t) })),
        }));
        const uses = tops.filter((n) => n.type === 'shared').map((n) => ({ id: n.ref, title: n.title || refs[n.ref]?.title || n.ref }));
        const steps = stages.flatMap((s) => s.tasks);
        return { id, name: meta.name || id, description: meta.description || '', startsFrom: meta.startsFrom || '', order: meta.order ?? 99, stages, steps, uses };
      }).sort((a, b) => a.order - b.order);
    },

    createApp(actor, { id, name, subtitle = '', template } = {}) {
      if (!name?.trim()) throw httpError(400, '앱 이름을 적어 주세요.');
      const appId = safeId(id || name);
      if (!/^[a-z0-9]/.test(appId)) throw httpError(400, '앱 id는 영문 소문자나 숫자로 시작해야 해요. 예: desk-dream');
      if (RESERVED.has(appId)) throw httpError(400, `"${appId}"는 쓸 수 없는 id예요.`);
      const tplDir = path.join(templatesDir, safeId(template || ''));
      if (!template || !fs.existsSync(path.join(tplDir, 'pipeline.json'))) throw httpError(400, `모드 "${template}"가 없어요. 있는 모드: ${studio.templates().map((t) => t.id).join(', ')}`);
      const dir = path.join(appsDir, appId);
      if (fs.existsSync(dir)) throw httpError(409, `앱 id "${appId}"가 이미 있어요.`);

      fs.mkdirSync(dir, { recursive: true });
      copyDir(path.join(tplDir, 'nodes'), path.join(dir, 'nodes'));
      const now = new Date().toISOString();
      const tpl = readBoard(path.join(tplDir, 'pipeline.json'));
      const meta = readJson(path.join(tplDir, 'template.json'), {});
      const pipeline = {
        version: 3,
        project: { name: name.trim(), subtitle: subtitle.trim(), template, createdAt: now },
        stages: tpl.stages,
        nodes: tpl.nodes.map((n) => ({ ...(n.type === 'shared' || tpl.nodes.some((c) => c.parent === n.id) ? {} : { status: 'todo' }), owner: '', ...n, updatedAt: now, updatedBy: actor })),
        edges: tpl.edges,
      };
      fs.writeFileSync(path.join(dir, 'pipeline.json'), JSON.stringify(pipeline, null, 2) + '\n');

      const specSrc = [path.join(tplDir, 'scene_spec.yaml'), path.join(sharedDir, 'scene_spec.template.yaml')].find((f) => fs.existsSync(f));
      if (specSrc) fs.writeFileSync(path.join(dir, 'scene_spec.yaml'), fs.readFileSync(specSrc, 'utf8').replace(/^(\s*title:).*$/m, `$1 ${name.trim()}`));

      fs.writeFileSync(path.join(dir, 'log.jsonl'), JSON.stringify({ ts: now, actor, action: 'app.create', nodeId: null, detail: `${meta.name || template} 모드로 생성` }) + '\n');
      return { id: appId };
    },
  };
  return studio;
}

function createProjectStore(dir, pid, ctx) {
  const pipelinePath = path.join(dir, 'pipeline.json');
  const logPath = path.join(dir, 'log.jsonl');
  const lockDir = path.join(dir, '.lock');
  const nodesDir = path.join(dir, 'nodes');
  const archiveDir = path.join(dir, '_archive');
  const relDir = path.relative(ctx.studioDir, dir).split(path.sep).join('/');
  const isShared = pid === SHARED_ID;
  const specPath = path.join(dir, 'scene_spec.yaml');
  const specLock = path.join(dir, '.spec.lock');
  const hasSpec = () => !isShared && fs.existsSync(specPath);

  function readSpecDoc() {
    if (!hasSpec()) throw httpError(400, isShared ? '공통 보드에는 장면 명세가 없어요. 앱 보드에서 써 주세요.' : `studio/${relDir}/scene_spec.yaml 이 없어요.`);
    return parseSpec(fs.readFileSync(specPath, 'utf8'));
  }
  function readEntriesSafe() {
    try { return hasSpec() ? readEntries(readSpecDoc()) : []; } catch { return []; }
  }
  // 하위 과업 id 로 적힌 항목도 과업 단위로 모은다
  const topOf = (p, id) => { const n = p.nodes.find((x) => x.id === id); return n?.parent || n?.id || id; };

  // 마지막 통과(또는 다시 열림) 이후 연속 실패 횟수
  function trailingFails(node) {
    let k = 0;
    for (const a of [...(node.attempts || [])].reverse()) { if (a.result === 'fail') k++; else break; }
    return k;
  }

  function ledgerCounts(p, entries) {
    const out = {};
    const bump = (id, k, v = 1) => { (out[id] ||= { assume: 0, lowAssume: 0, compromise: 0, unknown: 0, attempts: 0, fails: 0, stuck: false, reopened: 0, tokens: 0 })[k] += v; };
    for (const e of entries) {
      if (e.status !== 'open') continue;
      const t = topOf(p, e.task);
      bump(t, e.type);
      if (e.type === 'assume' && e.confidence === 'low') bump(t, 'lowAssume');
    }
    for (const n of p.nodes) {
      const t = n.parent || n.id;
      for (const a of n.attempts || []) { bump(t, 'attempts'); if (a.result === 'fail') bump(t, 'fails'); if (a.tokens) bump(t, 'tokens', Number(a.tokens) || 0); }
      if (n.reopened?.length) bump(t, 'reopened', n.reopened.length);
      if (n.status !== 'done' && trailingFails(n) >= STUCK_FAILS) { bump(t, 'attempts', 0); out[t].stuck = true; }
    }
    return out;
  }

  const nodeDir = (id) => path.join(nodesDir, safeId(id));
  const notesPath = (id) => path.join(nodeDir(id), 'README.md');
  const assetsDir = (id) => path.join(nodeDir(id), 'assets');
  const assetsIndexPath = (id) => path.join(nodeDir(id), 'assets.json');
  const fileUrl = (id, file) => `/files/${relDir}/nodes/${id}/assets/${encodeURIComponent(file)}`;

  function readPipeline() {
    return normalize(JSON.parse(fs.readFileSync(pipelinePath, 'utf8')));
  }

  function writeJsonAtomic(file, data) {
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
    fs.renameSync(tmp, file);
  }

  // 여러 프로세스(웹 서버, 에이전트 CLI)가 동시에 쓰는 것을 막는 간단한 잠금.
  function withLock(fn) {
    const start = Date.now();
    for (;;) {
      try {
        fs.mkdirSync(lockDir);
        break;
      } catch (err) {
        if (err.code !== 'EEXIST') throw err;
        try {
          if (Date.now() - fs.statSync(lockDir).mtimeMs > 10_000) fs.rmSync(lockDir, { recursive: true, force: true });
        } catch {}
        if (Date.now() - start > 5_000) throw new Error('pipeline.json 잠금을 얻지 못했어요. 다른 작업이 끝났는지 확인하세요.');
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
      }
    }
    try { return fn(); } finally { fs.rmSync(lockDir, { recursive: true, force: true }); }
  }

  function mutate(fn) {
    return withLock(() => {
      const p = readPipeline();
      const result = fn(p);
      p.version = 3;
      writeJsonAtomic(pipelinePath, p);
      return result;
    });
  }

  function appendLog(actor, action, nodeId, detail) {
    const entry = { ts: new Date().toISOString(), actor: actor || 'human', action, nodeId: nodeId ?? null };
    if (detail) entry.detail = detail;
    fs.appendFileSync(logPath, JSON.stringify(entry) + '\n');
  }

  function readLog(limit = 60) {
    if (!fs.existsSync(logPath)) return [];
    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean);
    return lines.slice(-limit).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean).reverse();
  }

  function getNode(p, id) {
    const node = p.nodes.find((n) => n.id === id);
    if (!node) throw httpError(404, `"${id}"가 없어요. 목록: npm run studio -- list --app ${pid}`);
    return node;
  }

  function getStage(p, id) {
    const s = p.stages.find((x) => x.id === id);
    if (!s) throw httpError(404, `단계 "${id}"가 없어요. 있는 단계: ${p.stages.map((x) => x.id).join(', ')}`);
    return s;
  }

  function siblings(p, node) {
    return p.nodes.filter((n) => (node.parent ? n.parent === node.parent : !n.parent && n.stage === node.stage)).sort((a, b) => a.order - b.order);
  }

  function nextOrder(p, where) {
    const sib = p.nodes.filter((n) => (where.parent ? n.parent === where.parent : !n.parent && n.stage === where.stage));
    return sib.length ? Math.max(...sib.map((n) => n.order)) + 1 : 0;
  }

  function readNotes(id) {
    try { return fs.readFileSync(notesPath(id), 'utf8'); } catch { return ''; }
  }

  function readAssets(id) {
    let index = [];
    try { index = JSON.parse(fs.readFileSync(assetsIndexPath(id), 'utf8')); } catch {}
    // 에이전트가 assets/ 에 파일만 넣고 인덱스를 안 고친 경우도 보여준다.
    let files = [];
    try { files = fs.readdirSync(assetsDir(id)).filter((f) => !f.startsWith('.')); } catch {}
    const known = new Set(index.map((a) => a.file));
    for (const f of files) if (!known.has(f)) index.push({ file: f, memo: '' });
    return index.filter((a) => files.includes(a.file));
  }

  function enrich(node, d, refs, usage) {
    const notes = readNotes(node.id);
    const assets = readAssets(node.id);
    // 제목 줄(#)과 표·구분선은 건너뛰고 첫 문장을 미리보기로 쓴다.
    const firstLine = notes.split('\n').map((l) => l.trim())
      .find((l) => l && !/^(#|<!--|---|\||```|>)/.test(l))?.replace(/^[-*]\s+(\[.\]\s+)?|\*\*/g, '') || '';
    const i = d.info[node.id] || {};
    const out = {
      ...node,
      ownStatus: node.status,
      ...i,
      notesPreview: firstLine.slice(0, 90),
      assetCount: assets.length,
      thumbs: assets.filter((a) => isImage(a.file)).slice(0, 4).map((a) => fileUrl(node.id, a.file)),
    };
    if (node.type === 'shared') {
      const ref = refs?.[node.ref];
      out.refNode = ref || null;
      if (ref) {
        out.title = node.title || ref.title;
        out.owner = node.owner || ref.owner;
      }
    }
    if (usage && !node.parent) out.usedBy = usage[node.id] || [];
    return out;
  }

  const context = () => ({ refs: isShared ? null : ctx.sharedSummary(), usage: isShared ? ctx.sharedUsage() : null });

  function cleanFields(patch) {
    if (patch.kind !== undefined && patch.kind !== '' && !KINDS[patch.kind]) throw httpError(400, `kind는 ${Object.keys(KINDS).join(', ')} 중 하나예요.`);
    if (patch.by !== undefined && patch.by !== '' && !ACTORS[patch.by]) throw httpError(400, 'by는 human 또는 agent 예요.');
    if (patch.status !== undefined && !STATUSES.includes(patch.status)) throw httpError(400, `status는 ${STATUSES.join(', ')} 중 하나여야 해요.`);
    if (patch.type !== undefined && !NODE_TYPES.includes(patch.type)) throw httpError(400, `type은 ${NODE_TYPES.join(', ')} 중 하나여야 해요.`);
    if (patch.budget !== undefined && patch.budget !== null && patch.budget !== '') {
      const b = Number(patch.budget);
      if (!Number.isFinite(b) || b < 0) throw httpError(400, 'budget(토큰 상한)은 0 이상의 숫자예요. 없애려면 0.');
      patch.budget = b || null;
    }
  }

  return {
    pid,
    relDir,
    readPipeline,
    readLog,

    pipeline() {
      const p = readPipeline();
      const { refs, usage } = context();
      const d = derive(p, refs);
      const counts = ledgerCounts(p, readEntriesSafe());
      return {
        ...p, id: pid, kind: isShared ? 'shared' : 'app', relDir, hasSpec: hasSpec(),
        nodes: p.nodes.map((n) => ({ ...enrich(n, d, refs, usage), ...(!n.parent && counts[n.id] ? { ledger: counts[n.id] } : {}) })),
        next: nextActions(p, refs),
      };
    },

    // ---------- 세 칸 (명세 안의 가정 · 타협 · 모름) ----------
    specPathRel: `studio/${relDir}/scene_spec.yaml`,
    hasSpec,

    spec() {
      const doc = readSpecDoc();
      const p = readPipeline();
      const titles = Object.fromEntries(p.nodes.map((n) => [n.id, n.title]));
      const m = specMap(doc);
      m.entries = m.entries.map((e) => ({ ...e, taskTitle: titles[e.task] || e.task || '', top: e.task ? topOf(p, e.task) : null }));
      return { ...m, path: `studio/${relDir}/scene_spec.yaml` };
    },

    addKnowledge(actor, type, input = {}) {
      if (input.task) getNode(readPipeline(), input.task);
      return withFileLock(specLock, () => {
        const doc = readSpecDoc();
        const entry = addEntry(doc, type, input, actor);
        fs.writeFileSync(specPath, stringifySpec(doc));
        appendLog(actor, `knowledge.${type}`, input.task || null, `${entry.id} ${entry.text.slice(0, 70)}`);
        return entry;
      });
    },

    resolveKnowledge(actor, id, action, extra = {}) {
      return withFileLock(specLock, () => {
        const doc = readSpecDoc();
        const entry = resolveEntry(doc, id, action, extra, actor);
        fs.writeFileSync(specPath, stringifySpec(doc));
        appendLog(actor, `knowledge.${action}`, entry.task || null, `${id}${extra.answer ? `: ${String(extra.answer).slice(0, 60)}` : extra.note ? `: ${String(extra.note).slice(0, 60)}` : ''}`);
        return entry;
      });
    },

    entriesFor(taskId) {
      const p = readPipeline();
      const top = topOf(p, taskId);
      return readEntriesSafe().filter((e) => e.task && topOf(p, e.task) === top);
    },

    // ---------- 에이전트 장부: 시도 기록과 다시 열기 ----------
    addAttempt(actor, id, { label, result = 'pending', why = '', tokens, file = '' } = {}) {
      if (!String(label || '').trim()) throw httpError(400, '무엇을 시도했는지 한 줄로 적어 주세요. 예: "변종 B: 반사 해상도 절반"');
      if (!ATTEMPT_RESULTS[result]) throw httpError(400, `result 는 ${Object.keys(ATTEMPT_RESULTS).join(', ')} 중 하나예요.`);
      const n = tokens === undefined || tokens === '' ? undefined : Number(tokens);
      if (n !== undefined && (!Number.isFinite(n) || n < 0)) throw httpError(400, 'tokens 는 0 이상의 숫자예요.');
      return mutate((p) => {
        const node = getNode(p, id);
        if (p.nodes.some((c) => c.parent === id)) throw httpError(400, `"${node.title}"는 하위 과업이 있는 과업이에요. 시도는 하위 과업에 남겨요.`);
        const a = { n: (node.attempts?.length || 0) + 1, at: new Date().toISOString(), by: actor, label: String(label).trim(), result };
        if (why) a.why = String(why).trim();
        if (n !== undefined) a.tokens = n;
        if (file) a.file = file;
        (node.attempts ||= []).push(a);
        node.updatedAt = a.at;
        node.updatedBy = actor;
        const fails = trailingFails(node);
        appendLog(actor, 'attempt', id, `#${a.n} ${ATTEMPT_RESULTS[result]}: ${a.label.slice(0, 60)}${fails >= STUCK_FAILS ? ` (연속 실패 ${fails})` : ''}`);
        return { ...a, trailingFails: fails, stuck: fails >= STUCK_FAILS };
      });
    },

    // 끝난 일을 이유와 함께 다시 연다. 과업을 열면 하위 과업 하나(--sub, 기본은 마지막 에이전트 하위 과업)를 대기로 되돌린다.
    reopen(actor, id, { because, from = '', sub = '' } = {}) {
      if (!String(because || '').trim()) throw httpError(400, '왜 다시 여는지 한 줄로 적어 주세요.');
      return mutate((p) => {
        const node = getNode(p, id);
        if (node.type === 'shared') throw httpError(400, '"공통" 과업은 공통 보드에서 다시 열어요.');
        if (from) getNode(p, from);
        const kids = p.nodes.filter((c) => c.parent === id).sort((a, b) => a.order - b.order);
        let target = node;
        if (kids.length) {
          target = sub ? kids.find((k) => k.id === sub) : [...kids].reverse().find((k) => k.by !== 'human' && k.status === 'done') || [...kids].reverse().find((k) => k.status === 'done') || kids[kids.length - 1];
          if (!target) throw httpError(404, `"${sub}"는 이 과업의 하위 과업이 아니에요.`);
        }
        const rec = { at: new Date().toISOString(), by: actor, because: String(because).trim() };
        if (from) rec.from = from;
        if (target !== node) rec.sub = target.id;
        (node.reopened ||= []).push(rec);
        target.status = 'todo';
        for (const n of [node, target]) { n.updatedAt = rec.at; n.updatedBy = actor; }
        appendLog(actor, 'reopen', id, `${target !== node ? `${target.id} 대기로 · ` : ''}${rec.because.slice(0, 70)}`);
        return { node: node.id, reopenedSub: target !== node ? target.id : null, ...rec };
      });
    },

    // ---------- 사람 화면 ----------
    overview() {
      const p = readPipeline();
      const { refs } = context();
      const d = derive(p, refs);
      const entries = readEntriesSafe();
      const counts = ledgerCounts(p, entries);
      const byId = Object.fromEntries(p.nodes.map((n) => [n.id, n]));
      const label = (id) => { const n = byId[id]; if (!n) return id; const t = n.parent ? byId[n.parent] : null; return t ? `${t.title} · ${n.title}` : n.title; };
      const thumbsOf = (id) => {
        const top = byId[id]?.parent || id;
        return [id, top].flatMap((x) => readAssets(x).filter((a) => isImage(a.file)).map((a) => ({ file: a.file, memo: a.memo || '', url: fileUrl(x, a.file) }))).slice(0, 4);
      };

      const next = nextActions(p, refs);
      const decisions = [];
      for (const it of next.filter((x) => x.by === 'human')) {
        decisions.push({ kind: 'decide', id: it.id, task: it.task, title: it.title, where: `${it.stage} · ${it.taskTitle}`, how: it.how, subKind: it.kind, thumbs: thumbsOf(it.id) });
      }
      for (const n of p.nodes) {
        if (d.info[n.id]?.status !== 'review' || p.nodes.some((c) => c.parent === n.id) || decisions.some((x) => x.id === n.id)) continue;
        decisions.push({ kind: 'review', id: n.id, task: n.parent || n.id, title: n.title, where: label(n.parent || n.id), how: n.how || '', subKind: n.kind || null, thumbs: thumbsOf(n.id), attempts: (n.attempts || []).slice(-4) });
      }
      const open = entries.filter((e) => e.status === 'open');
      const withTask = (e) => ({ ...e, where: e.task ? label(e.task) : '' });
      const questions = open.filter((e) => e.type === 'unknown' && (e.ask || 'human') === 'human').map(withTask);
      const guesses = open.filter((e) => e.type === 'assume').sort((a, b) => ({ low: 0, mid: 1, high: 2 }[a.confidence] - { low: 0, mid: 1, high: 2 }[b.confidence])).map(withTask);
      const receipts = open.filter((e) => e.type === 'compromise').map(withTask);

      const alerts = [];
      for (const n of p.nodes) {
        const f = trailingFails(n);
        if (n.status !== 'done' && f >= STUCK_FAILS) {
          const last = n.attempts.slice(-f);
          alerts.push({ kind: 'stuck', id: n.id, title: label(n.id), text: `연속 ${f}번 실패했어요. 헤매고 있을 수 있어요.`, detail: last.map((a) => `#${a.n} ${a.label}${a.why ? ` — ${a.why}` : ''}`) });
        }
      }
      for (const t of p.nodes.filter((n) => !n.parent && n.budget)) {
        const spent = counts[t.id]?.tokens || 0;
        const ratio = spent / t.budget;
        if (ratio >= 0.8) alerts.push({ kind: ratio >= 1 ? 'over' : 'budget', id: t.id, title: t.title, text: ratio >= 1 ? `토큰 상한을 넘었어요 (${fmt(spent)} / ${fmt(t.budget)}).` : `토큰 상한의 ${Math.round(ratio * 100)}%를 썼어요 (${fmt(spent)} / ${fmt(t.budget)}).` });
      }

      const working = p.nodes.filter((n) => n.status === 'doing' && !p.nodes.some((c) => c.parent === n.id)).map((n) => ({
        id: n.id, title: label(n.id), by: n.by || 'agent', owner: n.owner || byId[n.parent]?.owner || '', attempts: n.attempts?.length || 0, lastAttempt: n.attempts?.at(-1) || null, updatedAt: n.updatedAt, updatedBy: n.updatedBy,
      }));
      const log = readLog(200);
      const lastAgent = log.find((l) => l.actor && l.actor !== 'human') || null;
      const tokens = Object.values(counts).reduce((s, c) => s + (c.tokens || 0), 0);

      let summary = null;
      if (hasSpec()) { try { summary = specMap(readSpecDoc()).summary; } catch (e) { summary = { error: e.message }; } }
      const recentReopens = p.nodes.flatMap((n) => (n.reopened || []).map((r) => ({ ...r, id: n.id, title: n.title }))).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5);
      return {
        id: pid, project: p.project, hasSpec: hasSpec(),
        decisions, questions, guesses, receipts, alerts, working, lastAgent, tokens, summary, recentReopens,
        nextAgent: next.filter((x) => x.by === 'agent').slice(0, 5),
      };
    },

    next() {
      const p = readPipeline();
      return nextActions(p, context().refs);
    },

    nodeDetail(id) {
      const p = readPipeline();
      const node = getNode(p, id);
      const { refs, usage } = context();
      const d = derive(p, refs);
      const top = node.parent ? getNode(p, node.parent) : node;
      const entries = readEntriesSafe();
      const ledger = ledgerCounts(p, entries)[top.id] || null;
      return {
        node: { ...enrich(node, d, refs, usage), ...(node.parent ? {} : { ledger }) },
        entries: entries.filter((e) => e.task && topOf(p, e.task) === top.id),
        hasSpec: hasSpec(), pid,
        stage: p.stages.find((s) => s.id === top.stage) || null,
        parent: node.parent ? { id: top.id, title: top.title, type: top.type } : null,
        children: (d.kids[node.id] || []).map((c) => enrich(c, d, refs, usage)),
        notes: readNotes(id),
        notesPath: `studio/${relDir}/nodes/${id}/README.md`,
        assets: readAssets(id).map((a) => ({ ...a, url: fileUrl(id, a.file), image: isImage(a.file) })),
        incoming: node.parent ? [] : p.edges.filter((e) => e.target === id).map((e) => ({ id: e.source, kind: e.kind || '' })),
        outgoing: node.parent ? [] : p.edges.filter((e) => e.source === id).map((e) => ({ id: e.target, kind: e.kind || '' })),
      };
    },

    // ---------- 단계 ----------
    addStage(actor, { title, goal = '', after, id } = {}) {
      if (!title?.trim()) throw httpError(400, '단계 이름을 적어 주세요.');
      return mutate((p) => {
        const sid = id ? safeId(id) : `stage-${crypto.randomBytes(3).toString('hex')}`;
        if (p.stages.some((s) => s.id === sid)) throw httpError(409, `단계 "${sid}"가 이미 있어요.`);
        const stage = { id: sid, title: title.trim() };
        if (goal) stage.goal = goal;
        const at = after ? p.stages.findIndex((s) => s.id === after) + 1 : p.stages.length;
        p.stages.splice(at > 0 ? at : p.stages.length, 0, stage);
        appendLog(actor, 'stage.create', null, stage.title);
        return stage;
      });
    },

    updateStage(actor, id, patch) {
      return mutate((p) => {
        const s = getStage(p, id);
        if (patch.title !== undefined && patch.title.trim()) s.title = patch.title.trim();
        if (patch.goal !== undefined) s.goal = patch.goal;
        if (patch.move === 'left' || patch.move === 'right') {
          const i = p.stages.indexOf(s);
          const j = patch.move === 'left' ? i - 1 : i + 1;
          if (j >= 0 && j < p.stages.length) [p.stages[i], p.stages[j]] = [p.stages[j], p.stages[i]];
        }
        appendLog(actor, 'stage.update', null, s.title);
        return s;
      });
    },

    deleteStage(actor, id) {
      return mutate((p) => {
        const s = getStage(p, id);
        if (p.nodes.some((n) => !n.parent && n.stage === id)) throw httpError(400, `"${s.title}" 단계에 과업이 남아 있어요. 과업을 옮기거나 보관한 뒤 지워 주세요.`);
        if (p.stages.length === 1) throw httpError(400, '마지막 단계는 지울 수 없어요.');
        p.stages = p.stages.filter((x) => x.id !== id);
        appendLog(actor, 'stage.delete', null, s.title);
        return { ok: true };
      });
    },

    // ---------- 과업과 하위 과업 ----------
    createNode(actor, input = {}) {
      const { type = 'note', title, status = 'todo', owner = '', id, ref, stage, parent, kind, by, how, goal, output } = input;
      cleanFields({ type, kind, by, status });
      if (type === 'shared' && isShared) throw httpError(400, '공통 보드 안에는 "공통" 과업을 둘 수 없어요.');
      return mutate((p) => {
        let node;
        const newId = id ? safeId(id) : `${parent ? `${parent}-` : ''}${parent ? (kind || 'step') : type}-${crypto.randomBytes(2).toString('hex')}`;
        if (p.nodes.some((n) => n.id === newId)) throw httpError(409, `"${newId}"가 이미 있어요.`);
        const base = { id: newId, title: title ?? '', owner, updatedAt: new Date().toISOString(), updatedBy: actor };
        if (parent) {
          const par = getNode(p, parent);
          if (par.parent) throw httpError(400, '하위 과업 아래에는 하위 과업을 둘 수 없어요. 과업 아래에 두세요.');
          if (par.type === 'shared') throw httpError(400, '"공통" 과업의 하위 과업은 공통 보드에서 관리해요.');
          if (!title?.trim()) throw httpError(400, '하위 과업 이름을 적어 주세요.');
          node = { ...base, parent, kind: kind || 'write', by: by || 'agent', status, order: nextOrder(p, { parent }) };
          if (how) node.how = how;
        } else {
          const st = stage ? getStage(p, stage).id : p.stages[0].id;
          if (type !== 'shared' && !title?.trim()) throw httpError(400, '과업 이름을 적어 주세요.');
          node = { ...base, type, stage: st, order: nextOrder(p, { stage: st }) };
          if (type === 'shared') node.ref = ref || '';
          else node.status = status;
          if (goal) node.goal = goal;
          if (output) node.output = output;
          if (by) node.by = by;
          if (how) node.how = how;
        }
        p.nodes.push(node);
        if (!parent && type !== 'shared') {
          fs.mkdirSync(nodeDir(newId), { recursive: true });
          if (!fs.existsSync(notesPath(newId))) fs.writeFileSync(notesPath(newId), `# ${node.title}\n\n`);
        }
        appendLog(actor, parent ? 'sub.create' : 'node.create', newId, node.title || ref);
        return node;
      });
    },

    updateNode(actor, id, patch) {
      cleanFields(patch);
      const allowed = ['title', 'status', 'owner', 'type', 'ref', 'stage', 'parent', 'kind', 'by', 'how', 'goal', 'output', 'budget'];
      return mutate((p) => {
        const node = getNode(p, id);
        const hasKids = p.nodes.some((n) => n.parent === id);
        const changes = [];
        for (const k of allowed) {
          if (patch[k] === undefined) continue;
          if (JSON.stringify(node[k] ?? '') === JSON.stringify(patch[k])) continue;
          if (k === 'status' && node.type === 'shared') throw httpError(400, '"공통" 과업의 상태는 공통 보드에서 바꿔요.');
          if (k === 'status' && hasKids) throw httpError(400, `"${node.title}"의 상태는 하위 과업에서 계산돼요. 하위 과업의 상태를 바꾸세요. (show ${id})`);
          if (k === 'stage') {
            if (node.parent) throw httpError(400, '하위 과업은 과업을 따라 움직여요. 과업의 단계를 바꾸세요.');
            getStage(p, patch.stage);
            node.order = nextOrder(p, { stage: patch.stage });
          }
          if (k === 'parent') {
            if (!node.parent) throw httpError(400, '과업을 다른 과업 아래로 옮길 수 없어요.');
            const par = getNode(p, patch.parent);
            if (par.parent || par.type === 'shared') throw httpError(400, '그 과업 아래로는 옮길 수 없어요.');
            node.order = nextOrder(p, { parent: patch.parent });
          }
          if (patch[k] === null) delete node[k];
          else node[k] = patch[k];
          changes.push(`${k}=${patch[k]}`);
        }
        if (changes.length) {
          node.updatedAt = new Date().toISOString();
          node.updatedBy = actor;
          appendLog(actor, 'node.update', id, changes.join(', '));
        }
        return node;
      });
    },

    moveNode(actor, id, dir) {
      if (dir !== 'up' && dir !== 'down') throw httpError(400, 'dir 은 up 또는 down 이에요.');
      return mutate((p) => {
        const node = getNode(p, id);
        const sib = siblings(p, node);
        const i = sib.indexOf(node);
        const j = dir === 'up' ? i - 1 : i + 1;
        if (j < 0 || j >= sib.length) return node;
        [sib[i], sib[j]] = [sib[j], sib[i]];
        sib.forEach((n, k) => { n.order = k; });
        appendLog(actor, 'node.move', id, dir === 'up' ? '위로' : '아래로');
        return node;
      });
    },

    deleteNode(actor, id) {
      return mutate((p) => {
        getNode(p, id);
        const gone = new Set([id, ...p.nodes.filter((n) => n.parent === id).map((n) => n.id)]);
        p.nodes = p.nodes.filter((n) => !gone.has(n.id));
        p.edges = p.edges.filter((e) => !gone.has(e.source) && !gone.has(e.target));
        for (const g of gone) {
          if (fs.existsSync(nodeDir(g))) {
            fs.mkdirSync(archiveDir, { recursive: true });
            fs.renameSync(nodeDir(g), path.join(archiveDir, `${g}-${Date.now()}`));
          }
        }
        appendLog(actor, 'node.archive', id, gone.size > 1 ? `하위 과업 ${gone.size - 1}개 포함` : undefined);
        return { ok: true };
      });
    },

    writeNotes(actor, id, notes) {
      getNode(readPipeline(), id);
      fs.mkdirSync(nodeDir(id), { recursive: true });
      fs.writeFileSync(notesPath(id), notes);
      mutate((p) => {
        const node = getNode(p, id);
        node.updatedAt = new Date().toISOString();
        node.updatedBy = actor;
      });
      appendLog(actor, 'notes.write', id);
      return { ok: true };
    },

    appendNote(actor, id, text) {
      getNode(readPipeline(), id);
      const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
      fs.mkdirSync(nodeDir(id), { recursive: true });
      fs.appendFileSync(notesPath(id), `\n---\n**${actor}** · ${stamp}\n\n${text.trim()}\n`);
      appendLog(actor, 'notes.append', id, text.trim().slice(0, 80));
      return { ok: true };
    },

    addEdge(actor, { source, target, label, kind }) {
      return mutate((p) => {
        const s = getNode(p, source); const t = getNode(p, target);
        if (s.parent || t.parent) throw httpError(400, '연결은 과업끼리만 해요. 하위 과업 순서는 과업 안에서 위아래로 정해요.');
        if (source === target) throw httpError(400, '같은 과업끼리는 연결할 수 없어요.');
        const existing = p.edges.find((e) => e.source === source && e.target === target);
        if (existing) return existing;
        const edge = { id: `${source}__${target}`, source, target };
        if (label) edge.label = label;
        if (kind === 'feedback') edge.kind = 'feedback';
        p.edges.push(edge);
        appendLog(actor, 'edge.create', source, `→ ${target}`);
        return edge;
      });
    },

    deleteEdge(actor, edgeId) {
      return mutate((p) => {
        const edge = p.edges.find((e) => e.id === edgeId);
        if (!edge) throw httpError(404, '연결이 없어요.');
        p.edges = p.edges.filter((e) => e.id !== edgeId);
        appendLog(actor, 'edge.delete', edge.source, `→ ${edge.target}`);
        return { ok: true };
      });
    },

    saveAsset(actor, id, originalName, buffer, memo = '') {
      getNode(readPipeline(), id);
      const adir = assetsDir(id);
      fs.mkdirSync(adir, { recursive: true });
      const file = uniqueName(adir, safeFileName(originalName));
      fs.writeFileSync(path.join(adir, file), buffer);
      const index = readAssets(id).filter((a) => a.file !== file);
      index.push({ file, memo, addedBy: actor, addedAt: new Date().toISOString() });
      writeJsonAtomic(assetsIndexPath(id), index);
      appendLog(actor, 'asset.add', id, file);
      return { file };
    },

    updateAsset(actor, id, file, { memo }) {
      const index = readAssets(id);
      const a = index.find((x) => x.file === file);
      if (!a) throw httpError(404, '파일이 없어요.');
      a.memo = memo ?? a.memo;
      writeJsonAtomic(assetsIndexPath(id), index);
      appendLog(actor, 'asset.memo', id, `${file}: ${String(memo).slice(0, 60)}`);
      return a;
    },

    deleteAsset(actor, id, file) {
      const index = readAssets(id).filter((a) => a.file !== file);
      const src = path.join(assetsDir(id), safeFileName(file));
      if (fs.existsSync(src)) {
        const dest = path.join(archiveDir, 'assets', id);
        fs.mkdirSync(dest, { recursive: true });
        fs.renameSync(src, path.join(dest, `${Date.now()}-${safeFileName(file)}`));
      }
      writeJsonAtomic(assetsIndexPath(id), index);
      appendLog(actor, 'asset.archive', id, file);
      return { ok: true };
    },
  };
}

// 첫 버전(studio/ 바로 아래 한 앱) 사용자를 위한 자동 이전.
// git으로 올라가지 않은 무드보드 파일 등이 예전 위치에 남아 있으면 새 위치로 옮긴다. 이미 있는 파일은 덮어쓰지 않는다.
function migrateLegacy(studioDir, appsDir, sharedDir) {
  const legacyNodes = path.join(studioDir, 'nodes');
  const legacyPipeline = path.join(studioDir, 'pipeline.json');
  if (!fs.existsSync(legacyNodes) && !fs.existsSync(legacyPipeline)) return;
  const appDir = path.join(appsDir, 'desk-dream');
  const toShared = new Set(['unity-version', 'calibration']);
  const moved = [];
  if (fs.existsSync(legacyNodes)) {
    for (const id of fs.readdirSync(legacyNodes)) {
      const target = path.join(toShared.has(id) ? sharedDir : appDir, 'nodes', id);
      moved.push(...mergeMove(path.join(legacyNodes, id), target));
    }
    // 새 위치에 같은 이름이 이미 있어 옮기지 못한 파일은 지우지 않고 보관해 둔다.
    const leftovers = listFiles(legacyNodes).filter((f) => path.basename(f) !== 'assets.json');
    if (leftovers.length) {
      const keep = path.join(appDir, '_archive', `legacy-nodes-${Date.now()}`);
      fs.mkdirSync(path.dirname(keep), { recursive: true });
      fs.renameSync(legacyNodes, keep);
      console.log(`[studio] 이름이 겹친 예전 파일 ${leftovers.length}개는 ${path.relative(studioDir, keep)} 에 보관했어요.`);
    } else {
      fs.rmSync(legacyNodes, { recursive: true, force: true });
    }
  }
  for (const f of ['pipeline.json', 'log.jsonl', 'scene_spec.yaml']) {
    const src = path.join(studioDir, f);
    if (!fs.existsSync(src)) continue;
    const dest = path.join(appDir, f);
    if (f === 'log.jsonl' && fs.existsSync(dest)) {
      fs.appendFileSync(dest, fs.readFileSync(src, 'utf8'));
      fs.rmSync(src);
    } else if (!fs.existsSync(dest)) {
      fs.mkdirSync(appDir, { recursive: true });
      fs.renameSync(src, dest);
    } else {
      fs.mkdirSync(path.join(appDir, '_archive'), { recursive: true });
      fs.renameSync(src, path.join(appDir, '_archive', `legacy-${Date.now()}-${f}`));
    }
  }
  if (moved.length) console.log(`[studio] 예전 위치의 파일 ${moved.length}개를 새 구조로 옮겼어요.`);
}

function mergeMove(src, dest) {
  const moved = [];
  if (!fs.existsSync(src)) return moved;
  if (fs.statSync(src).isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) moved.push(...mergeMove(path.join(src, name), path.join(dest, name)));
    return moved;
  }
  if (path.basename(src) === 'assets.json' && fs.existsSync(dest)) {
    // 파일 메모 목록은 합친다.
    const a = JSON.parse(fs.readFileSync(dest, 'utf8'));
    const known = new Set(a.map((x) => x.file));
    for (const x of JSON.parse(fs.readFileSync(src, 'utf8'))) if (!known.has(x.file)) a.push(x);
    fs.writeFileSync(dest, JSON.stringify(a, null, 2) + '\n');
    return moved;
  }
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.renameSync(src, dest);
    moved.push(dest);
  }
  return moved;
}

function listFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return fs.statSync(p).isDirectory() ? listFiles(p) : [p];
  });
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name);
    const d = path.join(dest, name);
    if (fs.statSync(s).isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function fmt(n) {
  return Number(n || 0).toLocaleString('en-US');
}

function writeJsonFile(file, data) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(tmp, file);
}

// 파일 하나를 여러 프로세스가 동시에 고치지 않게 하는 잠금 (폴더를 만들 수 있으면 잠금을 얻은 것)
function withFileLock(lockDir, fn) {
  const start = Date.now();
  for (;;) {
    try { fs.mkdirSync(lockDir); break; } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      try { if (Date.now() - fs.statSync(lockDir).mtimeMs > 10_000) fs.rmSync(lockDir, { recursive: true, force: true }); } catch {}
      if (Date.now() - start > 5_000) throw new Error(`${path.basename(lockDir)} 잠금을 얻지 못했어요.`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
    }
  }
  try { return fn(); } finally { fs.rmSync(lockDir, { recursive: true, force: true }); }
}

function readLastLog(file) {
  try {
    const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
    return JSON.parse(lines[lines.length - 1]);
  } catch { return null; }
}

export function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

export function safeId(id) {
  const s = String(id).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!s) throw httpError(400, 'id가 비어 있어요. 영문 소문자, 숫자, - 로 적어 주세요.');
  return s;
}

function safeFileName(name) {
  const base = path.basename(String(name || 'file')).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim();
  return base || 'file';
}

function uniqueName(dir, name) {
  if (!fs.existsSync(path.join(dir, name))) return name;
  const ext = path.extname(name);
  const stem = name.slice(0, name.length - ext.length);
  for (let i = 2; ; i++) {
    const candidate = `${stem}-${i}${ext}`;
    if (!fs.existsSync(path.join(dir, candidate))) return candidate;
  }
}

export function isImage(file) {
  return /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(file);
}
