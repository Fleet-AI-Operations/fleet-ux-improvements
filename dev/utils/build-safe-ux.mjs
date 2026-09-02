#!/usr/bin/env node
/**
 * build-safe-ux.mjs
 *
 * Bundles the compile-time Safe UX allowlist into fleet.user.js.
 * Adding a feature requires a reviewed source change, an allowlist edit,
 * and a rebuilt userscript — not a remote archetypes.json change.
 *
 * Usage (from repo root):
 *   node dev/utils/build-safe-ux.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../..');

const ALLOWLIST_PATH = path.join(scriptDir, 'safe-ux-allowlist.json');
const ARCHETYPES_PATH = path.join(repoRoot, 'archetypes.json');
const FLEET_USER_PATH = path.join(repoRoot, 'fleet.user.js');
const PLUGINS_ROOT = path.join(repoRoot, 'plugins');
const DOCS_ROOT = path.join(repoRoot, 'docs', 'settings-modal');

const BUNDLE_START = '    // @@SAFE_UX_BUNDLE_START';
const BUNDLE_END = '    // @@SAFE_UX_BUNDLE_END';

function sha256File(contents) {
    const hex = crypto.createHash('sha256').update(contents, 'utf8').digest('hex');
    return 'sha256-' + hex;
}

function assertAllowlisted(filename, bucket, allowlist) {
    const allowed = new Set(allowlist[bucket] || []);
    if (!allowed.has(filename)) {
        throw new Error(`"${filename}" is not in the Safe UX ${bucket} allowlist`);
    }
}

function collectPluginDefs(config) {
    const core = config.corePlugins || [];
    const libraries = config.libraries || [];
    const archetypeFiles = [];
    for (const archetype of config.archetypes || []) {
        for (const plugin of archetype.plugins || []) {
            archetypeFiles.push({
                archetypeId: archetype.id,
                def: plugin
            });
        }
    }
    return { core, libraries, archetypeFiles };
}

function readPluginSource(relPath) {
    const abs = path.join(PLUGINS_ROOT, relPath);
    if (!fs.existsSync(abs)) {
        throw new Error(`Missing plugin source: ${relPath}`);
    }
    return fs.readFileSync(abs, 'utf8').replace(/\r\n/g, '\n');
}

function wrapFactory(source) {
    return (
        'function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {\n' +
        source +
        '\nreturn plugin;\n}'
    );
}

function indentBlock(text, spaces) {
    const pad = ' '.repeat(spaces);
    return text.split('\n').map((line) => (line.length ? pad + line : line)).join('\n');
}

function main() {
    const allowlist = JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf8'));
    const config = JSON.parse(fs.readFileSync(ARCHETYPES_PATH, 'utf8'));

    if (config.opsAccess || config.opsSecrets) {
        throw new Error('archetypes.json must not include opsAccess or opsSecrets in the Safe UX build');
    }
    if ((config.opsDashboardPlugins || []).length > 0) {
        throw new Error('archetypes.json must not include opsDashboardPlugins in the Safe UX build');
    }
    if ((config.devPlugins || []).length > 0 || (config.devArchetypes || []).length > 0) {
        throw new Error('archetypes.json must not include dev plugins in the Safe UX build');
    }

    const { core, libraries, archetypeFiles } = collectPluginDefs(config);
    const factories = {};
    const hashUpdates = [];

    for (const def of core) {
        assertAllowlisted(def.name, 'core', allowlist);
        const sourcePath = `core/main/${def.name}`;
        const source = readPluginSource(sourcePath);
        factories[sourcePath] = wrapFactory(source);
        hashUpdates.push({ kind: 'core', name: def.name, hash: sha256File(source) });
    }
    for (const def of libraries) {
        assertAllowlisted(def.name, 'libraries', allowlist);
        const sourcePath = `libs/${def.name}`;
        const source = readPluginSource(sourcePath);
        factories[sourcePath] = wrapFactory(source);
        hashUpdates.push({ kind: 'library', name: def.name, hash: sha256File(source) });
    }
    for (const { archetypeId, def } of archetypeFiles) {
        assertAllowlisted(def.name, 'archetypePlugins', allowlist);
        const sourcePath = `archetypes/${archetypeId}/main/${def.name}`;
        const source = readPluginSource(sourcePath);
        factories[sourcePath] = wrapFactory(source);
        hashUpdates.push({
            kind: 'archetype',
            archetypeId,
            name: def.name,
            hash: sha256File(source)
        });
    }

    for (const libName of (config.archetypes || []).flatMap((a) => a.libraries || [])) {
        assertAllowlisted(libName, 'libraries', allowlist);
    }

    const docs = {};
    for (const doc of config.settingsModalDocs || []) {
        assertAllowlisted(doc.name, 'settingsDocs', allowlist);
        const abs = path.join(DOCS_ROOT, doc.name);
        if (!fs.existsSync(abs)) {
            throw new Error(`Missing settings doc: ${doc.name}`);
        }
        docs[doc.name] = fs.readFileSync(abs, 'utf8').replace(/\r\n/g, '\n');
    }

    for (const update of hashUpdates) {
        if (update.kind === 'core') {
            const entry = core.find((d) => d.name === update.name);
            if (entry) entry.hash = update.hash;
        } else if (update.kind === 'library') {
            const entry = libraries.find((d) => d.name === update.name);
            if (entry) entry.hash = update.hash;
        } else {
            const archetype = (config.archetypes || []).find((a) => a.id === update.archetypeId);
            const entry = (archetype && archetype.plugins || []).find((d) => d.name === update.name);
            if (entry) entry.hash = update.hash;
        }
    }
    fs.writeFileSync(ARCHETYPES_PATH, JSON.stringify(config, null, 2) + '\n');

    const factoryEntries = Object.entries(factories)
        .map(([sourcePath, fnSource]) => {
            return `        ${JSON.stringify(sourcePath)}: ${fnSource}`;
        })
        .join(',\n');

    const bundle = [
        BUNDLE_START,
        '    const BUNDLED_ARCHETYPES = ' + JSON.stringify(config) + ';',
        '    const BUNDLED_SETTINGS_DOCS = ' + JSON.stringify(docs) + ';',
        '    const BUNDLED_PLUGIN_FACTORIES = {',
        factoryEntries,
        '    };',
        BUNDLE_END
    ].join('\n');

    const fleet = fs.readFileSync(FLEET_USER_PATH, 'utf8');
    const start = fleet.indexOf(BUNDLE_START);
    const end = fleet.indexOf(BUNDLE_END);
    if (start < 0 || end < 0 || end < start) {
        throw new Error('fleet.user.js is missing @@SAFE_UX_BUNDLE_START / @@SAFE_UX_BUNDLE_END markers');
    }
    const before = fleet.slice(0, start);
    const after = fleet.slice(end + BUNDLE_END.length);
    fs.writeFileSync(FLEET_USER_PATH, before + bundle + after);

    console.log('Safe UX bundle written:');
    console.log('  factories:', Object.keys(factories).length);
    console.log('  docs:', Object.keys(docs).length);
    console.log('  archetypes.json hashes refreshed');
}

main();
