#!/usr/bin/env node
// 에이전트용 CLI. 웹 앱과 같은 저장소 함수를 쓰므로, 여기서 바꾼 내용은 열려 있는 웹 화면에 바로 나타난다.
//
// 전체
//   npm run studio -- apps                                   공통과 앱 목록
//   npm run studio -- modes                                  모드(템플릿) 목록
//   npm run studio -- new-app <id> "이름" --mode <모드 id> [--subtitle "한 줄 소개"]
//
// 캔버스 하나 (--app <앱 id> 또는 --app shared, 혹은 STUDIO_APP 환경변수)
//   npm run studio -- list   --app desk-dream
//   npm run studio -- show   <노드 id> --app desk-dream
//   npm run studio -- status <노드 id> <todo|doing|review|done|blocked> --app desk-dream
//   npm run studio -- note   <노드 id> "덧붙일 메모" --app desk-dream
//   npm run studio -- add    <type> "제목" [--after <노드 id>] [--owner 이름] [--ref <공통 노드 id>] --app desk-dream
//   npm run studio -- link   <from> <to> [--label 글자] --app desk-dream
//   npm run studio -- asset  <노드 id> <파일 경로> [--memo "왜 골랐는지"] --app desk-dream
//   npm run studio -- set    <노드 id> --title 새제목 --owner 이름 --app desk-dream
//   npm run studio -- log    [개수] --app desk-dream
//
// 누가 했는지는 --as 이름 또는 STUDIO_ACTOR 환경변수로 남긴다. 기본값은 "agent".
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStudio, NODE_TYPES, STATUSES } from '../server/store.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const studio = createStudio(root);

const argv = process.argv.slice(2);
const flags = {};
const args = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) { flags[argv[i].slice(2)] = argv[i + 1]; i++; }
  else args.push(argv[i]);
}
const actor = flags.as || process.env.STUDIO_ACTOR || 'agent';
const [cmd, ...rest] = args;

const STATUS_KO = { todo: '대기', doing: '진행 중', review: '확인 필요', done: '완료', blocked: '막힘' };

function fail(msg) {
  console.error(`오류: ${msg}`);
  process.exit(1);
}

function store() {
  const pid = flags.app || process.env.STUDIO_APP;
  if (!pid) {
    const { apps } = studio.projects();
    fail(`어느 캔버스인지 --app 으로 알려 주세요. 공통은 --app shared, 앱: ${apps.map((a) => a.id).join(', ') || '(없음)'}`);
  }
  return studio.project(pid);
}

try {
  switch (cmd) {
    case 'apps': {
      const { studio: info, shared, apps } = studio.projects();
      console.log(`# ${info.name}\n`);
      if (shared) {
        const done = shared.nodes.filter((n) => n.status === 'done').length;
        console.log(`shared  "공통"  ${done}/${shared.nodes.length} 완료`);
      }
      for (const a of apps) {
        const done = a.nodes.filter((n) => n.status === 'done').length;
        const now = a.nodes.filter((n) => n.status === 'doing').map((n) => n.title);
        console.log(`${a.id}  "${a.name}"  모드:${a.template}  ${done}/${a.nodes.length} 완료${now.length ? `  진행 중: ${now.join(', ')}` : ''}`);
      }
      break;
    }
    case 'modes': {
      for (const t of studio.templates()) {
        console.log(`${t.id}  "${t.name}"  출발점: ${t.startsFrom}\n  ${t.description}\n  ${t.steps.map((s) => s.title).join(' → ')}${t.uses.length ? `\n  공통에서 가져옴: ${t.uses.map((u) => u.title).join(', ')}` : ''}\n`);
      }
      break;
    }
    case 'new-app': {
      const [id, name] = rest;
      if (!id || !name || !flags.mode) fail('new-app <id> "이름" --mode <모드 id>  (모드 목록: npm run studio -- modes)');
      const r = studio.createApp(actor, { id, name, subtitle: flags.subtitle || '', template: flags.mode });
      console.log(`앱 생성: ${r.id}  (studio/apps/${r.id}/)`);
      break;
    }
    case 'list': {
      const s = store();
      const p = s.pipeline();
      console.log(`# ${p.project?.name ?? s.pid}  (studio/${p.relDir}/)\n`);
      for (const n of p.nodes) {
        const ins = p.edges.filter((e) => e.target === n.id).map((e) => e.source);
        const ref = n.type === 'shared' ? ` → 공통:${n.ref || '(미지정)'}` : '';
        const used = n.usedBy?.length ? ` 사용 앱:${n.usedBy.map((u) => u.app).join(',')}` : '';
        console.log(`- [${n.status}] ${n.id} (${n.type}) "${n.title}"${ref}${n.owner ? ` 담당:${n.owner}` : ''}${ins.length ? ` ← ${ins.join(', ')}` : ''}${n.assetCount ? ` 파일:${n.assetCount}` : ''}${used}`);
      }
      break;
    }
    case 'show': {
      const [id] = rest;
      if (!id) fail('show <노드 id> --app <앱>');
      const s = store();
      const d = s.nodeDetail(id);
      const n = d.node;
      console.log(`id: ${n.id}\ntype: ${n.type}\ntitle: ${n.title}\nstatus: ${n.status} (${STATUS_KO[n.status]})\nowner: ${n.owner || '-'}\nupdated: ${n.updatedAt} by ${n.updatedBy}`);
      if (n.type === 'shared') console.log(`ref: 공통 노드 "${n.ref}" (자세히: show ${n.ref} --app shared)`);
      if (n.usedBy?.length) console.log(`used_by: ${n.usedBy.map((u) => `${u.app}/${u.node}`).join(', ')}`);
      console.log(`incoming: ${d.incoming.join(', ') || '-'}\noutgoing: ${d.outgoing.join(', ') || '-'}`);
      console.log(`notes_file: ${d.notesPath}`);
      if (d.assets.length) {
        console.log('assets:');
        for (const a of d.assets) console.log(`  - studio/${s.relDir}/nodes/${n.id}/assets/${a.file}${a.memo ? `  # ${a.memo}` : ''}`);
      }
      console.log('\n--- README.md ---\n' + d.notes);
      break;
    }
    case 'status': {
      const [id, status] = rest;
      if (!id || !STATUSES.includes(status)) fail(`status <노드 id> <${STATUSES.join('|')}> --app <앱>`);
      store().updateNode(actor, id, { status });
      console.log(`${id} → ${status}`);
      break;
    }
    case 'set': {
      const [id] = rest;
      if (!id) fail('set <노드 id> --title ... --owner ... --type ... --ref ... --app <앱>');
      const patch = {};
      for (const k of ['title', 'owner', 'type', 'status', 'ref']) if (flags[k] !== undefined) patch[k] = flags[k];
      store().updateNode(actor, id, patch);
      console.log(`${id} 수정: ${JSON.stringify(patch)}`);
      break;
    }
    case 'note': {
      const [id, ...text] = rest;
      const body = text.join(' ') || (!process.stdin.isTTY ? fs.readFileSync(0, 'utf8') : '');
      if (!id || !body.trim()) fail('note <노드 id> "메모" --app <앱>  (또는 표준입력으로 전달)');
      store().appendNote(actor, id, body);
      console.log(`${id} 메모 추가`);
      break;
    }
    case 'add': {
      const [type, title] = rest;
      if (!NODE_TYPES.includes(type) || (!title && type !== 'shared')) fail(`add <${NODE_TYPES.join('|')}> "제목" [--after <노드 id>] [--ref <공통 노드 id>] --app <앱>`);
      const s = store();
      let position = { x: 0, y: 0 };
      if (flags.after) {
        const prev = s.readPipeline().nodes.find((n) => n.id === flags.after);
        if (!prev) fail(`--after 노드 "${flags.after}"가 없어요.`);
        position = { x: prev.position.x + 330, y: prev.position.y };
      }
      const node = s.createNode(actor, { type, title: title || '', owner: flags.owner || '', position, id: flags.id, ref: flags.ref });
      if (flags.after) s.addEdge(actor, { source: flags.after, target: node.id });
      console.log(`추가: ${node.id}`);
      break;
    }
    case 'link': {
      const [from, to] = rest;
      if (!from || !to) fail('link <from> <to> [--label 글자] --app <앱>');
      store().addEdge(actor, { source: from, target: to, label: flags.label });
      console.log(`${from} → ${to}`);
      break;
    }
    case 'asset': {
      const [id, file] = rest;
      if (!id || !file || !fs.existsSync(file)) fail('asset <노드 id> <존재하는 파일 경로> [--memo "..."] --app <앱>');
      const s = store();
      const r = s.saveAsset(actor, id, path.basename(file), fs.readFileSync(file), flags.memo || '');
      console.log(`저장: studio/${s.relDir}/nodes/${id}/assets/${r.file}`);
      break;
    }
    case 'log': {
      const n = Number(rest[0]) || 20;
      for (const l of store().readLog(n).reverse()) console.log(`${l.ts}  ${l.actor.padEnd(14)} ${l.action.padEnd(14)} ${l.nodeId ?? ''} ${l.detail ?? ''}`);
      break;
    }
    default:
      console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
  }
} catch (err) {
  fail(err.message);
}
