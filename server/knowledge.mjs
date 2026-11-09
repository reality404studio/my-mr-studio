// 세 칸(가정 · 타협 · 모름)과 빈칸 지도.
//
// 진실의 원천은 앱의 scene_spec.yaml 이다. 세 칸은 명세 안의 블록으로 산다:
//
//   assumptions:   말하지 않은 것을 어떻게 메웠는지. 확신 high | mid | low
//   compromises:   조건(게이트)을 맞추려고 낮춘 것
//   unknowns:      사람이나 다음 단계가 답해야 하는 것
//
// 항목마다 task(어느 과업에서 나왔는지)와 field(명세의 어느 칸에 대한 것인지, 선택)를 가진다.
// field 는 점으로 이은 경로다. 배열 항목은 id 나 target 으로 가리킨다. 예: objects.cd_player.pos_m, perf.pink_clouds
//
// 빈칸 지도는 명세의 칸마다 상태를 계산한다:
//   unknown   열린 "모름"이 걸려 있음
//   empty     값이 비어 있음 (null, "", [])
//   inferred  열린 "가정"이 걸려 있음 (에이전트가 추정한 값)
//   settled   값이 있고, 열린 가정이 없음 (사람이 정했거나 가정이 확인됨)
import YAML from 'yaml';

export const BLOCKS = {
  assume: { key: 'assumptions', prefix: 'a', label: '가정', comment: ' 말하지 않은 것을 어떻게 메웠는지. confidence: high | mid | low. 사람이 confirm 하거나 reject 한다' },
  compromise: { key: 'compromises', prefix: 'c', label: '타협', comment: ' 조건(게이트)을 맞추려고 낮춘 것. 사람이 accept 하거나 과업을 다시 연다' },
  unknown: { key: 'unknowns', prefix: 'u', label: '모름', comment: ' 영상이나 디렉션만으로 정할 수 없는 것. 사람(또는 다음 과업)이 답한다' },
};
export const CONFIDENCE = { high: '상', mid: '중', low: '하' };
const LEDGER_KEYS = new Set(['assumptions', 'compromises', 'unknowns', 'review']);
const CONF_RANK = { low: 0, mid: 1, high: 2 };

export function parseSpec(src) {
  const doc = YAML.parseDocument(src || '');
  if (doc.errors?.length) {
    const e = new Error(`scene_spec.yaml 을 읽지 못했어요: ${doc.errors[0].message}`);
    e.status = 422;
    throw e;
  }
  return doc;
}

// 항목을 한 줄씩 유지하려고 줄바꿈 접기를 끈다.
export function stringifySpec(doc) {
  return doc.toString({ lineWidth: 0, flowCollectionPadding: false });
}

// 명세에서 세 칸 항목을 모두 꺼낸다. 사람이 손으로 적은 문자열 항목도 받아 준다.
export function readEntries(doc) {
  const out = [];
  for (const [type, b] of Object.entries(BLOCKS)) {
    const list = doc.get(b.key);
    const items = YAML.isSeq(list) ? list.items : [];
    items.forEach((node, i) => {
      const raw = YAML.isMap(node) ? node.toJSON() : { text: String(YAML.isScalar(node) ? node.value : node) };
      const e = { ...raw, type, id: raw.id || `${b.prefix}?${i + 1}` };
      if (type === 'unknown') e.text = raw.question ?? raw.text ?? '';
      e.status ||= 'open';
      if (type === 'assume') e.confidence = CONFIDENCE[raw.confidence] ? raw.confidence : 'mid';
      out.push(e);
    });
  }
  return out;
}

function seqFor(doc, type) {
  const b = BLOCKS[type];
  let seq = doc.get(b.key, true);
  if (!YAML.isSeq(seq)) {
    seq = doc.createNode([]);
    doc.set(b.key, seq);
    const pair = doc.contents.items.find((p) => (p.key?.value ?? p.key) === b.key);
    if (pair && YAML.isScalar(pair.key)) pair.key.commentBefore = b.comment;
  }
  seq.flow = false;
  return seq;
}

export function addEntry(doc, type, { task, field, text, confidence, gate, ask }, actor) {
  const b = BLOCKS[type];
  if (!b) throw Object.assign(new Error(`종류는 ${Object.keys(BLOCKS).join(', ')} 중 하나예요.`), { status: 400 });
  if (!String(text || '').trim()) throw Object.assign(new Error(`${b.label} 내용을 적어 주세요.`), { status: 400 });
  if (type === 'assume' && confidence && !CONFIDENCE[confidence]) throw Object.assign(new Error('confidence 는 high, mid, low 중 하나예요.'), { status: 400 });
  const used = readEntries(doc).filter((e) => e.type === type).map((e) => Number(String(e.id).slice(1)) || 0);
  const id = `${b.prefix}${(used.length ? Math.max(...used) : 0) + 1}`;
  const entry = { id };
  if (task) entry.task = task;
  if (field) entry.field = field;
  entry[type === 'unknown' ? 'question' : 'text'] = String(text).trim();
  if (type === 'assume') entry.confidence = confidence || 'mid';
  if (type === 'compromise' && gate) entry.gate = gate;
  if (type === 'unknown') entry.ask = ask || 'human';
  entry.status = 'open';
  entry.by = actor;
  entry.at = new Date().toISOString();
  const seq = seqFor(doc, type);
  const node = doc.createNode(entry);
  node.flow = true;
  seq.items.push(node);
  return { ...entry, type, text: entry.text ?? entry.question };
}

const NEXT_STATUS = {
  assume: { confirm: 'confirmed', reject: 'rejected', reopen: 'open' },
  compromise: { accept: 'accepted', reopen: 'reopened' },
  unknown: { answer: 'answered', reopen: 'open' },
};

// action: confirm | reject (가정), accept | reopen (타협), answer (모름)
export function resolveEntry(doc, id, action, { answer, note } = {}, actor) {
  for (const [type, b] of Object.entries(BLOCKS)) {
    const list = doc.get(b.key);
    if (!YAML.isSeq(list)) continue;
    const node = list.items.find((n) => YAML.isMap(n) && n.get('id') === id);
    if (!node) continue;
    const status = NEXT_STATUS[type][action];
    if (!status) throw Object.assign(new Error(`${b.label}(${id})에는 ${Object.keys(NEXT_STATUS[type]).join(', ')} 만 할 수 있어요.`), { status: 400 });
    if (action === 'answer' && !String(answer || '').trim()) throw Object.assign(new Error('답을 적어 주세요.'), { status: 400 });
    node.set('status', status);
    if (action === 'answer') node.set('answer', String(answer).trim());
    if (note) node.set('note', String(note).trim());
    node.set('resolvedBy', actor);
    node.set('resolvedAt', new Date().toISOString());
    return { ...node.toJSON(), type };
  }
  throw Object.assign(new Error(`"${id}" 항목이 명세에 없어요. 목록: npm run studio -- blanks`), { status: 404 });
}

// ---------- 빈칸 지도 ----------

const isEmpty = (v) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0) || (isPlainObject(v) && Object.keys(v).length === 0);
const isPlainObject = (v) => v && typeof v === 'object' && !Array.isArray(v);
const isLeafArray = (v) => Array.isArray(v) && v.every((x) => x === null || typeof x !== 'object');
const itemKey = (x, i) => (isPlainObject(x) && (x.id ?? x.target ?? x.t_s)) ?? i;

function walk(value, pathParts, out) {
  if (isEmpty(value) || !isPlainObject(value) && (!Array.isArray(value) || isLeafArray(value))) {
    out.push({ path: pathParts.join('.'), value: isEmpty(value) ? null : value });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((x, i) => {
      const key = String(itemKey(x, i));
      // 배열 항목 하나가 작은 레코드(시간축 이벤트, perf 태그)이면 통째로 한 칸으로 본다
      if (isPlainObject(x) && !x.id) out.push({ path: [...pathParts, key].join('.'), value: x });
      else walk(x, [...pathParts, key], out);
    });
    return;
  }
  for (const [k, v] of Object.entries(value)) if (k !== 'id') walk(v, [...pathParts, k], out);
}

const related = (field, path) => field && (field === path || path.startsWith(`${field}.`) || field.startsWith(`${path}.`));

export function specMap(doc) {
  const data = doc.toJS() || {};
  const entries = readEntries(doc);
  const blocks = [];
  for (const [key, value] of Object.entries(data)) {
    if (LEDGER_KEYS.has(key)) continue;
    const leaves = [];
    walk(value, [key], leaves);
    blocks.push({
      key,
      fields: leaves.map((l) => {
        const rel = entries.filter((e) => related(e.field, l.path));
        const open = (t) => rel.filter((e) => e.type === t && e.status === 'open');
        const assumptions = open('assume');
        let state = 'settled';
        if (open('unknown').length) state = 'unknown';
        else if (l.value === null) state = 'empty';
        else if (assumptions.length) state = 'inferred';
        const confidence = assumptions.length ? assumptions.map((a) => a.confidence).sort((a, b) => CONF_RANK[a] - CONF_RANK[b])[0] : null;
        return { ...l, state, confidence, entries: rel.map((e) => e.id) };
      }),
    });
  }
  const fields = blocks.flatMap((b) => b.fields);
  const fieldPaths = fields.map((f) => f.path);
  const loose = entries.filter((e) => !e.field || !fieldPaths.some((p) => related(e.field, p))).map((e) => e.id);
  return { blocks, entries, loose, summary: summarize(fields, entries) };
}

export function summarize(fields, entries) {
  const count = (s) => fields.filter((f) => f.state === s).length;
  const open = entries.filter((e) => e.status === 'open' || e.status === 'reopened');
  const s = {
    fields: fields.length,
    settled: count('settled'),
    inferred: count('inferred'),
    lowInferred: fields.filter((f) => f.state === 'inferred' && f.confidence === 'low').length,
    empty: count('empty'),
    unknown: count('unknown'),
    openAssumptions: open.filter((e) => e.type === 'assume').length,
    lowAssumptions: open.filter((e) => e.type === 'assume' && e.confidence === 'low').length,
    openCompromises: open.filter((e) => e.type === 'compromise').length,
    openUnknowns: open.filter((e) => e.type === 'unknown').length,
    humanUnknowns: open.filter((e) => e.type === 'unknown' && (e.ask || 'human') === 'human').length,
  };
  // 디렉션이 충분한지: 사람이 답할 모름이나 확신 낮은 추정이 남아 있으면 부족
  s.verdict = s.humanUnknowns || s.lowAssumptions ? 'thin' : s.openAssumptions || s.empty ? 'ok' : 'solid';
  return s;
}
