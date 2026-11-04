// 지금 살아 있는 Claude Code 세션 목록. ~/.claude/sessions/<pid>.json 에서 이름·상태·cwd·시각만 읽는다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const DEFAULT_SESSIONS_DIR = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'sessions');

const SESSION_FILE = /^\d+\.json$/;

export function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (err) { return err.code === 'EPERM'; }
}

function readSessionFiles(sessionsDir) {
  let files = [];
  try { files = fs.readdirSync(sessionsDir).filter((f) => SESSION_FILE.test(f)); } catch { return []; }
  const out = [];
  for (const f of files) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(sessionsDir, f), 'utf8'));
      out.push({
        pid: Number(raw.pid), sessionId: String(raw.sessionId || ''), name: String(raw.name || ''),
        status: raw.status === 'busy' ? 'busy' : 'idle', cwd: String(raw.cwd || ''),
        startedAt: Number(raw.startedAt) || null, statusUpdatedAt: Number(raw.statusUpdatedAt || raw.updatedAt) || null,
      });
    } catch {}
  }
  return out;
}

// CLI 가 로그에 찍을 세션 이름. 못 찾으면 id 그대로.
export function sessionLabel(sessionId, sessionsDir = DEFAULT_SESSIONS_DIR) {
  if (!sessionId) return null;
  const hit = readSessionFiles(sessionsDir).find((s) => s.sessionId === sessionId && s.name);
  return hit ? hit.name : sessionId;
}

function logFiles(studioDir) {
  const files = [{ app: 'shared', file: path.join(studioDir, 'shared', 'log.jsonl') }];
  try {
    for (const id of fs.readdirSync(path.join(studioDir, 'apps'))) files.push({ app: id, file: path.join(studioDir, 'apps', id, 'log.jsonl') });
  } catch {}
  return files;
}

function lastStamped(studioDir, keys) {
  const best = new Map();
  for (const { app, file } of logFiles(studioDir)) {
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
    for (const line of text.split('\n')) {
      if (!line.includes('"session"')) continue;
      let e;
      try { e = JSON.parse(line); } catch { continue; }
      if (!e.session || !keys.has(e.session)) continue;
      const prev = best.get(e.session);
      if (!prev || String(e.ts) >= prev.ts) best.set(e.session, { app, nodeId: e.nodeId ?? null, action: e.action, ts: e.ts });
    }
  }
  return best;
}

export function listSessions({ scopeDir, studioDir, sessionsDir = DEFAULT_SESSIONS_DIR, isAlive = pidAlive }) {
  const scope = path.resolve(scopeDir);
  const live = readSessionFiles(sessionsDir).filter((s) => {
    const cwd = path.resolve(s.cwd || '/');
    return (cwd === scope || cwd.startsWith(scope + path.sep)) && isAlive(s.pid);
  });
  const keys = new Set(live.flatMap((s) => [s.name, s.sessionId].filter(Boolean)));
  const last = lastStamped(studioDir, keys);
  return live.map((s) => {
    const a = last.get(s.name), b = last.get(s.sessionId);
    const lastLog = a && b ? (String(a.ts) >= String(b.ts) ? a : b) : a || b || null;
    return {
      name: s.name || s.sessionId.slice(0, 8), status: s.status,
      cwd: path.relative(scope, path.resolve(s.cwd)) || '.',
      startedAt: s.startedAt, statusUpdatedAt: s.statusUpdatedAt, last: lastLog,
    };
  }).sort((x, y) => (y.statusUpdatedAt || 0) - (x.statusUpdatedAt || 0));
}
