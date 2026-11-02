// 파일 기반 저장소. 웹 서버와 CLI가 같은 함수를 쓴다.
// 진실의 원천은 studio/ 폴더의 파일들이다.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const NODE_TYPES = ['reference', 'concept', 'prompt', 'video', 'spec', 'build', 'review', 'note'];
export const STATUSES = ['todo', 'doing', 'review', 'done', 'blocked'];

export function createStore(root) {
  const studioDir = path.resolve(root, 'studio');
  const pipelinePath = path.join(studioDir, 'pipeline.json');
  const logPath = path.join(studioDir, 'log.jsonl');
  const lockDir = path.join(studioDir, '.lock');
  const nodesDir = path.join(studioDir, 'nodes');
  const archiveDir = path.join(studioDir, '_archive');

  const nodeDir = (id) => path.join(nodesDir, safeId(id));
  const notesPath = (id) => path.join(nodeDir(id), 'README.md');
  const assetsDir = (id) => path.join(nodeDir(id), 'assets');
  const assetsIndexPath = (id) => path.join(nodeDir(id), 'assets.json');

  function readPipeline() {
    return JSON.parse(fs.readFileSync(pipelinePath, 'utf8'));
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
          const age = Date.now() - fs.statSync(lockDir).mtimeMs;
          if (age > 10_000) fs.rmSync(lockDir, { recursive: true, force: true });
        } catch {}
        if (Date.now() - start > 5_000) throw new Error('pipeline.json 잠금을 얻지 못했어요. 다른 작업이 끝났는지 확인하세요.');
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
      }
    }
    try {
      return fn();
    } finally {
      fs.rmSync(lockDir, { recursive: true, force: true });
    }
  }

  function mutate(actor, action, fn) {
    return withLock(() => {
      const p = readPipeline();
      const result = fn(p);
      writeJsonAtomic(pipelinePath, p);
      if (action) appendLog(actor, action.action, action.nodeId, action.detail ?? result?.detail);
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
    if (!node) throw httpError(404, `노드 "${id}"가 없어요.`);
    return node;
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

  function enrich(node) {
    const notes = readNotes(node.id);
    const assets = readAssets(node.id);
    // 제목 줄(#)과 표·구분선은 건너뛰고 첫 문장을 미리보기로 쓴다.
    const firstLine = notes.split('\n').map((l) => l.trim())
      .find((l) => l && !/^(#|<!--|---|\||```)/.test(l))?.replace(/^[-*]\s+(\[.\]\s+)?|\*\*/g, '') || '';
    return {
      ...node,
      notesPreview: firstLine.slice(0, 90),
      assetCount: assets.length,
      thumbs: assets.filter((a) => isImage(a.file)).slice(0, 4).map((a) => `/files/nodes/${node.id}/assets/${encodeURIComponent(a.file)}`),
    };
  }

  return {
    studioDir,
    readPipeline,
    readLog,
    appendLog,

    pipeline() {
      const p = readPipeline();
      return { ...p, nodes: p.nodes.map(enrich) };
    },

    nodeDetail(id) {
      const p = readPipeline();
      const node = getNode(p, id);
      return {
        node: enrich(node),
        notes: readNotes(id),
        assets: readAssets(id).map((a) => ({ ...a, url: `/files/nodes/${id}/assets/${encodeURIComponent(a.file)}`, image: isImage(a.file) })),
        incoming: p.edges.filter((e) => e.target === id).map((e) => e.source),
        outgoing: p.edges.filter((e) => e.source === id).map((e) => e.target),
      };
    },

    createNode(actor, { type = 'note', title, status = 'todo', owner = '', position, id } = {}) {
      if (!NODE_TYPES.includes(type)) throw httpError(400, `type은 ${NODE_TYPES.join(', ')} 중 하나여야 해요.`);
      return mutate(actor, null, (p) => {
        const newId = id ? safeId(id) : `${type}-${crypto.randomBytes(3).toString('hex')}`;
        if (p.nodes.some((n) => n.id === newId)) throw httpError(409, `노드 "${newId}"가 이미 있어요.`);
        const node = {
          id: newId, type, title: title || '새 단계', status, owner,
          position: position || { x: 0, y: 0 },
          updatedAt: new Date().toISOString(), updatedBy: actor,
        };
        p.nodes.push(node);
        fs.mkdirSync(assetsDir(newId), { recursive: true });
        if (!fs.existsSync(notesPath(newId))) fs.writeFileSync(notesPath(newId), `# ${node.title}\n\n`);
        appendLog(actor, 'node.create', newId, node.title);
        return node;
      });
    },

    updateNode(actor, id, patch) {
      const allowed = ['title', 'status', 'owner', 'type', 'position'];
      return mutate(actor, null, (p) => {
        const node = getNode(p, id);
        const changes = [];
        for (const k of allowed) {
          if (patch[k] === undefined) continue;
          if (k === 'status' && !STATUSES.includes(patch[k])) throw httpError(400, `status는 ${STATUSES.join(', ')} 중 하나여야 해요.`);
          if (k === 'type' && !NODE_TYPES.includes(patch[k])) throw httpError(400, `type이 올바르지 않아요.`);
          if (JSON.stringify(node[k]) === JSON.stringify(patch[k])) continue;
          node[k] = patch[k];
          if (k !== 'position') changes.push(`${k}=${patch[k]}`);
        }
        // 위치 이동만은 로그와 updatedBy를 남기지 않는다(노이즈).
        if (changes.length) {
          node.updatedAt = new Date().toISOString();
          node.updatedBy = actor;
          appendLog(actor, 'node.update', id, changes.join(', '));
        }
        return node;
      });
    },

    deleteNode(actor, id) {
      return mutate(actor, null, (p) => {
        getNode(p, id);
        p.nodes = p.nodes.filter((n) => n.id !== id);
        p.edges = p.edges.filter((e) => e.source !== id && e.target !== id);
        if (fs.existsSync(nodeDir(id))) {
          fs.mkdirSync(archiveDir, { recursive: true });
          fs.renameSync(nodeDir(id), path.join(archiveDir, `${id}-${Date.now()}`));
        }
        appendLog(actor, 'node.archive', id);
        return { ok: true };
      });
    },

    writeNotes(actor, id, notes) {
      getNode(readPipeline(), id);
      fs.mkdirSync(nodeDir(id), { recursive: true });
      fs.writeFileSync(notesPath(id), notes);
      mutate(actor, null, (p) => {
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
      const block = `\n---\n**${actor}** · ${stamp}\n\n${text.trim()}\n`;
      fs.mkdirSync(nodeDir(id), { recursive: true });
      fs.appendFileSync(notesPath(id), block);
      appendLog(actor, 'notes.append', id, text.trim().slice(0, 80));
      return { ok: true };
    },

    addEdge(actor, { source, target, label }) {
      return mutate(actor, null, (p) => {
        getNode(p, source); getNode(p, target);
        if (source === target) throw httpError(400, '같은 노드끼리는 연결할 수 없어요.');
        const existing = p.edges.find((e) => e.source === source && e.target === target);
        if (existing) return existing;
        const edge = { id: `${source}__${target}`, source, target };
        if (label) edge.label = label;
        p.edges.push(edge);
        appendLog(actor, 'edge.create', source, `→ ${target}`);
        return edge;
      });
    },

    deleteEdge(actor, edgeId) {
      return mutate(actor, null, (p) => {
        const edge = p.edges.find((e) => e.id === edgeId);
        if (!edge) throw httpError(404, '연결이 없어요.');
        p.edges = p.edges.filter((e) => e.id !== edgeId);
        appendLog(actor, 'edge.delete', edge.source, `→ ${edge.target}`);
        return { ok: true };
      });
    },

    saveAsset(actor, id, originalName, buffer, memo = '') {
      getNode(readPipeline(), id);
      const dir = assetsDir(id);
      fs.mkdirSync(dir, { recursive: true });
      const file = uniqueName(dir, safeFileName(originalName));
      fs.writeFileSync(path.join(dir, file), buffer);
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

export function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

export function safeId(id) {
  const s = String(id).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!s) throw httpError(400, '노드 id가 비어 있어요.');
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
