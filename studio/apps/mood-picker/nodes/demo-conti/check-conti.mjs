import { readFileSync } from 'node:fs';
const md = readFileSync(new URL('./README.md', import.meta.url), 'utf8');
const rows = md.split('\n').filter(l => /^\| \d+ \| \d+ \|/.test(l)).map(l => l.split('|').map(s => s.trim()));
if (!rows.length) { console.error('no shot rows'); process.exit(1); }
let prev = 0, ok = true;
for (const r of rows) { const s = +r[1], e = +r[2]; if (s !== prev || e <= s) { console.error('gap/overlap at', s); ok = false; } prev = e; }
const total = prev;
const first20 = rows.filter(r => +r[1] < 20).map(r => r[6]).join(' ');
const a1 = ['G', 'C', 'D'].every(k => first20.includes(k));
console.log(`shots=${rows.length} total=${total}s a1In20=${a1}`);
if (!(ok && total < 180 && a1)) process.exit(1);
console.log('PASS');
