/**
 * Password-based encryption for Ops secrets (AES-256-GCM + PBKDF2-SHA256).
 * Used by encrypt-ops-secrets.mjs (Node). Browser copy lives in ops-tab.js — keep in sync.
 */

export const FORMAT_PREFIX = 'fleet-ops1';
export const FORMAT_VERSION = 1;
export const PBKDF2_ITERATIONS = 310000;
export const SALT_BYTES = 16;
export const IV_BYTES = 12;
/** AES-GCM auth tag size in bits (Web Crypto default; set explicitly for encrypt/decrypt parity). */
export const AES_GCM_TAG_LENGTH = 128;

const AES_GCM_PARAMS = { name: 'AES-GCM', tagLength: AES_GCM_TAG_LENGTH };

function base64Encode(bytes) {
    if (typeof Buffer !== 'undefined') {
        return Buffer.from(bytes).toString('base64');
    }
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function base64Decode(str) {
    if (typeof Buffer !== 'undefined') {
        return new Uint8Array(Buffer.from(str, 'base64'));
    }
    const binary = atob(str);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        out[i] = binary.charCodeAt(i);
    }
    return out;
}

async function deriveAesKey(password, salt) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        enc.encode(password),
        'PBKDF2',
        false,
        ['deriveKey']
    );
    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt,
            iterations: PBKDF2_ITERATIONS,
            hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

function packBlob({ salt, iv, ciphertext }) {
    const buf = new Uint8Array(1 + salt.length + iv.length + ciphertext.length);
    buf[0] = FORMAT_VERSION;
    buf.set(salt, 1);
    buf.set(iv, 1 + salt.length);
    buf.set(ciphertext, 1 + salt.length + iv.length);
    return buf;
}

function unpackBlob(blob) {
    const prefix = FORMAT_PREFIX + ':';
    if (!blob || typeof blob !== 'string' || !blob.startsWith(prefix)) {
        throw new Error('Invalid encrypted blob prefix (expected ' + FORMAT_PREFIX + ':...)');
    }
    const raw = base64Decode(blob.slice(prefix.length));
    if (raw.length < 1 + SALT_BYTES + IV_BYTES + 16) {
        throw new Error('Encrypted blob too short');
    }
    if (raw[0] !== FORMAT_VERSION) {
        throw new Error('Unsupported blob version: ' + raw[0]);
    }
    const salt = raw.slice(1, 1 + SALT_BYTES);
    const iv = raw.slice(1 + SALT_BYTES, 1 + SALT_BYTES + IV_BYTES);
    const ciphertext = raw.slice(1 + SALT_BYTES + IV_BYTES);
    return { salt, iv, ciphertext };
}

/**
 * @param {string} plaintext UTF-8 text (typically JSON)
 * @param {string} password Ops password (not hashed)
 * @returns {Promise<string>} fleet-ops1:... blob
 */
export async function encryptWithPassword(plaintext, password) {
    if (!password) {
        throw new Error('Password must not be empty');
    }
    const enc = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const key = await deriveAesKey(password, salt);
    const ciphertext = await crypto.subtle.encrypt(
        { ...AES_GCM_PARAMS, iv },
        key,
        enc.encode(plaintext)
    );
    const packed = packBlob({
        salt,
        iv,
        ciphertext: new Uint8Array(ciphertext)
    });
    return FORMAT_PREFIX + ':' + base64Encode(packed);
}

/**
 * @param {string} blob fleet-ops1:... value
 * @param {string} password Ops password (not hashed)
 * @returns {Promise<string>} UTF-8 plaintext
 */
export async function decryptWithPassword(blob, password) {
    if (!password) {
        throw new Error('Password must not be empty');
    }
    const { salt, iv, ciphertext } = unpackBlob(blob);
    const key = await deriveAesKey(password, salt);
    try {
        const plain = await crypto.subtle.decrypt(
            { ...AES_GCM_PARAMS, iv },
            key,
            ciphertext
        );
        return new TextDecoder().decode(plain);
    } catch (_e) {
        throw new Error('Decryption failed (wrong password or corrupted blob)');
    }
}
