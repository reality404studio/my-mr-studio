// 헤드셋 메모: 헤드셋을 쓴 채로 남긴 말 한마디와, 그 순간의 공간 정보.
//
// 헤드셋을 벗고 기억을 더듬어 말로 다시 설명하면 느낌이 반쯤 날아간다.
// 그래서 말하는 순간에 "무엇을 보고 있었고, 얼마나 떨어져 있었는지"를 같이 남긴다.
//
//   studio/apps/<앱>/feel/notes.json      메모 목록
//   studio/apps/<앱>/feel/<id>.<ext>      녹음 (webm, wav …)
//
// 메모 하나:
//   id        f1, f2 …
//   status    new(아직 아무도 안 읽음) → translated(가정으로 옮겨짐) | dismissed(버림)
//   text      받아쓰기. 헤드셋이 못 받아쓰면 빈칸이고, 사람이 화면에서 녹음을 듣고 적을 수 있다
//   audio     녹음 파일 이름 (없을 수 있음)
//   target    { id: 명세 경로 "objects.cd_player", label, how: gaze|point|none }
//   rel       머리 기준 상대값. 세션마다 원점이 바뀌어도 의미가 같아서 이걸 먼저 본다
//             { distance_m, below_eye_deg(+면 눈높이보다 아래), side_deg(+면 오른쪽), hand_m(가까운 손끝까지) }
//   pose      { frame: desk | session, head: { pos, fwd }, left, right }  frame=desk 면 명세와 같은 책상 좌표
//   params    그 순간의 조절 값(손잡이) 사본. 무엇을 바꿔야 할지 고를 때 기준점
//   source    webxr-greybox | unity | cli | …
//   links     이 메모에서 나온 가정 id (a3 …)
import fs from 'node:fs';
import path from 'node:path';

export const FEEL_STATUS = { new: '새 메모', translated: '가정으로 옮김', dismissed: '버림' };
const AUDIO_EXT = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3' };
const MAX_TEXT = 2000;

const err = (status, message) => Object.assign(new Error(message), { status });
const num = (v, digits = 3) => (Number.isFinite(Number(v)) ? Number(Number(v).toFixed(digits)) : undefined);
const vec = (v) => (Array.isArray(v) && v.length >= 3 && v.slice(0, 3).every((x) => Number.isFinite(Number(x))) ? v.slice(0, 3).map((x) => num(x)) : undefined);

function clean(obj) {
  if (!obj || typeof obj !== 'object') return undefined;
  const out = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined && v !== null && v !== '') out[k] = v;
  return Object.keys(out).length ? out : undefined;
}

// 받은 값을 형식에 맞게 다듬는다. 모르는 칸은 버리고, 숫자는 자리수를 줄인다.
function normalizeInput(input = {}) {
  const t = input.target || {};
  const r = input.rel || {};
  const p = input.pose || {};
  const hand = (h) => (h ? clean({ tip: vec(h.tip ?? h), wrist: vec(h.wrist) }) : undefined);
  let params;
  if (input.params && typeof input.params === 'object' && !Array.isArray(input.params)) {
    params = {};
    for (const [k, v] of Object.entries(input.params).slice(0, 60)) {
      if (typeof v === 'number') params[k] = num(v, 4);
      else if (typeof v === 'string' || typeof v === 'boolean') params[k] = typeof v === 'string' ? v.slice(0, 120) : v;
      else if (Array.isArray(v) && v.every((x) => typeof x === 'number')) params[k] = v.slice(0, 4).map((x) => num(x, 4));
    }
  }
  return clean({
    text: String(input.text ?? '').trim().slice(0, MAX_TEXT),
    textBy: input.text ? String(input.textBy || 'speech').slice(0, 30) : undefined,
    chip: input.chip ? String(input.chip).slice(0, 30) : undefined,
    source: String(input.source || 'unknown').slice(0, 40),
    scene: input.scene ? String(input.scene).slice(0, 120) : undefined,
    duration_s: num(input.duration_s, 1),
    target: clean({ id: t.id ? String(t.id).slice(0, 120) : undefined, label: t.label ? String(t.label).slice(0, 80) : undefined, how: ['gaze', 'point', 'none'].includes(t.how) ? t.how : undefined }),
    rel: clean({ distance_m: num(r.distance_m), below_eye_deg: num(r.below_eye_deg, 1), side_deg: num(r.side_deg, 1), hand_m: num(r.hand_m) }),
    pose: clean({ frame: p.frame === 'desk' ? 'desk' : p.frame ? 'session' : undefined, head: clean({ pos: vec(p.head?.pos), fwd: vec(p.head?.fwd) }), left: hand(p.left), right: hand(p.right) }),
    params: params && Object.keys(params).length ? params : undefined,
  });
}

// 사람이 읽을 한 줄: "cd_player · 0.42m · 눈높이보다 18° 아래 · 왼쪽 5°"
export function describeFeel(n) {
  const bits = [];
  if (n.target?.label || n.target?.id) bits.push(n.target.label || n.target.id);
  const r = n.rel || {};
  if (r.distance_m !== undefined) bits.push(`${r.distance_m.toFixed(2)}m`);
  if (r.below_eye_deg !== undefined) bits.push(Math.abs(r.below_eye_deg) < 3 ? '눈높이' : `눈높이보다 ${Math.abs(Math.round(r.below_eye_deg))}° ${r.below_eye_deg > 0 ? '아래' : '위'}`);
  if (r.side_deg !== undefined && Math.abs(r.side_deg) >= 3) bits.push(`${r.side_deg > 0 ? '오른쪽' : '왼쪽'} ${Math.abs(Math.round(r.side_deg))}°`);
  if (r.hand_m !== undefined) bits.push(`손끝까지 ${r.hand_m.toFixed(2)}m`);
  return bits.join(' · ');
}

// 결정 서랍의 번역표에서 메모 글자와 겹치는 말을 찾는다 ("답답해" → 번역표 "답답하다")
export function matchVocab(text, items) {
  const t = String(text || '').replace(/\s+/g, '');
  if (!t) return [];
  return items.filter((it) => it.kind === 'vocab' && it.status !== 'retired').filter((it) => {
    const w = String(it.text || '').replace(/\s+/g, '').replace(/[다요]$/u, '');
    return w.length >= 2 && (t.includes(w) || t.includes(w.slice(0, Math.max(2, w.length - 1))));
  });
}

export function createFeelStore({ dir, relDir, appendLog, withFileLock, addAssumption }) {
  const feelDir = path.join(dir, 'feel');
  const file = path.join(feelDir, 'notes.json');
  const lock = path.join(dir, '.feel.lock');
  const audioUrl = (name) => `/files/${relDir}/feel/${encodeURIComponent(name)}`;

  function read() {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')).notes || []; } catch { return []; }
  }
  function write(notes) {
    fs.mkdirSync(feelDir, { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ notes }, null, 2) + '\n');
    fs.renameSync(tmp, file);
  }
  const mutate = (fn) => withFileLock(lock, () => { const notes = read(); const out = fn(notes); write(notes); return out; });
  const find = (notes, id) => {
    const n = notes.find((x) => x.id === id);
    if (!n) throw err(404, `헤드셋 메모 "${id}"가 없어요. 목록: npm run studio -- feel`);
    return n;
  };
  const view = (n) => ({ ...n, audioUrl: n.audio ? audioUrl(n.audio) : null, summary: describeFeel(n) });

  return {
    list({ status } = {}) {
      const notes = read().map(view);
      return status ? notes.filter((n) => n.status === status) : notes;
    },
    get(id) { return view(find(read(), id)); },

    add(actor, input) {
      const data = normalizeInput(input);
      if (!data.text && !input.expectAudio) throw err(400, '메모가 비어 있어요. 받아쓰기(text)나 녹음 중 하나는 있어야 해요.');
      return mutate((notes) => {
        const used = notes.map((n) => Number(String(n.id).slice(1)) || 0);
        const n = { id: `f${(used.length ? Math.max(...used) : 0) + 1}`, at: new Date().toISOString(), by: actor, status: 'new', ...data };
        notes.push(n);
        appendLog(actor, 'feel.add', null, `${n.id} ${n.text ? n.text.slice(0, 60) : '(녹음)'}${n.target?.id ? ` @${n.target.id}` : ''}`);
        return view(n);
      });
    },

    saveAudio(actor, id, buffer, contentType = '') {
      if (!buffer?.length) throw err(400, '녹음이 비어 있어요.');
      const ext = AUDIO_EXT[String(contentType).split(';')[0].trim().toLowerCase()];
      if (!ext) throw err(415, `녹음 형식(${contentType || '없음'})을 모르겠어요. ${Object.keys(AUDIO_EXT).join(', ')} 중 하나로 보내 주세요.`);
      return mutate((notes) => {
        const n = find(notes, id);
        fs.mkdirSync(feelDir, { recursive: true });
        const name = `${n.id}.${ext}`;
        fs.writeFileSync(path.join(feelDir, name), buffer);
        n.audio = name;
        appendLog(actor, 'feel.audio', null, `${n.id} ${Math.round(buffer.length / 1024)}KB`);
        return view(n);
      });
    },

    // 사람이 녹음을 듣고 받아쓰기를 고친다
    setText(actor, id, text) {
      return mutate((notes) => {
        const n = find(notes, id);
        n.text = String(text || '').trim().slice(0, MAX_TEXT);
        n.textBy = actor;
        appendLog(actor, 'feel.text', null, `${n.id} ${n.text.slice(0, 60)}`);
        return view(n);
      });
    },

    // 메모를 명세의 가정으로 옮긴다. 값은 바로 바꾸지 않는다. 헤드셋에서 다시 확인할 때까지 "추정"으로 남는다
    translate(actor, id, { field, text, confidence = 'mid', task } = {}) {
      if (!String(text || '').trim()) throw err(400, '이 메모를 무엇으로 해석했는지 적어 주세요. 예: "답답하다 = 패널이 너무 가까움, 0.45m → 0.6m"');
      const note = find(read(), id);
      if (note.status === 'dismissed') throw err(400, `${id}는 버린 메모예요. 다시 쓰려면 먼저 사람이 화면에서 되살려요.`);
      const entry = addAssumption(actor, { task, field: field || note.target?.id, text: String(text).trim(), confidence, source: `feel:${id}` });
      return mutate((notes) => {
        const n = find(notes, id);
        n.status = 'translated';
        (n.links ||= []).push(entry.id);
        n.translatedBy = actor;
        n.translatedAt = new Date().toISOString();
        appendLog(actor, 'feel.translate', task || null, `${n.id} → ${entry.id}${entry.field ? ` (${entry.field})` : ''}`);
        return { note: view(n), entry };
      });
    },

    dismiss(actor, id, why = '') {
      return mutate((notes) => {
        const n = find(notes, id);
        n.status = 'dismissed';
        if (why) n.why = String(why).trim().slice(0, 300);
        appendLog(actor, 'feel.dismiss', null, `${n.id}${why ? ` ${String(why).slice(0, 60)}` : ''}`);
        return view(n);
      });
    },

    restore(actor, id) {
      return mutate((notes) => {
        const n = find(notes, id);
        n.status = n.links?.length ? 'translated' : 'new';
        delete n.why;
        appendLog(actor, 'feel.restore', null, n.id);
        return view(n);
      });
    },
  };
}
