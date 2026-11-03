import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createStudio, STATUSES } from '../server/store.mjs';
import { STATUSES as UI_STATUSES } from '../src/constants.js';

let s;
beforeEach(() => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-gate-'));
  const dir = path.join(root, 'studio', 'apps', 't');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'pipeline.json'), JSON.stringify({
    version: 3, project: { name: 't' }, stages: [{ id: 'a', title: 'A' }],
    nodes: [
      { id: 'task', type: 'build', title: '과업', stage: 'a', order: 0 },
      { id: 'sub', parent: 'task', kind: 'build', by: 'agent', title: '에이전트 카드', status: 'todo', order: 0 },
      { id: 'ask', parent: 'task', kind: 'decide', by: 'human', title: '사람 카드', status: 'todo', order: 1 },
    ],
    edges: [],
  }));
  s = createStudio(root).project('t');
});

const evidence = (exit = 0) => s.saveAsset('t', 'sub', 'check.log', Buffer.from('BUILD OK id=abc'), `$ make test → exit ${exit}`, { check: { cmd: 'make test', exit } });

test('doing → done 직행은 거절된다', () => {
  s.updateNode('t', 'sub', { success: '배치 빌드 exit 0', status: 'doing' });
  assert.throws(() => s.updateNode('t', 'sub', { status: 'done' }), /proof/);
});

test('성공 조건 없이는 done 불가', () => {
  s.updateNode('t', 'sub', { status: 'proof' });
  evidence();
  assert.throws(() => s.updateNode('t', 'sub', { status: 'done' }), /성공 조건/);
});

test('proof 이전에 붙인 로그는 증거로 치지 않는다', async () => {
  s.updateNode('t', 'sub', { success: '배치 빌드 exit 0', status: 'doing' });
  evidence();
  await new Promise((r) => setTimeout(r, 5));
  s.updateNode('t', 'sub', { status: 'proof' });
  assert.throws(() => s.updateNode('t', 'sub', { status: 'done' }), /통과 로그/);
});

test('검증 명령 기록이 없는 파일은 증거가 아니다', () => {
  s.updateNode('t', 'sub', { success: 'x', status: 'proof' });
  s.saveAsset('t', 'sub', 'shot.png', Buffer.from('x'), '스크린샷');
  assert.throws(() => s.updateNode('t', 'sub', { status: 'done' }), /통과 로그/);
});

test('실패한 검증 로그(exit≠0)는 증거가 아니다', () => {
  s.updateNode('t', 'sub', { success: 'x', status: 'proof' });
  evidence(2);
  assert.throws(() => s.updateNode('t', 'sub', { status: 'done' }), /통과 로그/);
});

test('성공 조건 + proof + 이후 증거 → done 통과, 과업 상태도 계산된다', () => {
  s.updateNode('t', 'sub', { success: '배치 빌드 exit 0', status: 'proof' });
  assert.equal(s.nodeDetail('task').node.status, 'proof');
  evidence();
  s.updateNode('t', 'sub', { status: 'done' });
  assert.equal(s.nodeDetail('sub').node.status, 'done');
});

test('시작된 에이전트 카드를 사람 카드로 바꿔 게이트를 우회할 수 없다', () => {
  s.updateNode('t', 'sub', { status: 'doing' });
  assert.throws(() => s.updateNode('t', 'sub', { by: 'human' }), /todo/);
  assert.throws(() => s.updateNode('t', 'sub', { by: 'human', status: 'done' }));
});

test('에이전트 카드를 done 상태로 바로 만들 수 없다', () => {
  assert.throws(() => s.createNode('t', { parent: 'task', kind: 'build', title: 'x', status: 'done' }), /바로/);
});

test('사람 결정 카드는 게이트 밖이다', () => {
  s.updateNode('t', 'ask', { status: 'done' });
  assert.equal(s.nodeDetail('ask').node.status, 'done');
});

test('UI 상태 목록이 서버와 같다 (증명 칼럼 포함)', () => {
  assert.deepEqual(Object.keys(UI_STATUSES), STATUSES);
  assert.ok(STATUSES.indexOf('proof') === STATUSES.indexOf('done') - 1);
});

test('done 된 에이전트 카드의 성공 조건은 덮어쓸 수 없다', () => {
  s.updateNode('t', 'sub', { success: '원래 조건', status: 'proof' });
  evidence();
  s.updateNode('t', 'sub', { status: 'done' });
  assert.throws(() => s.updateNode('t', 'sub', { success: '다른 조건' }), /바꿀 수 없어요/);
  assert.equal(s.nodeDetail('sub').node.success, '원래 조건');
});

test('같은 세션이 통과 로그로 직접 done 할 수 있다', () => {
  s.updateNode('작업자', 'sub', { success: '배치 빌드 exit 0', status: 'proof' });
  evidence();
  s.updateNode('작업자', 'sub', { status: 'done' });
  assert.equal(s.nodeDetail('sub').node.status, 'done');
});
