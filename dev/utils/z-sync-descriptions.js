#!/usr/bin/env node
//
// sync-descriptions.js — Sync dev/descriptions.json with plugin name/description in .js files.
// Builds plugin tree (core/main, core/dev, archetypes/*/main, archetypes/*/dev), backfills
// missing entries into descriptions.json from live files, then applies JSON name/description
// to plugin files when they differ.
//
// Usage: node sync-descriptions.js <root> [--dry-run]
// Exit: 0 = no changes made, 1 = one or more files changed (so caller can run update-versions.sh).
//

const fs = require('fs');
const path = require('path');

const root = process.argv[2] || process.cwd();
const dryRun = process.argv.includes('--dry-run');
const pluginsDir = path.join(root, 'plugins');
const descriptionsPath = path.join(root, 'dev', 'descriptions.json');

// ——— Build plugin tree (same dirs as update-versions.sh: no deprecated) ———
function buildPluginTree() {
  const tree = {};
  const coreMain = path.join(pluginsDir, 'core', 'main');
  const coreDev = path.join(pluginsDir, 'core', 'dev');
  const archetypesDir = path.join(pluginsDir, 'archetypes');

  for (const dir of [coreMain, coreDev]) {
    if (!fs.existsSync(dir)) continue;
    const key = dir === coreMain ? 'core/main' : 'core/dev';
    tree[key] = fs.readdirSync(dir)
      .filter((f) => f.endsWith('.js'))
      .sort();
  }

  if (fs.existsSync(archetypesDir)) {
    for (const archId of fs.readdirSync(archetypesDir)) {
      const archPath = path.join(archetypesDir, archId);
      if (!fs.statSync(archPath).isDirectory()) continue;
      for (const subdir of ['main', 'dev']) {
        const subPath = path.join(archPath, subdir);
        if (!fs.existsSync(subPath) || !fs.statSync(subPath).isDirectory()) continue;
        const key = `archetypes/${archId}/${subdir}`;
        tree[key] = fs.readdirSync(subPath)
          .filter((f) => f.endsWith('.js'))
          .sort();
      }
    }
  }

  return tree;
}

// ——— Extract first plugin-level name and description from .js content ———
const SINGLE_RE = /\bname\s*:\s*'((?:[^'\\]|\\.)*)'/;
const DOUBLE_NAME_RE = /\bname\s*:\s*"((?:[^"\\]|\\.)*)"/;
const SINGLE_DESC_RE = /\bdescription\s*:\s*'((?:[^'\\]|\\.)*)'/;
const DOUBLE_DESC_RE = /\bdescription\s*:\s*"((?:[^"\\]|\\.)*)"/;
const VERSION_SINGLE_RE = /_version\s*:\s*'(\d+(?:\.\d+)*)'/;
const VERSION_DOUBLE_RE = /_version\s*:\s*"(\d+(?:\.\d+)*)"/;

function unescape(s) {
  return s.replace(/\\(.)/g, (_, c) => (c === 'n' ? '\n' : c === 'r' ? '\r' : c === 't' ? '\t' : c));
}

function extractFirstQuoted(content, singleRe, doubleRe) {
  const a = content.match(singleRe);
  const b = content.match(doubleRe);
  let idxA = a ? content.indexOf(a[0]) : -1;
  let idxB = b ? content.indexOf(b[0]) : -1;
  if (idxA === -1 && idxB === -1) return null;
  if (idxA === -1) return unescape(b[1]);
  if (idxB === -1) return unescape(a[1]);
  return idxA < idxB ? unescape(a[1]) : unescape(b[1]);
}

function extractFromJs(content) {
  const name = extractFirstQuoted(content, SINGLE_RE, DOUBLE_NAME_RE);
  const description = extractFirstQuoted(content, SINGLE_DESC_RE, DOUBLE_DESC_RE);
  return { name: name || '', description: description || '' };
}

// ——— Replace first name / first description in content ———
function getFirstMatch(content, singleRe, doubleRe) {
  const a = content.match(singleRe);
  const b = content.match(doubleRe);
  let idxA = a ? content.indexOf(a[0]) : -1;
  let idxB = b ? content.indexOf(b[0]) : -1;
  if (idxA === -1 && idxB === -1) return null;
  if (idxA === -1) return { full: b[0], re: doubleRe, quote: '"' };
  if (idxB === -1) return { full: a[0], re: SINGLE_RE, quote: "'" };
  return idxA < idxB
    ? { full: a[0], re: SINGLE_RE, quote: "'" }
    : { full: b[0], re: DOUBLE_NAME_RE, quote: '"' };
}

function escapeForQuote(str, q) {
  if (q === "'") return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function replaceFirstPluginField(content, field, newValue) {
  const singleRe = field === 'name'
    ? SINGLE_RE
    : SINGLE_DESC_RE;
  const doubleRe = field === 'name'
    ? DOUBLE_NAME_RE
    : DOUBLE_DESC_RE;
  const m = getFirstMatch(content, singleRe, doubleRe);
  if (!m) return content;
  const escaped = escapeForQuote(newValue, m.quote);
  const replacement = field === 'name'
    ? `name: ${m.quote}${escaped}${m.quote}`
    : `description: ${m.quote}${escaped}${m.quote}`;
  return content.replace(m.full, replacement);
}

// Bump _version by 0.1 (minor): e.g. 5.25 -> 5.26, 1.9 -> 1.10
function bumpVersion(versionStr) {
  const parts = versionStr.split('.');
  const last = parseInt(parts[parts.length - 1], 10) || 0;
  parts[parts.length - 1] = String(last + 1);
  return parts.join('.');
}

function extractVersion(content) {
  const a = content.match(VERSION_SINGLE_RE);
  const b = content.match(VERSION_DOUBLE_RE);
  let idxA = a ? content.indexOf(a[0]) : -1;
  let idxB = b ? content.indexOf(b[0]) : -1;
  if (idxA === -1 && idxB === -1) return null;
  if (idxA === -1) return { full: b[0], version: b[1], quote: '"' };
  if (idxB === -1) return { full: a[0], version: a[1], quote: "'" };
  return idxA < idxB
    ? { full: a[0], version: a[1], quote: "'" }
    : { full: b[0], version: b[1], quote: '"' };
}

function replaceVersion(content, fullMatch, newVersion, quote) {
  return content.replace(fullMatch, `_version: ${quote}${newVersion}${quote}`);
}

// ——— Resolve absolute path for a folder key + filename ———
function absPath(folderKey, filename) {
  if (folderKey === 'core/main') return path.join(pluginsDir, 'core', 'main', filename);
  if (folderKey === 'core/dev') return path.join(pluginsDir, 'core', 'dev', filename);
  const m = folderKey.match(/^archetypes\/([^/]+)\/(main|dev)$/);
  if (m) return path.join(pluginsDir, 'archetypes', m[1], m[2], filename);
  return null;
}

// ——— Main ———
let backfillChanged = false;
let applyChanged = false;

function log(msg) {
  console.log(msg);
}

function loadDescriptions() {
  if (!fs.existsSync(descriptionsPath)) return {};
  return JSON.parse(fs.readFileSync(descriptionsPath, 'utf8'));
}

function writeDescriptions(obj) {
  const json = JSON.stringify(obj, null, 2) + '\n';
  if (!dryRun) fs.writeFileSync(descriptionsPath, json, 'utf8');
}

const tree = buildPluginTree();

let descriptions = loadDescriptions();

// 1) Backfill: add any folder/file from tree that is missing in descriptions
for (const [folderKey, files] of Object.entries(tree)) {
  if (!descriptions[folderKey]) descriptions[folderKey] = [];
  const byFile = new Map(descriptions[folderKey].map((e) => [e.file, e]));
  for (const file of files) {
    if (byFile.has(file)) continue;
    const abs = absPath(folderKey, file);
    if (!abs || !fs.existsSync(abs)) continue;
    const content = fs.readFileSync(abs, 'utf8');
    const { name, description } = extractFromJs(content);
    const entry = { file, name, description };
    descriptions[folderKey].push(entry);
    byFile.set(file, entry);
    log(`[backfill] ${folderKey}/${file}: added to descriptions.json (name: "${name}")`);
    backfillChanged = true;
  }
  // Keep order stable: sort by file name
  descriptions[folderKey].sort((a, b) => a.file.localeCompare(b.file));
}

if (backfillChanged && !dryRun) {
  writeDescriptions(descriptions);
}
if (backfillChanged && dryRun) {
  log('[dry-run] Would write descriptions.json with backfilled entries');
}

// 2) Apply: for each entry in descriptions that exists in tree, sync name/description to .js
for (const [folderKey, entries] of Object.entries(descriptions)) {
  const treeFiles = tree[folderKey];
  if (!treeFiles) continue;
  const treeSet = new Set(treeFiles);
  for (const entry of entries) {
    const { file, name: wantName, description: wantDesc } = entry;
    if (!treeSet.has(file)) continue;
    const abs = absPath(folderKey, file);
    if (!abs || !fs.existsSync(abs)) continue;
    let content = fs.readFileSync(abs, 'utf8');
    const { name: curName, description: curDesc } = extractFromJs(content);
    const nameChanged = curName !== wantName;
    const descChanged = curDesc !== wantDesc;
    const changed = nameChanged || descChanged;
    if (!changed) continue;

    const relPath = `${folderKey}/${file}`;
    if (dryRun) {
      if (nameChanged) log(`${relPath}: name "${curName}" -> "${wantName}"`);
      if (descChanged) log(`${relPath}: description "${curDesc}" -> "${wantDesc}"`);
      log(`[dry-run] Would update ${relPath}`);
    } else {
      const attrs = [nameChanged && 'name', descChanged && 'description'].filter(Boolean).join(', ');
      log(`${relPath}: ${attrs}`);
      if (nameChanged) content = replaceFirstPluginField(content, 'name', wantName);
      if (descChanged) content = replaceFirstPluginField(content, 'description', wantDesc);
      const versionInfo = extractVersion(content);
      if (versionInfo) {
        const newVersion = bumpVersion(versionInfo.version);
        content = replaceVersion(content, versionInfo.full, newVersion, versionInfo.quote);
      }
      fs.writeFileSync(abs, content, 'utf8');
    }
    applyChanged = true;
  }
}

process.exit(backfillChanged || applyChanged ? 1 : 0);
