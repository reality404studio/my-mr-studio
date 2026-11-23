#!/usr/bin/env node
// Build standalone static bundle for Quest 3S testing via GitHub Pages.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

function parseArgs(argv) {
  let outDir = path.join(repoRoot, 'dist', 'gh-pages-bookmark');
  let version = '';
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--version' && argv[i + 1]) version = argv[++i];
    else if (!arg.startsWith('--')) outDir = path.resolve(process.cwd(), arg);
  }
  return { outDir, version: version.trim() };
}

function walkFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walkFiles(full));
    else if (entry.isFile()) results.push(full);
  }
  return results;
}

function main() {
  const { outDir, version } = parseArgs(process.argv.slice(2));
  const srcDir = path.join(repoRoot, 'public', 'bookmark-snake');
  if (!fs.existsSync(srcDir)) {
    throw new Error(`Missing source directory: ${srcDir}`);
  }

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  fs.cpSync(srcDir, outDir, { recursive: true });
  fs.cpSync(srcDir, path.join(outDir, 'bookmark-snake'), { recursive: true });
  fs.writeFileSync(path.join(outDir, '.nojekyll'), '');

  if (version) {
    for (const filePath of walkFiles(outDir)) {
      if (!filePath.endsWith('.js') && !filePath.endsWith('.html')) continue;
      const original = fs.readFileSync(filePath, 'utf8');
      const updated = original.replace(/\?v=[A-Za-z0-9._-]+/g, `?v=${version}`);
      if (updated !== original) fs.writeFileSync(filePath, updated);
    }
  }

  console.log(`Built bookmark-snake bundle at ${outDir}${version ? ` (v=${version})` : ''}`);
}

main();
