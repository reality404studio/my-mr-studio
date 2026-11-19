#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

function parseArgs(argv) {
  let outDir = path.join(repoRoot, 'dist', 'gh-pages');
  let version = process.env.INK_CROW_DEPLOY_VERSION || '';

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--version' && argv[i + 1]) {
      version = argv[++i];
    } else if (!arg.startsWith('--')) {
      outDir = path.resolve(process.cwd(), arg);
    }
  }
  return { outDir, version: version.trim() };
}

function walkFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(full));
    } else if (entry.isFile()) {
      results.push(full);
    }
  }
  return results;
}

function main() {
  const { outDir, version } = parseArgs(process.argv.slice(2));
  const inkCrowSrc = path.join(repoRoot, 'public', 'ink-crow');
  const inkStudySrc = path.join(repoRoot, 'public', 'ink-study');

  if (!fs.existsSync(inkCrowSrc)) {
    throw new Error(`Missing source directory: ${inkCrowSrc}`);
  }
  if (!fs.existsSync(inkStudySrc)) {
    throw new Error(`Missing source directory: ${inkStudySrc}`);
  }

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  // Serve ink-crow at both the GitHub Pages root (/) and /ink-crow/
  fs.cpSync(inkCrowSrc, outDir, { recursive: true });
  fs.cpSync(inkCrowSrc, path.join(outDir, 'ink-crow'), { recursive: true });
  fs.cpSync(inkStudySrc, path.join(outDir, 'ink-study'), { recursive: true });
  fs.writeFileSync(path.join(outDir, '.nojekyll'), '');

  // Rewrite parent-relative ../ink-study/ imports for files served at the Pages root
  const rootEntries = fs.readdirSync(outDir, { withFileTypes: true });
  let rewroteRootImport = false;
  for (const entry of rootEntries) {
    if (!entry.isFile() || !entry.name.endsWith('.js')) continue;
    const filePath = path.join(outDir, entry.name);
    const original = fs.readFileSync(filePath, 'utf8');
    if (original.includes('../ink-study/')) {
      const updated = original.replaceAll('../ink-study/', './ink-study/');
      fs.writeFileSync(filePath, updated);
      rewroteRootImport = true;
    }
  }
  if (!rewroteRootImport) {
    console.warn('Warning: no root JS file contained ../ink-study/ to rewrite.');
  }

  // Optionally stamp cache-busting query strings (?v=...) with deploy version/SHA
  if (version) {
    for (const filePath of walkFiles(outDir)) {
      if (!filePath.endsWith('.js') && !filePath.endsWith('.html')) continue;
      const original = fs.readFileSync(filePath, 'utf8');
      const updated = original.replace(/\?v=[A-Za-z0-9._-]+/g, `?v=${version}`);
      if (updated !== original) {
        fs.writeFileSync(filePath, updated);
      }
    }
  }

  // Sanity-check key deployed files and root import paths
  const requiredFiles = [
    '.nojekyll',
    'index.html',
    'app.js',
    'world-wash.js',
    'ink-crow/index.html',
    'ink-crow/world-wash.js',
    'ink-study/ink-engine.js',
  ];
  for (const rel of requiredFiles) {
    const abs = path.join(outDir, rel);
    if (!fs.existsSync(abs)) {
      throw new Error(`Expected built file missing: ${rel}`);
    }
  }

  const rootWorldWash = fs.readFileSync(path.join(outDir, 'world-wash.js'), 'utf8');
  if (rootWorldWash.includes('../ink-study/')) {
    throw new Error('Root world-wash.js still contains ../ink-study/ import');
  }

  console.log(`Built ink-crow GitHub Pages bundle at ${outDir}${version ? ` (v=${version})` : ''}`);
}

main();
