import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { listSessions, sessionLabel } from '../server/sessions.mjs';
import { createStudio } from '../server/store.mjs';

const DEAD_PID = 999_999;
let base, scope, repo, studioDir, sessionsDir;

const writeSession = (pid, extra) => fs.writeFileSync(path.join(sessionsDir, `${pid}.json`), JSON.stringify({
  pid, sessionId: `sid-${pid}`, status: 'idle', startedAt: 1, updatedAt: 2, statusUpdatedAt: 3, kind: 'interactive',
  messagingSocketPath: '/tmp/secret.sock', ...extra,
}));
const writeLog = (rel, entries) => {
  fs.mkdirSync(path.join(studioDir, rel), { recursive: true });
  fs.writeFileSync(path.join(studioDir, rel, 'log.jsonl'), entries.map((e) => JSON.stringify(e)).join('\n') + '\n');
};
const list = () => listSessions({ scopeDir: scope, studioDir, sessionsDir });

beforeEach(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-sessions-'));
  scope = path.join(base, 'project');
  repo = path.join(scope, 'studio-repo');
  studioDir = path.join(repo, 'studio');
  sessionsDir = path.join(base, 'sessions');
  fs.mkdirSync(sessionsDir, { recursive: true });
  fs.mkdirSync(studioDir, { recursive: true });
});

test('죽은 pid 는 빠진다', () => {
  writeSession(process.pid, { name: 'live', cwd: scope });
  writeSession(DEAD_PID, { name: 'dead', cwd: scope });
  assert.deepEqual(list().map((s) => s.name), ['live']);
});

test('상위 폴더 밖 cwd 는 빠지고, 안쪽은 상대 경로로 나온다', () => {
  writeSession(process.pid, { name: 'inside', cwd: path.join(repo, 'src') });
  writeSession(process.ppid, { name: 'outside', cwd: path.join(base, 'project-other') });
  const out = list();
  assert.deepEqual(out.map((s) => s.name), ['inside']);
  assert.equal(out[0].cwd, path.join('studio-repo', 'src'));
});

test('.key 파일과 소켓 경로는 노출하지 않는다', () => {
  writeSession(process.pid, { name: 'a', cwd: scope });
  fs.writeFileSync(path.join(sessionsDir, `${process.pid}.abc.key`), '{"oops":1}');
  const [s] = list();
  assert.deepEqual(Object.keys(s).sort(), ['cwd', 'last', 'name', 'startedAt', 'status', 'statusUpdatedAt']);
  assert.ok(!JSON.stringify(list()).includes('secret.sock'));
});

test('세션 이름이 찍힌 가장 최근 로그 줄이 붙는다 (옛 줄은 무시)', () => {
  writeSession(process.pid, { name: 'my-53', cwd: scope, status: 'busy' });
  writeLog('shared', [
    { ts: '2026-11-04T01:00:00.000Z', actor: 'Claude Code', action: 'node.update', nodeId: 'old-no-session' },
    { ts: '2026-11-04T02:00:00.000Z', actor: 'Claude Code', action: 'node.update', nodeId: 'shared-card', session: 'my-53' },
    { ts: '2026-11-04T09:00:00.000Z', actor: 'Claude Code', action: 'node.update', nodeId: 'other', session: 'someone-else' },
  ]);
  writeLog('apps/demo', [
    { ts: '2026-11-04T03:00:00.000Z', actor: 'Claude Code', action: 'notes.append', nodeId: 'app-card', session: 'my-53' },
  ]);
  const [s] = list();
  assert.equal(s.status, 'busy');
  assert.deepEqual(s.last, { app: 'demo', nodeId: 'app-card', action: 'notes.append', ts: '2026-11-04T03:00:00.000Z' });
});

test('CLI 쪽: 세션 이름을 찾고, 로그 줄에 session 이 붙는다 (actor 그대로)', () => {
  writeSession(process.pid, { name: 'my-53', cwd: scope, sessionId: 'abc-123' });
  assert.equal(sessionLabel('abc-123', sessionsDir), 'my-53');
  assert.equal(sessionLabel('unknown-id', sessionsDir), 'unknown-id');
  assert.equal(sessionLabel(undefined, sessionsDir), null);

  const app = path.join(studioDir, 'apps', 't');
  fs.mkdirSync(app, { recursive: true });
  fs.writeFileSync(path.join(app, 'pipeline.json'), JSON.stringify({
    version: 3, project: { name: 't' }, stages: [{ id: 'a', title: 'A' }],
    nodes: [{ id: 'c', type: 'build', title: 'c', stage: 'a', order: 0, status: 'todo' }], edges: [],
  }));
  createStudio(repo, { session: 'my-53' }).project('t').appendNote('Claude Code', 'c', '메모');
  createStudio(repo).project('t').appendNote('human', 'c', '메모2');
  const lines = fs.readFileSync(path.join(app, 'log.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(lines[0].session, 'my-53');
  assert.equal(lines[0].actor, 'Claude Code');
  assert.equal(lines[1].session, undefined);
  assert.equal(list()[0].last.nodeId, 'c');
});
