// extension-ping.js
// Core plugin that pings extension usage endpoint on script version update.

const plugin = {
    id: 'extension-ping',
    name: 'Extension Ping',
    description: 'Pings extension endpoint once per userscript version',
    _version: '1.0',
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
            const lastPingedVersion = Storage.get(storageKey, null);
            if (lastPingedVersion === currentVersion) {
                Logger.debug(`Extension ping skipped: already pinged for version ${currentVersion}`);
                return;
            }

            const email = this._extractEmailFromInlineScripts();
            if (!email) {
                Logger.warn('Extension ping skipped: email not found in inline scripts');
                return;
            }

            this._sendPing(email, currentVersion, storageKey);
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

    _sendPing(email, currentVersion, storageKey) {
        const payload = JSON.stringify({ email });
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
                    Storage.set(storageKey, currentVersion);
                    Logger.info(`Extension ping sent for version ${currentVersion}`);
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
