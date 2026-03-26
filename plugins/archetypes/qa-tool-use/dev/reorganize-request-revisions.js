// ============= reorganize-request-revisions.js =============
// Reorganize the Request Revisions modal layout

const TWO_COL_WRAPPER_MARKER = 'data-fleet-request-revisions-two-col';

const plugin = {
    id: 'reorganizeRequestRevisions',
    name: '"Request Revisions" Modal Reorganization',
    description: 'Split the Request Revisions modal into two columns to reduce scrolling.',
    _version: '1.2',
    enabledByDefault: false,
    phase: 'mutation',

    storageKeys: {
        twoColDividerRatio: 'requestRevisions-two-col-divider-ratio'
    },

    subOptions: [
        {
            id: 'two-column-layout',
            name: 'Two-column layout',
            description: 'Split the modal into two columns with a resizable divider to reduce scrolling. Divider position is remembered.',
            enabledByDefault: false
        }
    ],

    initialState: {
        missingLogged: false,
        twoColContentContainerMissingLogged: false,
        twoColGridPlacementObserver: null
    },

    onMutation(state) {
        const dialogs = Context.dom.queryAll('div[role="dialog"][data-state="open"]', {
            context: `${this.id}.dialogs`
        });

        if (dialogs.length === 0) {
            state.missingLogged = false;
            state.twoColContentContainerMissingLogged = false;
            if (state.twoColGridPlacementObserver) {
                state.twoColGridPlacementObserver.disconnect();
                state.twoColGridPlacementObserver = null;
            }
            return;
        }

        let requestRevisionsModal = null;
        for (const dialog of dialogs) {
            const heading = Context.dom.query('h2', {
                root: dialog,
                context: `${this.id}.heading`
            });
            if (heading && heading.textContent.includes('Request Revisions')) {
                requestRevisionsModal = dialog;
                break;
            }
        }

        if (!requestRevisionsModal) {
            if (!state.missingLogged) {
                Logger.debug('Request Revisions modal not found (layout reorg)');
                state.missingLogged = true;
            }
            return;
        }

        state.missingLogged = false;

        const twoColEnabled = Storage.getSubOptionEnabled(this.id, 'two-column-layout', true);
        if (twoColEnabled && !requestRevisionsModal.querySelector(`[${TWO_COL_WRAPPER_MARKER}="true"]`)) {
            const split = this.findContentContainerAndSplitPoint(requestRevisionsModal, state);
            if (split) {
                this.applyTwoColumnLayout(requestRevisionsModal, split.contentContainer, split.leftNodes, split.rightNodes, state);
            }
        }
    },

    getTwoColSplitIndex(dialog, contentContainer) {
        const blocks = contentContainer.children.length === 1 && contentContainer.firstElementChild?.tagName === 'FORM'
            ? Array.from(contentContainer.firstElementChild.children)
            : Array.from(contentContainer.children);
        const whatDidYouTryLabel = Array.from(dialog.querySelectorAll('label, div')).find(el => {
            const t = (el.textContent || '').trim();
            return /what did you try/i.test(t) && (el.tagName === 'LABEL' || (el.classList?.contains('font-medium') && el.classList?.contains('text-muted-foreground')));
        });
        if (!whatDidYouTryLabel) return null;
        let section = whatDidYouTryLabel;
        while (section && section !== contentContainer) {
            if (section.querySelector && section.querySelector('textarea')) {
                break;
            }
            section = section.parentElement;
        }
        if (!section || section === contentContainer) return null;
        const splitIndex = blocks.findIndex(block => block.contains(section));
        if (splitIndex < 0) return null;
        if (splitIndex + 1 >= blocks.length) return null;
        return { splitIndex, blocks };
    },

    syncTwoColGridPlacement(dialog, contentContainer) {
        if (contentContainer.getAttribute(TWO_COL_WRAPPER_MARKER) !== 'true') return;
        const result = this.getTwoColSplitIndex(dialog, contentContainer);
        if (!result) return;
        const { splitIndex, blocks } = result;
        blocks.forEach((node, i) => {
            if (i <= splitIndex) {
                node.style.gridColumn = '1';
                node.style.gridRow = String(i + 1);
            } else {
                node.style.gridColumn = '3';
                node.style.gridRow = String(i - splitIndex);
            }
        });
    },

    findContentContainerAndSplitPoint(dialog, state) {
        const logOnceIfMissing = () => {
            if (!state.twoColContentContainerMissingLogged) {
                Logger.debug('Request Revisions two-column: content container or split point not found');
                state.twoColContentContainerMissingLogged = true;
            }
        };
        let contentContainer = Array.from(dialog.querySelectorAll('div')).find(d => {
            const cls = d.getAttribute('class') || '';
            const hasOverflow = cls.includes('overflow-auto') || cls.includes('overflow-y-auto');
            return hasOverflow && /where are the issues/i.test(d.textContent) && /what did you try/i.test(d.textContent);
        });
        if (!contentContainer) {
            contentContainer = Array.from(dialog.querySelectorAll('div')).find(d => {
                const cls = d.getAttribute('class') || '';
                return cls.includes('space-y-4') && /where are the issues/i.test(d.textContent) && /what did you try/i.test(d.textContent);
            });
        }
        if (!contentContainer) {
            logOnceIfMissing();
            return null;
        }
        const result = this.getTwoColSplitIndex(dialog, contentContainer);
        if (!result) {
            logOnceIfMissing();
            return null;
        }
        const { splitIndex, blocks } = result;
        const leftNodes = blocks.slice(0, splitIndex + 1);
        const rightNodes = blocks.slice(splitIndex + 1);
        return { contentContainer, leftNodes, rightNodes };
    },

    applyTwoColumnLayout(modal, contentContainer, leftNodes, rightNodes, state) {
        const leftPercent = 33;
        const rightPercent = 67;
        contentContainer.setAttribute('data-fleet-plugin', this.id);
        contentContainer.setAttribute(TWO_COL_WRAPPER_MARKER, 'true');
        contentContainer.style.display = 'grid';
        contentContainer.style.gridTemplateColumns = `${leftPercent}% 8px ${rightPercent}%`;
        contentContainer.style.gridAutoRows = 'auto';
        contentContainer.style.minHeight = '0';
        leftNodes.forEach((node, i) => {
            node.style.gridColumn = '1';
            node.style.gridRow = String(i + 1);
        });
        rightNodes.forEach((node, i) => {
            node.style.gridColumn = '3';
            node.style.gridRow = String(i + 1);
        });
        const modalContent = modal.querySelector('[class*="max-w"]') || modal;
        if (modalContent && modalContent !== document.body) {
            modalContent.style.width = '90vw';
            modalContent.style.maxWidth = '90vw';
        }
        if (state.twoColGridPlacementObserver) {
            state.twoColGridPlacementObserver.disconnect();
            state.twoColGridPlacementObserver = null;
        }
        let placementScheduled = false;
        const scheduleSyncPlacement = () => {
            if (placementScheduled) return;
            placementScheduled = true;
            queueMicrotask(() => {
                placementScheduled = false;
                if (contentContainer.isConnected && modal.isConnected) {
                    this.syncTwoColGridPlacement(modal, contentContainer);
                    this.normalizeGeneralFeedbackHeight(contentContainer);
                }
            });
        };
        const placementObserver = new MutationObserver(() => {
            scheduleSyncPlacement();
        });
        placementObserver.observe(contentContainer, { childList: true, subtree: false });
        state.twoColGridPlacementObserver = placementObserver;
        this.syncTwoColGridPlacement(modal, contentContainer);
        this.normalizeGeneralFeedbackHeight(contentContainer);
        Logger.log('Request Revisions: two-column layout applied');
    },

    normalizeGeneralFeedbackHeight(contentContainer) {
        const textarea = contentContainer.querySelector('textarea#discard-reason');
        if (!textarea) return;
        const value = (textarea.value || '').trim();
        if (value.length > 0) return;
        if (textarea.offsetHeight > 300) {
            textarea.style.height = '136px';
        } else if (textarea.style.height) {
            textarea.style.height = '136px';
        }
    }
};
