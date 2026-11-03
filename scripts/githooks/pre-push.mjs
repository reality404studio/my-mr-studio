import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkPush, allowedBranches, gitIsAncestor } from './rules.mjs';

const studioRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const repoDir = process.cwd();
const lines = fs.readFileSync(0, 'utf8').split('\n').filter((l) => l.trim());
const errs = checkPush(lines, { allowed: allowedBranches(studioRoot, repoDir), isAncestor: gitIsAncestor(repoDir), approved: process.env.STUDIO_PUSH_APPROVED === '1' });
if (errs.length) { console.error(`푸시 거절:\n- ${errs.join('\n- ')}`); process.exit(1); }
