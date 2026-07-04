#!/usr/bin/env node
/**
 * Split search-output.js into core + left-pane + results-pane modules.
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const SRC = path.join(ROOT, 'plugins/core/main/search-output.js');
const LISTENERS_TMP = '/tmp/so-listeners.js';

const LEFT_METHODS = new Set([
    '_leftTabStyle', '_searchSectionStyle', '_leftPanelHtml', '_filterScopeLabel',
    '_toggleOutputType', '_setOutputTypesExclusive', '_setOutputTypesTaskAndQa', '_resetSearchScopeToUniversal', '_syncOutputToggleUi',
    '_personRawName', '_personNameLooksLikeId', '_personChipName', '_personDisplayLabel', '_personSearchHaystack',
    '_personMatchesQuery', '_scorePersonMatch', '_filterAndRankPersons', '_searchPersons',
    '_normalizeAuthorPerson', '_setAuthorTokens', '_addAuthorToken', '_removeAuthorToken', '_renderAuthorTokens',
    '_setAuthorError', '_showAuthorCandidates', '_hideAuthorCandidates', '_resolveAuthorToken', '_flushPendingAuthorInput',
    '_isDashSessionRefreshError', '_handleDashSessionRefreshError', '_renderDashSessionRefreshBannerHtml', '_syncDashSessionRefreshBanner',
    '_refreshCatalogDependentUi', '_renderSearchTeamsList', '_renderSearchProjectsList', '_renderSearchEnvsList',
    '_getFilterDraft', '_updateFilterSelectionOrder', '_resetFilterLists', '_renderFilterLists',
    '_setLeftTab', '_syncLeftTabUi', '_isMessageElVisible', '_syncLeftMessagesBar',
    '_isPrefetchInProgress', '_getRatingsPrefetchWarnings', '_getRatingsHydrationWarnings', '_buildRatingWorkerProfiles',
    '_ratingsAboutAxisTableHtml', '_ratingsAboutSectionHtml', '_ratingScoreBasisLine', '_ratingScoreBlockHtml',
    '_ratingWorkerCardHtml', '_renderRatingsPanel', '_downloadTextFile', '_handleRatingExport',
    '_applyQuickDatePreset', '_clearDateRangeFields', '_syncFieldClearButtons', '_syncPromptFilterHeight',
    '_validateRangeUi', '_isFilterSelectionValid', '_filterArraysEqual', '_filtersDraftDiffersFromApplied',
    '_isPromptRegexFilterEnabled', '_maybeLiveApplyPromptFilter', '_maybeLiveApplyFilterMsChange', '_updateApplyFiltersUi', '_updateSubstringErrorUi',
    '_parseRetrieveInput', '_setRetrieveError', '_setRetrieveButtonLoading', '_clearRetrieveInput',
    '_fetchTaskRowForRetrieve', '_buildRetrieveTaskItem', '_submitRetrieveTask',
    '_clearParameters', '_clearFilterUiFields',
    '_currentClientFilters', '_hasActiveFilters', '_applyFiltersAndRender',
    '_buildManualFilterRow', '_resetManualFilters', '_readSearchOutputManualFilters',
    '_resultsModeToggleHtml', '_syncResultsModeHint', '_syncResultsModeUi', '_setResultsMode',
    '_readResultsModePref', '_persistResultsModePref', '_isAdditiveResultsMode', '_btnDepthSegmentStyle',
    '_applyDefaultSearchDates', '_markTimeFilterUserPicked', '_resetTimeFilterUserPicked', '_maybeSwitchToAllTimeForContributor',
    '_btnToggleStyle', '_submitSearch', '_resetFiltersToDefaults',
    '_setSearchError', '_searchStatusDetail', '_setSearchButtonLoading', '_canShowStopSearchButton',
    '_shouldStopSearch', '_requestStopSearchFetches', '_finishStoppedSearch', '_stopSearchButtonHtml',
    '_runContributorHistoryDeepDive', '_runContributorWorkerOutputDeepDive',
    '_availableSearchProjects', '_ratingSearchScoreTypes'
]);

const RESULTS_METHODS = new Set([
    '_resultsHeaderBarStyle', '_resultsHeaderRowStyle', '_resultsToolbarRow2Style', '_resultsPanelHtml',
    '_readResultsPageSizePref', '_persistResultsPageSizePref', '_getEffectiveResultsPageSize', '_applyResultsPageSizeForNewSearch', '_syncResultsPageSizeUi',
    '_getPaginatedViewItems', '_getResultsPaginationMeta', '_getResultsRangeLabel', '_goResultsPage', '_syncResultsPagerUi', '_syncResultsRangeCountUi',
    '_syncResultsToolbarDerivedUi', '_syncDiffIncludedUi', '_syncVersionModeDropdownUi', '_dashVersionModeSelectOptionsHtml',
    '_isTasksHydratingActive', '_syncResultsHydrateBannerUi', '_syncDropExcludedUi',
    '_dropIncludedResults', '_dropExcludedResults', '_dropResultFromSearch',
    '_syncResultsListDerivedUi', '_resultsToolbarReady', '_onResultsKindTabChanged',
    '_applySortAndRender', '_applyVersionModeChange', '_contributorMatchDisplayNo',
    '_shouldShowHelpfulness', '_helpfulnessFeedbackIdInFilter', '_getHelpfulnessUi', '_helpfulnessThumbSvg', '_helpfulnessThumbBtnStyle',
    '_helpfulnessBlockHtml', '_patchHelpfulnessBlock', '_helpfulnessUpsertBody',
    '_handleQaReviewInput', '_handleQaReviewRemovePrompt', '_handleQaReviewRemoveCancel',
    '_getFlagResolutionUi', '_flagResolutionBlockHtml', '_patchFlagResolutionBlock', '_handleFlagResolutionInput',
    '_isCurrentUserTaskAuthor', '_shouldShowFlagCreateBtn', '_dashFleetQaReferer', '_getFlagCreateUi', '_toggleFlagCreatePanel',
    '_flagCreateReasonOptionsHtml', '_flagCreateFormInnerHtml', '_flagCreatePanelHtml', '_patchFlagCreatePanel',
    '_readFlagCreateFormFromDom', '_readQaReviewTextFromDom', '_handleFlagCreateInput',
    '_getTaskOpenUi', '_openTaskInFleet',
    '_getHydrateUi', '_getUserStoryUi', '_screenshotUiKey', '_getScreenshotUi', '_qaScreenshotViewUrlsPath', '_taskViewReferer',
    '_findScreenshotKeys', '_screenshotBlockHtml', '_patchScreenshotBlock', '_closeScreenshotLightbox', '_openScreenshotLightbox',
    '_userStoryEmptyMessage', '_userStoryHasContent', '_userStoryIsAbsent', '_userStoryEmptyHtml', '_userStoryPanelBodyHtml',
    '_userStoryBtnLabel', '_userStorySectionHtml', '_findUserStorySection', '_animateUserStoryOpen', '_syncUserStoryPanelOpen',
    '_patchUserStoryVisibility', '_patchUserStorySection', '_toggleUserStory', '_getVerifierFromCard',
    '_getUnhydratedInView', '_getUnhydratedOnPage', '_getInitialHydrateBatch', '_needsManualHydrateForRemainder',
    '_autoHydrateContextKey', '_schedulePageHydrate', '_bulkHydrateShowable', '_kindLabelForHydrate', '_bulkHydrateBaseLabel',
    '_bulkHydrateLabel', '_syncBulkHydrateUi', '_setBulkHydrateProgress', '_bulkHydrateVisible',
    '_btnResultsKindTabStyle', '_taskInitialCreatedAt',
    '_cardTabShellBase', '_cardSurfaceTabHtml', '_cardCreatedTabHtml', '_cardKeyCopyHtml', '_cardKeyTabHtml', '_cardStatusTabHtml', '_cardActionAreaHtml',
    '_addToDiffFromCard', '_diffSeedFromItem', '_diffIncludedResults',
    '_autoGrowTextareaStyle', '_compactSelectStyle', '_iconMicroBtnStyle', '_segmentBtnStyle', '_textareaFocusSnapshot', '_restoreTextareaFocus',
    '_quotedFieldBodyLayoutStyle', '_mutedQuotedFieldBodyStyle', '_quotedFieldBlockHtml',
    '_resolutionStatusBadgeHtml', '_resolutionBlockColors', '_resolvedActionSubBlockHtml',
    '_getCardUi', '_getRollingUi', '_ensureRollingUiOnExpand', '_clampCardRollingLeft', '_rollingSegBtn',
    '_rollingSimilarityLabelHtml', '_rollingSimilarityBadgeHtml', '_expandedRollingFeedbackBtnHtml', '_expandedRollingDiffToolbarHtml',
    '_collectFeedbackBlockIdsForItem', '_setFeedbackBulkCollapsed', '_rollingPromptBodyHtml', '_ensureRollingDiffStyles',
    '_detachCardRollingListeners', '_removeCardRollingOverlay', '_updateCardRollingOverlay', '_attachCardRollingListeners',
    '_renderedVersionsForItem', '_versionRollingHeaderRightHtml', '_updateRollingPairInCard', '_shiftCardRollingPair',
    '_findResultItem', '_getDisputeClaimUi', '_disputeResolutionOptionByKey', '_disputeResolutionIsFlagAsBugged',
    '_disputeResolutionOptionsHtml', '_disputeBugCategoryByKey', '_disputeBugCategoryOptionsHtml',
    '_buildDisputeResolveRequestBody', '_buildFlagBuggedRequestBody', '_disputeResolutionReasonLength',
    '_disputeResolutionPanelHtml', '_patchDisputeResolutionPanel',
    '_handleDisputeResolutionInput', '_handleDisputeResolutionStatusChange', '_handleDisputeBugCategoryChange',
    '_handleDisputeRelease', '_handleDisputeResolve', '_claimDispute',
    '_getActionBlockCollapseUi', '_actionBlockBodyHiddenStyle', '_actionBlockHeaderRowHtml', '_actionBlockShellHtml', '_patchActionBlock', '_toggleActionBlockCollapse',
    '_patchTaskCard', '_patchCardsForDisputeId',
    '_resultsKindTabsMeta', '_itemHasOutputKind', '_countItemsByResultsKindTab', '_kindsWithResults',
    '_isResultsKindTabDisabled', '_firstEnabledResultsKindTab', '_ensureValidResultsKindTab', '_filterItemsByResultsKindTab',
    '_getViewItems', '_updateResultsKindTabsUi',
    '_setSearchLoadPhase', '_searchFetchSourcesLabel', '_updateResultsStatus',
    '_searchLoadMessage', '_trackSearchLoadPromise', '_visibleSearchLoadLogEntries', '_searchLoadLogRowStyle', '_searchLoadLogMarkHtml',
    '_searchLoadLogRowHtml', '_searchLoadLogStateKey', '_searchLoadPhaseDisplayText', '_applySearchLoadPhaseDom',
    '_searchLoadOverlayStyle', '_searchLoadOverlayAnchorStyle', '_reorderSearchLoadLogRows', '_patchSearchLoadLogDom',
    '_searchLoadLogHtml', '_syncSearchLoadPhaseUi',
    '_renderResults', '_dashCopyInnerHtml', '_copyChipHtml', '_copyIconHtml', '_extLinkIconSvg', '_extLinkHtml', '_extLinkButtonStyle', '_taskOpenLinkHtml',
    '_labelSpan', '_promptVersionCountHtml', '_collapsedVersionPickerHtml', '_expandedVersionHeaderHtml', '_fieldGroupHtml',
    '_notesToQaSectionHtml', '_plainTimestampHtml', '_dashHighlightSegmentsHtml', '_dashSplitMarkdownLinkParts', '_dashHighlightedHtml',
    '_dashQuotedText', '_dashQuotedHighlightedHtml', '_cardHeaderMetaRowHtml', '_dismissedBadgeHtml',
    '_contributorDeepDiveTitle', '_contributorDeepDiveBtnHtml', '_flagForSeniorReviewBtnHtml', '_personChipsHtml',
    '_statusDisplayMeta', '_qaAlertBadgeStyle', '_qaEditedBadgeHtml', '_qaAlertIssueBadgeStyle', '_qaAcceptedBadgeStyle',
    '_qaReturnedBadgeStyle', '_qaPromptRatingBadgeStyle', '_qaAcceptedBlockStyle', '_qaReturnedBlockStyle', '_qaOtherBlockStyle', '_disputeBlockStyle',
    '_disputeCategoryBadgeHtml', '_qaBlockHtml', '_feedbackActionBadgeHtml', '_reviewerBadgeHtml',
    '_disputeClaimControlHtml', '_disputeBlockHtml', '_noneProvidedBadgeHtml', '_flagBlockHtml',
    '_promptVersionsRawLike', '_orphanDisputesByDisplayNo', '_orphanFlagsByDisplayNo',
    '_feedbackEntryAt', '_feedbackEntriesOldestFirst', '_sortTaskActionBlocksByDate', '_versionTaskActionsHtml', '_quickTaskActionsHtml',
    '_versionSectionHtml', '_resultCardHtml', '_quickResultCardHtml', '_resultCardOuterWrap', '_taskCardHtml',
    '_copyText', '_copyWithFeedback',
    '_syncAutoGrowTextarea', '_syncAutoGrowTextareasIn',
    '_fetchHelpfulnessRatingsBatch', '_handleThumbClick', '_handleQaReviewSubmit', '_handleQaReviewRemoveConfirm',
    '_handleFlagCreateSubmit', '_handleFlagResolution', '_fetchScreenshotViewUrls', '_handleLoadScreenshots'
]);

function buildSharedHeader(header) {
    let h = header;
    const removals = [
        [/const DASH_KIND_LABELS = \{[\s\S]*?\};\n\n/, ''],
        [/const DASH_RESULTS_MODE_HINTS = \{[\s\S]*?\};\n/, ''],
        [/const DASH_SUBSTRING_FILTER_HELP = [^\n]+;\n/, ''],
        [/const DASH_NONE_SELECTED_HINT = [^\n]+;\n\n/, ''],
        [/const DASH_SORT_DEFAULT = [^\n]+;\n/, ''],
        [/const DASH_SORT_METRICS = \[[\s\S]*?\];\n/, ''],
        [/const DASH_SORT_OPTIONS = DASH_SORT_METRICS[\s\S]*?\]\);\n\n/, ''],
        [/const DASH_KIND_MERGE_ORDER = \[[^\]]+\];\n\n/, ''],
        [/const DASH_FILTER_SCOPES = \[[\s\S]*?\];\n\n/, ''],
        [/const DASH_OUTPUT_MANUAL_FILTER_FIELDS = \[[\s\S]*?\];\n\n/, ''],
        [/const DASH_MANUAL_FILTER_DEFAULT_FIELD = [^\n]+;\n/, ''],
        [/const DASH_MANUAL_FILTER_DEFAULT_COMPARATOR = [^\n]+;\n\n/, ''],
        [/function dashDefaultManualFilterStageRows\(\) \{[\s\S]*?\}\n\n/, ''],
        [/function dashManualFilterWordCount\(text\) \{[\s\S]*?\}\n\n/, '']
    ];
    for (const [re, rep] of removals) h = h.replace(re, rep);

    const accessors = `
function dashFilterScopes() {
    const lib = Context.dashboardLib;
    return (lib && lib.filterScopes) || [];
}

function dashSortDefault() {
    const lib = Context.dashboardLib;
    return (lib && lib.sortDefault) || 'task_submitted:desc';
}

function dashSortOptions() {
    const lib = Context.dashboardLib;
    return (lib && lib.sortOptions) || [];
}

function dashSortMetrics() {
    const lib = Context.dashboardLib;
    return (lib && lib.sortMetrics) || [];
}

function dashKindMergeOrder() {
    const lib = Context.dashboardLib;
    return (lib && lib.outputKindMergeOrder) || [];
}

function dashKindLabels() {
    const lib = Context.dashboardLib;
    return (lib && lib.outputKindLabels) || {};
}

function dashManualFilterFields() {
    const lib = Context.dashboardLib;
    return (lib && lib.manualFilterFields) || [];
}

function dashDefaultManualFilterStageRows() {
    const lib = Context.dashboardLib;
    return lib && typeof lib.defaultManualFilterStageRows === 'function'
        ? lib.defaultManualFilterStageRows()
        : [];
}

function dashManualFilterWordCount(text) {
    const lib = Context.dashboardLib;
    return lib && typeof lib.manualFilterWordCount === 'function'
        ? lib.manualFilterWordCount(text)
        : 0;
}

function dashNoneSelectedHint() {
    const lib = Context.dashboardLib;
    return (lib && lib.noneSelectedHint) || 'None selected = all.';
}

function dashSubstringFilterHelp() {
    const lib = Context.dashboardLib;
    return (lib && lib.substringFilterHelp) || '';
}

function dashResultsModeHints() {
    const lib = Context.dashboardLib;
    return (lib && lib.resultsModeHints) || {};
}

`;
    return h.replace('function dashLib()', accessors + 'function dashLib()');
}

function patchRefs(body) {
    return body
        .replace(/\bDASH_FILTER_SCOPES\b/g, 'dashFilterScopes()')
        .replace(/\bDASH_SORT_DEFAULT\b/g, 'dashSortDefault()')
        .replace(/\bDASH_SORT_OPTIONS\b/g, 'dashSortOptions()')
        .replace(/\bDASH_SORT_METRICS\b/g, 'dashSortMetrics()')
        .replace(/\bDASH_KIND_MERGE_ORDER\b/g, 'dashKindMergeOrder()')
        .replace(/\bDASH_KIND_LABELS\b/g, 'dashKindLabels()')
        .replace(/\bDASH_OUTPUT_MANUAL_FILTER_FIELDS\b/g, 'dashManualFilterFields()')
        .replace(/\bDASH_NONE_SELECTED_HINT\b/g, 'dashNoneSelectedHint()')
        .replace(/\bDASH_SUBSTRING_FILTER_HELP\b/g, 'dashSubstringFilterHelp()')
        .replace(/\bDASH_RESULTS_MODE_HINTS\b/g, 'dashResultsModeHints()');
}

function buildListeners() {
    const orig = fs.readFileSync(LISTENERS_TMP, 'utf8');
    const lines = orig.split('\n');
    const body = lines.slice(1, -1); // strip outer function

    const leftLines = [];
    const resultsLines = [];
    const leftLineNums = new Set([
        6, 7, 8, 9, 14, 15, 16, 17, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73,
        ...range(76, 247)
    ]);
    const resultsLineNums = new Set([
        11, 12, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 33, 34, 35, 36, 37, 40, 41, 42, 45, 46, 47, 48,
        225, 226, 227, 228, 229, 230, 231, 232,
        ...range(248, 632)
    ]);

    function range(a, b) {
        const out = [];
        for (let i = a; i <= b; i++) out.push(i);
        return out;
    }

    // 1-indexed line numbers from /tmp/so-listeners.js
    body.forEach((line, idx) => {
        const n = idx + 2; // offset for function line
        if (leftLineNums.has(n)) leftLines.push(line);
        if (resultsLineNums.has(n)) resultsLines.push(line);
    });

    // Remove duplicate rating export from results (lines 249-255) - only in left
    const resultsFiltered = [];
    let skip = false;
    for (const line of resultsLines) {
        if (line.includes('const exportBtn')) skip = true;
        if (skip) {
            if (line.trim() === 'return;' && resultsFiltered.length && resultsFiltered[resultsFiltered.length - 1].includes('return;')) {
                skip = false;
                continue;
            }
            if (line.includes('const stopSearchBtn')) skip = false;
        }
        if (!skip) resultsFiltered.push(line);
    }

    const leftFn = `function attachSearchOutputLeftListeners(modal, dash) {
    if (!modal || !dash) return;
${leftLines.join('\n')}
    modal.addEventListener('click', (e) => {
            const exportBtn = e.target.closest('[data-wf-dash-rating-export]');
            if (exportBtn && modal.contains(exportBtn)) {
                const workerId = exportBtn.getAttribute('data-wf-dash-rating-worker');
                const format = exportBtn.getAttribute('data-wf-dash-rating-export');
                if (workerId && format) dash._handleRatingExport(workerId, format);
                return;
            }
            const candidate = e.target.closest('[data-wf-dash-candidate]');
            if (candidate && modal.contains(candidate)) {
                const id = candidate.getAttribute('data-wf-dash-candidate');
                const cand = (dash._state._candidates || []).find((c) => c.id === id);
                const authorInput = dash._q('#wf-dash-author-input');
                if (cand) { dash._addAuthorToken(cand); if (authorInput) authorInput.value = ''; }
                return;
            }
            const removeTok = e.target.closest('[data-wf-dash-remove-token]');
            if (removeTok && modal.contains(removeTok)) {
                e.stopPropagation();
                dash._removeAuthorToken(removeTok.getAttribute('data-wf-dash-remove-token'));
                return;
            }
    });
}`;

    const resultsFn = `function attachSearchOutputResultsListeners(modal, dash) {
    if (!modal || !dash) return;
    const authorInput = dash._q('#wf-dash-author-input');
${resultsFiltered.join('\n')}
}`;

    return { leftFn, resultsFn };
}

function extractTemplateLiteral(src, startIdx) {
    const tick = src.indexOf('`', startIdx);
    let i = tick + 1;
    while (i < src.length) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === '`') return src.slice(tick + 1, i);
        i++;
    }
    throw new Error('unclosed template');
}

// Main
const src = fs.readFileSync(SRC, 'utf8');
const lines = src.split('\n');
const methodsStart = lines.findIndex((l) => l.startsWith('const searchOutputMethods = {'));
const listenersStart = lines.findIndex((l) => l.startsWith('function attachSearchOutputListeners'));
const pluginStart = lines.findIndex((l) => l.startsWith('const plugin = {'));

const header = buildSharedHeader(lines.slice(0, methodsStart).join('\n'));

function extractMethods() {
    const methods = [];
    let i = methodsStart + 1;
    while (i < listenersStart) {
        const m = lines[i].match(/^    (async )?(_[a-zA-Z0-9]+)\(/);
        if (!m) { i++; continue; }
        const name = m[2];
        const start = i;
        let depth = 0;
        let started = false;
        let j = i;
        for (; j < listenersStart; j++) {
            for (const ch of lines[j]) {
                if (ch === '{') { depth++; started = true; }
                else if (ch === '}') depth--;
            }
            if (started && depth === 0) {
                if (lines[j + 1] && lines[j + 1].trim() === ',') j++;
                break;
            }
        }
        methods.push({ name, body: lines.slice(start, j + 1).join('\n') });
        i = j + 1;
    }
    return methods;
}

const methods = extractMethods();
const core = [];
const left = [];
const results = [];

for (const m of methods) {
    if (m.name === '_searchPanelHtml') continue;
    if (LEFT_METHODS.has(m.name)) left.push(m.body);
    else if (RESULTS_METHODS.has(m.name)) results.push(m.body);
    else core.push(m.body);
}

const searchPanel = methods.find((m) => m.name === '_searchPanelHtml');
const spBody = searchPanel.body;
const leftHtmlContent = extractTemplateLiteral(spBody, spBody.indexOf('const leftHtml = `'));
const rightHtmlContent = extractTemplateLiteral(spBody, spBody.indexOf('const rightHtml = `'));

left.unshift(`    _leftPanelHtml() {
        const box = this._panelBoxStyle();
        const label = this._labelStyle();
        const hint = this._hintStyle();
        const input = this._inputStyle();
        const section = this._searchSectionStyle();
        const retrieveInputVal = dashEscHtml((this._state && this._state.retrieveInput) || '');
        const leftTab = this._state ? this._state.leftTab : 'search';
        const filterScopes = dashFilterScopes();
        const sortDefault = dashSortDefault();
        return \`${leftHtmlContent}\`;
    },`);

results.unshift(`    _resultsPanelHtml() {
        const box = this._panelBoxStyle();
        const label = this._labelStyle();
        const input = this._inputStyle();
        const sortDefault = dashSortDefault();
        return \`${rightHtmlContent}\`;
    },`);

const coreMethods = patchRefs([
    ...core,
    `    _searchPanelHtml() {
        return this._splitPanelSectionHtml(this._leftPanelHtml(), this._resultsPanelHtml());
    },`
].join('\n\n'));

const leftMethods = patchRefs(left.join('\n\n'));
const resultsMethods = patchRefs(results.join('\n\n'));
const { leftFn, resultsFn } = buildListeners();

function writePane(filename, id, label, version, methodsVar, methodsBody, attachFnName, attachFnBody) {
    fs.writeFileSync(path.join(ROOT, 'plugins/core/main', filename), `// ${filename} — Worker Output Search ${label}

${header}

const ${methodsVar} = {
${methodsBody}
};

${attachFnBody}

const plugin = {
    id: '${id}',
    name: 'Search Output ${label}',
    description: 'Worker Output Search tab — ${label.toLowerCase()}',
    _version: '${version}',
    phase: 'core',
    enabledByDefault: true,
    initialState: { registered: false },

    init(state) {
        if (state && state.registered) {
            Logger.debug('${id}: already registered — skipping re-init');
            return;
        }
        Context.${methodsVar} = ${methodsVar};
        Context.${attachFnName} = ${attachFnName};
        if (state) state.registered = true;
        Logger.log('${id}: registered (Context.${methodsVar})');
    }
};
`);
}

writePane('search-output-left-pane.js', 'search-output-left-pane', 'left pane', '1.0', 'searchOutputLeftPaneMethods', leftMethods, 'attachSearchOutputLeftListeners', leftFn);
writePane('search-output-results-pane.js', 'search-output-results-pane', 'results pane', '1.0', 'searchOutputResultsPaneMethods', resultsMethods, 'attachSearchOutputResultsListeners', resultsFn);

const pluginTail = lines.slice(pluginStart).join('\n')
    .replace('_version: \'5.12\'', '_version: \'6.0\'')
    .replace(
        'Object.assign(loader, searchOutputMethods);',
        `Object.assign(loader, searchOutputCoreMethods);
            if (Context.searchOutputLeftPaneMethods) Object.assign(loader, Context.searchOutputLeftPaneMethods);
            if (Context.searchOutputResultsPaneMethods) Object.assign(loader, Context.searchOutputResultsPaneMethods);`
    )
    .replace(
        'description: \'Worker Output Search tab: bootstrap, search, hydrate, filters, results cards\'',
        'description: \'Worker Output Search tab core: bootstrap, search, prefetch, filter engine\''
    );

const coreContent = `// search-output.js — Worker Output Search tab (core orchestration).

${header}

const searchOutputCoreMethods = {
${coreMethods}
};

function attachSearchOutputListeners(modal, dash) {
    if (!modal || !dash) return;
    if (modal.dataset.wfSearchOutputListenersAttached === '1') return;
    modal.dataset.wfSearchOutputListenersAttached = '1';
    if (typeof Context.attachSearchOutputLeftListeners === 'function') {
        Context.attachSearchOutputLeftListeners(modal, dash);
    }
    if (typeof Context.attachSearchOutputResultsListeners === 'function') {
        Context.attachSearchOutputResultsListeners(modal, dash);
    }
}

${pluginTail.replace('searchOutputMethods', 'searchOutputCoreMethods')}`;

fs.writeFileSync(SRC, coreContent);
console.log('Split OK', { core: core.length + 1, left: left.length, results: results.length });
