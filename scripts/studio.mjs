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
//   npm run studio -- status <id> <todo|doing|review|done|blocked>
//   npm run studio -- note   <id> "덧붙일 메모"
//   npm run studio -- asset  <id> <파일 경로> [--memo "설명"]
//   npm run studio -- add    <type> "과업 제목" --stage <단계 id> [--goal ..] [--output ..] [--ref <공통 과업 id>]
//   npm run studio -- sub    <과업 id> <kind> "하위 과업 제목" [--by agent|human] [--how "방법, 결과 위치"]
//   npm run studio -- set    <id> [--title ..] [--owner ..] [--stage ..] [--kind ..] [--by ..] [--how ..] [--goal ..] [--output ..]
//   npm run studio -- move   <id> up|down                     같은 단계(또는 같은 과업) 안에서 순서 바꾸기
//   npm run studio -- link   <과업 id> <과업 id> [--label 글자] [--feedback]   뒤 과업이 앞 과업을 기다림 (--feedback 은 되돌림, 기다리지 않음)
//   npm run studio -- stages                                 단계 목록
//   npm run studio -- stage-add "이름" [--goal ..] [--after <단계 id>]
//   npm run studio -- log    [개수]
//
// 세 칸: 일이 끝날 때 남긴다. 명세(scene_spec.yaml)의 assumptions / compromises / unknowns 블록에 쌓인다
//   npm run studio -- done   <id> [--assume ".."] [--compromise ".."] [--unknown ".."] [--none]   세 칸을 남기며 완료 (여러 번 써도 됨)
//   npm run studio -- assume <과업 id> "어떻게 메웠는지" [--confidence high|mid|low] [--field objects.cd_player.pos_m]
//   npm run studio -- compromise <과업 id> "무엇을 낮췄는지" [--gate 72fps] [--field perf.pink_clouds]
//   npm run studio -- unknown <과업 id> "답이 필요한 질문" [--ask human|<과업 id>] [--field meta.bpm]
//   npm run studio -- answer <u id> "답"   ·  confirm <a id>  ·  reject <a id> "이유"  ·  accept <c id>
//   npm run studio -- blanks [--open]                         빈칸 지도: 명세 칸마다 정해짐 / 추정 / 빈칸 / 모름
//
// 에이전트 장부
//   npm run studio -- attempt <하위 과업 id> "무엇을 시도했나" --result ok|fail|pending [--why ..] [--tokens 수]
//   npm run studio -- reopen  <id> "왜 다시 여는지" [--from <원인 과업 id>] [--sub <하위 과업 id>]
//   npm run studio -- set     <과업 id> --budget <토큰 상한>    넘으면 사람 화면에 알림
//
// 결정 서랍 (모든 앱이 함께 씀)
//   npm run studio -- drawer                                  목록
//   npm run studio -- drawer add <constraint|taste|hold|vocab> "내용" [--why ..] [--until "조건"] [--means "실제로 바꾸는 것"]
//   npm run studio -- drawer retire <id>
//
// kind: decide(결정) collect(수집) analyze(분석) write(작성) make(생성) build(구현) verify(검증)
// 누가 했는지는 --as 이름 또는 STUDIO_ACTOR 환경변수로 남긴다. 기본값은 "agent".
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStudio, NODE_TYPES, STATUSES, KINDS, ACTORS, BLOCKS, CONFIDENCE, ATTEMPT_RESULTS, DRAWER_KINDS } from '../server/store.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const studio = createStudio(root);

const BOOL_FLAGS = new Set(['feedback', 'none', 'open']);
const MULTI_FLAGS = new Set(['assume', 'compromise', 'unknown']); // 여러 번 쓸 수 있는 플래그
const argv = process.argv.slice(2);
const flags = {};
const args = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) {
    const k = argv[i].slice(2);
    if (BOOL_FLAGS.has(k)) flags[k] = true;
    else if (MULTI_FLAGS.has(k)) { (flags[k] ||= []).push(argv[i + 1]); i++; }
    else { flags[k] = argv[i + 1]; i++; }
  } else args.push(argv[i]);
}
const actor = flags.as || process.env.STUDIO_ACTOR || 'agent';
const [cmd, ...rest] = args;

const STATE_KO = { settled: '정해짐', inferred: '추정', empty: '빈칸', unknown: '모름' };
const ENTRY_STATUS_KO = { open: '열림', confirmed: '확인됨', rejected: '틀림', accepted: '괜찮음', reopened: '다시 열림', answered: '답함' };

function printEntry(e) {
  const conf = e.type === 'assume' ? ` 확신 ${CONFIDENCE[e.confidence]}` : '';
  const extra = e.type === 'compromise' && e.gate ? ` 게이트:${e.gate}` : e.type === 'unknown' ? ` 답할 쪽:${e.ask || 'human'}` : '';
  console.log(`  ${e.id}  [${BLOCKS[e.type].label}${conf}${extra}] ${e.text}${e.status !== 'open' ? `  (${ENTRY_STATUS_KO[e.status] || e.status})` : ''}`);
  const where = [e.task && `과업 ${e.task}`, e.field && `칸 ${e.field}`].filter(Boolean).join(' · ');
  if (where) console.log(`        ${where}`);
  if (e.answer) console.log(`        답: ${e.answer}`);
  if (e.note) console.log(`        메모: ${e.note}`);
}

// 세 칸 중 하나라도 남겼는지. 없으면 done 을 막고 방법을 알려 준다.
function requireThree(s, id) {
  if (!s.hasSpec()) return true;
  return s.entriesFor(id).length > 0;
}

const STATUS_KO = { todo: '대기', doing: '진행 중', review: '확인 필요', done: '완료', blocked: '막힘' };
const MARK = { todo: '[ ]', doing: '[~]', review: '[?]', done: '[x]', blocked: '[!]' };

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
      console.log('표시: [ ] 대기  [~] 진행 중  [?] 확인 필요  [x] 완료  [!] 막힘  · ▶ 지금 차례\n');
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
      } else {
        console.log(`과업: ${n.id} (${n.type})\n제목: ${n.title}\n단계: ${d.stage?.id} "${d.stage?.title}"\n상태: ${n.status} (${STATUS_KO[n.status]})${n.progress?.total ? ` · 하위 과업 ${n.progress.done}/${n.progress.total}` : ''}\n담당: ${n.owner || '-'}`);
        if (n.goal) console.log(`목표: ${n.goal}`);
        if (n.output) console.log(`산출물: ${n.output}`);
        if (n.type === 'shared') console.log(`공통 과업: ${n.ref} (자세히: show ${n.ref} --app shared)`);
        if (n.usedBy?.length) console.log(`사용 앱: ${n.usedBy.map((u) => `${u.app}/${u.node}`).join(', ')}`);
        console.log(`기다리는 과업: ${d.incoming.filter((e) => e.kind !== 'feedback').map((e) => e.id).join(', ') || '-'}${n.waitingOn?.length ? `  (아직 안 끝남: ${n.waitingOn.join(', ')})` : ''}`);
        console.log(`넘기는 과업: ${d.outgoing.map((e) => e.id + (e.kind === 'feedback' ? '(되돌림)' : '')).join(', ') || '-'}`);
        if (d.children.length) {
          console.log('하위 과업:');
          for (const c of d.children) console.log(`  ${c.isCurrent ? '▶' : ' '}${MARK[c.status]} ${c.id}  (${ACTORS[c.by]}) ${KINDS[c.kind]} · ${c.title}${c.how ? `\n        방법: ${c.how}` : ''}`);
        }
      }
      if (n.budget) console.log(`토큰 상한: ${n.budget}${n.ledger?.tokens ? ` (지금까지 ${n.ledger.tokens})` : ''}`);
      if (n.attempts?.length) {
        console.log('시도 기록:');
        for (const a of n.attempts) console.log(`  #${a.n} ${ATTEMPT_RESULTS[a.result]}  ${a.label}${a.why ? ` — ${a.why}` : ''}${a.tokens ? `  (${a.tokens} 토큰)` : ''}  · ${a.by}`);
      }
      if (n.reopened?.length) {
        console.log('다시 열림:');
        for (const r of n.reopened) console.log(`  ${r.at.slice(0, 16).replace('T', ' ')}  ${r.because}${r.from ? `  (원인: ${r.from})` : ''}${r.sub ? `  → ${r.sub}` : ''} · ${r.by}`);
      }
      const entries = s.entriesFor(n.id);
      if (entries.length) { console.log('세 칸:'); entries.forEach(printEntry); }
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
      const s = store();
      s.updateNode(actor, id, { status });
      console.log(`${id} → ${status}`);
      if (status === 'done' && actor !== 'human' && !requireThree(s, id)) {
        console.log(`참고: 이 과업에 세 칸(가정 · 타협 · 모름)이 하나도 없어요. 에이전트는 \`done ${id} --assume .. --compromise .. --unknown ..\` 로 끝내 주세요. 정말 없으면 --none.`);
      }
      break;
    }
    case 'done': {
      const [id] = rest;
      if (!id) fail('done <id> [--assume ".."] [--compromise ".."] [--unknown ".."] [--none] --app <앱>');
      const s = store();
      const added = [];
      for (const [flag, type] of [['assume', 'assume'], ['compromise', 'compromise'], ['unknown', 'unknown']]) {
        for (const text of flags[flag] || []) added.push(s.addKnowledge(actor, type, { task: id, text, confidence: type === 'assume' ? flags.confidence : undefined }));
      }
      if (!added.length && !flags.none && !requireThree(s, id)) {
        fail([
          `"${id}"을 끝내기 전에 세 칸을 남겨 주세요. 사람 화면의 빈칸 지도가 이걸로 계산돼요.`,
          '  --assume "말하지 않은 것을 어떻게 메웠는지"   (확신은 --confidence high|mid|low, 기본 mid)',
          '  --compromise "조건을 맞추려고 낮춘 것"',
          '  --unknown "사람이나 다음 단계가 답해야 하는 것"',
          '  정말 셋 다 없으면 --none',
        ].join('\n'));
      }
      s.updateNode(actor, id, { status: 'done' });
      for (const e of added) console.log(`  ${e.id} ${BLOCKS[e.type].label}: ${e.text}`);
      console.log(`${id} → done${flags.none && !added.length ? ' (세 칸 없음)' : ''}`);
      break;
    }
    case 'assume':
    case 'compromise':
    case 'unknown': {
      const [task, ...text] = rest;
      if (!task || !text.length) fail(`${cmd} <과업 id> "내용" [--field 명세.경로]${cmd === 'assume' ? ' [--confidence high|mid|low]' : cmd === 'compromise' ? ' [--gate 72fps]' : ' [--ask human|<과업 id>]'} --app <앱>`);
      const e = store().addKnowledge(actor, cmd, { task, text: text.join(' '), field: flags.field, confidence: flags.confidence, gate: flags.gate, ask: flags.ask });
      console.log(`${e.id} ${BLOCKS[cmd].label} 추가`);
      break;
    }
    case 'answer':
    case 'confirm':
    case 'reject':
    case 'accept': {
      const [id, ...text] = rest;
      if (!id || (cmd === 'answer' && !text.length)) fail(`${cmd} <id>${cmd === 'answer' ? ' "답"' : cmd === 'reject' ? ' "이유"' : ''} --app <앱>`);
      const e = store().resolveKnowledge(actor, id, cmd, cmd === 'answer' ? { answer: text.join(' ') } : { note: text.join(' ') });
      console.log(`${id} → ${ENTRY_STATUS_KO[e.status] || e.status}`);
      break;
    }
    case 'blanks': {
      const s = store();
      const m = s.spec();
      const sm = m.summary;
      const verdict = { thin: '디렉션이 아직 부족해요', ok: '진행할 만해요. 추정이나 빈칸이 남아 있어요', solid: '충분해요' }[sm.verdict];
      console.log(`# 빈칸 지도  (${m.path})`);
      console.log(`칸 ${sm.fields}개: 정해짐 ${sm.settled} · 추정 ${sm.inferred}(확신 하 ${sm.lowInferred}) · 빈칸 ${sm.empty} · 모름 ${sm.unknown}`);
      console.log(`열린 항목: 가정 ${sm.openAssumptions}(확신 하 ${sm.lowAssumptions}) · 타협 ${sm.openCompromises} · 모름 ${sm.openUnknowns}(사람이 답할 것 ${sm.humanUnknowns})`);
      console.log(`판정: ${verdict}\n`);
      for (const b of m.blocks) {
        const fields = flags.open ? b.fields.filter((f) => f.state !== 'settled') : b.fields;
        if (!fields.length) continue;
        console.log(`## ${b.key}`);
        for (const f of fields) console.log(`  ${STATE_KO[f.state].padEnd(3)} ${f.path}${f.confidence ? ` (확신 ${CONFIDENCE[f.confidence]})` : ''}${f.entries.length ? `  ← ${f.entries.join(', ')}` : ''}`);
      }
      const open = m.entries.filter((e) => !flags.open || e.status === 'open');
      if (open.length) { console.log('\n## 세 칸 항목'); open.forEach(printEntry); }
      break;
    }
    case 'attempt': {
      const [id, ...label] = rest;
      if (!id || !label.length) fail('attempt <하위 과업 id> "무엇을 시도했나" --result ok|fail|pending [--why ..] [--tokens 수] --app <앱>');
      const a = store().addAttempt(actor, id, { label: label.join(' '), result: flags.result || 'pending', why: flags.why, tokens: flags.tokens, file: flags.file });
      console.log(`${id} 시도 #${a.n} ${ATTEMPT_RESULTS[a.result]}`);
      if (a.stuck) console.log(`주의: 연속 ${a.trailingFails}번 실패했어요. 사람 화면에 "헤맴" 알림이 떠요. 방향을 바꾸기 전에 사람에게 물어보세요.`);
      break;
    }
    case 'reopen': {
      const [id, ...because] = rest;
      if (!id || !because.length) fail('reopen <id> "왜 다시 여는지" [--from <원인 과업 id>] [--sub <하위 과업 id>] --app <앱>');
      const r = store().reopen(actor, id, { because: because.join(' '), from: flags.from, sub: flags.sub });
      console.log(`${id} 다시 열림${r.reopenedSub ? ` (${r.reopenedSub} → todo)` : ' → todo'}`);
      break;
    }
    case 'drawer': {
      const [sub, kindOrId, ...text] = rest;
      if (sub === 'add') {
        if (!DRAWER_KINDS[kindOrId] || !text.length) fail(`drawer add <${Object.keys(DRAWER_KINDS).join('|')}> "내용" [--why ..] [--until ..] [--means ..]`);
        const it = studio.addDrawer(actor, { kind: kindOrId, text: text.join(' '), why: flags.why, until: flags.until, means: flags.means, app: flags.app, task: flags.task });
        console.log(`서랍 ${it.id} (${DRAWER_KINDS[it.kind].label}) 추가`);
        break;
      }
      if (sub === 'retire' || sub === 'revive') {
        if (!kindOrId) fail(`drawer ${sub} <id>`);
        studio.updateDrawer(actor, kindOrId, { status: sub === 'retire' ? 'retired' : 'active' });
        console.log(`${kindOrId} → ${sub === 'retire' ? '내림' : '다시 씀'}`);
        break;
      }
      const d = studio.drawer();
      console.log(`# 결정 서랍  (${d.path})\n`);
      for (const [k, meta] of Object.entries(DRAWER_KINDS)) {
        const items = d.items.filter((x) => x.kind === k && x.status !== 'retired');
        console.log(`## ${meta.label} — ${meta.hint}`);
        if (k === 'constraint') for (const t of d.sharedTasks) console.log(`  공통/${t.id}  ${t.title}${t.preview ? ` — ${t.preview}` : ''}`);
        for (const it of items) {
          console.log(`  ${it.id}  ${it.text}${it.means ? ` → ${it.means}` : ''}${it.until ? `  (다시 볼 조건: ${it.until})` : ''}${it.app ? `  [${it.app}]` : ''}`);
          if (it.why) console.log(`        이유: ${it.why}`);
        }
        if (!items.length && k !== 'constraint') console.log('  (없음)');
        console.log('');
      }
      break;
    }
    case 'set': {
      const [id] = rest;
      if (!id) fail('set <id> --title .. --owner .. --stage .. --kind .. --by .. --how .. --goal .. --output .. --ref .. --app <앱>');
      const patch = {};
      for (const k of ['title', 'owner', 'type', 'status', 'ref', 'stage', 'kind', 'by', 'how', 'goal', 'output', 'parent', 'budget']) if (flags[k] !== undefined) patch[k] = flags[k];
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
      const node = store().createNode(actor, { type, title: title || '', owner: flags.owner || '', stage: flags.stage, id: flags.id, ref: flags.ref, goal: flags.goal, output: flags.output, by: flags.by, how: flags.how });
      console.log(`과업 추가: ${node.id}  (단계 ${node.stage})`);
      break;
    }
    case 'sub': {
      const [parent, kind, title] = rest;
      if (!parent || !KINDS[kind] || !title) fail(`sub <과업 id> <${Object.keys(KINDS).join('|')}> "제목" [--by agent|human] [--how ..] --app <앱>`);
      const node = store().createNode(actor, { parent, kind, title, by: flags.by || (kind === 'decide' ? 'human' : 'agent'), how: flags.how, id: flags.id });
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
