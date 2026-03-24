// extension-ping.js
// Core plugin that pings extension usage endpoint on script version update.

const plugin = {
    id: 'extension-ping',
    name: 'Extension Ping',
    description:
        'Pings extension usage endpoint; once per userscript version by default, or every load when archetypes.json sets extensionPingEveryLoad',
    _version: '1.5',
    phase: 'core',
    enabledByDefault: true,

    init(state, context) {
        try {
            const currentVersion = context && context.version ? context.version : null;
            if (!currentVersion) {
                Logger.warn('Extension ping skipped: missing current script version');
                return;
            }

            const storageKey = 'extension-ping-last-version';
            const pingEveryLoad = context && context.extensionPingEveryLoad === true;
            if (!pingEveryLoad) {
                const lastPingedVersion = Storage.get(storageKey, null);
                if (lastPingedVersion === currentVersion) {
                    Logger.debug(`Extension ping skipped: already pinged for version ${currentVersion}`);
                    return;
                }
            } else {
                Logger.debug('Extension ping: extensionPingEveryLoad is set; skipping version dedup');
            }

            const email = this._extractEmailFromInlineScripts();
            if (!email) {
                Logger.warn('Extension ping skipped: email not found in inline scripts');
                return;
            }

            this._sendPing(email, currentVersion, storageKey, pingEveryLoad);
        } catch (error) {
            Logger.error('Extension ping init failed:', error);
        }
    },

    _extractEmailFromInlineScripts() {
        const scripts = document.querySelectorAll('script:not([src])');
        if (!scripts || scripts.length === 0) {
            Logger.debug('Extension ping email extraction: no inline scripts found');
            return null;
        }

        const escapedPattern = /\\"email\\":\\"([^"\\]+@[^"\\]+\.[^"\\]+)\\"/;
        const plainPattern = /"email":"([^"\\]+@[^"\\]+\.[^"\\]+)"/;

        for (const scriptEl of scripts) {
            const content = scriptEl && scriptEl.textContent ? scriptEl.textContent : '';
            if (!content) continue;

            const escapedMatch = content.match(escapedPattern);
            if (escapedMatch && escapedMatch[1]) {
                return escapedMatch[1];
            }

            const plainMatch = content.match(plainPattern);
            if (plainMatch && plainMatch[1]) {
                return plainMatch[1];
            }
        }

        return null;
    },

    _buildPingMetadata(extensionVersion) {
        const meta = { extensionVersion: String(extensionVersion) };
        const nav = typeof navigator !== 'undefined' ? navigator : null;
        if (nav && nav.userAgent) {
            meta.userAgent = nav.userAgent;
        }
        return meta;
    },

    _sendPing(email, currentVersion, storageKey, pingEveryLoad) {
        if (typeof GM_xmlhttpRequest !== 'function') {
            Logger.error('Extension ping unavailable: GM_xmlhttpRequest is not defined');
            return;
        }

        const body = {
            email,
            metadata: this._buildPingMetadata(currentVersion)
        };
        const payload = JSON.stringify(body);
        const url = 'https://operations-toolkit-admin.vercel.app/api/extension-ping';

        GM_xmlhttpRequest({
            method: 'POST',
            url,
            headers: {
                'Content-Type': 'application/json'
            },
            data: payload,
            onload: (response) => {
                const status = response && typeof response.status === 'number' ? response.status : 0;
                if (status >= 200 && status < 300) {
                    if (!pingEveryLoad) {
                        Storage.set(storageKey, currentVersion);
                    }
                    Logger.info(
                        pingEveryLoad
                            ? `Extension ping sent for version ${currentVersion} (extensionPingEveryLoad)`
                            : `Extension ping sent for version ${currentVersion}`
                    );
                    return;
                }

                Logger.warn(`Extension ping failed with status ${status}`);
            },
            onerror: (error) => {
                Logger.error('Extension ping network error:', error);
            }
        });
    }
};
