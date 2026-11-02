#!/usr/bin/env node
// 에이전트용 CLI. 웹 앱과 같은 저장소 함수를 쓰므로, 여기서 바꾼 내용은 열려 있는 웹 화면에 바로 나타난다.
//
//   npm run studio -- list
//   npm run studio -- show <id>
//   npm run studio -- status <id> <todo|doing|review|done|blocked>
//   npm run studio -- note <id> "덧붙일 메모"
//   npm run studio -- add <type> "제목" [--after <id>] [--owner 이름]
//   npm run studio -- link <from> <to> [--label 글자]
//   npm run studio -- asset <id> <파일경로> [--memo "왜 골랐는지"]
//   npm run studio -- set <id> --title 새제목 --owner 이름
//   npm run studio -- log [개수]
//
// 누가 했는지는 --as 이름 또는 STUDIO_ACTOR 환경변수로 남긴다. 기본값은 "agent".
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore, NODE_TYPES, STATUSES } from '../server/store.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const store = createStore(root);

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

try {
  switch (cmd) {
    case 'list': {
      const p = store.pipeline();
      console.log(`# ${p.project?.name ?? 'pipeline'}\n`);
      for (const n of p.nodes) {
        const ins = p.edges.filter((e) => e.target === n.id).map((e) => e.source);
        console.log(`- [${n.status}] ${n.id} (${n.type}) "${n.title}"${n.owner ? ` 담당:${n.owner}` : ''}${ins.length ? ` ← ${ins.join(', ')}` : ''}${n.assetCount ? ` 파일:${n.assetCount}` : ''}`);
      }
      break;
    }
    case 'show': {
      const [id] = rest;
      if (!id) fail('show <id>');
      const d = store.nodeDetail(id);
      const n = d.node;
      console.log(`id: ${n.id}\ntype: ${n.type}\ntitle: ${n.title}\nstatus: ${n.status} (${STATUS_KO[n.status]})\nowner: ${n.owner || '-'}\nupdated: ${n.updatedAt} by ${n.updatedBy}`);
      console.log(`incoming: ${d.incoming.join(', ') || '-'}\noutgoing: ${d.outgoing.join(', ') || '-'}`);
      console.log(`notes_file: studio/nodes/${n.id}/README.md`);
      if (d.assets.length) {
        console.log('assets:');
        for (const a of d.assets) console.log(`  - studio/nodes/${n.id}/assets/${a.file}${a.memo ? `  # ${a.memo}` : ''}`);
      }
      console.log('\n--- README.md ---\n' + d.notes);
      break;
    }
    case 'status': {
      const [id, status] = rest;
      if (!id || !STATUSES.includes(status)) fail(`status <id> <${STATUSES.join('|')}>`);
      store.updateNode(actor, id, { status });
      console.log(`${id} → ${status}`);
      break;
    }
    case 'set': {
      const [id] = rest;
      if (!id) fail('set <id> --title ... --owner ... --type ...');
      const patch = {};
      for (const k of ['title', 'owner', 'type', 'status']) if (flags[k] !== undefined) patch[k] = flags[k];
      store.updateNode(actor, id, patch);
      console.log(`${id} 수정: ${JSON.stringify(patch)}`);
      break;
    }
    case 'note': {
      const [id, ...text] = rest;
      const body = text.join(' ') || (!process.stdin.isTTY ? fs.readFileSync(0, 'utf8') : '');
      if (!id || !body.trim()) fail('note <id> "메모" (또는 표준입력으로 전달)');
      store.appendNote(actor, id, body);
      console.log(`${id} 메모 추가`);
      break;
    }
    case 'add': {
      const [type, title] = rest;
      if (!NODE_TYPES.includes(type) || !title) fail(`add <${NODE_TYPES.join('|')}> "제목" [--after <id>] [--owner 이름] [--id 직접지정]`);
      let position = { x: 0, y: 0 };
      if (flags.after) {
        const prev = store.readPipeline().nodes.find((n) => n.id === flags.after);
        if (!prev) fail(`--after 노드 "${flags.after}"가 없어요.`);
        position = { x: prev.position.x + 330, y: prev.position.y };
      }
      const node = store.createNode(actor, { type, title, owner: flags.owner || '', position, id: flags.id });
      if (flags.after) store.addEdge(actor, { source: flags.after, target: node.id });
      console.log(`추가: ${node.id}`);
      break;
    }
    case 'link': {
      const [from, to] = rest;
      if (!from || !to) fail('link <from> <to> [--label 글자]');
      store.addEdge(actor, { source: from, target: to, label: flags.label });
      console.log(`${from} → ${to}`);
      break;
    }
    case 'asset': {
      const [id, file] = rest;
      if (!id || !file || !fs.existsSync(file)) fail('asset <id> <존재하는 파일 경로> [--memo "..."]');
      const r = store.saveAsset(actor, id, path.basename(file), fs.readFileSync(file), flags.memo || '');
      console.log(`저장: studio/nodes/${id}/assets/${r.file}`);
      break;
    }
    case 'log': {
      const n = Number(rest[0]) || 20;
      for (const l of store.readLog(n).reverse()) console.log(`${l.ts}  ${l.actor.padEnd(14)} ${l.action.padEnd(14)} ${l.nodeId ?? ''} ${l.detail ?? ''}`);
      break;
    }
    default:
      console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
  }
} catch (err) {
  fail(err.message);
}
