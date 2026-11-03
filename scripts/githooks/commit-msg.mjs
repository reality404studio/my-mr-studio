import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkCommitMsg, studioFinder } from './rules.mjs';

const studioRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const errs = checkCommitMsg(fs.readFileSync(process.argv[2], 'utf8'), studioFinder(studioRoot));
if (errs.length) { console.error(`커밋 거절:\n- ${errs.join('\n- ')}`); process.exit(1); }
