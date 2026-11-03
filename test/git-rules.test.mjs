import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkCommitMsg, checkPush } from '../scripts/githooks/rules.mjs';

const cards = { 'card-done': { status: 'done' }, 'card-proof': { status: 'proof' } };
const find = (id) => cards[id] || null;
const A = 'a'.repeat(40), B = 'b'.repeat(40), Z = '0'.repeat(40);
const line = (branch, local = A, remote = B) => `refs/heads/x ${local} refs/heads/${branch} ${remote}`;
const ff = () => true, notFf = () => false;

test('커밋: card-id: 관찰 가능한 변화 형식만', () => {
  assert.equal(checkCommitMsg('card-done: 핀치 이벤트가 0.3초 안에 뜬다\n\nbody', find).length, 0);
  assert.match(checkCommitMsg('그냥 고침', find)[0], /형식/);
  assert.match(checkCommitMsg('card-done:붙여씀', find)[0], /형식/);
});

test('커밋: 게이트 통과(done) 카드만', () => {
  assert.match(checkCommitMsg('card-proof: 무언가', find)[0], /done/);
  assert.match(checkCommitMsg('no-such-card: 무언가', find)[0], /없어요/);
});

test('푸시: 지정 브랜치는 자동', () => {
  assert.deepEqual(checkPush([line('feat')], { allowed: ['feat'], isAncestor: ff, approved: false }), []);
  assert.deepEqual(checkPush([line('feat', A, Z)], { allowed: ['feat'], isAncestor: notFf, approved: false }), []);
});

test('푸시: 지정 아닌 브랜치는 거절', () => {
  assert.match(checkPush([line('other')], { allowed: ['feat'], isAncestor: ff, approved: false })[0], /지정 브랜치/);
});

test('푸시: main 직푸시는 승인 없이 거절, 승인 있으면 통과', () => {
  assert.match(checkPush([line('main')], { allowed: ['feat'], isAncestor: ff, approved: false })[0], /main/);
  assert.deepEqual(checkPush([line('main')], { allowed: [], isAncestor: ff, approved: true }), []);
});

test('푸시: force-push 는 지정 브랜치라도 승인 없이 거절', () => {
  assert.match(checkPush([line('feat')], { allowed: ['feat'], isAncestor: notFf, approved: false })[0], /force/);
});

test('푸시: 브랜치 삭제 줄(로컬 sha 0)은 건드리지 않는다', () => {
  assert.deepEqual(checkPush([`(delete) ${Z} refs/heads/feat ${B}`], { allowed: [], isAncestor: ff, approved: false }), []);
});
