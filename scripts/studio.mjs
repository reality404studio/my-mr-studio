#!/usr/bin/env node
// 에이전트용 CLI. 웹 앱과 같은 저장소 함수를 쓰므로, 여기서 바꾼 내용은 열려 있는 웹 화면에 바로 나타난다.
//
// 보드 구조: 단계(stage) > 과업(task) > 하위 과업(sub). 하위 과업마다 특성(kind)과 하는 쪽(by: human|agent)이 있다.
//
// 전체
//   npm run studio -- apps                                   공통과 앱 목록, 앱마다 지금 할 일
//   npm run studio -- modes                                  모드(템플릿) 목록
//   npm run studio -- new-app <id> "이름" --mode <모드 id> [--subtitle "한 줄 소개"]
//
// 보드 하나 (--app <앱 id> 또는 --app shared, 혹은 STUDIO_APP 환경변수)
//   npm run studio -- next   [--by agent|human]              지금 시작할 수 있는 일 (먼저 이것부터)
//   npm run studio -- list                                   단계 > 과업 > 하위 과업 트리
//   npm run studio -- show   <id>                            과업이나 하위 과업 상세와 메모
//   npm run studio -- status <id> <todo|doing|review|proof|done|blocked>
//   npm run studio -- proof  <id> <증거 파일> --memo "무엇을 증명하는지"     증명 칼럼에 붙이는 증거 (proof 상태에서만)
//   npm run studio -- proofs                                 검증 세션용: 증명 칼럼 카드의 성공 조건과 증거만
//
// 증명 게이트 (에이전트 카드): doing → proof → 증거 붙이기 → done. 성공 조건(--success)이 없거나,
// proof 를 건너뛰었거나, proof 이후 붙인 증거가 없거나, proof 로 올린 이름과 같은 이름이면 done 이 거절된다.
//   npm run studio -- note   <id> "덧붙일 메모"
//   npm run studio -- asset  <id> <파일 경로> [--memo "설명"]
//   npm run studio -- add    <type> "과업 제목" --stage <단계 id> [--goal ..] [--output ..] [--ref <공통 과업 id>]
//   npm run studio -- sub    <과업 id> <kind> "하위 과업 제목" [--by agent|human] [--how "방법, 결과 위치"] [--success "관찰 가능한 성공 조건"]
//   npm run studio -- set    <id> [--title ..] [--owner ..] [--stage ..] [--kind ..] [--by ..] [--how ..] [--goal ..] [--output ..] [--success ..]
//   npm run studio -- move   <id> up|down                     같은 단계(또는 같은 과업) 안에서 순서 바꾸기
//   npm run studio -- link   <과업 id> <과업 id> [--label 글자] [--feedback]   뒤 과업이 앞 과업을 기다림 (--feedback 은 되돌림, 기다리지 않음)
//   npm run studio -- stages                                 단계 목록
//   npm run studio -- stage-add "이름" [--goal ..] [--after <단계 id>]
//   npm run studio -- log    [개수]
//
// kind: decide(결정) collect(수집) analyze(분석) write(작성) make(생성) build(구현) verify(검증)
// 누가 했는지는 --as 이름 또는 STUDIO_ACTOR 환경변수로 남긴다. 기본값은 "agent".
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStudio, NODE_TYPES, STATUSES, KINDS, ACTORS } from '../server/store.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const studio = createStudio(root);

const BOOL_FLAGS = new Set(['feedback']);
const argv = process.argv.slice(2);
const flags = {};
const args = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) {
    const k = argv[i].slice(2);
    if (BOOL_FLAGS.has(k)) flags[k] = true;
    else { flags[k] = argv[i + 1]; i++; }
  } else args.push(argv[i]);
}
const actor = flags.as || process.env.STUDIO_ACTOR || 'agent';
const [cmd, ...rest] = args;

const STATUS_KO = { todo: '대기', doing: '진행 중', review: '확인 필요', proof: '증명', done: '완료', blocked: '막힘' };
const MARK = { todo: '[ ]', doing: '[~]', review: '[?]', proof: '[P]', done: '[x]', blocked: '[!]' };

function fail(msg) {
  console.error(`오류: ${msg}`);
  process.exit(1);
}

function store() {
  const pid = flags.app || process.env.STUDIO_APP;
  if (!pid) {
    const { apps } = studio.projects();
    fail(`어느 보드인지 --app 으로 알려 주세요. 공통은 --app shared, 앱: ${apps.map((a) => a.id).join(', ') || '(없음)'}`);
  }
  return studio.project(pid);
}

function printNext(items, pid) {
  if (!items.length) { console.log('지금 시작할 수 있는 일이 없어요. 앞 과업을 기다리거나 모두 끝났어요.'); return; }
  for (const it of items) {
    const who = ACTORS[it.by] || it.by;
    const kind = it.kind ? `${KINDS[it.kind]} · ` : '';
    console.log(`${MARK[it.status]} ${it.id}  (${who}) ${kind}${it.title}`);
    console.log(`      과업: ${it.task} "${it.taskTitle}" · 단계: ${it.stage}${it.how ? `\n      방법: ${it.how}` : ''}`);
  }
  console.log(`\n자세히: npm run studio -- show <id> --app ${pid}`);
}

try {
  switch (cmd) {
    case 'apps': {
      const { studio: info, shared, apps } = studio.projects();
      console.log(`# ${info.name}\n`);
      const line = (p) => {
        const done = p.nodes.filter((n) => n.status === 'done').length;
        console.log(`${p.id}  "${p.name}"${p.template ? `  모드:${p.template}` : ''}  과업 ${done}/${p.nodes.length} 완료`);
        for (const n of p.next) console.log(`    다음: ${n.id} (${ACTORS[n.by]}) ${n.title}`);
      };
      if (shared) line(shared);
      apps.forEach(line);
      break;
    }
    case 'modes': {
      for (const t of studio.templates()) {
        console.log(`${t.id}  "${t.name}"  출발점: ${t.startsFrom}\n  ${t.description}`);
        for (const s of t.stages) console.log(`  ${s.title}: ${s.tasks.map((x) => x.title).join(', ') || '-'}`);
        if (t.uses.length) console.log(`  공통에서 가져옴: ${t.uses.map((u) => u.title).join(', ')}`);
        console.log('');
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
    case 'next': {
      const s = store();
      let items = s.next();
      if (flags.by) items = items.filter((i) => i.by === flags.by);
      printNext(items, s.pid);
      break;
    }
    case 'list': {
      const s = store();
      const p = s.pipeline();
      const byId = Object.fromEntries(p.nodes.map((n) => [n.id, n]));
      console.log(`# ${p.project?.name ?? s.pid}  (studio/${p.relDir}/)`);
      console.log('표시: [ ] 대기  [~] 진행 중  [?] 확인 필요  [P] 증명  [x] 완료  [!] 막힘  · ▶ 지금 차례\n');
      p.stages.forEach((st, i) => {
        console.log(`## ${i + 1}. ${st.title}  (${st.id})${st.goal ? ` — ${st.goal}` : ''}`);
        const tasks = p.nodes.filter((n) => !n.parent && n.stage === st.id).sort((a, b) => a.order - b.order);
        if (!tasks.length) console.log('   (과업 없음)');
        for (const t of tasks) {
          const ref = t.type === 'shared' ? ` → 공통:${t.ref || '(미지정)'}` : '';
          const prog = t.progress?.total ? ` ${t.progress.done}/${t.progress.total}` : '';
          const wait = t.waitingOn?.length ? `  기다림: ${t.waitingOn.join(', ')}` : '';
          const used = t.usedBy?.length ? `  사용 앱: ${t.usedBy.map((u) => u.app).join(', ')}` : '';
          console.log(`${MARK[t.status]} ${t.id} (${t.type}) "${t.title}"${ref}${prog}${t.owner ? ` 담당:${t.owner}` : ''}${wait}${used}`);
          if (t.output) console.log(`      산출물: ${t.output}`);
          for (const cid of t.children || []) {
            const c = byId[cid];
            const cur = c.isCurrent ? '▶' : ' ';
            console.log(`    ${cur}${MARK[c.status]} ${c.id}  (${ACTORS[c.by] || c.by}) ${KINDS[c.kind] || c.kind} · ${c.title}`);
          }
        }
        console.log('');
      });
      break;
    }
    case 'show': {
      const [id] = rest;
      if (!id) fail('show <id> --app <앱>');
      const s = store();
      const d = s.nodeDetail(id);
      const n = d.node;
      if (n.parent) {
        console.log(`하위 과업: ${n.id}\n제목: ${n.title}\n과업: ${d.parent.id} "${d.parent.title}" · 단계: ${d.stage?.title}`);
        console.log(`특성: ${n.kind} (${KINDS[n.kind]}) · 하는 쪽: ${n.by} (${ACTORS[n.by]})\n상태: ${n.status} (${STATUS_KO[n.status]})${n.isCurrent ? ' · 지금 차례' : ''}`);
        if (n.how) console.log(`방법: ${n.how}`);
        console.log(`성공 조건: ${n.success || '(없음 — done 불가)'}`);
      } else {
        console.log(`과업: ${n.id} (${n.type})\n제목: ${n.title}\n단계: ${d.stage?.id} "${d.stage?.title}"\n상태: ${n.status} (${STATUS_KO[n.status]})${n.progress?.total ? ` · 하위 과업 ${n.progress.done}/${n.progress.total}` : ''}\n담당: ${n.owner || '-'}`);
        if (n.goal) console.log(`목표: ${n.goal}`);
        if (n.output) console.log(`산출물: ${n.output}`);
        if (!d.children.length && n.type !== 'shared') console.log(`성공 조건: ${n.success || '(없음 — done 불가)'}`);
        if (n.type === 'shared') console.log(`공통 과업: ${n.ref} (자세히: show ${n.ref} --app shared)`);
        if (n.usedBy?.length) console.log(`사용 앱: ${n.usedBy.map((u) => `${u.app}/${u.node}`).join(', ')}`);
        console.log(`기다리는 과업: ${d.incoming.filter((e) => e.kind !== 'feedback').map((e) => e.id).join(', ') || '-'}${n.waitingOn?.length ? `  (아직 안 끝남: ${n.waitingOn.join(', ')})` : ''}`);
        console.log(`넘기는 과업: ${d.outgoing.map((e) => e.id + (e.kind === 'feedback' ? '(되돌림)' : '')).join(', ') || '-'}`);
        if (d.children.length) {
          console.log('하위 과업:');
          for (const c of d.children) console.log(`  ${c.isCurrent ? '▶' : ' '}${MARK[c.status]} ${c.id}  (${ACTORS[c.by]}) ${KINDS[c.kind]} · ${c.title}${c.how ? `\n        방법: ${c.how}` : ''}`);
        }
      }
      console.log(`수정: ${n.updatedAt || '-'} by ${n.updatedBy || '-'}`);
      console.log(`메모 파일: ${d.notesPath}`);
      if (d.assets.length) {
        console.log('파일:');
        for (const a of d.assets) console.log(`  - studio/${s.relDir}/nodes/${n.id}/assets/${a.file}${a.memo ? `  # ${a.memo}` : ''}`);
      }
      if (d.notes.trim()) console.log('\n--- README.md ---\n' + d.notes);
      break;
    }
    case 'status': {
      const [id, status] = rest;
      if (!id || !STATUSES.includes(status)) fail(`status <id> <${STATUSES.join('|')}> --app <앱>`);
      store().updateNode(actor, id, { status });
      console.log(`${id} → ${status}`);
      break;
    }
    case 'set': {
      const [id] = rest;
      if (!id) fail('set <id> --title .. --owner .. --stage .. --kind .. --by .. --how .. --goal .. --output .. --ref .. --app <앱>');
      const patch = {};
      for (const k of ['title', 'owner', 'type', 'status', 'ref', 'stage', 'kind', 'by', 'how', 'goal', 'output', 'parent', 'success']) if (flags[k] !== undefined) patch[k] = flags[k];
      store().updateNode(actor, id, patch);
      console.log(`${id} 수정: ${JSON.stringify(patch)}`);
      break;
    }
    case 'note': {
      const [id, ...text] = rest;
      const body = text.join(' ') || (!process.stdin.isTTY ? fs.readFileSync(0, 'utf8') : '');
      if (!id || !body.trim()) fail('note <id> "메모" --app <앱>  (또는 표준입력으로 전달)');
      store().appendNote(actor, id, body);
      console.log(`${id} 메모 추가`);
      break;
    }
    case 'add': {
      const [type, title] = rest;
      if (!NODE_TYPES.includes(type) || (!title && type !== 'shared')) fail(`add <${NODE_TYPES.join('|')}> "과업 제목" --stage <단계 id> --app <앱>  (단계 목록: stages)`);
      const node = store().createNode(actor, { type, title: title || '', owner: flags.owner || '', stage: flags.stage, id: flags.id, ref: flags.ref, goal: flags.goal, output: flags.output, by: flags.by, how: flags.how, success: flags.success });
      console.log(`과업 추가: ${node.id}  (단계 ${node.stage})`);
      break;
    }
    case 'sub': {
      const [parent, kind, title] = rest;
      if (!parent || !KINDS[kind] || !title) fail(`sub <과업 id> <${Object.keys(KINDS).join('|')}> "제목" [--by agent|human] [--how ..] --app <앱>`);
      const node = store().createNode(actor, { parent, kind, title, by: flags.by || (kind === 'decide' ? 'human' : 'agent'), how: flags.how, success: flags.success, id: flags.id });
      console.log(`하위 과업 추가: ${node.id}  (${parent} 안, 마지막 순서)`);
      break;
    }
    case 'move': {
      const [id, dir] = rest;
      if (!id || !['up', 'down'].includes(dir)) fail('move <id> up|down --app <앱>');
      store().moveNode(actor, id, dir);
      console.log(`${id} ${dir === 'up' ? '위로' : '아래로'}`);
      break;
    }
    case 'link': {
      const [from, to] = rest;
      if (!from || !to) fail('link <과업 id> <과업 id> [--label 글자] [--feedback] --app <앱>');
      store().addEdge(actor, { source: from, target: to, label: flags.label, kind: flags.feedback ? 'feedback' : undefined });
      console.log(`${from} → ${to}${flags.feedback ? ' (되돌림)' : ''}`);
      break;
    }
    case 'stages': {
      const p = store().readPipeline();
      p.stages.forEach((s, i) => console.log(`${i + 1}. ${s.id}  "${s.title}"${s.goal ? ` — ${s.goal}` : ''}`));
      break;
    }
    case 'stage-add': {
      const [title] = rest;
      if (!title) fail('stage-add "이름" [--goal ..] [--after <단계 id>] --app <앱>');
      const s = store().addStage(actor, { title, goal: flags.goal, after: flags.after, id: flags.id });
      console.log(`단계 추가: ${s.id}`);
      break;
    }
    case 'asset': {
      const [id, file] = rest;
      if (!id || !file || !fs.existsSync(file)) fail('asset <id> <존재하는 파일 경로> [--memo "..."] --app <앱>');
      const s = store();
      const r = s.saveAsset(actor, id, path.basename(file), fs.readFileSync(file), flags.memo || '');
      console.log(`저장: studio/${s.relDir}/nodes/${id}/assets/${r.file}`);
      break;
    }
    case 'proof': {
      const [id, file] = rest;
      if (!id || !file || !fs.existsSync(file) || !flags.memo?.trim()) fail('proof <id> <존재하는 파일 경로> --memo "무엇을 증명하는지" --app <앱>');
      const s = store();
      const n = s.nodeDetail(id).node;
      if (n.status !== 'proof') fail(`${id} 는 지금 ${n.status} 예요. 먼저 status ${id} proof`);
      const r = s.saveAsset(actor, id, path.basename(file), fs.readFileSync(file), flags.memo.trim());
      console.log(`증거: studio/${s.relDir}/nodes/${id}/assets/${r.file}\n검증은 다른 세션: proofs --app ${s.pid}`);
      break;
    }
    case 'proofs': {
      const s = store();
      const cards = s.pipeline().nodes.filter((n) => n.status === 'proof' && !(n.children || []).length);
      if (!cards.length) { console.log('증명 칼럼에 카드가 없어요.'); break; }
      for (const n of cards) {
        const d = s.nodeDetail(n.id);
        const ev = d.assets.filter((a) => a.addedAt && a.addedAt >= (n.proofAt || '') && String(a.memo || '').trim());
        console.log(`[P] ${n.id}  "${n.title}"  올린 이름: ${n.proofBy || '-'}`);
        console.log(`    성공 조건: ${n.success || '(없음)'}`);
        for (const a of ev) console.log(`    증거: studio/${s.relDir}/nodes/${n.id}/assets/${a.file}  # ${a.memo}`);
        if (!ev.length) console.log('    증거: (없음)');
      }
      console.log(`\n판단: 증거가 성공 조건을 보여 주면 status <id> done --as "<${actor === 'agent' ? '다른 이름' : '올린 이름과 다른 이름'}>", 아니면 status <id> doing + note <id> "무엇이 모자란지"`);
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
