#!/usr/bin/env node
//
// encrypt-ops-secrets.mjs — Legacy alias for encrypt-ops-bundle.mjs
//
// Usage:
//   node dev/utils/encrypt-ops-secrets.mjs encrypt [--password 'secret']
//   node dev/utils/encrypt-ops-secrets.mjs decrypt [--password 'secret']   # verify locally
//
// Prefer encrypt-ops-bundle.mjs (local/secrets/ops-bundle.json + local/secrets/password).
// Plaintext (gitignored):  local/secrets/ops-bundle.json
// Committed ciphertext:    ops-secrets.enc.json
//
// Password: --password, OPS_PASSWORD env, or hidden prompt.

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';
import { decryptWithPassword, encryptWithPassword, FORMAT_PREFIX } from './ops-password-crypto.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const BUNDLE_PATH = path.join(root, 'local', 'secrets', 'ops-bundle.json');
const PASSWORD_PATH = path.join(root, 'local', 'secrets', 'password');
const ENCRYPTED_PATH = path.join(root, 'ops-secrets.enc.json');

function usage() {
    console.error(`Usage:
  node dev/utils/encrypt-ops-secrets.mjs encrypt [--password '...']
  node dev/utils/encrypt-ops-secrets.mjs decrypt [--password '...']

  Plaintext:  ${BUNDLE_PATH}
  Encrypted:  ${ENCRYPTED_PATH}`);
}

function promptPassword(promptLabel) {
    const stdin = process.stdin;
    const stderr = process.stderr;

    if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
        const rl = readline.createInterface({ input: stdin, output: stderr });
        return new Promise((resolve) => {
            rl.question(promptLabel, (answer) => {
                rl.close();
                resolve(answer);
            });
        });
    }

    return new Promise((resolve) => {
        const wasRaw = stdin.isRaw;
        stderr.write(promptLabel);
        stdin.setRawMode(true);
        stdin.resume();
        stdin.setEncoding('utf8');

        let password = '';
        const onData = (chunk) => {
            switch (chunk) {
                case '\n':
                case '\r':
                case '\u0004':
                    stdin.setRawMode(wasRaw);
                    stdin.pause();
                    stdin.removeListener('data', onData);
                    stderr.write('\n');
                    resolve(password);
                    break;
                case '\u0003':
                    stdin.setRawMode(wasRaw);
                    process.exit(130);
                    break;
                case '\u007f':
                case '\b':
                    password = password.slice(0, -1);
                    break;
                default:
                    if (chunk >= ' ' && chunk <= '~') {
                        password += chunk;
                    }
                    break;
            }
        };
        stdin.on('data', onData);
    });
}

function readPasswordFile() {
    if (!fs.existsSync(PASSWORD_PATH)) return '';
    return fs.readFileSync(PASSWORD_PATH, 'utf8').trim();
}

async function resolvePassword(flagPassword) {
    if (flagPassword) return flagPassword;
    if (process.env.OPS_PASSWORD) return process.env.OPS_PASSWORD;
    const fromFile = readPasswordFile();
    if (fromFile) return fromFile;
    return promptPassword('Ops password: ');
}

function readPlaintextJson() {
    if (!fs.existsSync(BUNDLE_PATH)) {
        throw new Error(
            'Plaintext not found. Create ' + BUNDLE_PATH
            + ' (see dev/ops-bundle.example.json)'
        );
    }
    const text = fs.readFileSync(BUNDLE_PATH, 'utf8');
    JSON.parse(text);
    return text;
}

async function cmdEncrypt(password) {
    const plaintext = readPlaintextJson();
    const blob = await encryptWithPassword(plaintext, password);
    const out = {
        format: FORMAT_PREFIX,
        encrypted: blob
    };
    fs.writeFileSync(ENCRYPTED_PATH, JSON.stringify(out, null, 2) + '\n', 'utf8');
    console.log('[info] Wrote ' + ENCRYPTED_PATH);
    console.log('[info] Commit ops-secrets.enc.json; keep local/secrets/ops-bundle.json out of git.');
}

async function cmdDecrypt(password) {
    if (!fs.existsSync(ENCRYPTED_PATH)) {
        throw new Error('Encrypted file not found: ' + ENCRYPTED_PATH);
    }
    const wrapped = JSON.parse(fs.readFileSync(ENCRYPTED_PATH, 'utf8'));
    const blob = wrapped && wrapped.encrypted;
    if (!blob) {
        throw new Error('ops-secrets.enc.json missing "encrypted" field');
    }
    const plaintext = await decryptWithPassword(blob, password);
    JSON.parse(plaintext);
    process.stdout.write(plaintext);
    if (!plaintext.endsWith('\n')) {
        process.stdout.write('\n');
    }
}

async function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    let flagPassword = '';
    for (let i = 1; i < args.length; i++) {
        if (args[i] === '--password' && args[i + 1]) {
            flagPassword = args[++i];
        }
    }

    if (!command || command === '--help' || command === '-h') {
        usage();
        process.exit(command ? 0 : 1);
    }

    const password = await resolvePassword(flagPassword);
    if (!password) {
        console.error('[error] Password must not be empty.');
        process.exit(1);
    }

    try {
        if (command === 'encrypt') {
            await cmdEncrypt(password);
        } else if (command === 'decrypt') {
            await cmdDecrypt(password);
        } else {
            usage();
            process.exit(1);
        }
    } catch (err) {
        console.error('[error]', err instanceof Error ? err.message : err);
        process.exit(1);
    }
}

main();
