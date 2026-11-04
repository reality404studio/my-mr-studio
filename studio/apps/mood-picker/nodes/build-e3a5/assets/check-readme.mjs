// usage: node check-readme.mjs analyze|write
import { readFileSync, statSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const readme = readFileSync(join(here, '..', 'README.md'), 'utf8');
const mode = process.argv[2];
const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); else console.log('ok  ' + m); };

function section(title) {
  const i = readme.indexOf(title);
  if (i < 0) return '';
  const rest = readme.slice(i + title.length);
  const j = rest.search(/\n#{2,3} /);
  return j < 0 ? rest : rest.slice(0, j);
}
const rows = (txt) => txt.split('\n').filter(l => /^\|/.test(l) && !/^\|[-| ]+\|$/.test(l)).length - 1;

if (mode === 'analyze') {
  const pre = section('### 선례 표');
  ok(rows(pre) >= 8, `선례 표 행 ≥8 (지금 ${rows(pre)})`);
  ok(/형태/.test(pre) && /기능/.test(pre) && /MR 적합성/.test(pre), '선례 표 열: 형태·기능·MR 적합성');
  const mr = section('## 2. MR 제약 표');
  ok(rows(mr) >= 8, `MR 제약 표 행 ≥8 (지금 ${rows(mr)})`);
  for (const k of ['FoV', '손 닿는', '라벨 글자', '공간 앵커', '드로우콜', '텍스처 메모리']) ok(mr.includes(k), `MR 제약에 ${k}`);
  ok(readme.includes('Best Reason to Come Back'), 'Best Reason to Come Back 각도');
  const src = section('### 출처');
  const links = (src.match(/https?:\/\/\S+/g) || []);
  ok(links.length >= 10, `출처 링크 ≥10 (지금 ${links.length})`);
  ok(links.filter(l => l.includes('developers.meta.com')).length >= 5, 'Meta 문서 링크 ≥5');
} else if (mode === 'write') {
  const base = section('## 3. 기준선');
  ok(base.length > 300, '기준선 설명 있음');
  const tag = section('### 태깅 표');
  ok(rows(tag) >= 10, `태깅 표 행 ≥10 (지금 ${rows(tag)})`);
  ok(/관습 이름/.test(tag) && /기능/.test(tag) && /확신도/.test(tag), '태깅 표 열: 관습 이름·기능·확신도');
  const conf = tag.split('\n').filter(l => /^\|/.test(l)).map(l => l.split('|').slice(-2)[0].trim()).filter(c => /^(상|중|하)$/.test(c));
  ok(conf.length === rows(tag), `모든 행 확신도 상/중/하 (${conf.length}/${rows(tag)})`);
  const png = join(here, 'baseline-chip-wall.png');
  ok(existsSync(png) && statSync(png).size > 20 * 1024, `기준선 PNG >20KB (${existsSync(png) ? statSync(png).size : 0} B)`);
  ok(readme.includes('assets/baseline-chip-wall.png'), 'README 가 PNG 를 가리킴');
  ok(!/대안 시안/.test(base), '기준선 절에 대안 없음');
} else { console.error('mode?'); process.exit(2); }

if (fails.length) { console.error('FAIL\n' + fails.map(f => '  ' + f).join('\n')); process.exit(1); }
console.log('PASS ' + mode);
