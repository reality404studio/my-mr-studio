// Vite 개발 서버와 미리보기 서버에 붙는 API 미들웨어.
// studio/ 폴더를 감시해서, 에이전트가 파일을 고치면 브라우저에 바로 알린다.
//
//   GET  /api/projects                    공통 + 앱 목록 (홈 화면)
//   POST /api/projects                    새 앱 { id, name, subtitle, template }
//   GET  /api/templates                   모드 목록
//   GET  /api/events                      파일 변경 알림 (SSE)
//   /api/p/<pid>/pipeline | next | log | stages/... | nodes/... | edges/...   pid = "shared" 또는 앱 id
//   GET  /api/p/<pid>/overview            사람 화면 (결정 대기, 질문, 추정, 영수증, 알림, 상태)
//   GET  /api/p/<pid>/spec                빈칸 지도 (scene_spec.yaml 칸별 상태와 세 칸 항목)
//   POST /api/p/<pid>/knowledge           세 칸 추가 { type: assume|compromise|unknown, task, text, field, confidence, gate, ask }
//   POST /api/p/<pid>/knowledge/<id>      세 칸 처리 { action: answer|confirm|reject|accept|reopen, answer, note }
//   POST /api/p/<pid>/nodes/<id>/attempts 시도 기록 { label, result, why, tokens }
//   POST /api/p/<pid>/nodes/<id>/reopen   다시 열기 { because, from, sub }
//   GET  /api/p/<pid>/feel[?status=new]   헤드셋 메모 목록
//   POST /api/p/<pid>/feel                헤드셋 메모 { text, target, rel, pose, params, source, expectAudio }
//   POST /api/p/<pid>/feel/<id>/audio     녹음 (본문 = 오디오, Content-Type = audio/webm | audio/wav …)
//   POST /api/p/<pid>/feel/<id>           { action: text|translate|dismiss|restore, text, field, confidence, task, why }
//        feel 과 spec 은 다른 출처(헤드셋 브라우저의 다른 프로토타입, Unity 앱)에서도 부를 수 있게 CORS 를 연다
//   GET|POST /api/drawer, PATCH /api/drawer/<id>   결정 서랍
//   /files/<studio/ 아래 상대 경로>       첨부 파일
import fs from 'node:fs';
import path from 'node:path';
import chokidar from 'chokidar';
import { createStudio } from './store.mjs';

const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.avif': 'image/avif', '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.md': 'text/markdown; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.yaml': 'text/yaml; charset=utf-8', '.yml': 'text/yaml; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.pdf': 'application/pdf', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4',
};

export function studioApi(root) {
  const studio = createStudio(root);
  const clients = new Set();

  let pending = new Set();
  let timer = null;
  const watcher = chokidar.watch(studio.studioDir, {
    ignoreInitial: true,
    // 잠금 폴더(.lock, .spec.lock, .drawer.lock)와 보관함, 임시 파일은 알리지 않는다
    ignored: (p) => /[\\/](\.([a-z]+\.)?lock|_archive)([\\/]|$)/.test(p) || p.endsWith('.tmp'),
  });
  watcher.on('all', (_event, file) => {
    pending.add(path.relative(studio.studioDir, file).split(path.sep).join('/'));
    clearTimeout(timer);
    timer = setTimeout(() => {
      const payload = JSON.stringify({ type: 'change', paths: [...pending] });
      pending = new Set();
      for (const res of clients) res.write(`data: ${payload}\n\n`);
    }, 150);
  });

  return async function middleware(req, res, next) {
    const url = new URL(req.url, 'http://localhost');
    let parts;
    try { parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent); }
    catch { res.statusCode = 400; return res.end('bad path'); }

    if (parts[0] === 'files') return serveFile(studio.studioDir, parts.slice(1), res);
    if (parts[0] !== 'api') return next();

    // 헤드셋 메모와 명세 읽기는 다른 출처(다른 포트의 WebXR 프로토타입, Unity 앱)에서도 온다
    if (parts[1] === 'p' && (parts[3] === 'feel' || (parts[3] === 'spec' && req.method !== 'POST'))) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-actor');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
    }

    const actor = String(req.headers['x-actor'] || 'human').slice(0, 60);
    const send = (status, data) => {
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(data));
    };

    try {
      const m = req.method;
      const [, top] = parts;

      if (top === 'events' && m === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
        res.write(`data: ${JSON.stringify({ type: 'hello' })}\n\n`);
        clients.add(res);
        const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
        req.on('close', () => { clearInterval(ping); clients.delete(res); });
        return;
      }
      if (top === 'projects' && m === 'GET') return send(200, studio.projects());
      if (top === 'projects' && m === 'POST') return send(201, studio.createApp(actor, await readJson(req)));
      if (top === 'templates' && m === 'GET') return send(200, studio.templates());

      if (top === 'drawer') {
        if (!parts[2] && m === 'GET') return send(200, studio.drawer());
        if (!parts[2] && m === 'POST') return send(201, studio.addDrawer(actor, await readJson(req)));
        if (parts[2] && m === 'PATCH') return send(200, studio.updateDrawer(actor, parts[2], await readJson(req)));
      }

      if (top === 'p' && parts[2]) {
        const store = studio.project(parts[2]);
        const [a, b, c, d] = parts.slice(3);

        if (a === 'pipeline' && m === 'GET') return send(200, store.pipeline());
        if (a === 'next' && m === 'GET') return send(200, store.next());
        if (a === 'overview' && m === 'GET') return send(200, store.overview());
        if (a === 'spec' && m === 'GET') return send(200, store.spec());
        if (a === 'knowledge') {
          if (!b && m === 'POST') { const body = await readJson(req); return send(201, store.addKnowledge(actor, body.type, body)); }
          if (b && m === 'POST') { const body = await readJson(req); return send(200, store.resolveKnowledge(actor, b, body.action, body)); }
        }

        if (a === 'feel') {
          if (!b && m === 'GET') return send(200, store.feelList({ status: url.searchParams.get('status') || undefined }));
          if (!b && m === 'POST') return send(201, store.addFeel(actor, await readJson(req)));
          if (b && !c && m === 'GET') return send(200, store.feelGet(b));
          if (b && c === 'audio' && m === 'POST') return send(200, store.saveFeelAudio(actor, b, await readBody(req, 30 * 1024 * 1024), req.headers['content-type']));
          if (b && !c && m === 'POST') {
            const body = await readJson(req);
            if (body.action === 'text') return send(200, store.setFeelText(actor, b, body.text));
            if (body.action === 'translate') return send(201, store.translateFeel(actor, b, body));
            if (body.action === 'dismiss') return send(200, store.dismissFeel(actor, b, body.why));
            if (body.action === 'restore') return send(200, store.restoreFeel(actor, b));
            return send(400, { error: 'action 은 text, translate, dismiss, restore 중 하나예요.' });
          }
        }

        if (a === 'stages') {
          if (!b && m === 'POST') return send(201, store.addStage(actor, await readJson(req)));
          if (b && m === 'PATCH') return send(200, store.updateStage(actor, b, await readJson(req)));
          if (b && m === 'DELETE') return send(200, store.deleteStage(actor, b));
        }
        if (a === 'log' && m === 'GET') return send(200, store.readLog(Number(url.searchParams.get('limit')) || 60));

        if (a === 'nodes') {
          if (!b && m === 'POST') return send(201, store.createNode(actor, await readJson(req)));
          if (b && !c && m === 'GET') return send(200, store.nodeDetail(b));
          if (b && !c && m === 'PATCH') return send(200, store.updateNode(actor, b, await readJson(req)));
          if (b && !c && m === 'DELETE') return send(200, store.deleteNode(actor, b));
          if (b && c === 'move' && m === 'POST') return send(200, store.moveNode(actor, b, (await readJson(req)).dir));
          if (b && c === 'attempts' && m === 'POST') return send(201, store.addAttempt(actor, b, await readJson(req)));
          if (b && c === 'reopen' && m === 'POST') return send(200, store.reopen(actor, b, await readJson(req)));
          if (b && c === 'notes' && m === 'PUT') return send(200, store.writeNotes(actor, b, (await readJson(req)).notes ?? ''));
          if (b && c === 'notes' && m === 'POST') return send(200, store.appendNote(actor, b, (await readJson(req)).text ?? ''));
          if (b && c === 'assets' && !d && m === 'POST') {
            const name = url.searchParams.get('name') || 'upload';
            const memo = url.searchParams.get('memo') || '';
            return send(201, store.saveAsset(actor, b, name, await readBody(req, 200 * 1024 * 1024), memo));
          }
          if (b && c === 'assets' && d && m === 'PATCH') return send(200, store.updateAsset(actor, b, d, await readJson(req)));
          if (b && c === 'assets' && d && m === 'DELETE') return send(200, store.deleteAsset(actor, b, d));
        }

        if (a === 'edges') {
          if (!b && m === 'POST') return send(201, store.addEdge(actor, await readJson(req)));
          if (b && m === 'DELETE') return send(200, store.deleteEdge(actor, b));
        }
      }

      return send(404, { error: '없는 API예요.' });
    } catch (err) {
      return send(err.status || 500, { error: err.message || String(err) });
    }
  };
}

function serveFile(studioDir, rel, res) {
  const file = path.resolve(studioDir, ...rel);
  if (!file.startsWith(studioDir + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.statusCode = 404;
    return res.end('not found');
  }
  res.setHeader('Content-Type', MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-cache');
  fs.createReadStream(file).pipe(res);
}

function readBody(req, limit = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(Object.assign(new Error('파일이 너무 커요.'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJson(req) {
  const buf = await readBody(req);
  if (!buf.length) return {};
  try { return JSON.parse(buf.toString('utf8')); }
  catch { throw Object.assign(new Error('JSON 형식이 아니에요.'), { status: 400 }); }
}
