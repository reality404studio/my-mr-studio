import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createStudio } from '../../server/store.mjs';

export const PROTECTED = ['main', 'master'];
export const ZERO = /^0+$/;

export function parseSubject(msg) {
  const line = String(msg).split('\n').find((l) => l.trim() && !l.startsWith('#')) || '';
  const m = line.match(/^([a-z0-9][a-z0-9-]*): (\S.*)$/);
  return m ? { id: m[1], change: m[2] } : null;
}

export function checkCommitMsg(msg, findCard) {
  if (/^(Merge|Revert) /.test(msg)) return [];
  const s = parseSubject(msg);
  if (!s) return ['첫 줄은 "card-id: 관찰 가능한 변화" 형식이어야 해요. 예: setup-handinput: 녹화한 손 궤적으로 핀치 이벤트를 받는다'];
  const card = findCard(s.id);
  if (!card) return [`카드 "${s.id}" 가 어느 보드에도 없어요`];
  if (card.status !== 'done') return [`카드 "${s.id}" 는 ${card.status} 예요. 게이트를 통과(done)한 카드만 커밋해요`];
  return [];
}

export function checkPush(lines, { allowed, isAncestor, approved }) {
  const errs = [];
  for (const l of lines) {
    const [, localSha, remoteRef, remoteSha] = l.trim().split(/\s+/);
    if (!remoteRef || ZERO.test(localSha || '')) continue;
    const branch = remoteRef.replace(/^refs\/heads\//, '');
    if (PROTECTED.includes(branch) && !approved) errs.push(`${branch} 직푸시는 사람에게 물어본 뒤에만 (STUDIO_PUSH_APPROVED=1)`);
    else if (!PROTECTED.includes(branch) && !allowed.includes(branch)) errs.push(`${branch} 는 지정 브랜치가 아니에요. 지정: ${allowed.join(', ') || '(없음)'} — scripts/githooks/push-branches.json`);
    if (remoteSha && !ZERO.test(remoteSha) && !isAncestor(remoteSha, localSha) && !approved) errs.push(`${branch} 에 force-push(빨리 감기 아님)는 사람에게 물어본 뒤에만 (STUDIO_PUSH_APPROVED=1)`);
  }
  return errs;
}

export function studioFinder(studioRoot) {
  const studio = createStudio(studioRoot);
  const { shared, apps } = studio.projects();
  const pids = [shared?.id, ...apps.map((a) => a.id)].filter(Boolean);
  return (id) => {
    for (const pid of pids) {
      try { return studio.project(pid).nodeDetail(id).node; } catch {}
    }
    return null;
  };
}

export function allowedBranches(studioRoot, repoDir) {
  const cfg = JSON.parse(fs.readFileSync(path.join(studioRoot, 'scripts/githooks/push-branches.json'), 'utf8'));
  const key = path.relative(studioRoot, repoDir).split(path.sep).join('/') || '.';
  return cfg[key] || [];
}

export function gitIsAncestor(repoDir) {
  return (a, b) => {
    try { execFileSync('git', ['merge-base', '--is-ancestor', a, b], { cwd: repoDir, stdio: 'ignore' }); return true; } catch { return false; }
  };
}
