
// ==UserScript==
// @name         Fleet Workflow Builder UX Enhancer
// @namespace    http://tampermonkey.net/
// @version      14.1
// @description  Local Fleet UX helpers only (FOS, counters, QA shortcuts). No Ops, no remote code, no token capture.
// @author       Fleet AI Operations
// @match        https://www.fleetai.com/*
// @match        https://fleetai.com/*
// @include      /^https:\/\/[^/]+\.env\.[^/]+\.fleetai\.com/
// @icon         https://www.fleetai.com/favicon.ico
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_openInTab
// @run-at       document-start
// @downloadURL  https://raw.githubusercontent.com/Fleet-AI-Operations/fleet-ux-improvements/main/fleet.user.js
// @updateURL    https://raw.githubusercontent.com/Fleet-AI-Operations/fleet-ux-improvements/main/fleet.user.js
// ==/UserScript==

(function() {
    'use strict';

    const NOVNC_HOST_PATTERN = /\.env\.[^.]+(?:\.[^.]+)*\.fleetai\.com$/;
    const FLEET_PARENT_ORIGINS = new Set([
        'https://www.fleetai.com',
        'https://fleetai.com'
    ]);
    const FOS_CLIPBOARD_MAX_CHARS = 262144;

    if (window.top != window.self) {
        if (!NOVNC_HOST_PATTERN.test(window.location.hostname)) {
            console.warn("[Fleet UX Enhancer] - iframe detected. Terminating duplicate script instance. This is normal.");
            return;
        }
        initFosEmbeddedMode();
        return;
    }

    // ============= CORE CONFIGURATION =============
    const VERSION = '14.1';
    const SAFE_UX_BUILD = true;
    const SAFE_UX_BUILD_NAME = 'Fleet Safe UX Build';
    const STORAGE_PREFIX = 'wf-enhancer-';
    const SAFE_UX_ALLOWLIST = new Set([
        'ui-lib.js',
        'settings-ui.js',
        'fos-embedded-watcher.js',
        'accept-task-modal-improvements.js',
        'action-counter.js',
        'auto-start-recording.js',
        'copy-result-params.js',
        'copy-verifier-output.js',
        'fos-iframe-autoconnect.js',
        'fos-vm-clipboard-bar.js',
        'fos-vm-clipboard.js',
        'hide-verifier-output.js',
        'notes-resize-handle.js',
        'prompt-scratchpad.js',
        'prompt-text-counter.js',
        'request-revisions.js',
        'screenshot-upload-improvement.js',
        'show-verifier-on-run.js',
        'text-sanitizer.js',
        'toggle-main-panels.js',
        'tool-results-resize-handle.js',
        'user-story-collapse.js',
        'user-story-markdown.js'
    ]);
    const FOS_ORCHESTRATOR_INSTANCES_URL = 'https://orchestrator.fleetai.com/v1/env/instances';
    const PRIVILEGED_STORAGE_KEYS_TO_PURGE = [
        'fleet-ux:ops-team-search-next-action',
        'fleet-ux:ops-team-search-router-state',
        'fleet-ux:ops-team-add-member-next-action',
        'fleet-ux:ops-team-add-member-router-state',
        'fleet-ux:ops-task-data-next-action',
        'fleet-ux:ops-task-data-router-state',
        'fleet-ux:ops-expert-stats-next-action',
        'fleet-ux:ops-expert-stats-router-state',
        'fleet-ux:ops-current-user-id',
        'fleet-ux:ops-team-cred-refresh-done',
        'fleet-ux:dashboard-bootstrap',
        'fleet-ux:ai-openrouter-key',
        'fleet-ux:ai-chats-index',
        'fleet-ux:supabase-rest-base-url',
        'fleet-ux:supabase-anon-key',
        'fleet-ux:supabase-project-ref',
        'fleet-ux:supabase-access-token',
        'fleet-ux:verifier-fetcher-scratchpad-text',
        'fleet-ux:verifier-fetcher-scratchpad-open',
        'fleet-ux:verifier-fetcher-chat-open'
    ];
    // @@SAFE_UX_BUNDLE_START
    const BUNDLED_ARCHETYPES = {"version":"14.1","coreOnlyMode":false,"archetypesVersion":"15.1","logs":{"debug":false,"verbose":false,"submodule":false},"corePlugins":[{"name":"ui-lib.js","version":"3.24","hash":"sha256-cbc6806b400abf6e043369934cfc61505f089e2547cee74b634905113e347053","log":false},{"name":"settings-ui.js","version":"11.18","hash":"sha256-3de387b59ce35c18b0dd62a3a1dd9239bf553f16570bfd35fe8f2d2ac8b199f6","log":false},{"name":"fos-embedded-watcher.js","version":"5.4","hash":"sha256-5b1c214882fcdc15c3d81045f93164a44e1b313565ae65c11aa659ffd90341e7","log":false}],"libraries":[{"name":"accept-task-modal-improvements.js","version":"2.3","hash":"sha256-0707031982051172a43a9f2507be481f22c8c900026bfde041a94f2b86b4e6db","log":false},{"name":"copy-verifier-output.js","version":"5.4","hash":"sha256-664558f445aebfb1c61b296377fffcb45233e33fa64dc82803774a7550c0021d","log":false},{"name":"screenshot-upload-improvement.js","version":"1.1","hash":"sha256-b6e737f3e8ef886051154ff27b4b6e09016b44bf80224668463ed97474456371","log":false},{"name":"action-counter.js","version":"3.7","hash":"sha256-b06eb33bb0065da47284139f38890b4b91fe79a2c0342706a33211efdfbdae35","log":false},{"name":"fos-vm-clipboard-bar.js","version":"1.8","hash":"sha256-e33cccb48347c5c89bf37f2835f02bd5518bc4cc58bbd983ed99914c8acd4d7c","log":false},{"name":"fos-iframe-autoconnect.js","version":"1.2","hash":"sha256-ad3b70a082fa2e3ddf5ca934ab86cb13c6aeed02e6f138643e46ee491361b0fa","log":false},{"name":"notes-resize-handle.js","version":"2.2","hash":"sha256-845e1f33ecf6a389a9c66c5e5242bb7a15830e4544b4502860a6a911d96a5dcd","log":false},{"name":"prompt-scratchpad.js","version":"3.3","hash":"sha256-1391b3d0b3d7ab405b9680d5bc37668a58eb6935ccc2b14fae96c9fdfbfd1fb4","log":false},{"name":"prompt-text-counter.js","version":"1.0","hash":"sha256-b0d71baa66ad441d5a0dc190028cb1a04a8d7adf465d1211b27fc1be019d75ce","log":false},{"name":"request-revisions.js","version":"1.2","hash":"sha256-b835c1c13b5bcb185401f3f333bf559651817b5d1b3551a8e02795d2e4f538c5","log":false},{"name":"toggle-main-panels.js","version":"1.12","hash":"sha256-b5b1bb1bcf86ccb32a8decc3193841bcd82317effdf92447d63c7f35cbbc734d","log":false},{"name":"user-story-markdown.js","version":"1.10","hash":"sha256-394efdd7463de3eeb1d8ceb242c378019d66e834f892a10eb998423c6c955ca3","log":false},{"name":"user-story-collapse.js","version":"1.6","hash":"sha256-c339004a313287eca5338f97872ee3afa24d1dce87bf2929692559846c3c4807","log":false}],"opsDashboardPlugins":[],"opsDashboardLibraries":[],"devPlugins":[],"settingsModalDocs":[{"name":"information-tab.md","version":"1.19"},{"name":"features-tab.md","version":"1.45"}],"archetypes":[{"id":"dashboard","name":"Main Dashboard","description":"Main dashboard page","urlPattern":"work/create","disambiguationSelectors":[],"plugins":[]},{"id":"tool-use-task-creation","name":"Tool Use Task Creation Page","description":"Page for creating K-type workflow tasks","urlPattern":"work/problems/create-tool-use*","disambiguationSelectors":[],"libraries":["notes-resize-handle.js","prompt-text-counter.js","user-story-markdown.js","user-story-collapse.js"],"plugins":[{"name":"notes-resize-handle.js","version":"1.2","hash":"sha256-0c448040a545cd8fb1a95c07fe3d20c586e2564323751c12741d27c363d8859a","log":false},{"name":"prompt-text-counter.js","version":"1.0","hash":"sha256-8770cb46c0f4a1831a071588769d7762f1298930e08eb042cd599601e8a2fd2c","log":false},{"name":"text-sanitizer.js","version":"4.2","hash":"sha256-8088efb71950f66e8522dce416402ef607510a1edc2203b98c2d13c1bd6c49ee","log":false},{"name":"tool-results-resize-handle.js","version":"2.4","hash":"sha256-0fb0fbe80e9eb779f516aa3871ed08ef39503f0d2e6e48553394633869b6f477","log":false},{"name":"user-story-markdown.js","version":"1.1","hash":"sha256-a7e78253b63f803a1c7e86330ec1630b2050aaff3ad66ea5610e547051ea28a6","log":false},{"name":"user-story-collapse.js","version":"1.0","hash":"sha256-d8b2c80adfe4eed14ecc7726fa5f87de24f2ce7d5e5aa321a9cfc0b4d1dcb959","log":false}]},{"id":"tool-use-task-creation-openclaw","name":"Tool Use OpenClaw Task Creation Page","description":"Task Designers Special Projects OpenClaw variant","urlPattern":"work/problems/create-tool-use*","disambiguationSelectors":["text:Task Designers - Special Projects Tasks"],"libraries":["notes-resize-handle.js","prompt-text-counter.js","user-story-markdown.js","user-story-collapse.js"],"plugins":[{"name":"notes-resize-handle.js","version":"1.2","hash":"sha256-0c448040a545cd8fb1a95c07fe3d20c586e2564323751c12741d27c363d8859a","log":false},{"name":"prompt-text-counter.js","version":"1.0","hash":"sha256-8770cb46c0f4a1831a071588769d7762f1298930e08eb042cd599601e8a2fd2c","log":false},{"name":"text-sanitizer.js","version":"4.2","hash":"sha256-f9d1e893030f8800986bae1ac02fe5614a70d74839d942df3aeeab756984edfc","log":false},{"name":"tool-results-resize-handle.js","version":"2.4","hash":"sha256-0fb0fbe80e9eb779f516aa3871ed08ef39503f0d2e6e48553394633869b6f477","log":false},{"name":"user-story-markdown.js","version":"1.1","hash":"sha256-a7e78253b63f803a1c7e86330ec1630b2050aaff3ad66ea5610e547051ea28a6","log":false},{"name":"user-story-collapse.js","version":"1.0","hash":"sha256-d8b2c80adfe4eed14ecc7726fa5f87de24f2ce7d5e5aa321a9cfc0b4d1dcb959","log":false}]},{"id":"tool-use-revision","name":"Tool Use Task Revision Page","description":"Page for reviewing and fixing previously submitted tool use tasks","urlPattern":"work/problems/respond-feedback/edit-tool-use*","disambiguationSelectors":[],"libraries":["prompt-scratchpad.js","prompt-text-counter.js","user-story-markdown.js","user-story-collapse.js"],"plugins":[{"name":"prompt-scratchpad.js","version":"2.3","hash":"sha256-82432dd241762fefdae9d4602b7900ecf54a3b37a37c0d5222f1cc4fbcee5728","log":false},{"name":"prompt-text-counter.js","version":"1.0","hash":"sha256-8770cb46c0f4a1831a071588769d7762f1298930e08eb042cd599601e8a2fd2c","log":false},{"name":"tool-results-resize-handle.js","version":"3.4","hash":"sha256-a244822dd48563ef7b169293483a5bebc2de2ee2f65406acb23489855a0d9733","log":false},{"name":"user-story-markdown.js","version":"1.1","hash":"sha256-a7e78253b63f803a1c7e86330ec1630b2050aaff3ad66ea5610e547051ea28a6","log":false},{"name":"user-story-collapse.js","version":"1.0","hash":"sha256-d8b2c80adfe4eed14ecc7726fa5f87de24f2ce7d5e5aa321a9cfc0b4d1dcb959","log":false}]},{"id":"create-task-project-selection","name":"Create Task Project Selection","description":"Screen for choosing a project before creating a task","urlPattern":"work/problems/create-instance","disambiguationSelectors":[],"plugins":[]},{"id":"dashboard-create-instance","name":"Dashboard Create Instance","description":"Dashboard page for creating instances","urlPattern":"dashboard/instances/create","disambiguationSelectors":[],"plugins":[]},{"id":"comp-use-task-creation","name":"Computer Use Task Creation Page","description":"Page for creating computer use tasks","urlPattern":"work/problems/create*","disambiguationSelectors":[],"libraries":["notes-resize-handle.js","action-counter.js","fos-vm-clipboard-bar.js","fos-iframe-autoconnect.js","prompt-text-counter.js","user-story-markdown.js","user-story-collapse.js","toggle-main-panels.js"],"plugins":[{"name":"action-counter.js","version":"3.2","log":false,"hash":"sha256-493bbb1b472191eea6f6762e8715f5c40ef84122884340f23132c33b9c9cc9a8"},{"name":"fos-vm-clipboard.js","version":"2.1","hash":"sha256-814b760804fd15837dee2087faf9b6dc73455a1245ecb922755203989dbb48c9","log":false},{"name":"fos-iframe-autoconnect.js","version":"1.2","hash":"sha256-7ae4d81165d55305d48d9e3051e4d1b0ab40e3ef60234cd72e890f11d872d775","log":false},{"name":"notes-resize-handle.js","version":"1.2","hash":"sha256-0c448040a545cd8fb1a95c07fe3d20c586e2564323751c12741d27c363d8859a","log":false},{"name":"prompt-text-counter.js","version":"1.0","hash":"sha256-8770cb46c0f4a1831a071588769d7762f1298930e08eb042cd599601e8a2fd2c","log":false},{"name":"user-story-markdown.js","version":"1.1","hash":"sha256-a7e78253b63f803a1c7e86330ec1630b2050aaff3ad66ea5610e547051ea28a6","log":false},{"name":"user-story-collapse.js","version":"1.0","hash":"sha256-d8b2c80adfe4eed14ecc7726fa5f87de24f2ce7d5e5aa321a9cfc0b4d1dcb959","log":false},{"name":"toggle-main-panels.js","version":"1.0","log":false,"hash":"sha256-f8778c48ed98c701c8d32bdbd155d551072f97be5b62f4c5cf462b62202f6e2f"}]},{"id":"comp-use-revision","name":"Computer Use Task Revision Page","description":"Page for reviewing and fixing previously submitted computer use tasks","urlPattern":"work/problems/respond-feedback/edit*","disambiguationSelectors":[],"libraries":["prompt-scratchpad.js","prompt-text-counter.js","action-counter.js","fos-vm-clipboard-bar.js","fos-iframe-autoconnect.js","user-story-markdown.js","user-story-collapse.js","toggle-main-panels.js"],"plugins":[{"name":"action-counter.js","version":"3.1","log":false,"hash":"sha256-a60367b612d26d7689c24a44ceb486d68d8c3376f95976854ac448b45c8094b7"},{"name":"fos-vm-clipboard.js","version":"2.0","hash":"sha256-7c15434c8773235ff010e6e292279abd498594a4ded07ebe51f011e59b21df8e","log":false},{"name":"fos-iframe-autoconnect.js","version":"1.2","hash":"sha256-a9540416f8f6b1f9f4b9750957705033f90ad4d620569e72798cb43b1f411be8","log":false},{"name":"prompt-scratchpad.js","version":"2.3","hash":"sha256-d236db4f8a7b598d20278aa03f53a53a6e185e5c3682a94fe5267dbaeb3b2c9e","log":false},{"name":"prompt-text-counter.js","version":"1.0","hash":"sha256-8770cb46c0f4a1831a071588769d7762f1298930e08eb042cd599601e8a2fd2c","log":false},{"name":"user-story-markdown.js","version":"1.1","hash":"sha256-a7e78253b63f803a1c7e86330ec1630b2050aaff3ad66ea5610e547051ea28a6","log":false},{"name":"user-story-collapse.js","version":"1.0","hash":"sha256-d8b2c80adfe4eed14ecc7726fa5f87de24f2ce7d5e5aa321a9cfc0b4d1dcb959","log":false},{"name":"toggle-main-panels.js","version":"1.0","log":false,"hash":"sha256-f8778c48ed98c701c8d32bdbd155d551072f97be5b62f4c5cf462b62202f6e2f"}]},{"id":"qa-tool-use","name":"Task Review Page","description":"Page for reviewing and approving tasks","urlPattern":"work/problems/qa-tool-use/*","disambiguationSelectors":[],"libraries":["accept-task-modal-improvements.js","copy-verifier-output.js","request-revisions.js","screenshot-upload-improvement.js","user-story-markdown.js","user-story-collapse.js"],"plugins":[{"name":"accept-task-modal-improvements.js","version":"1.8","hash":"sha256-d7a50c2fc6a6800f1bb050d9d2bba32b6966b24cf919e039ad1358be3273eed6","log":false},{"name":"copy-verifier-output.js","version":"4.2","hash":"sha256-fc06c07eca5c10458b7ca6efe3d54b1386f6958672782bad217244ae9e6e4c1b","log":false},{"name":"hide-verifier-output.js","version":"1.8","hash":"sha256-22888468f4715d7152cb411e98d2de55183327fb540d8ba455273875c1806781","log":false},{"name":"request-revisions.js","version":"8.0","hash":"sha256-913205a4e8eda3704e2d51078404560b48b5cfc11b5a867d0a57b7034b085d6c","log":false},{"name":"text-sanitizer.js","version":"3.2","hash":"sha256-dd1887ece3307bf0f35e6b08b23af4af4ba5dfdecc62200211f3f37e8cfa3fe7","log":false},{"name":"tool-results-resize-handle.js","version":"2.4","hash":"sha256-ed705a53a986c843f8605db4599f4abfac0bc755b03f28afc9a2ac650c326bef","log":false},{"name":"user-story-markdown.js","version":"1.1","hash":"sha256-a7e78253b63f803a1c7e86330ec1630b2050aaff3ad66ea5610e547051ea28a6","log":false},{"name":"user-story-collapse.js","version":"1.0","hash":"sha256-d8b2c80adfe4eed14ecc7726fa5f87de24f2ce7d5e5aa321a9cfc0b4d1dcb959","log":false}]},{"id":"qa-session","name":"Session Trace Review","description":"Page for reviewing session traces","urlPattern":"work/problems/qa-session/*","disambiguationSelectors":[],"plugins":[]},{"id":"qa-comp-use","name":"Computer Use Task Review Page","description":"Page for reviewing and approving computer-use tasks","urlPattern":"work/problems/qa/*","disambiguationSelectors":[],"libraries":["accept-task-modal-improvements.js","action-counter.js","copy-verifier-output.js","fos-vm-clipboard-bar.js","fos-iframe-autoconnect.js","request-revisions.js","screenshot-upload-improvement.js","user-story-markdown.js","user-story-collapse.js","toggle-main-panels.js"],"plugins":[{"name":"accept-task-modal-improvements.js","version":"1.8","hash":"sha256-d7a50c2fc6a6800f1bb050d9d2bba32b6966b24cf919e039ad1358be3273eed6","log":false},{"name":"action-counter.js","version":"2.1","log":false,"hash":"sha256-acf016786bee0a736809f777b684265670f9fdd235ae7e2682d4636a7a53fdbc"},{"name":"auto-start-recording.js","version":"1.4","hash":"sha256-41c516f670f44c9d03d736b938ecfe346313b28810766e3860b322d039a80cd1","log":false},{"name":"copy-result-params.js","version":"2.0","hash":"sha256-c8b3853bafeb018ace90c39bd585b857aca0c5ac3617f5ea79d7c42cf3491dee","log":false},{"name":"copy-verifier-output.js","version":"4.2","hash":"sha256-fc06c07eca5c10458b7ca6efe3d54b1386f6958672782bad217244ae9e6e4c1b","log":false},{"name":"fos-vm-clipboard.js","version":"1.2","hash":"sha256-dbf69e0448ba4b77facb7a400260d505f8d02e48883373ed20d5b9599d4669b9","log":false},{"name":"fos-iframe-autoconnect.js","version":"1.2","hash":"sha256-4cebf3f63cdbcfc8cf2e246153465e7299691dafbf8199e1c25e45807721a052","log":false},{"name":"request-revisions.js","version":"8.0","hash":"sha256-913205a4e8eda3704e2d51078404560b48b5cfc11b5a867d0a57b7034b085d6c","log":false},{"name":"show-verifier-on-run.js","version":"1.4","hash":"sha256-c2e4e617d066522280dfa894595d996e75ffb9040f2abad75315f8a872d8975c","log":false},{"name":"toggle-main-panels.js","version":"1.11","log":false,"hash":"sha256-57e883d0db1eaaf784343de7a4ece06eaff54d108860971027692f8e5b6ab201"},{"name":"user-story-markdown.js","version":"1.1","hash":"sha256-a7e78253b63f803a1c7e86330ec1630b2050aaff3ad66ea5610e547051ea28a6","log":false},{"name":"user-story-collapse.js","version":"1.0","hash":"sha256-d8b2c80adfe4eed14ecc7726fa5f87de24f2ce7d5e5aa321a9cfc0b4d1dcb959","log":false}]},{"id":"disputes","name":"Dispute Review Page","description":"Page for reviewing writer disputes","urlPattern":"work/problems/disputes","disambiguationSelectors":[],"libraries":["user-story-markdown.js"],"plugins":[{"name":"user-story-markdown.js","version":"1.2","hash":"sha256-053a47538155b35ec5a766ee7b55291b3b78d8de4a113dcd609975101d138bc3","log":false}]},{"id":"dispute-detail","name":"Dispute Detail Page","description":"Page for reviewing a single writer dispute","urlPattern":"work/problems/disputes/*","disambiguationSelectors":[],"libraries":["copy-verifier-output.js","fos-vm-clipboard-bar.js","fos-iframe-autoconnect.js","user-story-markdown.js"],"plugins":[{"name":"copy-verifier-output.js","version":"4.2","hash":"sha256-fc06c07eca5c10458b7ca6efe3d54b1386f6958672782bad217244ae9e6e4c1b","log":false},{"name":"fos-vm-clipboard.js","version":"1.2","hash":"sha256-bb6c066c58e5bf843439c6b18e35d95ba88ab6e1f0c7a3b1fed4d813d0ab9f66","log":false},{"name":"fos-iframe-autoconnect.js","version":"1.2","hash":"sha256-662ca9bd9c4883de4250fb87deb48291a4f15b5740a081421cf4e7f2d0dd7db2","log":false},{"name":"tool-results-resize-handle.js","version":"1.3","hash":"sha256-7df97c2a426026a2002da1f31cac0c81d2e5abc995182cd9bba6773d1ec69462","log":false},{"name":"user-story-markdown.js","version":"1.2","hash":"sha256-bd4703bc5f63c20aa08db6babe4177f495ff40e10e69f604d5730edcd8905ae0","log":false}]},{"id":"task-view","name":"Task View","description":"Page for viewing a task","urlPattern":"work/problems/view-task*","disambiguationSelectors":[],"plugins":[]},{"id":"dashboard-data-task","name":"Dashboard Data Task View","description":"Dashboard task detail page","urlPattern":"dashboard/data/tasks/*","disambiguationSelectors":[],"plugins":[]},{"id":"dashboard-data-expert","name":"Dashboard Data Expert Profile","description":"Expert profile page on the dashboard","urlPattern":"dashboard/data/experts/*","disambiguationSelectors":[],"plugins":[]},{"id":"no-vnc","name":"noVNC Instance","description":"noVNC remote desktop instances on fleet environment subdomains","urlPattern":"_novnc","disambiguationSelectors":[],"plugins":[]},{"id":"assessments-grade","name":"Assessments Grade","description":"Assessment grading queue","urlPattern":"work/assessments/grade","disambiguationSelectors":["text:To grade"],"plugins":[]},{"id":"assessments-grade-detail","name":"Assessments Grade Detail","description":"Individual assessment grading page","urlPattern":"work/assessments/grade/*","disambiguationSelectors":["text:← Back to queue"],"plugins":[]},{"id":"guidelines","name":"Guidelines","description":"Guidelines list and editor","urlPattern":"work/guidelines","disambiguationSelectors":[],"plugins":[]}],"devArchetypes":[]};
    const BUNDLED_SETTINGS_DOCS = {"information-tab.md":"1.19\n## Fleet Safe UX Build\nThis is a containment userscript. It keeps FOS clipboard/autoconnect, local prompt/UX helpers, and QA shortcuts. Ops Dashboard, OpenRouter, verifier-source lookup, team/permission tools, token capture, and remote plugin loading are suspended pending investigation.\n\n## Information\nIf you still cannot find a specific codename, please use the `Feedback` tab to notify me!\n#### Environment Codenames\n| Environment Codename      | Real App Name          |\n|---------------------------|------------------------|\n| Agora                     | Reddit                 |\n| Aisle                     | Walmart                |\n| Atlas                     | Google Maps            |\n| Bay                       | Amazon                 |\n| Brass                     | Bill                   |\n| Citadel                   | Salesforce             |\n| Chorus                    | Teams                  |\n| Crate                     | Instacart              |\n| Docket                    | Dropbox                |\n| Float                     | Ramp                   |\n| Seal                      | Docusign               |\n| Foundry                   | Github                 |\n| Funnel                    | Zip                    |\n| Harbor                    | Bank of America        |\n| Jetstream                 | Google Flights         |\n| Kernel                    | Jira / RevOps          |\n| KeyRing                   | Booking                |\n| Latch Calendar/Mail/Tasks | Outlook                |\n| Ledger                    | Quickbooks             |\n| LedgerGov                 | DMV                    |\n| Lumen                     | Datadog                |\n| Medora                    | Zocdoc                 |\n| Meridian                  | Amex                   |\n| Nest                      | Zillow                 |\n| Orbit                     | PandaDoc               |\n| Portal                    | Ticketmaster           |\n| Relay                     | Hubspot                |\n| Seal                      | Docusign               |\n| Sentinel                  | Vanta                  |\n| Signal                    | Sentry                 |\n| StackLine                 | StackOverflow          |\n| Torch                     | PagerDuty              |\n| Vault                     | Confluence             |\n| Ward                      | Synk                   |\n| Yelp                      | Hearth                 |\n\n#### Guidelines\n- [General](https://www.fleetai.com/work/guidelines?doc=c007bc70-5202-4bfd-95bb-4f1699d8b9f3)\n- [Tool use](https://www.fleetai.com/work/guidelines?doc=1d4e376a-04e5-4636-93b9-faeeca44f80b)\n- [QA](https://www.fleetai.com/work/guidelines?doc=171f1c3e-3ba9-4531-a5e2-30a8f301ea43)\n- [Time submission](https://www.fleetai.com/work/guidelines?doc=f2536177-34a9-4a34-967e-0b8c374c203c)\n\n#### Community\n- [Fleet AI Official Slack](https://app.slack.com/client/T05EN36FWHY)\n- [Environment Gists](https://fleetai-env-gists.vercel.app)\n- [This Extension](https://github.com/fleet-ai-operations/fleet-ux-improvements)","features-tab.md":"1.45\n\n## Fleet Safe UX Build\nThis containment build ships only the allowlisted helpers below. Ops Dashboard, Search Chat, Diff Viewer, OpenRouter, verifier-source lookup, dashboard stats, dispute filters, and remote module loading are suspended.\n\n## Features\n\nThe extension uses an archetype-based plugin system that loads different features depending on which page you're on. Plugin configuration and versions are managed in `archetypes.json`. The lists below match plugins shipped from each archetype’s `main` folder in the production archetype set (not `dev` or `deprecated`).\n\nMany of the original modifications (such as a 3-column layout in the Kinesis task creation environments, or duplicating tools to the end of the workflow) that only users of this extension were able to enjoy are now part of the main website!\n\n### Main Dashboard\n- **Disputes Reviewed Today Breakdown**: Show today's disputes reviewed count and approved/rejected breakdown with copy and scroll warning\n\n### Tool Use Task Creation Page\n- **Prompt Text Counter**: Shows a live word and character count below the prompt\n- **Remove Textarea Gradient**: Removes the gradient fade overlay from the prompt textarea\n- **Tool Results Resize Handle**: Adds a resize handle to tool result boxes so their height can be adjusted by dragging\n- **User Story Markdown**: Hide native User Story bodies and show markdown-rendered blue-framed replicas\n\n### Tool Use Task Creation Page (OpenClaw / Special Projects)\n*Loads when the task-creation page matches the OpenClaw / Special Projects disambiguator in `archetypes.json`.*\n- **Bug Report Readability Fix**: Makes bug report cards expandable to see full text\n- **Clear Tool Search**: Adds a clear `X` button to the tool search box when it has text\n- **Tool Favorites**: Add favorite stars to tools list\n- **JSON Editor Online**: Add button that opens JSON Editor Online in a new tab. Optionally show button on each tool result to copy output and open editor.\n- **Prompt Text Counter**: Shows a live word and character count below the prompt\n- **Remove Textarea Gradient**: Removes the gradient fade overlay from the prompt textarea\n- **Text Sanitizer**: Adds a text sanitizer utility for quickly cleaning and transforming text\n- **Tool Results Resize Handle**: Adds a resize handle to tool result boxes so their height can be adjusted by dragging\n- **User Story Markdown**: Hide native User Story bodies and show markdown-rendered blue-framed replicas\n\n### Tool Use Task Revision Page\n- **Prompt Text Counter**: Shows a live word and character count below the prompt\n- **Scratchpad**: Adds an adjustable height scratchpad to the page\n- **Tool Results Resize Handle**: Adds a resize handle to tool result boxes so their height can be adjusted by dragging\n- **User Story Markdown**: Hide native User Story bodies and show markdown-rendered blue-framed replicas\n\n### Computer Use Task Creation Page\n- **Disable Prompt Text Area Autocorrect**: Disables autocorrect in the prompt text box\n- **Prompt Text Counter**: Shows a live word and character count below the prompt\n- **Remove Textarea Gradient**: Removes the gradient fade overlay from the prompt textarea\n- **User Story Markdown**: Hide native User Story bodies and show markdown-rendered blue-framed replicas\n- **Action Counter**: Persistent +/- counter in the page header\n- **Creation Annotator Instructions**: Shows annotator instructions above the user story on computer-use creation\n- **VM Clipboard**: Extract/Overwrite VM Clipboard controls in the page header (shown when FOS env is ready)\n- **FOS Viewport Resize**: Resizes the embedded FOS environment to the viewport. Autoconnects the instance and open-in-new-tab URL; reconnects when the tab is focused again\n- **Time Remaining Chip**: Keeps the Time remaining countdown from shifting the header as digits change\n- **Toggle Main Panels**: Hide or unhide either main pane (task detail or environment); the other pane expands to full width\n\n### Computer Use Task Revision Page\n- **Prompt Text Counter**: Shows a live word and character count below the prompt\n- **Scratchpad**: Adds an adjustable height scratchpad to the page\n- **Remove Textarea Gradient**: Removes the gradient fade overlay from the prompt textarea\n- **User Story Markdown**: Hide native User Story bodies and show markdown-rendered blue-framed replicas\n- **Action Counter**: Persistent +/- counter in the page header\n- **VM Clipboard**: Extract/Overwrite VM Clipboard controls in the page header (shown when FOS env is ready)\n- **FOS Viewport Resize**: Resizes the embedded FOS environment to the viewport. Autoconnects the instance and open-in-new-tab URL; reconnects when the tab is focused again\n- **Toggle Main Panels**: Hide or unhide either main pane (task detail or environment); the other pane expands to full width\n\n### QA Tool Use Review Page\n- **\"Accept Task\" Modal Improvements**: Add a button above the optional comments box to paste a positive blurb\n- **Auto Start Recording**: Automatically clicks the \"Start Recording\" button once when it appears on the page.\n- **Copy Prompt**: Add a copy button next to the Prompt label. Click copies the prompt text to the clipboard\n- **Copy Verifier Output**: Add a copy button after Stdout or Score; when checklist Raw Output is expanded, a copy icon beside Raw Output copies the raw pre text\n- **Hide Grading Autoclick**: Automatically clicks the \"Hide Grading\" button once when it becomes available after load.\n- **\"Request Revisions\" Modal Improvements**: Guidelines, copy actions, task-only issue selection, and screenshot upload on Request Revisions\n- **Tool Results Resize Handle**: Adds a resize handle to tool result boxes so their height can be adjusted by dragging\n- **Useful Link Buttons**: Add useful link buttons to the page\n- **User Story Markdown**: Hide native User Story bodies and show markdown-rendered blue-framed replicas\n\n### QA Computer Use Review Page\n- **\"Accept Task\" Modal Improvements**: Add a button above the optional comments box to paste a positive blurb\n- **Auto Start Recording**: Automatically clicks the \"Start Recording\" button once when it appears on the page.\n- **Copy Result Params and Inputs**: Add a button under Your Answer that copies all parameter labels and values to the clipboard\n- **Copy Verifier Output**: Add a copy button after Stdout or Score; when checklist Raw Output is expanded, a copy icon beside Raw Output copies the raw pre text\n- **Hide Grading Autoclick**: Automatically clicks the \"Hide Grading\" button once when it becomes available after load.\n- **\"Request Revisions\" Modal Improvements**: Guidelines, copy actions, task-only issue selection, and screenshot upload on Request Revisions\n- **User Story Markdown**: Hide native User Story bodies and show markdown-rendered blue-framed replicas\n- **Action Counter**: Persistent +/- counter beside the Verifier tab\n- **VM Clipboard**: Extract/Overwrite VM Clipboard controls beside the Verifier tab (shown when FOS env is ready)\n- **FOS Viewport Resize**: Resizes the embedded FOS environment to the viewport. Autoconnects the instance and open-in-new-tab URL; reconnects when the tab is focused again\n- **Toggle Main Panels**: Hide or unhide either main pane (task detail or environment); the other pane expands to full width\n\n### Dispute Detail Page\n- **Clear Tool Search**: Adds a clear `X` button to the tool search box when it has text\n- **Copy Verifier Output**: Add a copy button after Stdout or Score; when checklist Raw Output is expanded, a copy icon beside Raw Output copies the raw pre text\n- **Dispute Screenshot Upload Improvement**: Drag & Drop/Upload plus Paste Image (clipboard API) in one row; document paste; forwards images to the hidden native file input without duplicate controls after thumbnails appear\n- **Dispute Tool Environment Gate**: Detects tool environment readiness for dispute detail pages\n- **Environment Verifier Tab**: Adds Environment | Verifier tabs on the instance status bar (beside Start Recording / Reset / Run Verifier) and shows searchable verifier source; switches only the iframe stack\n- **Tool Favorites**: Add favorite stars to tools list\n- **Tool Description Truncation**: Limits the length tool descriptions to make the tool picker more manageable\n- **Tool Results Resize Handle**: Adds a resize handle to tool result boxes so their height can be adjusted by dragging\n- **Verifier Expand Mismatch Rows**: Expands Per-Field Comparison rows that failed (red X) so Expected vs Your Answer is visible without clicking each field\n- **VM Clipboard**: Extract/Overwrite VM Clipboard controls after the Computer Use badge (shown when FOS env is ready)\n- **FOS Viewport Resize**: Resizes the embedded FOS environment to the viewport. Autoconnects the instance and open-in-new-tab URL; reconnects when the tab is focused again\n\n### Session Trace Review Page\n- **Auto-expand Verifier Output**: Expands the Verifier Output section on load by activating the score/timing header once (same as a user click)\n- **Remember Layout Proportions**: Saves and restores the task-stack vs trace, prompt vs comments, and transcript vs screenshot splits\n\n### Guidelines\n- **Export Guideline Markdown**: Download the open guideline as a Markdown file from the edit toolbar\n- **Guideline Theme Presets**: Apply named text themes from the edit toolbar\n\n### Task View\n*No production plugins are configured for this archetype.*\n"};
    const BUNDLED_PLUGIN_FACTORIES = {
        "core/main/ui-lib.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {
// ui-lib.js — shared UI tokens, button styles, spinners, and copy feedback.
// Loaded first among core plugins; registers Context.uiLib and Context.buttonFeedback.

const FLEET_UI_STYLE_ID = 'fleet-ui-styles';
const FLEET_UI_SCOPED_STYLE_PREFIX = 'fleet-ui-btn-scope-';
const FLEET_UI_PANEL_STYLE_ID = 'fleet-ui-panel-styles';
const FLEET_UI_PANEL_SCOPED_PREFIX = 'fleet-ui-panel-scope-';
const FLEET_UI_SEGMENT_STYLE_ID = 'fleet-ui-segment-styles';
const FLEET_UI_SEGMENT_SCOPED_PREFIX = 'fleet-ui-seg-scope-';
const FLEET_UI_FILTER_TOGGLE_STYLE_ID = 'fleet-ui-filter-toggle-styles';
const FLEET_UI_FILTER_TOGGLE_SCOPED_PREFIX = 'fleet-ui-ft-scope-';
const FLEET_UI_ALERT_BANNER_STYLE_ID = 'fleet-ui-alert-banner-styles';
const FLEET_UI_USER_STORY_PROSE_STYLE_ID = 'fleet-ui-user-story-prose';
const FLEET_UI_THEME_OVERRIDE_STYLE_ID = 'fleet-ui-theme-overrides';
const FLEET_UI_THEME_MODE_KEY = 'extension-theme-mode';
const FLEET_UI_THEME_MODES = ['match', 'light', 'dark'];
/** Shared accent for Preferred chrome (segments, primary buttons, brand-tinted controls). */
const FLEET_UI_ACCENT = '#2563eb';
const FLEET_UI_ACCENT_FG = '#ffffff';
/** Border color for buttons that only ship on dev-branch builds (`data-fleet-dev`). */
const FLEET_UI_DEV_BTN_BORDER = '#ea580c';

const FLASH_PULSE_MS = 600;
const FLASH_PULSE_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';
const COPY_SUCCESS_MS = FLASH_PULSE_MS;
const COPY_FAILURE_MS = FLASH_PULSE_MS;
const COPY_SUCCESS_BG = 'rgb(34, 197, 94)';
const COPY_FAILURE_BG = 'rgb(239, 68, 68)';
const SPIN_DURATION = '0.7s';
const TAB_PULSE_MS = FLASH_PULSE_MS;
const FLASH_CLASS_SUCCESS = 'fleet-ui-flash--success';
const FLASH_CLASS_FAILURE = 'fleet-ui-flash--failure';

/** Panel kit class names (theme-aware floating chrome). */
const PANEL_CLASSES = {
    root: 'fleet-ui-panel',
    header: 'fleet-ui-panel__header',
    title: 'fleet-ui-panel__title',
    sectionLabel: 'fleet-ui-panel__section-label',
    muted: 'fleet-ui-panel__muted',
    strong: 'fleet-ui-panel__strong',
    btn: 'fleet-ui-panel__btn',
    textarea: 'fleet-ui-panel__textarea',
    chip: 'fleet-ui-panel__chip',
    chipSep: 'fleet-ui-panel__chip-sep',
    toast: 'fleet-ui-panel__toast',
    resize: 'fleet-ui-panel__resize',
    divider: 'fleet-ui-panel__divider',
    ghostBtn: 'fleet-ui-panel__ghost-btn'
};

/**
 * Preferred-mode alert banners (session refresh, update notice, ops credential gaps).
 * Variants: danger (red), amber, amberSoft.
 */
const ALERT_BANNER_CLASSES = {
    root: 'fleet-ui-alert-banner',
    danger: 'fleet-ui-alert-banner--danger',
    amber: 'fleet-ui-alert-banner--amber',
    amberSoft: 'fleet-ui-alert-banner--amber-soft',
    title: 'fleet-ui-alert-banner__title',
    body: 'fleet-ui-alert-banner__body',
    footer: 'fleet-ui-alert-banner__footer',
    btnSecondary: 'fleet-ui-alert-banner__btn-secondary',
    btnPrimary: 'fleet-ui-alert-banner__btn-primary'
};

/** Exclusive connected segment control (Match/Light/Dark, Diff Viewer On/Off, Clear/Add). */
const SEGMENT_CLASSES = {
    group: 'fleet-ui-seg-group',
    groupFill: 'fleet-ui-seg-group--fill',
    groupCompact: 'fleet-ui-seg-group--compact',
    btn: 'fleet-ui-seg-btn',
    btnDivider: 'fleet-ui-seg-btn--divider'
};

/** Multi-select filter pills (Ops Dashboard Task Creation / QA / …). */
const FILTER_TOGGLE_CLASSES = {
    btn: 'fleet-ui-filter-toggle'
};

let _fleetThemeListeners = [];
let _fleetThemeObserverStarted = false;
let _fleetLastDark = null;

const BTN_VARIANTS = {
    primary: 'wf-dash-btn--primary',
    secondary: 'wf-dash-btn--secondary',
    tertiary: 'wf-dash-btn--basic',
    basic: 'wf-dash-btn--basic',
    danger: 'wf-dash-btn--danger',
    success: 'wf-dash-btn--success',
    warning: 'wf-dash-btn--warning'
};

const BTN_SIZES = {
    nav: 'wf-dash-btn--nav',
    regular: 'wf-dash-btn--regular',
    icon: 'wf-dash-btn--icon',
    compact: 'wf-dash-btn--compact'
};

function fleetUiScopeStyleId(scopeSelector) {
    const slug = String(scopeSelector || '')
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48) || 'root';
    return FLEET_UI_SCOPED_STYLE_PREFIX + slug;
}

function fleetUiPanelScopeStyleId(scopeSelector) {
    const slug = String(scopeSelector || '')
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48) || 'root';
    return FLEET_UI_PANEL_SCOPED_PREFIX + slug;
}

function fleetUiSegmentScopeStyleId(scopeSelector) {
    const slug = String(scopeSelector || '')
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48) || 'root';
    return FLEET_UI_SEGMENT_SCOPED_PREFIX + slug;
}

function fleetUiFilterToggleScopeStyleId(scopeSelector) {
    const slug = String(scopeSelector || '')
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48) || 'root';
    return FLEET_UI_FILTER_TOGGLE_SCOPED_PREFIX + slug;
}

function fleetUiSiteIsDark() {
    return document.documentElement.classList.contains('dark');
}

function fleetUiNormalizeThemeMode(mode) {
    const m = String(mode || '').toLowerCase();
    return FLEET_UI_THEME_MODES.includes(m) ? m : 'match';
}

function fleetUiGetThemeMode() {
    try {
        if (typeof Storage !== 'undefined' && Storage.get) {
            return fleetUiNormalizeThemeMode(Storage.get(FLEET_UI_THEME_MODE_KEY, 'match'));
        }
    } catch (_) { /* ignore */ }
    return 'match';
}

function fleetUiResolveTheme() {
    const mode = fleetUiGetThemeMode();
    if (mode === 'light') return 'light';
    if (mode === 'dark') return 'dark';
    return fleetUiSiteIsDark() ? 'dark' : 'light';
}

function fleetUiIsFleetDark() {
    return fleetUiResolveTheme() === 'dark';
}

function fleetUiGetFleetTheme() {
    return fleetUiResolveTheme();
}

/** Opaque Preferred-mode palette for Settings / injected chrome (not host CSS vars). */
function fleetUiChromeColors() {
    if (fleetUiIsFleetDark()) {
        return {
            bg: '#18181b',
            card: '#27272a',
            // Match Ops modal/gutter bg so task cards align with the shell T-shape.
            taskCard: '#18181b',
            hover: '#3f3f46',
            border: '#3f3f46',
            borderHover: '#52525b',
            fg: '#e4e4e7',
            muted: '#a1a1aa'
        };
    }
    return {
        bg: '#ffffff',
        card: '#fafafa',
        // Match Ops modal/gutter bg so task cards align with the shell T-shape.
        taskCard: '#ffffff',
        hover: '#f0f0f0',
        border: '#e5e5e5',
        borderHover: '#d1d5db',
        fg: '#333333',
        muted: '#666666'
    };
}

function fleetUiThemeChromeRootsSelector() {
    return [
        '.fleet-ui-panel',
        '.fleet-ui-panel__chip',
        '.fleet-ui-panel__toast',
        '#wf-settings-modal',
        '#wf-dash-modal',
        '#wf-dev-log-panel',
        '#wf-dev-log-toggle',
        '#fleet-vnc-helper',
        '#fleet-vnc-helper-tab',
        '#fleet-env-helper',
        '#fleet-env-helper-tab'
    ].join(', ');
}

function fleetUiThemeOverrideCssText() {
    const roots = fleetUiThemeChromeRootsSelector();
    const rootsAndDescendants = roots
        .split(', ')
        .flatMap((sel) => [sel, sel + ' *'])
        .join(', ');
    return [
        // Preferred light tokens match Settings chromeColors() light palette.
        'html[data-fleet-ux-theme="light"] ' + rootsAndDescendants + ' {',
        '  --background: #ffffff !important;',
        '  --card: #fafafa !important;',
        '  --foreground: #333333 !important;',
        '  --border: #e5e5e5 !important;',
        '  --muted: #f0f0f0 !important;',
        '  --muted-foreground: #666666 !important;',
        '  --input: #e5e5e5 !important;',
        // Keep filled controls on the extension accent (not host indigo/--primary-foreground).
        '  --brand: ' + FLEET_UI_ACCENT + ' !important;',
        '  --primary: ' + FLEET_UI_ACCENT + ' !important;',
        '  --primary-foreground: ' + FLEET_UI_ACCENT_FG + ' !important;',
        '}',
        'html[data-fleet-ux-theme="dark"] ' + rootsAndDescendants + ' {',
        '  --background: #121212 !important;',
        '  --card: #1a1a1c !important;',
        '  --foreground: #f5f5f5 !important;',
        '  --border: #262626 !important;',
        '  --muted: #171717 !important;',
        '  --muted-foreground: #8c8c8c !important;',
        '  --input: #262626 !important;',
        '  --brand: ' + FLEET_UI_ACCENT + ' !important;',
        '  --primary: ' + FLEET_UI_ACCENT + ' !important;',
        '  --primary-foreground: ' + FLEET_UI_ACCENT_FG + ' !important;',
        '}'
    ].join('\n');
}

function fleetUiEnsureThemeOverrideStyles() {
    let style = document.getElementById(FLEET_UI_THEME_OVERRIDE_STYLE_ID);
    if (!style) {
        style = document.createElement('style');
        style.id = FLEET_UI_THEME_OVERRIDE_STYLE_ID;
    }
    style.textContent = fleetUiThemeOverrideCssText();
    // Keep after site CSS so Preferred tokens win cascade order as well as specificity.
    (document.head || document.documentElement).appendChild(style);
}

function fleetUiSyncThemeDataset(forceNotify) {
    const theme = fleetUiResolveTheme();
    const dark = theme === 'dark';
    try {
        document.documentElement.dataset.fleetUxTheme = theme;
    } catch (_) { /* ignore */ }
    fleetUiEnsureThemeOverrideStyles();
    if (forceNotify || _fleetLastDark !== dark) {
        _fleetLastDark = dark;
        const payload = { theme, dark };
        for (const fn of _fleetThemeListeners) {
            try {
                fn(payload);
            } catch (err) {
                Logger.warn('theme listener failed', err);
            }
        }
    }
}

function fleetUiSetThemeMode(mode) {
    const next = fleetUiNormalizeThemeMode(mode);
    try {
        if (typeof Storage !== 'undefined' && Storage.set) {
            Storage.set(FLEET_UI_THEME_MODE_KEY, next);
        }
    } catch (err) {
        Logger.warn('failed to persist theme mode', err);
    }
    fleetUiSyncThemeDataset(true);
    Logger.log('preferred mode → ' + next);
    return next;
}

function fleetUiNotifyThemeChange() {
    fleetUiSyncThemeDataset(false);
}

function fleetUiEnsureThemeObserver() {
    if (_fleetThemeObserverStarted) return;
    _fleetThemeObserverStarted = true;
    fleetUiSyncThemeDataset(true);
    try {
        const observer = new MutationObserver(() => {
            if (fleetUiGetThemeMode() !== 'match') return;
            fleetUiNotifyThemeChange();
        });
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        if (typeof CleanupRegistry !== 'undefined' && CleanupRegistry.registerObserver) {
            CleanupRegistry.registerObserver(observer);
        }
    } catch (err) {
        Logger.warn('fleet theme observer failed', err);
    }
}

function fleetUiOnThemeChange(callback) {
    if (typeof callback !== 'function') return () => {};
    fleetUiEnsureThemeObserver();
    _fleetThemeListeners.push(callback);
    return () => {
        _fleetThemeListeners = _fleetThemeListeners.filter((fn) => fn !== callback);
    };
}

function fleetUiPanelCssLines(scopePrefix) {
    const p = scopePrefix || '';
    const root = p + '.fleet-ui-panel';
    const header = p + '.fleet-ui-panel__header';
    const title = p + '.fleet-ui-panel__title';
    const sectionLabel = p + '.fleet-ui-panel__section-label';
    const muted = p + '.fleet-ui-panel__muted';
    const strong = p + '.fleet-ui-panel__strong';
    const btn = p + '.fleet-ui-panel__btn';
    const textarea = p + '.fleet-ui-panel__textarea';
    const chip = p + '.fleet-ui-panel__chip';
    const chipSep = p + '.fleet-ui-panel__chip-sep';
    const toast = p + '.fleet-ui-panel__toast';
    const resize = p + '.fleet-ui-panel__resize';
    const divider = p + '.fleet-ui-panel__divider';
    const ghostBtn = p + '.fleet-ui-panel__ghost-btn';

    return [
        root + ' {',
        '  color: var(--foreground, #0f172a);',
        '  background: var(--card, var(--background, #ffffff));',
        '  border: 1px solid var(--border, #e2e8f0);',
        '  border-radius: 10px;',
        '  box-shadow: 0 12px 40px color-mix(in srgb, var(--foreground, #0f172a) 18%, transparent);',
        '  overflow: hidden;',
        '  font: 13px/1.45 system-ui, Segoe UI, sans-serif;',
        '}',
        header + ' {',
        '  display: flex;',
        '  align-items: center;',
        '  gap: 8px;',
        '  padding: 8px 10px 8px 12px;',
        '  font-weight: 600;',
        '  font-size: 12px;',
        '  letter-spacing: 0.02em;',
        '  color: var(--foreground, #0f172a);',
        '  background: color-mix(in srgb, var(--muted, #f1f5f9) 80%, transparent);',
        '  border-bottom: 1px solid var(--border, #e2e8f0);',
        '  flex-shrink: 0;',
        '}',
        title + ' {',
        '  flex: 1;',
        '  min-width: 0;',
        '  font-weight: 600;',
        '  font-size: 12px;',
        '}',
        sectionLabel + ' {',
        '  font-size: 11px;',
        '  font-weight: 600;',
        '  color: var(--muted-foreground, #64748b);',
        '  letter-spacing: 0.03em;',
        '  text-transform: uppercase;',
        '  user-select: none;',
        '}',
        muted + ' {',
        '  color: var(--muted-foreground, #64748b);',
        '}',
        strong + ' {',
        '  color: var(--foreground, #0f172a);',
        '  font-weight: 600;',
        '}',
        btn + ' {',
        '  margin: 0;',
        '  padding: 6px 8px;',
        '  border-radius: 6px;',
        '  border: 1px solid var(--border, #e2e8f0);',
        '  background: var(--background, #fff);',
        '  color: var(--foreground, #0f172a);',
        '  font: inherit;',
        '  font-size: 11px;',
        '  font-weight: 500;',
        '  cursor: pointer;',
        '  transition: background 0.15s, border-color 0.15s, color 0.15s;',
        '}',
        btn + ':hover:not(:disabled) {',
        '  background: var(--muted, #f1f5f9);',
        '  border-color: var(--foreground, #0f172a);',
        '}',
        textarea + ' {',
        '  box-sizing: border-box;',
        '  width: 100%;',
        '  padding: 8px;',
        '  border-radius: 6px;',
        '  border: 1px solid var(--border, #e2e8f0);',
        '  background: var(--background, #fff);',
        '  color: var(--foreground, #0f172a);',
        '  font: inherit;',
        '  resize: vertical;',
        '  overflow-y: auto;',
        '}',
        chip + ' {',
        '  display: flex;',
        '  align-items: stretch;',
        '  padding: 0;',
        '  font-size: 12px;',
        '  border-radius: 10px;',
        '  border: 1px solid var(--border, #e2e8f0);',
        '  background: color-mix(in srgb, var(--background, white) 30%, transparent);',
        '  color: var(--foreground, #0f172a);',
        '  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);',
        '  overflow: hidden;',
        '  transition: background 0.2s ease, box-shadow 0.2s ease;',
        '}',
        chip + ':hover {',
        '  background: var(--background, white);',
        '  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);',
        '}',
        chip + ' button {',
        '  margin: 0;',
        '  padding: 6px 10px;',
        '  border: none;',
        '  background: transparent;',
        '  color: inherit;',
        '  font: inherit;',
        '  font-size: 12px;',
        '  cursor: pointer;',
        '}',
        chipSep + ' {',
        '  border-left: 1px solid var(--border, #e2e8f0) !important;',
        '  padding: 6px 8px !important;',
        '  font-size: 13px !important;',
        '  line-height: 1 !important;',
        '}',
        toast + ' {',
        '  background: var(--card, var(--background, #fff));',
        '  color: var(--foreground, #0f172a);',
        '  border: 1px solid var(--border, #e2e8f0);',
        '  font: 12px/1.4 system-ui, Segoe UI, sans-serif;',
        '  padding: 10px 12px;',
        '  border-radius: 8px;',
        '  box-shadow: 0 4px 16px color-mix(in srgb, var(--foreground, #0f172a) 16%, transparent);',
        '  max-width: min(420px, 92vw);',
        '  word-break: break-word;',
        '  white-space: pre-wrap;',
        '}',
        resize + ' {',
        '  position: absolute;',
        '  right: 2px;',
        '  bottom: 2px;',
        '  width: 14px;',
        '  height: 14px;',
        '  cursor: se-resize;',
        '  background: transparent;',
        '  border-right: 2px solid var(--muted-foreground, #94a3b8);',
        '  border-bottom: 2px solid var(--muted-foreground, #94a3b8);',
        '  border-radius: 0 0 8px 0;',
        '  z-index: 1;',
        '}',
        divider + ' {',
        '  border-top: 1px solid var(--border, #e2e8f0);',
        '}',
        ghostBtn + ' {',
        '  margin: 0;',
        '  padding: 2px 8px;',
        '  border-radius: 6px;',
        '  border: 1px solid var(--border, #e2e8f0);',
        '  background: transparent;',
        '  color: var(--muted-foreground, #64748b);',
        '  font: inherit;',
        '  font-size: 10px;',
        '  font-weight: 500;',
        '  cursor: pointer;',
        '}',
        ghostBtn + ':hover:not(:disabled) {',
        '  background: var(--muted, #f1f5f9);',
        '  color: var(--foreground, #0f172a);',
        '}',
        'html[data-fleet-ux-theme="dark"] ' + root + ' {',
        '  background: color-mix(in srgb, var(--card, #1a1a1c) 82%, #fff);',
        '  border-color: color-mix(in srgb, var(--border, #262626) 45%, #737373);',
        '  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.55);',
        '}',
        'html[data-fleet-ux-theme="dark"] ' + header + ' {',
        '  background: color-mix(in srgb, var(--foreground, #f5f5f5) 8%, transparent);',
        '  border-bottom-color: color-mix(in srgb, var(--border, #262626) 45%, #737373);',
        '}',
        'html[data-fleet-ux-theme="dark"] ' + chip + ' {',
        '  background: color-mix(in srgb, var(--background, white) 30%, transparent);',
        '  border-color: color-mix(in srgb, var(--border, #262626) 45%, #737373);',
        '  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);',
        '}',
        'html[data-fleet-ux-theme="dark"] ' + chip + ':hover {',
        '  background: var(--background, white);',
        '  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);',
        '}',
        'html[data-fleet-ux-theme="dark"] ' + toast + ' {',
        '  background: color-mix(in srgb, var(--card, #1a1a1c) 82%, #fff);',
        '  border-color: color-mix(in srgb, var(--border, #262626) 45%, #737373);',
        '  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);',
        '}',
        'html[data-fleet-ux-theme="dark"] ' + btn + ',',
        'html[data-fleet-ux-theme="dark"] ' + textarea + ' {',
        '  background: var(--background, #121212);',
        '  border-color: color-mix(in srgb, var(--border, #262626) 45%, #737373);',
        '}',
        p + '.fleet-ui-log--error { color: #dc2626; }',
        'html[data-fleet-ux-theme="dark"] ' + p + '.fleet-ui-log--error { color: #fca5a5; }',
        p + '.fleet-ui-log--warn { color: #ca8a04; }',
        'html[data-fleet-ux-theme="dark"] ' + p + '.fleet-ui-log--warn { color: #facc15; }',
        p + '.fleet-ui-log--debug { color: #2563eb; }',
        'html[data-fleet-ux-theme="dark"] ' + p + '.fleet-ui-log--debug { color: #93c5fd; }',
        p + '.fleet-ui-log--info { color: #059669; }',
        'html[data-fleet-ux-theme="dark"] ' + p + '.fleet-ui-log--info { color: #6ee7b7; }',
        p + '.fleet-ui-log-entry:hover {',
        '  background: color-mix(in srgb, var(--foreground, #0f172a) 6%, transparent);',
        '}'
    ];
}

function fleetUiAlertBannerCssLines() {
    const root = '.fleet-ui-alert-banner';
    const danger = root + '--danger';
    const amber = root + '--amber';
    const amberSoft = root + '--amber-soft';
    const title = root + '__title';
    const body = root + '__body';
    const footer = root + '__footer';
    const btnSec = root + '__btn-secondary';
    const btnPri = root + '__btn-primary';
    const dark = (sel) => 'html[data-fleet-ux-theme="dark"] ' + sel;
    return [
        danger + ' {',
        '  margin-bottom: 4px; padding: 14px; padding-top: 20px;',
        '  background: #fee2e2; border: 2px solid #dc2626; border-radius: 8px;',
        '}',
        danger + ' ' + title + ',',
        danger + ' ' + body + ',',
        danger + ' ' + body + ' a { color: #991b1b; }',
        danger + ' ' + body + ' a { text-decoration: underline; font-weight: 600; }',
        danger + ' ' + footer + ' {',
        '  margin-top: 12px; padding-top: 10px; border-top: 1px solid #fecaca;',
        '  text-align: center; display: flex; flex-wrap: wrap; gap: 8px; justify-content: center;',
        '}',
        danger + ' ' + btnSec + ',',
        danger + ' ' + btnPri + ' {',
        '  display: inline-block; padding: 8px 14px; font-size: 13px; font-weight: 600;',
        '  border-radius: 6px; cursor: pointer; border: 1px solid #dc2626;',
        '  text-decoration: none;',
        '}',
        danger + ' ' + btnSec + ' { color: #991b1b; background: #fef2f2; }',
        danger + ' ' + btnPri + ' { color: #fff; background: #dc2626; }',
        dark(danger) + ' {',
        '  background: color-mix(in srgb, #dc2626 22%, var(--background, #121212));',
        '}',
        dark(danger + ' ' + title) + ',',
        dark(danger + ' ' + body) + ',',
        dark(danger + ' ' + body + ' a') + ' { color: #fca5a5; }',
        dark(danger + ' ' + footer) + ' { border-top-color: #7f1d1d; }',
        dark(danger + ' ' + btnSec) + ' {',
        '  color: #fecaca; background: color-mix(in srgb, #dc2626 28%, var(--background, #121212));',
        '}',
        amber + ',',
        amberSoft + ' {',
        '  margin-bottom: 20px; padding: 14px;',
        '  background: #fef3c7; border: 2px solid #f59e0b; border-radius: 8px;',
        '}',
        amberSoft + ' {',
        '  padding: 12px; border-width: 1px; border-radius: 6px;',
        '}',
        amber + ' ' + title + ',',
        amber + ' ' + body + ',',
        amber + ' ' + body + ' a,',
        amberSoft + ' ' + title + ',',
        amberSoft + ' ' + body + ',',
        amberSoft + ' ' + body + ' a { color: #92400e; }',
        amber + ' ' + body + ' a,',
        amberSoft + ' ' + body + ' a { text-decoration: underline; font-weight: 600; }',
        amber + ' ' + footer + ',',
        amberSoft + ' ' + footer + ' {',
        '  margin-top: 12px; padding-top: 10px; border-top: 1px solid #fcd34d;',
        '  text-align: center; display: flex; flex-wrap: wrap; gap: 8px; justify-content: center;',
        '}',
        amber + ' ' + btnSec + ',',
        amberSoft + ' ' + btnSec + ' {',
        '  display: inline-block; padding: 8px 14px; font-size: 13px; font-weight: 600;',
        '  border-radius: 6px; cursor: pointer; border: 1px solid #f59e0b;',
        '  color: #92400e; background: #fffbeb; text-decoration: none;',
        '}',
        dark(amber) + ',',
        dark(amberSoft) + ' {',
        '  color: #fcd34d;',
        '  background: color-mix(in srgb, #f59e0b 22%, var(--background, #121212));',
        '}',
        dark(amber + ' ' + title) + ',',
        dark(amber + ' ' + body) + ',',
        dark(amber + ' ' + body + ' a') + ',',
        dark(amberSoft + ' ' + title) + ',',
        dark(amberSoft + ' ' + body) + ',',
        dark(amberSoft + ' ' + body + ' a') + ' { color: #fcd34d; }',
        dark(amber + ' ' + footer) + ',',
        dark(amberSoft + ' ' + footer) + ' { border-top-color: #92400e; }',
        dark(amber + ' ' + btnSec) + ',',
        dark(amberSoft + ' ' + btnSec) + ' {',
        '  color: #fef3c7; background: color-mix(in srgb, #f59e0b 28%, var(--background, #121212));',
        '}'
    ];
}

function fleetUiBtnBaseCssLines(scopePrefix) {
    const p = scopePrefix ? scopePrefix + ' ' : '';
    const btn = p + '.wf-dash-btn';
    const nav = p + '.wf-dash-btn--nav';
    const regular = p + '.wf-dash-btn--regular';
    const compact = p + '.wf-dash-btn--compact';
    const icon = p + '.wf-dash-btn--icon';
    const full = p + '.wf-dash-btn--full';
    const primary = p + '.wf-dash-btn--primary';
    const secondary = p + '.wf-dash-btn--secondary';
    const tertiary = p + '.wf-dash-btn--basic';
    const danger = p + '.wf-dash-btn--danger';
    const success = p + '.wf-dash-btn--success';
    const warning = p + '.wf-dash-btn--warning';
    const headerBasic = p + '.wf-dash-header-btn.wf-dash-btn--basic';
    const light = (sel) => 'html[data-fleet-ux-theme="light"] ' + sel;
    const dark = (sel) => 'html[data-fleet-ux-theme="dark"] ' + sel;

    return [
        btn + ' {',
        '  appearance: none;',
        '  -webkit-appearance: none;',
        '  box-sizing: border-box;',
        '  margin: 0;',
        '  font-family: inherit;',
        '  font-weight: 600;',
        '  border-radius: 6px;',
        '  cursor: pointer;',
        '  transition: background 0.15s, border-color 0.15s, color 0.15s, opacity 0.15s;',
        '  white-space: nowrap;',
        '  display: inline-flex;',
        '  align-items: center;',
        '  justify-content: center;',
        '  line-height: 1.4;',
        '  text-decoration: none;',
        '}',
        nav + ' { padding: 4px 10px; font-size: 11px; }',
        regular + ' { padding: 7px 14px; font-size: 12px; }',
        compact + ' { padding: 2px 10px; font-size: 11px; }',
        icon + ' { width: 26px; height: 26px; padding: 0; font-size: 13px; flex-shrink: 0; }',
        full + ' { width: 100%; box-sizing: border-box; }',
        primary + ' {',
        '  border: 1px solid var(--brand, var(--primary, ' + FLEET_UI_ACCENT + '));',
        '  background: var(--brand, var(--primary, ' + FLEET_UI_ACCENT + '));',
        '  color: var(--primary-foreground, ' + FLEET_UI_ACCENT_FG + ');',
        '}',
        primary + ':hover:not(:disabled) {',
        '  background: color-mix(in srgb, var(--brand, ' + FLEET_UI_ACCENT + ') 88%, #000);',
        '  border-color: color-mix(in srgb, var(--brand, ' + FLEET_UI_ACCENT + ') 88%, #000);',
        '  color: ' + FLEET_UI_ACCENT_FG + ';',
        '}',
        secondary + ' {',
        '  border: 1px solid var(--brand, var(--primary, ' + FLEET_UI_ACCENT + '));',
        '  background: var(--background, #fff);',
        '  color: var(--foreground, #0f172a);',
        '}',
        secondary + ':hover:not(:disabled) {',
        '  background: color-mix(in srgb, var(--brand, ' + FLEET_UI_ACCENT + ') 10%, var(--background, #fff));',
        '  border-color: var(--brand, var(--primary, ' + FLEET_UI_ACCENT + '));',
        '  color: var(--foreground, #0f172a);',
        '}',
        tertiary + ' {',
        '  border: 1px solid var(--border, #e2e8f0);',
        '  background: var(--background, #fff);',
        '  color: var(--muted-foreground, #64748b);',
        '}',
        tertiary + ':hover:not(:disabled) {',
        '  background: var(--muted, #f1f5f9);',
        '  border-color: var(--foreground, #0f172a);',
        '  color: var(--foreground, #0f172a);',
        '}',
        tertiary + '.wf-dash-btn--icon {',
        '  border: none;',
        '  background: color-mix(in srgb, #000000 15%, transparent);',
        '}',
        tertiary + '.wf-dash-btn--icon:hover:not(:disabled) {',
        '  background: color-mix(in srgb, #ffffff 5%, transparent);',
        '  border: none;',
        '  color: var(--foreground, #0f172a);',
        '}',
        primary + ':disabled, ' + secondary + ':disabled {',
        '  cursor: not-allowed;',
        '  border: 1px solid var(--border, #e2e8f0);',
        '  background: var(--muted, #f1f5f9);',
        '  color: var(--muted-foreground, #94a3b8);',
        '  opacity: 0.85;',
        '}',
        tertiary + ':disabled {',
        '  cursor: not-allowed;',
        '  border: 1px solid var(--border, #e2e8f0);',
        '  background: var(--muted, #f1f5f9);',
        '  color: var(--muted-foreground, #94a3b8);',
        '  opacity: 0.85;',
        '}',
        tertiary + '.wf-dash-btn--icon:disabled {',
        '  border: none;',
        '  background: color-mix(in srgb, #000000 15%, transparent);',
        '}',
        btn + ':disabled[aria-busy="true"] { opacity: 0.65; cursor: wait; }',
        headerBasic + ' { color: var(--muted-foreground, #64748b); }',
        headerBasic + ':hover:not(:disabled) {',
        '  color: var(--foreground, #0f172a);',
        '  border-color: var(--foreground, #0f172a);',
        '}',
        // Preferred-opaque recipes (do not trust host CSS vars alone)
        light(primary) + ' {',
        '  border-color: ' + FLEET_UI_ACCENT + ';',
        '  background: ' + FLEET_UI_ACCENT + ';',
        '  color: ' + FLEET_UI_ACCENT_FG + ';',
        '}',
        light(primary) + ':hover:not(:disabled) {',
        '  background: color-mix(in srgb, ' + FLEET_UI_ACCENT + ' 88%, #000);',
        '  border-color: color-mix(in srgb, ' + FLEET_UI_ACCENT + ' 88%, #000);',
        '  color: ' + FLEET_UI_ACCENT_FG + ';',
        '}',
        light(secondary) + ' {',
        '  border-color: ' + FLEET_UI_ACCENT + ';',
        '  background: #ffffff;',
        '  color: #111111;',
        '}',
        light(secondary) + ':hover:not(:disabled) {',
        '  background: color-mix(in srgb, ' + FLEET_UI_ACCENT + ' 10%, #ffffff);',
        '  border-color: ' + FLEET_UI_ACCENT + ';',
        '  color: #111111;',
        '}',
        light(tertiary) + ' {',
        '  border-color: #e5e5e5;',
        '  background: #ffffff;',
        '  color: #666666;',
        '}',
        light(tertiary) + ':hover:not(:disabled) {',
        '  background: #f0f0f0;',
        '  border-color: #333333;',
        '  color: #333333;',
        '}',
        light(tertiary + '.wf-dash-btn--icon') + ' {',
        '  border: none;',
        '  background: color-mix(in srgb, #000000 15%, transparent);',
        '  color: #666666;',
        '}',
        light(tertiary + '.wf-dash-btn--icon:hover:not(:disabled)') + ' {',
        '  background: color-mix(in srgb, #ffffff 5%, transparent);',
        '  color: #333333;',
        '}',
        light(tertiary + '.wf-dash-btn--icon:disabled') + ' {',
        '  border: none;',
        '  background: color-mix(in srgb, #000000 15%, transparent);',
        '  color: #999999;',
        '}',
        light(danger) + ' {',
        '  border: 1px solid #dc2626;',
        '  background: transparent;',
        '  color: #dc2626;',
        '}',
        light(danger) + ':hover:not(:disabled) {',
        '  background: #fee2e2;',
        '  border-color: #b91c1c;',
        '  color: #b91c1c;',
        '}',
        light(success) + ' {',
        '  border: 1px solid #16a34a;',
        '  background: transparent;',
        '  color: #16a34a;',
        '}',
        light(success) + ':hover:not(:disabled) {',
        '  background: #16a34a;',
        '  border-color: #16a34a;',
        '  color: #ffffff;',
        '}',
        light(warning) + ' {',
        '  border: 1px solid #ca8a04;',
        '  background: color-mix(in srgb, #ca8a04 14%, transparent);',
        '  color: #a16207;',
        '}',
        light(warning) + ':hover:not(:disabled) {',
        '  background: #ca8a04;',
        '  border-color: #ca8a04;',
        '  color: #ffffff;',
        '}',
        light(primary + ':disabled') + ', ' + light(secondary + ':disabled') + ', ' + light(tertiary + ':disabled') + ', ' + light(danger + ':disabled') + ', ' + light(success + ':disabled') + ', ' + light(warning + ':disabled') + ' {',
        '  border-color: #e5e5e5;',
        '  background: #f0f0f0;',
        '  color: #999999;',
        '}',
        light(headerBasic) + ' { color: #666666; }',
        light(headerBasic) + ':hover:not(:disabled) { color: #111111; border-color: #111111; }',
        dark(primary) + ' {',
        '  border-color: ' + FLEET_UI_ACCENT + ';',
        '  background: ' + FLEET_UI_ACCENT + ';',
        '  color: ' + FLEET_UI_ACCENT_FG + ';',
        '}',
        dark(primary) + ':hover:not(:disabled) {',
        '  background: color-mix(in srgb, ' + FLEET_UI_ACCENT + ' 88%, #000);',
        '  border-color: color-mix(in srgb, ' + FLEET_UI_ACCENT + ' 88%, #000);',
        '  color: ' + FLEET_UI_ACCENT_FG + ';',
        '}',
        dark(secondary) + ' {',
        '  border-color: ' + FLEET_UI_ACCENT + ';',
        '  background: #18181b;',
        '  color: #e4e4e7;',
        '}',
        dark(secondary) + ':hover:not(:disabled) {',
        '  background: color-mix(in srgb, ' + FLEET_UI_ACCENT + ' 14%, #18181b);',
        '  border-color: ' + FLEET_UI_ACCENT + ';',
        '  color: #e4e4e7;',
        '}',
        dark(tertiary) + ' {',
        '  border-color: #3f3f46;',
        '  background: #18181b;',
        '  color: #a1a1aa;',
        '}',
        dark(tertiary) + ':hover:not(:disabled) {',
        '  background: #27272a;',
        '  border-color: #e4e4e7;',
        '  color: #e4e4e7;',
        '}',
        dark(tertiary + '.wf-dash-btn--icon') + ' {',
        '  border: none;',
        '  background: color-mix(in srgb, #000000 15%, transparent);',
        '  color: #a1a1aa;',
        '}',
        dark(tertiary + '.wf-dash-btn--icon:hover:not(:disabled)') + ' {',
        '  background: color-mix(in srgb, #ffffff 5%, transparent);',
        '  color: #e4e4e7;',
        '}',
        dark(tertiary + '.wf-dash-btn--icon:disabled') + ' {',
        '  border: none;',
        '  background: color-mix(in srgb, #000000 15%, transparent);',
        '  color: #71717a;',
        '}',
        dark(danger) + ' {',
        '  border: 1px solid #dc2626;',
        '  background: transparent;',
        '  color: #fca5a5;',
        '}',
        dark(danger) + ':hover:not(:disabled) {',
        '  background: color-mix(in srgb, #dc2626 22%, #18181b);',
        '  border-color: #f87171;',
        '  color: #fecaca;',
        '}',
        dark(success) + ' {',
        '  border: 1px solid #22c55e;',
        '  background: transparent;',
        '  color: #86efac;',
        '}',
        dark(success) + ':hover:not(:disabled) {',
        '  background: #16a34a;',
        '  border-color: #16a34a;',
        '  color: #ffffff;',
        '}',
        dark(warning) + ' {',
        '  border-color: #ca8a04;',
        '  background: color-mix(in srgb, #ca8a04 18%, transparent);',
        '  color: #fde68a;',
        '}',
        dark(warning) + ':hover:not(:disabled) {',
        '  background: #ca8a04;',
        '  border-color: #ca8a04;',
        '  color: #ffffff;',
        '}',
        dark(primary + ':disabled') + ', ' + dark(secondary + ':disabled') + ', ' + dark(tertiary + ':disabled') + ', ' + dark(danger + ':disabled') + ', ' + dark(success + ':disabled') + ', ' + dark(warning + ':disabled') + ' {',
        '  border-color: #3f3f46;',
        '  background: #27272a;',
        '  color: #71717a;',
        '}',
        dark(headerBasic) + ' { color: #a1a1aa; }',
        dark(headerBasic) + ':hover:not(:disabled) { color: #e4e4e7; border-color: #e4e4e7; }',
        // Dev-branch-only marker: border-color only (keep existing 1px thickness)
        btn + '[data-fleet-dev],'
            + btn + '[data-fleet-dev]:hover:not(:disabled),'
            + btn + '[data-fleet-dev]:disabled {',
        '  border-color: ' + FLEET_UI_DEV_BTN_BORDER + ';',
        '}',
        light(btn + '[data-fleet-dev]') + ','
            + light(btn + '[data-fleet-dev]:hover:not(:disabled)') + ','
            + light(btn + '[data-fleet-dev]:disabled') + ' {',
        '  border-color: ' + FLEET_UI_DEV_BTN_BORDER + ';',
        '}',
        dark(btn + '[data-fleet-dev]') + ','
            + dark(btn + '[data-fleet-dev]:hover:not(:disabled)') + ','
            + dark(btn + '[data-fleet-dev]:disabled') + ' {',
        '  border-color: ' + FLEET_UI_DEV_BTN_BORDER + ';',
        '}'
    ];
}

function fleetUiGlobalCssText() {
    return [
        '@keyframes fleet-ui-spin { to { transform: rotate(360deg); } }',
        '@keyframes wf-dash-spin { to { transform: rotate(360deg); } }',
        '@keyframes wf-ops-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }',
        '@keyframes fleet-prompt-cache-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }',
        '@keyframes fleet-ui-dots { 0%, 32% { content: \'.\'; } 33%, 65% { content: \'..\'; } 66%, 99% { content: \'...\'; } }',
        '@keyframes wf-dash-dots { 0%, 32% { content: \'.\'; } 33%, 65% { content: \'..\'; } 66%, 99% { content: \'...\'; } }',
        '[data-fleet-ui-dots]::after, [data-wf-dash-dots]::after {',
        '  display: inline;',
        '  content: \'.\';',
        '  animation: fleet-ui-dots 1.5s linear infinite;',
        '}',
        '.fleet-ui-spinner {',
        '  display: inline-block;',
        '  border-radius: 50%;',
        '  border: 2px solid color-mix(in srgb, var(--brand, var(--primary, #2563eb)) 22%, transparent);',
        '  border-top-color: var(--brand, var(--primary, #2563eb));',
        '  animation: fleet-ui-spin ' + SPIN_DURATION + ' linear infinite;',
        '  flex-shrink: 0;',
        '}',
        '@keyframes fleet-ui-tab-pulse {',
        '  0% {',
        '    background-color: transparent;',
        '    box-shadow: inset 0 -2px 0 0 transparent;',
        '    color: inherit;',
        '    border-bottom-color: inherit;',
        '  }',
        '  12% {',
        '    background-color: color-mix(in srgb, ' + COPY_SUCCESS_BG + ' 30%, transparent);',
        '    box-shadow: inset 0 -3px 0 0 ' + COPY_SUCCESS_BG + ';',
        '    color: ' + COPY_SUCCESS_BG + ' !important;',
        '    border-bottom-color: ' + COPY_SUCCESS_BG + ' !important;',
        '  }',
        '  100% {',
        '    background-color: transparent;',
        '    box-shadow: inset 0 -2px 0 0 transparent;',
        '    color: inherit;',
        '    border-bottom-color: inherit;',
        '  }',
        '}',
        '@keyframes fleet-ui-flash-success {',
        '  0% { background-color: transparent; color: inherit; border-color: inherit; }',
        '  12% {',
        '    background-color: color-mix(in srgb, ' + COPY_SUCCESS_BG + ' 30%, transparent);',
        '    color: ' + COPY_SUCCESS_BG + ' !important;',
        '    border-color: ' + COPY_SUCCESS_BG + ' !important;',
        '  }',
        '  100% { background-color: transparent; color: inherit; border-color: inherit; }',
        '}',
        '@keyframes fleet-ui-flash-failure {',
        '  0% { background-color: transparent; color: inherit; border-color: inherit; }',
        '  12% {',
        '    background-color: color-mix(in srgb, ' + COPY_FAILURE_BG + ' 30%, transparent);',
        '    color: ' + COPY_FAILURE_BG + ' !important;',
        '    border-color: ' + COPY_FAILURE_BG + ' !important;',
        '  }',
        '  100% { background-color: transparent; color: inherit; border-color: inherit; }',
        '}',
        '#wf-dash-modal [data-wf-dash-tab].fleet-ui-tab--pulse,',
        '#wf-dash-modal [data-wf-dash-tab].wf-dash-tab--add-pulse {',
        '  animation: fleet-ui-tab-pulse ' + FLASH_PULSE_MS + 'ms ' + FLASH_PULSE_EASING + ' 1;',
        '}',
        '.' + FLASH_CLASS_SUCCESS + ' {',
        '  animation: fleet-ui-flash-success ' + FLASH_PULSE_MS + 'ms ' + FLASH_PULSE_EASING + ' 1;',
        '}',
        '.' + FLASH_CLASS_FAILURE + ' {',
        '  animation: fleet-ui-flash-failure ' + FLASH_PULSE_MS + 'ms ' + FLASH_PULSE_EASING + ' 1;',
        '}'
    ].join('\n');
}

function fleetUiClearCopyFeedback(el) {
    if (!el) return;
    if (el._fleetUiCopyTimeout) {
        clearTimeout(el._fleetUiCopyTimeout);
        el._fleetUiCopyTimeout = null;
    }
    if (el._fleetUiFlashEndHandler) {
        el.removeEventListener('animationend', el._fleetUiFlashEndHandler);
        el._fleetUiFlashEndHandler = null;
    }
    el.classList.remove(FLASH_CLASS_SUCCESS, FLASH_CLASS_FAILURE);
    el.style.transition = '';
    el.style.backgroundColor = '';
    el.style.color = '';
    el.style.borderColor = '';
}

function fleetUiFinishPulseFlash(el, className) {
    if (!el) return;
    if (el._fleetUiCopyTimeout) {
        clearTimeout(el._fleetUiCopyTimeout);
        el._fleetUiCopyTimeout = null;
    }
    if (el._fleetUiFlashEndHandler) {
        el.removeEventListener('animationend', el._fleetUiFlashEndHandler);
        el._fleetUiFlashEndHandler = null;
    }
    el.classList.remove(className);
}

function fleetUiRunPulseFlash(el, kind, opts) {
    if (!el) return;
    const options = opts || {};
    const isFailure = kind === 'failure';
    const durationMs = isFailure
        ? (options.failureMs != null ? options.failureMs : COPY_FAILURE_MS)
        : (options.successMs != null ? options.successMs : COPY_SUCCESS_MS);
    const className = isFailure ? FLASH_CLASS_FAILURE : FLASH_CLASS_SUCCESS;
    fleetUiClearCopyFeedback(el);
    void el.offsetWidth;
    el.classList.add(className);
    const finish = () => fleetUiFinishPulseFlash(el, className);
    el._fleetUiFlashEndHandler = (e) => {
        if (e.target !== el) return;
        finish();
    };
    el.addEventListener('animationend', el._fleetUiFlashEndHandler);
    el._fleetUiCopyTimeout = setTimeout(finish, durationMs + 100);
}

function fleetUiFlashSuccess(el, opts) {
    fleetUiRunPulseFlash(el, 'success', opts);
}

function fleetUiFlashFailure(el, opts) {
    fleetUiRunPulseFlash(el, 'failure', opts);
}

async function fleetUiCopyText(text) {
    if (!text) return false;
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch (_e) { /* fall through */ }
    try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
    } catch (_e2) {
        return false;
    }
}

async function fleetUiCopyWithFeedback(el, text, opts) {
    const options = opts || {};
    const value = String(text == null ? '' : text).trim();
    if (!value) {
        fleetUiFlashFailure(el, options);
        if (options.logLabel) {
            Logger.warn('copy skipped (empty ' + options.logLabel + ')');
        }
        return false;
    }
    const ok = await fleetUiCopyText(value);
    if (ok) {
        fleetUiFlashSuccess(el, options);
        if (options.logLabel) {
            Logger.log('copied ' + options.logLabel + ' (' + value.length + ' chars)');
        }
    } else {
        fleetUiFlashFailure(el, options);
        if (options.logLabel) {
            Logger.warn('copy ' + options.logLabel + ' failed');
        }
    }
    return ok;
}

function fleetUiBtnClass(variant, size) {
    const v = BTN_VARIANTS[variant] || BTN_VARIANTS.basic;
    const s = BTN_SIZES[size] || BTN_SIZES.nav;
    return 'wf-dash-btn ' + v + ' ' + s;
}

function fleetUiEscapeAttr(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function fleetUiEscapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function fleetUiSegmentCssLines(prefix) {
    const p = prefix || '';
    const light = (sel) => 'html[data-fleet-ux-theme="light"] ' + sel;
    const dark = (sel) => 'html[data-fleet-ux-theme="dark"] ' + sel;
    const group = p + '.fleet-ui-seg-group';
    const btn = p + '.fleet-ui-seg-btn';
    return [
        group + ' {',
        '  display: inline-flex;',
        '  border-radius: 6px;',
        '  overflow: hidden;',
        '  border: 1px solid var(--border, #e2e8f0);',
        '  background: color-mix(in srgb, var(--foreground, #0f172a) 6%, var(--card, #fff));',
        '}',
        p + '.fleet-ui-seg-group--fill {',
        '  display: flex;',
        '  width: 100%;',
        '}',
        btn + ' {',
        '  padding: 5px 12px;',
        '  font-size: 12px;',
        '  font-weight: 600;',
        '  border: none;',
        '  cursor: pointer;',
        '  background: transparent;',
        '  color: var(--foreground, #0f172a);',
        '  transition: background-color 0.15s, color 0.15s;',
        '  line-height: 1.4;',
        '}',
        p + '.fleet-ui-seg-group--fill .fleet-ui-seg-btn {',
        '  flex: 1;',
        '  padding: 8px 10px;',
        '}',
        // Match toolbar nav buttons / Sort selects (4px 10px, 11px)
        p + '.fleet-ui-seg-group--compact .fleet-ui-seg-btn {',
        '  padding: 4px 10px;',
        '  font-size: 11px;',
        '}',
        p + '.fleet-ui-seg-group--fill.fleet-ui-seg-group--compact .fleet-ui-seg-btn {',
        '  padding: 4px 10px;',
        '  font-size: 11px;',
        '}',
        p + '.fleet-ui-seg-btn--divider {',
        '  border-right: 1px solid var(--border, #e2e8f0);',
        '}',
        btn + '[aria-pressed="true"] {',
        '  background: var(--brand, ' + FLEET_UI_ACCENT + ');',
        '  color: ' + FLEET_UI_ACCENT_FG + ';',
        '}',
        btn + ':not([aria-pressed="true"]):hover {',
        '  background: color-mix(in srgb, var(--foreground, #0f172a) 10%, transparent);',
        '  color: var(--foreground, #0f172a);',
        '}',
        light(group) + ' {',
        '  border-color: #e5e5e5;',
        '  background: #f0f0f0;',
        '}',
        light(btn) + ' {',
        '  color: #333333;',
        '  background: transparent;',
        '}',
        light(p + '.fleet-ui-seg-btn--divider') + ' { border-right-color: #e5e5e5; }',
        light(btn + '[aria-pressed="true"]') + ' {',
        '  background: ' + FLEET_UI_ACCENT + ';',
        '  color: ' + FLEET_UI_ACCENT_FG + ';',
        '}',
        light(btn + ':not([aria-pressed="true"]):hover') + ' {',
        '  background: #e5e5e5;',
        '  color: #111111;',
        '}',
        dark(group) + ' {',
        '  border-color: #3f3f46;',
        '  background: #18181b;',
        '}',
        dark(btn) + ' {',
        '  color: #a1a1aa;',
        '  background: transparent;',
        '}',
        dark(p + '.fleet-ui-seg-btn--divider') + ' { border-right-color: #3f3f46; }',
        dark(btn + '[aria-pressed="true"]') + ' {',
        '  background: ' + FLEET_UI_ACCENT + ';',
        '  color: ' + FLEET_UI_ACCENT_FG + ';',
        '}',
        dark(btn + ':not([aria-pressed="true"]):hover') + ' {',
        '  background: #27272a;',
        '  color: #e4e4e7;',
        '}'
    ];
}

function fleetUiFilterToggleCssLines(prefix) {
    const p = prefix || '';
    return [
        p + '.fleet-ui-filter-toggle {',
        '  appearance: none;',
        '  -webkit-appearance: none;',
        '  padding: 7px 14px;',
        '  font-size: 12px;',
        '  font-weight: 600;',
        '  border-radius: 6px;',
        '  cursor: pointer;',
        '  border: 2px solid var(--border, #e2e8f0);',
        '  color: var(--muted-foreground, #64748b);',
        '  background: transparent;',
        '  opacity: 0.6;',
        '}',
        p + '.fleet-ui-filter-toggle[aria-pressed="true"] {',
        '  opacity: 1;',
        '}'
    ];
}

/** Ensure each declaration in an inline CSS string is marked !important (host theme overrides). */
function fleetUiImportantInlineCss(css) {
    return String(css || '')
        .split(';')
        .map((part) => {
            const idx = part.indexOf(':');
            if (idx < 0) return '';
            const prop = part.slice(0, idx).trim();
            let val = part.slice(idx + 1).trim();
            if (!prop || !val) return '';
            if (!/!important\s*$/i.test(val)) val += ' !important';
            return prop + ': ' + val;
        })
        .filter(Boolean)
        .join('; ');
}

function fleetUiSegmentBtnClass(divider) {
    return SEGMENT_CLASSES.btn + (divider ? ' ' + SEGMENT_CLASSES.btnDivider : '');
}

function fleetUiSegmentBtnHtml(opts) {
    const o = opts || {};
    const valueAttr = o.valueAttr || 'data-value';
    const divider = !!o.divider;
    const active = !!o.active;
    const idAttr = o.id ? ' id="' + fleetUiEscapeAttr(o.id) + '"' : '';
    const extra = o.extraAttrs ? ' ' + o.extraAttrs : '';
    return '<button type="button" class="' + fleetUiSegmentBtnClass(divider) + '" '
        + valueAttr + '="' + fleetUiEscapeAttr(o.value) + '" aria-pressed="'
        + (active ? 'true' : 'false') + '"' + idAttr + extra + '>'
        + fleetUiEscapeHtml(o.label) + '</button>';
}

function fleetUiSegmentGroupHtml(opts) {
    const o = opts || {};
    const options = Array.isArray(o.options) ? o.options : [];
    const valueAttr = o.valueAttr || 'data-value';
    const value = o.value;
    const fill = o.fill === true;
    const compact = o.compact === true;
    let groupClass = SEGMENT_CLASSES.group;
    if (fill) groupClass += ' ' + SEGMENT_CLASSES.groupFill;
    if (compact) groupClass += ' ' + SEGMENT_CLASSES.groupCompact;
    const buttons = options.map((opt, i) => fleetUiSegmentBtnHtml({
        value: opt.value,
        label: opt.label,
        id: opt.id,
        extraAttrs: opt.extraAttrs,
        valueAttr,
        active: String(opt.value) === String(value),
        divider: i < options.length - 1
    })).join('');
    const labelAttr = o.ariaLabel ? ' aria-label="' + fleetUiEscapeAttr(o.ariaLabel) + '"' : '';
    const styleAttr = o.style ? ' style="' + fleetUiEscapeAttr(o.style) + '"' : '';
    const extra = o.extraAttrs ? ' ' + o.extraAttrs : '';
    return '<div class="' + groupClass + '" role="group"' + labelAttr + styleAttr + extra + '>'
        + buttons + '</div>';
}

function fleetUiSyncSegmentGroup(root, value, valueAttr) {
    if (!root) return;
    const attr = valueAttr || 'data-value';
    root.querySelectorAll('.' + SEGMENT_CLASSES.btn).forEach((btn) => {
        const v = btn.getAttribute(attr);
        const active = String(v) === String(value);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
}

function fleetUiBindSegmentGroup(root, options) {
    if (!root) return;
    const opts = options || {};
    const valueAttr = opts.valueAttr || 'data-value';
    if (root.dataset.fleetUiSegBound === '1') return;
    root.dataset.fleetUiSegBound = '1';
    root.addEventListener('click', (e) => {
        const btn = e.target && e.target.closest
            ? e.target.closest('.' + SEGMENT_CLASSES.btn)
            : null;
        if (!btn || !root.contains(btn)) return;
        const next = btn.getAttribute(valueAttr);
        if (next == null) return;
        fleetUiSyncSegmentGroup(root, next, valueAttr);
        if (typeof opts.onChange === 'function') {
            opts.onChange(next, btn);
        }
    });
}

function fleetUiFilterToggleClass() {
    return FILTER_TOGGLE_CLASSES.btn;
}

function fleetUiFilterToggleHtml(opts) {
    const o = opts || {};
    const pressed = !!o.pressed;
    const idAttr = o.id ? ' id="' + fleetUiEscapeAttr(o.id) + '"' : '';
    const extra = o.extraAttrs ? ' ' + o.extraAttrs : '';
    const css = pressed && o.activeCss
        ? fleetUiImportantInlineCss(o.activeCss).replace(/"/g, '&quot;')
        : '';
    const styleAttr = css ? ' style="' + css + '"' : '';
    return '<button type="button" class="' + fleetUiFilterToggleClass() + '" aria-pressed="'
        + (pressed ? 'true' : 'false') + '"' + idAttr + styleAttr + extra + '>'
        + fleetUiEscapeHtml(o.label) + '</button>';
}

function fleetUiApplyFilterToggle(btn, pressed, activeCss) {
    if (!btn) return;
    btn.classList.add(FILTER_TOGGLE_CLASSES.btn);
    btn.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    btn.style.cssText = '';
    if (!(pressed && activeCss)) return;
    String(activeCss).split(';').forEach((part) => {
        const idx = part.indexOf(':');
        if (idx < 0) return;
        const prop = part.slice(0, idx).trim();
        const val = part.slice(idx + 1).trim().replace(/\s*!important\s*$/i, '');
        if (!prop || !val) return;
        btn.style.setProperty(prop, val, 'important');
    });
}

function fleetUiSpinnerHtml(sizePx) {
    const size = sizePx || 16;
    return '<span class="fleet-ui-spinner" aria-hidden="true" style="width: ' + size + 'px; height: ' + size + 'px;"></span>';
}

function fleetUiLoadingDotsAttr() {
    return 'data-fleet-ui-dots';
}

/** Attribute for buttons that only exist on dev-branch builds (orange border). */
function fleetUiDevBtnAttr() {
    return 'data-fleet-dev="1"';
}

/** Shared button-icon SVGs (basic+icon chrome). */
function fleetUiEyeIconSvg() {
    return '<svg width="15.4" height="15.4" viewBox="0 0 26 26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0;">'
        + '<path d="M13 6.9C6.9 6.9 2.1 13.2 2.1 13.2S6.9 19.5 13 19.5c4.7 0 10.9-6.3 10.9-6.3S17.6 6.9 13 6.9z"></path>'
        + '<circle cx="13" cy="13.2" r="3.2"></circle>'
        + '</svg>';
}

function fleetUiFlagIconSvg() {
    return '<svg width="14" height="14" viewBox="0 0 26 26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0;">'
        + '<line x1="7.5" y1="2" x2="7.5" y2="24"></line>'
        + '<path d="M7.5 3.5 L22.5 10 L7.5 16.5 Z" fill="#dc2626" stroke="none"></path>'
        + '</svg>';
}

function fleetUiFunnelIconSvg() {
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" aria-hidden="true" style="flex-shrink:0;">'
        + '<line x1="4" y1="7" x2="20" y2="7"></line>'
        + '<line x1="7" y1="12" x2="17" y2="12"></line>'
        + '<line x1="10" y1="17" x2="14" y2="17"></line>'
        + '</svg>';
}

function fleetUiExternalLinkIconSvg(opts) {
    const active = !(opts && opts.active === false);
    const stroke = active ? 'currentColor' : 'var(--muted-foreground, #94a3b8)';
    const opacity = active ? '1' : '0.45';
    return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="' + stroke + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="opacity: ' + opacity + '; flex-shrink:0;">'
        + '<path d="M15 3h6v6"></path>'
        + '<path d="M10 14 21 3"></path>'
        + '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>'
        + '</svg>';
}

function fleetUiCopyIconSvg(opts) {
    const raw = opts && opts.size != null ? Number(opts.size) : 13;
    const size = Number.isFinite(raw) && raw > 0 ? raw : 13;
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
        + '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>'
        + '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>'
        + '</svg>';
}

function fleetUiClipboardIconSvg(opts) {
    const raw = opts && opts.size != null ? Number(opts.size) : 13;
    const size = Number.isFinite(raw) && raw > 0 ? raw : 13;
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0;">'
        + '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"></rect>'
        + '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>'
        + '</svg>';
}

function fleetUiAlertTriangleIconSvg(opts) {
    const raw = opts && opts.size != null ? Number(opts.size) : 18;
    const size = Number.isFinite(raw) && raw > 0 ? raw : 18;
    const extraStyle = opts && opts.style != null ? String(opts.style) : '';
    const style = extraStyle ? 'flex-shrink:0; ' + extraStyle : 'flex-shrink:0;';
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="' + style + '">'
        + '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>'
        + '<line x1="12" y1="9" x2="12" y2="13"></line>'
        + '<circle cx="12" cy="17" r="1" fill="currentColor" stroke="none"></circle>'
        + '</svg>';
}

function fleetUiFlashTabSuccess(tabEl) {
    if (!tabEl) return;
    tabEl.classList.remove('fleet-ui-tab--pulse', 'wf-dash-tab--add-pulse');
    void tabEl.offsetWidth;
    tabEl.classList.add('fleet-ui-tab--pulse', 'wf-dash-tab--add-pulse');
    tabEl.addEventListener('animationend', () => {
        tabEl.classList.remove('fleet-ui-tab--pulse', 'wf-dash-tab--add-pulse');
    }, { once: true });
    Logger.debug('tab pulse');
}

function fleetUiUserStoryProseCssText() {
    const p = '[data-fleet-user-story-prose]';
    return [
        p + ' {',
        '  font-size: 0.875rem;',
        '  line-height: 1.5;',
        '  color: inherit;',
        '}',
        p + ' > :first-child { margin-top: 0; }',
        p + ' > :last-child { margin-bottom: 0; }',
        p + ' p { margin: 0.4em 0; }',
        p + ' h1, ' + p + ' h2, ' + p + ' h3, ' + p + ' h4, ' + p + ' h5 {',
        '  font-weight: 600;',
        '  line-height: 1.35;',
        '  color: inherit;',
        '  margin: 0.75em 0 0.35em;',
        '}',
        p + ' h1 { font-size: 1.15em; }',
        p + ' h2 { font-size: 1.08em; }',
        p + ' h3 { font-size: 1.02em; }',
        p + ' h4, ' + p + ' h5 { font-size: 1em; }',
        p + ' ul {',
        '  margin: 0.4em 0;',
        '  padding-left: 1.35em;',
        '  list-style-type: disc;',
        '}',
        p + ' ol {',
        '  margin: 0.4em 0;',
        '  padding-left: 1.35em;',
        '  list-style-type: decimal;',
        '}',
        p + ' li {',
        '  margin: 0.15em 0;',
        '  display: list-item;',
        '}',
        p + ' strong { font-weight: 700; color: inherit; }',
        p + ' code {',
        '  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;',
        '  font-size: 0.92em;',
        '  padding: 0.1em 0.3em;',
        '  border-radius: 0.25rem;',
        '  background: color-mix(in srgb, currentColor 10%, transparent);',
        '}',
        p + ' a {',
        '  color: var(--brand, #2563eb);',
        '  text-decoration: underline;',
        '  text-underline-offset: 2px;',
        '}'
    ].join('\n');
}

const plugin = {
    id: 'ui-lib',
    name: 'UI Lib',
    description: 'Shared buttons, segments, panels, and copy feedback',
    _version: '3.24',
    phase: 'core',
    enabledByDefault: true,
    initialState: { registered: false },

    init() {
        const self = this;

        function ensureStyles() {
            if (document.getElementById(FLEET_UI_STYLE_ID)) return;
            const style = document.createElement('style');
            style.id = FLEET_UI_STYLE_ID;
            style.textContent = fleetUiGlobalCssText();
            (document.head || document.documentElement).appendChild(style);
        }

        function ensureButtonStyles(scopeSelector, appendRoot) {
            if (!scopeSelector) {
                ensureStyles();
                return;
            }
            const styleId = fleetUiScopeStyleId(scopeSelector);
            const root = appendRoot || document;
            ensureStyles();
            let style = (root.getElementById && root.getElementById(styleId))
                || (root.querySelector && root.querySelector('#' + styleId))
                || document.getElementById(styleId);
            if (!style) {
                style = document.createElement('style');
                style.id = styleId;
            }
            style.textContent = fleetUiBtnBaseCssLines(scopeSelector + ' ').join('\n');
            const target = appendRoot || document.head || document.documentElement;
            target.appendChild(style);
        }

        function ensurePanelStyles(scopeSelector, appendRoot) {
            ensureStyles();
            const styleId = scopeSelector
                ? fleetUiPanelScopeStyleId(scopeSelector)
                : FLEET_UI_PANEL_STYLE_ID;
            const root = appendRoot || document;
            if (root.getElementById && root.getElementById(styleId)) return;
            if (root.querySelector && root.querySelector('#' + styleId)) return;
            if (document.getElementById(styleId)) return;
            const style = document.createElement('style');
            style.id = styleId;
            const prefix = scopeSelector ? scopeSelector + ' ' : '';
            style.textContent = fleetUiPanelCssLines(prefix).join('\n');
            const target = appendRoot || document.head || document.documentElement;
            target.appendChild(style);
        }

        function ensureUserStoryMarkdownStyles() {
            ensureStyles();
            if (document.getElementById(FLEET_UI_USER_STORY_PROSE_STYLE_ID)) return;
            const style = document.createElement('style');
            style.id = FLEET_UI_USER_STORY_PROSE_STYLE_ID;
            style.textContent = fleetUiUserStoryProseCssText();
            (document.head || document.documentElement).appendChild(style);
        }

        function ensureSegmentStyles(scopeSelector, appendRoot) {
            ensureStyles();
            const styleId = scopeSelector
                ? fleetUiSegmentScopeStyleId(scopeSelector)
                : FLEET_UI_SEGMENT_STYLE_ID;
            const root = appendRoot || document;
            let style = (root.getElementById && root.getElementById(styleId))
                || (root.querySelector && root.querySelector('#' + styleId))
                || document.getElementById(styleId);
            if (!style) {
                style = document.createElement('style');
                style.id = styleId;
            }
            const prefix = scopeSelector ? scopeSelector + ' ' : '';
            style.textContent = fleetUiSegmentCssLines(prefix).join('\n');
            const target = appendRoot || document.head || document.documentElement;
            target.appendChild(style);
        }

        function ensureFilterToggleStyles(scopeSelector, appendRoot) {
            ensureStyles();
            const styleId = scopeSelector
                ? fleetUiFilterToggleScopeStyleId(scopeSelector)
                : FLEET_UI_FILTER_TOGGLE_STYLE_ID;
            const root = appendRoot || document;
            if (root.getElementById && root.getElementById(styleId)) return;
            if (root.querySelector && root.querySelector('#' + styleId)) return;
            if (document.getElementById(styleId)) return;
            const style = document.createElement('style');
            style.id = styleId;
            const prefix = scopeSelector ? scopeSelector + ' ' : '';
            style.textContent = fleetUiFilterToggleCssLines(prefix).join('\n');
            const target = appendRoot || document.head || document.documentElement;
            target.appendChild(style);
        }

        function ensureAlertBannerStyles() {
            ensureStyles();
            fleetUiEnsureThemeObserver();
            if (document.getElementById(FLEET_UI_ALERT_BANNER_STYLE_ID)) return;
            const style = document.createElement('style');
            style.id = FLEET_UI_ALERT_BANNER_STYLE_ID;
            style.textContent = fleetUiAlertBannerCssLines().join('\n');
            (document.head || document.documentElement).appendChild(style);
        }

        ensureStyles();
        fleetUiEnsureThemeObserver();

        Context.uiLib = {
            FLASH_PULSE_MS,
            FLASH_PULSE_EASING,
            COPY_SUCCESS_MS,
            COPY_FAILURE_MS,
            COPY_SUCCESS_BG,
            COPY_FAILURE_BG,
            SPIN_DURATION,
            TAB_PULSE_MS,
            PANEL_CLASSES,
            ALERT_BANNER_CLASSES,
            SEGMENT_CLASSES,
            FILTER_TOGGLE_CLASSES,

            ensureStyles,
            ensureButtonStyles,
            ensurePanelStyles,
            ensureUserStoryMarkdownStyles,
            ensureSegmentStyles,
            ensureFilterToggleStyles,
            ensureAlertBannerStyles,
            btnClass: fleetUiBtnClass,
            spinnerHtml: fleetUiSpinnerHtml,
            loadingDotsAttr: fleetUiLoadingDotsAttr,
            devBtnAttr: fleetUiDevBtnAttr,
            eyeIconSvg: fleetUiEyeIconSvg,
            flagIconSvg: fleetUiFlagIconSvg,
            funnelIconSvg: fleetUiFunnelIconSvg,
            externalLinkIconSvg: fleetUiExternalLinkIconSvg,
            copyIconSvg: fleetUiCopyIconSvg,
            clipboardIconSvg: fleetUiClipboardIconSvg,
            alertTriangleIconSvg: fleetUiAlertTriangleIconSvg,

            segmentBtnClass: fleetUiSegmentBtnClass,
            segmentBtnHtml: fleetUiSegmentBtnHtml,
            segmentGroupHtml: fleetUiSegmentGroupHtml,
            syncSegmentGroup: fleetUiSyncSegmentGroup,
            bindSegmentGroup: fleetUiBindSegmentGroup,

            filterToggleClass: fleetUiFilterToggleClass,
            filterToggleHtml: fleetUiFilterToggleHtml,
            applyFilterToggle: fleetUiApplyFilterToggle,

            isFleetDark: fleetUiIsFleetDark,
            getFleetTheme: fleetUiGetFleetTheme,
            chromeColors: fleetUiChromeColors,
            onThemeChange: fleetUiOnThemeChange,
            getThemeMode: fleetUiGetThemeMode,
            setThemeMode: fleetUiSetThemeMode,
            resolveTheme: fleetUiResolveTheme,
            syncThemeDataset: () => fleetUiSyncThemeDataset(true),

            clearCopyFeedback: fleetUiClearCopyFeedback,
            flashSuccess: fleetUiFlashSuccess,
            flashFailure: fleetUiFlashFailure,
            copyWithFeedback: fleetUiCopyWithFeedback,
            flashTabSuccess: fleetUiFlashTabSuccess
        };

        Context.buttonFeedback = {
            clear: (el) => fleetUiClearCopyFeedback(el),
            flashSuccess: (el, opts) => fleetUiFlashSuccess(el, opts),
            flashFailure: (el, opts) => fleetUiFlashFailure(el, opts)
        };

        if (!self.initialState.registered) {
            Logger.log('module registered (Context.uiLib, Context.buttonFeedback)');
            self.initialState.registered = true;
        }
    }
};

return plugin;
},
        "core/main/settings-ui.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {

// settings-ui.js
// Core plugin that provides the settings UI - persists across navigation.
// Ops dashboard enable/password toggles live in ops-tab.js (Context.opsTab).

const plugin = {
    id: 'settings-ui',
    name: 'Settings UI',
    description: 'Provides the settings panel for managing plugins',
    _version: '11.18',
    phase: 'core', // Special phase - loaded once, never cleaned up
    enabledByDefault: true,

    // Internal state (not reset on navigation)
    _buttonCreated: false,
    _modalOpen: false,
    _foreignModalObserver: null,
    _presenceInterval: null,
    _presenceObserver: null,
    _docPaneCache: {},
    _gearClickHandler: null,
    _gearContextMenuHandler: null,
    _gearCtrlOpenHandled: false,
    _updateTabOpenedAutomatically: false,

    init(state, context) {
        const self = this;
        Context.settingsUi = {
            openModal: (opts) => self.openModal(opts),
            closeModal: () => self._closeModal(),
            isMainUserscriptUpdateAvailable: () => self._isMainUserscriptUpdateAvailable(),
            attachUpdateBannerListeners: (root) => self._attachUpdateBannerListeners(root),
            refreshUpdateIndicator: () => self._updatePulseAnimation(),
            syncOpsRefreshBanner: (modal) => self._syncOpsRefreshBanner(modal)
        };
        this._ensureDialogBackdropStyles();
        this._ensureSettingsButton();
        this._ensureModalPresence();
        this._startPresenceGuard();
        this._updatePulseAnimation();
        this._autoOpenUpdateIfNeeded();
    },

    /**
     * @param {{ forceSettings?: boolean }} [opts]
     * When forceSettings is true, always open the settings modal (not the Ops dashboard).
     */
    openModal(opts) {
        const options = opts || {};
        if (options.forceSettings) {
            if (this._modalOpen) return;
            this._openSettingsModal();
            return;
        }
        const routeDashboard = this._shouldOpenOpsDashboard();
        Logger.log('openModal — routeDashboard=' + routeDashboard + ' forceSettings=' + Boolean(options.forceSettings));
        if (routeDashboard) {
            void this._openOpsDashboardFromGear();
            return;
        }
        this._openSettingsModal();
    },

    async _openOpsDashboardFromGear() {
        if (typeof Context.ensureOpsDashboardPluginsLoaded === 'function') {
            try {
                await Context.ensureOpsDashboardPluginsLoaded();
            } catch (e) {
                Logger.warn('ensureOpsDashboardPluginsLoaded before gear route failed', e);
            }
        }
        if (!Context.dashboard || typeof Context.dashboard.open !== 'function') {
            Logger.warn('Ops dashboard routing requested but Context.dashboard unavailable — opening settings');
            this._openSettingsModal();
            return;
        }
        try {
            Context.dashboard.open();
            Logger.log('opened Ops dashboard from gear');
        } catch (err) {
            Logger.error('dashboard open failed — falling back to settings', err);
            this._openSettingsModal();
        }
    },

    _isMainUserscriptUpdateAvailable() {
        return this._shouldShowUpdateNotification();
    },

    _shouldOpenOpsDashboard() {
        if (this._isMainUserscriptUpdateAvailable()) return false;
        if (!Context.opsTab) return false;
        if (typeof Context.opsTab.shouldOpenDashboardOnSettings === 'function') {
            return Context.opsTab.shouldOpenDashboardOnSettings() && Context.opsTab.isEnabled();
        }
        return Context.opsTab.isEnabled();
    },

    _openSettingsModal() {
        let modal = document.getElementById('wf-settings-modal');

        if (this._modalOpen && modal) {
            this._closeModal();
            return;
        }
        if (modal) {
            this._captureOpsState(modal);
            modal.remove();
        }
        modal = this._createModal();
        this._bindSettingsDialogCloseSync(modal);
        try {
            if (typeof modal.showModal === 'function') {
                modal.showModal();
            }
        } catch (err) {
            Logger.error('settings dialog showModal failed', err);
            modal.remove();
            this._modalOpen = false;
            return;
        }
        this._modalOpen = true;
        this._startForeignModalObserver(modal);
    },

    _ensureDialogBackdropStyles() {
        if (Context.uiLib) {
            if (typeof Context.uiLib.ensureButtonStyles === 'function') {
                Context.uiLib.ensureButtonStyles('#wf-settings-modal');
            }
            if (typeof Context.uiLib.ensureAlertBannerStyles === 'function') {
                Context.uiLib.ensureAlertBannerStyles();
            }
            if (typeof Context.uiLib.ensureSegmentStyles === 'function') {
                Context.uiLib.ensureSegmentStyles('#wf-settings-modal');
            }
        }
        let style = document.getElementById('wf-settings-dialog-styles');
        if (!style) {
            style = document.createElement('style');
            style.id = 'wf-settings-dialog-styles';
            (document.head || document.documentElement).appendChild(style);
        }
        style.textContent = `
            #wf-settings-modal {
                margin: 0;
            }
            #wf-settings-modal::backdrop {
                background: rgba(0, 0, 0, 0.45);
            }
            @keyframes wf-settings-update-flash {
                0%, 100% {
                    border-color: rgba(220, 38, 38, 0.9);
                    box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.4);
                }
                50% {
                    border-color: rgba(220, 38, 38, 0.25);
                    box-shadow: 0 0 0 4px rgba(220, 38, 38, 0.15);
                }
            }
            #wf-settings-btn.wf-settings-outdated {
                border: 2px solid rgba(220, 38, 38, 0.9);
                animation: wf-settings-update-flash 1.2s ease-in-out infinite;
            }
            #wf-settings-message.fleet-ui-alert-banner {
                margin-bottom: 12px;
            }
        `;
    },

    _settingsBtnClass(variant, size) {
        if (Context.uiLib && typeof Context.uiLib.btnClass === 'function') {
            return Context.uiLib.btnClass(variant, size);
        }
        return 'wf-dash-btn wf-dash-btn--basic wf-dash-btn--' + (size || 'nav');
    },

    _alertBannerClasses() {
        return (Context.uiLib && Context.uiLib.ALERT_BANNER_CLASSES) || {
            root: 'fleet-ui-alert-banner',
            danger: 'fleet-ui-alert-banner--danger',
            amber: 'fleet-ui-alert-banner--amber',
            amberSoft: 'fleet-ui-alert-banner--amber-soft',
            title: 'fleet-ui-alert-banner__title',
            body: 'fleet-ui-alert-banner__body',
            footer: 'fleet-ui-alert-banner__footer',
            btnSecondary: 'fleet-ui-alert-banner__btn-secondary',
            btnPrimary: 'fleet-ui-alert-banner__btn-primary'
        };
    },

    _isFleetDark() {
        if (Context.uiLib && typeof Context.uiLib.isFleetDark === 'function') {
            return Context.uiLib.isFleetDark();
        }
        return document.documentElement.dataset.fleetUxTheme === 'dark';
    },

    _getPreferredThemeMode() {
        if (Context.uiLib && typeof Context.uiLib.getThemeMode === 'function') {
            return Context.uiLib.getThemeMode();
        }
        return 'match';
    },

    _setPreferredThemeMode(mode) {
        if (Context.uiLib && typeof Context.uiLib.setThemeMode === 'function') {
            return Context.uiLib.setThemeMode(mode);
        }
        return mode;
    },

    _createPreferredModeHTML() {
        const mode = this._getPreferredThemeMode();
        const c = this._settingsThemeColors();
        const ui = Context.uiLib;
        if (ui && typeof ui.ensureSegmentStyles === 'function') {
            ui.ensureSegmentStyles('#wf-settings-modal');
        }
        const groupHtml = ui && typeof ui.segmentGroupHtml === 'function'
            ? ui.segmentGroupHtml({
                value: mode,
                valueAttr: 'data-theme-mode',
                fill: true,
                ariaLabel: 'Preferred Visual Mode',
                options: [
                    { value: 'match', label: 'Match site', id: 'wf-theme-mode-match' },
                    { value: 'light', label: 'Light', id: 'wf-theme-mode-light' },
                    { value: 'dark', label: 'Dark', id: 'wf-theme-mode-dark' }
                ]
            })
            : '';
        return `
            <div style="margin-bottom: 20px;">
                <div style="padding: 12px 14px; border: 1px solid ${c.border}; border-radius: 8px; background: ${c.card};">
                    <div style="font-size: 14px; font-weight: 600; color: ${c.fg}; margin-bottom: 10px;">Preferred Visual Mode</div>
                    ${groupHtml}
                </div>
            </div>
        `;
    },

    /** Opaque light/dark palette for Settings modal surfaces (avoids fragile host CSS vars). */
    _settingsThemeColors() {
        if (Context.uiLib && typeof Context.uiLib.chromeColors === 'function') {
            return Context.uiLib.chromeColors();
        }
        if (this._isFleetDark()) {
            return {
                bg: '#18181b',
                card: '#27272a',
                hover: '#3f3f46',
                border: '#3f3f46',
                borderHover: '#52525b',
                fg: '#e4e4e7',
                muted: '#a1a1aa'
            };
        }
        return {
            bg: '#ffffff',
            card: '#fafafa',
            hover: '#f0f0f0',
            border: '#e5e5e5',
            borderHover: '#d1d5db',
            fg: '#333333',
            muted: '#666666'
        };
    },
    
    // No destroy method - this plugin persists
    
    _ensureSettingsButton() {
        if (!document.body) return;
        let settingsBtn = document.getElementById('wf-settings-btn');
        if (!settingsBtn) {
            settingsBtn = document.createElement('button');
            settingsBtn.id = 'wf-settings-btn';
            document.body.appendChild(settingsBtn);
            if (!this._buttonCreated) {
                Logger.log('Settings UI initialized');
                this._buttonCreated = true;
            }
        }
        this._applySettingsButtonBehavior(settingsBtn);
    },

    _applySettingsButtonBehavior(settingsBtn) {
        if (!settingsBtn) return;
        settingsBtn.type = 'button';
        settingsBtn.title = 'Fleet Enhancer Extension';

        const shouldPulse = Context.isOutdated || (Context.isDevBranch && this._getPulseOverrideEnabled());
        const bgTranslucent = 'color-mix(in srgb, var(--background, white) 30%, transparent)';
        const bgOpaque = 'var(--background, white)';

        settingsBtn.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 20px;
            width: 48px;
            height: 48px;
            border-radius: 50%;
            background: ${shouldPulse ? bgOpaque : bgTranslucent};
            border: 1px solid var(--brand, #60a5fa);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            z-index: 9999;
            transition: background 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
        `;

        const wasOutdated = settingsBtn.classList.contains('wf-settings-outdated');
        if (shouldPulse) {
            settingsBtn.classList.add('wf-settings-outdated');
            if (!wasOutdated) {
                Logger.log('update indicator pulse started');
            }
        } else {
            settingsBtn.classList.remove('wf-settings-outdated');
        }

        settingsBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
                <circle cx="12" cy="12" r="3"></circle>
            </svg>
        `;

        if (settingsBtn.dataset.wfSettingsBound !== 'true') {
            settingsBtn.dataset.wfSettingsBound = 'true';
            settingsBtn.addEventListener('mouseenter', () => {
                settingsBtn.style.background = 'var(--background, white)';
                settingsBtn.style.transform = 'scale(1.1)';
                if (!settingsBtn.classList.contains('wf-settings-outdated')) {
                    settingsBtn.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
                }
            });
            settingsBtn.addEventListener('mouseleave', () => {
                settingsBtn.style.transform = 'scale(1)';
                if (!settingsBtn.classList.contains('wf-settings-outdated')) {
                    settingsBtn.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.1)';
                }
                const solidBg =
                    Context.isOutdated ||
                    (Context.isDevBranch && this._getPulseOverrideEnabled()) ||
                    settingsBtn.classList.contains('wf-settings-outdated');
                settingsBtn.style.background = solidBg
                    ? 'var(--background, white)'
                    : 'color-mix(in srgb, var(--background, white) 30%, transparent)';
            });
        }

        this._attachGearClickHandler(settingsBtn);
    },

    _attachGearClickHandler(settingsBtn) {
        if (!settingsBtn) return;
        if (this._gearClickHandler) {
            settingsBtn.removeEventListener('click', this._gearClickHandler);
        }
        if (this._gearContextMenuHandler) {
            settingsBtn.removeEventListener('contextmenu', this._gearContextMenuHandler);
        }
        // Ctrl+click always opens the small settings modal (even when Ops routes the gear to the dashboard).
        // On macOS, Ctrl+click often fires contextmenu instead of (or before) click — handle both, once.
        this._gearClickHandler = (e) => {
            if (this._gearCtrlOpenHandled) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            const forceSettings = Boolean(e && e.ctrlKey);
            if (forceSettings) {
                e.preventDefault();
                e.stopPropagation();
                this._markGearCtrlOpenHandled();
                Logger.log('opened settings modal (Ctrl+click)');
                this.openModal({ forceSettings: true });
                return;
            }
            this.openModal();
        };
        this._gearContextMenuHandler = (e) => {
            if (!(e && e.ctrlKey)) return;
            e.preventDefault();
            e.stopPropagation();
            if (this._gearCtrlOpenHandled) return;
            this._markGearCtrlOpenHandled();
            Logger.log('opened settings modal (Ctrl+click)');
            this.openModal({ forceSettings: true });
        };
        settingsBtn.addEventListener('click', this._gearClickHandler);
        settingsBtn.addEventListener('contextmenu', this._gearContextMenuHandler);
    },

    _markGearCtrlOpenHandled() {
        this._gearCtrlOpenHandled = true;
        queueMicrotask(() => {
            this._gearCtrlOpenHandled = false;
        });
    },

    _updatePulseAnimation() {
        const settingsBtn = document.getElementById('wf-settings-btn');
        if (!settingsBtn) {
            Logger.debug('settings button not found for pulse animation update');
            return;
        }
        this._applySettingsButtonBehavior(settingsBtn);
    },
    
    _toggleModal() {
        this.openModal();
    },

    _ensureModalPresence() {
        if (!this._modalOpen) return;
        const modal = document.getElementById('wf-settings-modal');
        if (!modal) {
            const recreated = this._createModal();
            try {
                if (typeof recreated.showModal === 'function') {
                    recreated.showModal();
                }
            } catch (err) {
                Logger.error('Settings dialog showModal failed (presence guard)', err);
                recreated.remove();
                this._modalOpen = false;
                return;
            }
            this._startForeignModalObserver(recreated);
        }
    },
    
    _closeModal() {
        this._stopForeignModalObserver();
        const modal = document.getElementById('wf-settings-modal');
        if (modal) {
            this._captureOpsState(modal);
        }
        if (Context.opsTab && typeof Context.opsTab.onModalClosed === 'function') {
            Context.opsTab.onModalClosed();
        }
        if (modal && typeof modal.close === 'function' && modal.open) {
            modal.close();
        } else if (modal) {
            modal.style.display = 'none';
        }
        this._modalOpen = false;
        const msg = document.getElementById('wf-settings-message');
        if (msg) msg.style.display = 'none';
    },

    _bindSettingsDialogCloseSync(modal) {
        if (!modal || modal.dataset.wfCloseStateBound === '1') return;
        modal.dataset.wfCloseStateBound = '1';
        modal.addEventListener('close', () => {
            this._stopForeignModalObserver();
            this._modalOpen = false;
        });
    },

    _stopForeignModalObserver() {
        if (this._foreignModalObserver) {
            this._foreignModalObserver.disconnect();
            this._foreignModalObserver = null;
        }
    },

    _startForeignModalObserver(ourDialog) {
        this._stopForeignModalObserver();
        if (!ourDialog || !(ourDialog instanceof HTMLDialogElement)) return;

        const isForeignAriaModalVisible = (el) => {
            if (!(el instanceof Element) || ourDialog.contains(el)) return false;
            const st = getComputedStyle(el);
            if (st.display === 'none' || st.visibility === 'hidden') return false;
            const r = el.getBoundingClientRect();
            if (r.width < 4 || r.height < 4) return false;
            return el.getAttribute('aria-modal') === 'true';
        };

        const check = () => {
            if (!this._modalOpen || !ourDialog.isConnected || !ourDialog.open) return;

            const openDialogs = document.querySelectorAll('dialog[open]');
            for (const d of openDialogs) {
                if (d !== ourDialog) {
                    Logger.info('Closing Fleet settings because another native dialog opened (host page modal).');
                    this._closeModal();
                    return;
                }
            }

            const ariaModals = document.querySelectorAll('[aria-modal="true"]');
            for (const el of ariaModals) {
                if (isForeignAriaModalVisible(el)) {
                    Logger.info('Closing Fleet settings because a host aria-modal dialog appeared.');
                    this._closeModal();
                    return;
                }
            }
        };

        this._foreignModalObserver = new MutationObserver(check);
        this._foreignModalObserver.observe(document.documentElement, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: ['open', 'aria-modal', 'hidden', 'style', 'class']
        });
        check();
    },

    _startPresenceGuard() {
        if (this._presenceObserver) return;
        const check = () => {
            if (!document.getElementById('wf-settings-btn')) this._ensureSettingsButton();
            this._ensureModalPresence();
        };
        const obs = new MutationObserver(check);
        obs.observe(document.body, { childList: true, subtree: true });
        this._presenceObserver = obs;
        check();
    },
    
    _hasActiveDevSettings() {
        if (!Context.isDevBranch) return false;
        const devPlugins = PluginManager.getDevPlugins();
        return devPlugins.length > 0;
    },
    
    _createModal() {
        const modal = document.createElement('dialog');
        modal.id = 'wf-settings-modal';
        modal.setAttribute('aria-label', 'Fleet Enhancer Extension settings');
        modal.style.cssText = `
            position: fixed;
            top: 10%;
            left: 50%;
            transform: translateX(-50%);
            padding: 0;
            background: transparent;
            border: none;
            max-width: min(520px, calc(100vw - 32px));
            max-height: 80vh;
            overflow: visible;
        `;

        const c = this._settingsThemeColors();
        this._settingsColors = c;

        const contentStyle = `
            background: ${c.bg};
            color: ${c.fg};
            border: 1px solid ${c.border};
            border-radius: 12px;
            padding: 24px;
            width: 520px;
            max-width: min(520px, calc(100vw - 32px));
            max-height: 80vh;
            overflow-y: auto;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
        `;
        
        // Get current state
        const archetype = Context.currentArchetype;
        const archetypeId = archetype ? archetype.id : 'global';
        const allPlugins = PluginManager.getAll();
        // Separate regular archetype plugins from dev plugins
        const archetypePlugins = allPlugins.filter(p => p.phase !== 'core' && !p._isDev);
        const devPlugins = Context.isDevBranch ? PluginManager.getDevPlugins() : [];
        const orderedPlugins = this._getOrderedPlugins(archetypePlugins, archetypeId, 'regular');
        const orderedDevPlugins = this._getOrderedPlugins(devPlugins, archetypeId, 'dev');
        const version = Context.version || 'unknown';
        this._settingsArchetypeId = archetypeId;
        this._settingsDevPlugins = devPlugins;
        this._initialSettingsSnapshot = this._getSettingsSnapshot(archetypePlugins, archetypeId, devPlugins);
        
        // Build plugin toggles HTML
        const submoduleLoggingEnabled = Logger.isSubmoduleLoggingEnabled();
        const globalEnabled = this._getGlobalEnabled();
        const opsSettingsHTML = this._isOpsAccessConfigured() && Context.opsTab
            ? Context.opsTab.renderSettingsSection()
            : '';
        const defaultTab = this._getDefaultSettingsTabId();
        const openTab = (() => {
            const pending = this._pendingSettingsTabId;
            if (!pending) return defaultTab;
            const valid = this._getSettingsTabs().some((t) => t.id === pending);
            return valid ? pending : defaultTab;
        })();
        const paneDisplay = (tabId) => (tabId === openTab ? 'block' : 'none');
        const noPluginsMsg = Context.isOutdated
            ? 'No plugins will load until you update the userscript.'
            : 'No plugins loaded for this page.';
        const pluginTogglesHTML = orderedPlugins.length > 0 
            ? orderedPlugins.map(plugin => this._createPluginToggleHTML(plugin, submoduleLoggingEnabled, globalEnabled)).join('')
            : `<p style="color: ${c.muted}; font-size: 13px; font-style: italic;">${noPluginsMsg}</p>`;
        
        // Build dev plugin toggles HTML
        const devPluginTogglesHTML = orderedDevPlugins.length > 0 
            ? orderedDevPlugins.map(plugin => this._createPluginToggleHTML(plugin, submoduleLoggingEnabled, globalEnabled)).join('')
            : `<p style="color: ${c.muted}; font-size: 13px; font-style: italic;">No dev plugins loaded.</p>`;
        
        // Build outdated plugins warning HTML
        const outdatedPluginsHTML = Context.outdatedPlugins && Context.outdatedPlugins.length > 0
            ? this._createOutdatedPluginsHTML(Context.outdatedPlugins)
            : '';
        
        // Build script update notification HTML
        // Show if outdated OR if simulate update banner is enabled (for testing on dev branch)
        const updateNotificationHTML = this._shouldShowUpdateNotification()
            ? this._createUpdateNotificationHTML()
            : '';
        const opsRefreshBannerHTML = this._shouldShowOpsRefreshBanner()
            ? this._createOpsRefreshBannerHTML()
            : '';
        
        const hasDevSettings = this._hasActiveDevSettings();
        const tabs = this._getSettingsTabs();
        const tabRowHTML = this._createTabRowHTML(tabs, openTab);
        
        // Build the Dev pane content
        const devGlobalEnabled = this._getDevGlobalEnabled();
        const devPaneHTML = hasDevSettings ? `
            <div id="wf-settings-pane-dev" data-tab="dev" class="wf-settings-pane" style="display: none;">
            <!-- Dev Global Toggle -->
            <div style="margin-bottom: 20px;">
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border: 1px solid ${c.border}; border-radius: 8px; background: ${this._settingsThemeColors().card};">
                    <div>
                        <div style="font-size: 14px; font-weight: 600; color: ${c.fg};">Enable Dev Plugins</div>
                        <div style="font-size: 12px; color: ${c.muted}; margin-top: 4px;">
                            Disables all dev plugins on refresh when turned off.
                        </div>
                    </div>
                    ${this._createSwitchHTML('wf-dev-global-enabled', devGlobalEnabled)}
                </div>
                <div id="wf-all-dev-plugins-buttons" style="display: ${devGlobalEnabled ? 'flex' : 'none'}; gap: 8px; margin-top: 10px;">
                    <button id="wf-all-dev-plugins-on" type="button" class="${this._settingsBtnClass('basic', 'regular')}" style="flex: 1;">All On</button>
                    <button id="wf-all-dev-plugins-off" type="button" class="${this._settingsBtnClass('basic', 'regular')}" style="flex: 1;">All Off</button>
                </div>
            </div>

            <!-- Dev Plugins Section -->
            <div style="margin-bottom: 20px;">
                <h3 style="font-size: 14px; font-weight: 600; margin: 0 0 12px 0; color: ${c.fg};">
                    Dev Plugins (${devPlugins.length})
                </h3>
                <div id="wf-dev-plugin-list">
                    ${devPluginTogglesHTML}
                </div>
            </div>
            
            <!-- Debug Section -->
            <div style="border-top: 1px solid ${c.border}; padding-top: 16px; margin-bottom: 16px;">
                <h3 style="font-size: 14px; font-weight: 600; margin: 0 0 12px 0; color: ${c.fg};">
                    Debug Options
                </h3>
                <div style="display: flex; flex-direction: column; gap: 10px;">
                    ${this._createToggleHTML('wf-debug-enabled', 'Enable Debug Logging', Logger.isDebugEnabled(), 'log')}
                    <div>
                        ${this._createToggleHTML('wf-submodule-logging-enabled', 'Enable Submodule Logging', submoduleLoggingEnabled, 'log')}
                        <div id="wf-all-module-logging-buttons" style="display: ${submoduleLoggingEnabled ? 'flex' : 'none'}; gap: 8px; margin-top: 10px;">
                            <button id="wf-all-module-logging-on" type="button" class="${this._settingsBtnClass('basic', 'compact')}" style="flex: 1;">All On</button>
                            <button id="wf-all-module-logging-off" type="button" class="${this._settingsBtnClass('basic', 'compact')}" style="flex: 1;">All Off</button>
                        </div>
                        <div id="wf-core-lib-module-logging" style="display: ${submoduleLoggingEnabled ? 'block' : 'none'}; margin-top: 12px;">
                            ${this._createCoreLibModuleLoggingHTML()}
                        </div>
                    </div>
                    ${this._createToggleHTML('wf-pulse-override-enabled', 'Simulate Update Banner', this._getPulseOverrideEnabled(), 'sub')}
                </div>
            </div>
            </div>
        ` : '';

        modal.innerHTML = `
            <div id="wf-settings-content" style="${contentStyle}">
            <!-- Sticky Header -->
            <div id="wf-settings-sticky-header" style="position: sticky; top: -24px; margin: -24px -24px 20px -24px; padding: 24px 24px 16px 24px; background: ${this._settingsThemeColors().bg}; border-bottom: 1px solid ${c.border}; z-index: 1;">
                <div style="display: flex; align-items: flex-start; justify-content: space-between;">
                    <div>
                        <h2 style="font-size: 18px; font-weight: 600; margin: 0 0 4px 0; color: ${c.fg};">${Context.safeUxBuildName || 'Fleet Enhancer Extension'}</h2>
                        <p style="font-size: 13px; color: ${c.muted}; margin: 0;">
                            v${version} · a${Context.archetypesVersion || '?'} · <strong style="color: ${c.fg};">${(archetypeId.replace(/archetype/gi, '').trim() || archetypeId)}</strong>
                        </p>
                        ${Context.safeUxBuild ? `<p style="font-size: 12px; color: ${c.muted}; margin: 8px 0 0 0; line-height: 1.45;">Containment build: FOS clipboard/autoconnect, local UX helpers, and QA shortcuts only. Ops, AI, verifier lookup, and remote code loading are off.</p>` : ''}
                    </div>
                    <button id="wf-settings-close" style="
                        width: 28px;
                        height: 28px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        border-radius: 6px;
                        border: none;
                        background: transparent;
                        cursor: pointer;
                        transition: background 0.2s;
                        color: ${c.fg};
                    ">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M18 6L6 18M6 6l12 12"/>
                        </svg>
                    </button>
                </div>
                ${updateNotificationHTML}
                ${opsRefreshBannerHTML}
                ${tabRowHTML}
                <div id="wf-settings-message" class="${this._alertBannerClasses().root} ${this._alertBannerClasses().amberSoft}" style="display: none; margin-top: 12px; margin-bottom: 0; padding: 10px 12px; font-size: 13px; text-align: center;">
                    <span class="${this._alertBannerClasses().body}">Settings changed. <a href="#" id="wf-settings-refresh-link" style="color: var(--brand, #4f46e5); text-decoration: underline;">Refresh</a> the page for changes to take effect.</span>
                </div>
            </div>
            
            <div id="wf-settings-tab-panes">
            <div id="wf-settings-pane-settings" data-tab="settings" class="wf-settings-pane" style="display: none;">
            <!-- Global Toggle -->
            <div style="margin-bottom: 20px;">
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border: 1px solid ${c.border}; border-radius: 8px; background: ${this._settingsThemeColors().card};">
                    <div>
                        <div style="font-size: 14px; font-weight: 600; color: ${c.fg};">Enable Plugins</div>
                        <div style="font-size: 12px; color: ${c.muted}; margin-top: 4px;">
                            Disables all plugins on refresh when turned off.
                        </div>
                    </div>
                    ${this._createSwitchHTML('wf-global-enabled', globalEnabled)}
                </div>
                <div id="wf-all-plugins-buttons" style="display: ${globalEnabled ? 'flex' : 'none'}; gap: 8px; margin-top: 10px;">
                    <button id="wf-all-plugins-on" type="button" class="${this._settingsBtnClass('basic', 'regular')}" style="flex: 1;">All On</button>
                    <button id="wf-all-plugins-off" type="button" class="${this._settingsBtnClass('basic', 'regular')}" style="flex: 1;">All Off</button>
                </div>
            </div>

            ${this._createPreferredModeHTML()}

            ${opsSettingsHTML}

            <!-- Outdated Plugins Warning -->
            ${outdatedPluginsHTML}
            
            <!-- Plugins Section -->
            <div style="margin-bottom: 20px;">
                <h3 style="font-size: 14px; font-weight: 600; margin: 0 0 12px 0; color: ${c.fg};">
                    Plugins (${archetypePlugins.length})
                </h3>
                <div id="wf-plugin-list">
                    ${pluginTogglesHTML}
                </div>
            </div>
            
            <!-- Footer -->
            <div style="font-size: 11px; color: ${c.muted}; text-align: center; padding-top: 12px; border-top: 1px solid ${c.border};">
                Fleet Workflow Enhancer · 
                <a href="#" id="wf-reload-plugins" style="color: var(--brand, #4f46e5); text-decoration: none;">Reload Plugins</a>
            </div>
            
            <!-- Clear Cache Button -->
            <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid ${c.border};">
                <button id="wf-clear-cache" type="button" class="${this._settingsBtnClass('danger', 'regular')} wf-dash-btn--full">Clear Cache</button>
            </div>
            </div>
            ${devPaneHTML}
            <div id="wf-settings-pane-information" data-tab="information" class="wf-settings-pane" style="display: ${paneDisplay('information')}; overflow-y: auto; min-height: 200px;"></div>
            <div id="wf-settings-pane-features" data-tab="features" class="wf-settings-pane" style="display: none; overflow-y: auto; min-height: 200px;"></div>
            <div id="wf-settings-pane-feedback" data-tab="feedback" class="wf-settings-pane" style="display: none; overflow-y: auto; min-height: 200px;">
                <p style="font-size: 13px; color: ${c.muted}; margin: 0 0 16px 0; line-height: 1.5;">
                    We’d love to hear from you. Send feedback, suggest a feature, or report a bug—your input helps improve the extension.
                </p>
                <div style="margin-bottom: 12px;">
                    <label for="wf-feedback-title" style="display: block; font-size: 12px; font-weight: 500; color: ${c.fg}; margin-bottom: 4px;">Title</label>
                    <input type="text" id="wf-feedback-title" placeholder="Short summary" maxlength="256" style="
                        width: 100%;
                        padding: 8px 12px;
                        font-size: 13px;
                        border: 1px solid ${c.border};
                        border-radius: 6px;
                        background: ${this._settingsThemeColors().bg};
                        color: ${c.fg};
                        box-sizing: border-box;
                    ">
                </div>
                <div style="margin-bottom: 16px;">
                    <label for="wf-feedback-description" style="display: block; font-size: 12px; font-weight: 500; color: ${c.fg}; margin-bottom: 4px;">Description</label>
                    <textarea id="wf-feedback-description" placeholder="Describe your feedback, feature request, or bug in as much detail as you’d like." rows="5" style="
                        width: 100%;
                        padding: 8px 12px;
                        font-size: 13px;
                        border: 1px solid ${c.border};
                        border-radius: 6px;
                        background: ${this._settingsThemeColors().bg};
                        color: ${c.fg};
                        resize: vertical;
                        box-sizing: border-box;
                        font-family: inherit;
                    "></textarea>
                </div>
                <button type="button" id="wf-feedback-submit" style="
                    width: 100%;
                    padding: 10px 16px;
                    font-size: 13px;
                    font-weight: 600;
                    color: white;
                    background: var(--brand, #4f46e5);
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                    transition: background 0.2s;
                ">Create GitHub Issue</button>
            </div>
            </div>
            </div>
        `;

        const staleMsg = document.getElementById('wf-settings-message');
        if (staleMsg && !modal.contains(staleMsg)) {
            staleMsg.remove();
        }
        
        document.body.appendChild(modal);

        const self = this;
        modal.addEventListener('close', () => {
            self._stopForeignModalObserver();
            self._modalOpen = false;
            const msg = document.getElementById('wf-settings-message');
            if (msg) msg.style.display = 'none';
        });

        this._ensureMessageElement(modal);
        
        // Attach event listeners
        this._attachModalListeners(modal, orderedPlugins, orderedDevPlugins);
        this._updateSettingsMessage(modal, archetypePlugins);
        
        return modal;
    },

    _createPluginToggleHTML(plugin, submoduleLoggingEnabled, globalEnabled) {
        const c = this._settingsThemeColors();
        const isEnabled = PluginManager.isEnabled(plugin.id);
        const isDisabled = !globalEnabled;
        const moduleLoggingEnabled = Logger.isModuleLoggingEnabled(plugin.id);
        
        // Build sub-options HTML if plugin has them
        const subOptionsHTML = this._createSubOptionsHTML(plugin, isEnabled, isDisabled);
        
        const moduleToggleHTML = Context.isDevBranch && submoduleLoggingEnabled && isEnabled ? `
                <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 10px; padding-top: 10px; border-top: 1px dashed ${c.border};">
                    <label style="font-size: 12px; color: ${c.muted};" for="wf-plugin-log-${plugin.id}">
                        Module Logging
                    </label>
                    ${this._createSwitchHTML(`wf-plugin-log-${plugin.id}`, moduleLoggingEnabled, null, isDisabled, { size: 'small', variant: 'log' })}
                </div>
        ` : '';
        const removeFromCacheHTML = !isEnabled ? `
                <div style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed ${c.border};">
                    <button type="button" id="wf-plugin-clear-cache-${plugin.id}" class="${this._settingsBtnClass('basic', 'compact')} wf-dash-btn--full" data-plugin-id="${plugin.id}">Remove from Cache</button>
                </div>
        ` : '';
        return `
            <div class="wf-plugin-item" data-plugin-id="${plugin.id}" style="position: relative; display: flex; flex-direction: column; padding: 12px; border: 1px solid ${c.border}; border-radius: 8px; margin-bottom: 10px; background: ${this._settingsThemeColors().card}; will-change: transform;">
                <div style="display: flex; align-items: center; justify-content: space-between;">
                    <div style="display: flex; align-items: center; gap: 8px; min-width: 0;">
                        <div class="wf-drag-handle" title="Drag to reorder" style="width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; cursor: grab; color: ${c.muted}; user-select: none;">
                            <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                                <line x1="4" y1="5" x2="16" y2="5"></line>
                                <line x1="4" y1="10" x2="16" y2="10"></line>
                                <line x1="4" y1="15" x2="16" y2="15"></line>
                            </svg>
                        </div>
                        <div style="display: flex; align-items: baseline; gap: 4px; min-width: 0; overflow: hidden;">
                            <label style="font-size: 14px; font-weight: 500; cursor: pointer; color: ${c.fg}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" for="wf-plugin-${plugin.id}">
                                ${plugin.name || plugin.id}
                            </label>
                            ${plugin._version ? `<span style="font-size: 11px; font-weight: 400; color: ${c.muted}; flex-shrink: 0;">(${plugin._version})</span>` : ''}
                        </div>
                    </div>
                    ${this._createSwitchHTML(`wf-plugin-${plugin.id}`, isEnabled, plugin.id, isDisabled)}
                </div>
                <div style="font-size: 12px; color: ${c.muted}; margin-top: 6px; line-height: 1.4;">
                    ${plugin.description || 'No description available'}
                </div>
                ${subOptionsHTML}
                ${moduleToggleHTML}
                ${removeFromCacheHTML}
            </div>
        `;
    },
    
    _createSubOptionsHTML(plugin, pluginEnabled, globalDisabled) {
        const c = this._settingsThemeColors();
        if (!plugin.subOptions || !Array.isArray(plugin.subOptions) || plugin.subOptions.length === 0) {
            return '';
        }
        
        // Only show sub-options when the plugin is enabled
        if (!pluginEnabled) {
            return '';
        }
        
        const subOptionItems = plugin.subOptions.map(subOption => {
            const subOptionId = `wf-suboption-${plugin.id}-${subOption.id}`;
            const defaultValue = subOption.enabledByDefault !== false;
            const isSubOptionEnabled = Storage.getSubOptionEnabled(plugin.id, subOption.id, defaultValue);
            const isDisabled = globalDisabled;
            
            return `
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 6px 0;">
                    <div style="flex: 1; min-width: 0;">
                        <label style="font-size: 12px; color: ${c.muted}; cursor: pointer;" for="${subOptionId}">
                            ${subOption.name || subOption.id}
                        </label>
                        ${subOption.description ? `<div style="font-size: 11px; color: ${c.muted}; margin-top: 2px;">${subOption.description}</div>` : ''}
                    </div>
                    ${this._createSwitchHTML(subOptionId, isSubOptionEnabled, null, isDisabled, { size: 'small', variant: 'sub' })}
                </div>
            `;
        }).join('');
        
        return `
            <div style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed ${c.border};">
                <div style="margin-left: 12px;">
                    ${subOptionItems}
                </div>
            </div>
        `;
    },
    
    _createToggleHTML(id, label, isEnabled, variant = 'main') {
        const c = this._settingsThemeColors();
        return `
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; border: 1px solid ${c.border}; border-radius: 6px; background: ${this._settingsThemeColors().card};">
                <label style="font-size: 13px; color: ${c.fg};" for="${id}">${label}</label>
                ${this._createSwitchHTML(id, isEnabled, null, false, { variant })}
            </div>
        `;
    },
    
    _createSwitchHTML(id, isEnabled, pluginId = null, isDisabled = false, opts = {}) {
        const dataAttr = pluginId ? `data-plugin-id="${pluginId}"` : '';
        const disabledAttr = isDisabled ? 'disabled' : '';
        const isSmall = opts.size === 'small';
        // Main toggles: green. Sub-options: blue. Log options: yellow.
        const variant = opts.variant || (isSmall ? 'sub' : 'main');
        const onColor = variant === 'main' ? '#22c55e' : variant === 'log' ? '#ca8a04' : '#6366f1';
        const theme = this._settingsThemeColors();
        const offTrack = theme.hover;
        const disabledTrack = theme.border;
        const sliderBg = isDisabled ? disabledTrack : (isEnabled ? onColor : offTrack);
        const knobBg = isDisabled ? '#f3f4f6' : 'white';
        const knobShadow = isDisabled ? 'none' : '0 1px 3px rgba(0,0,0,0.2)';
        const w = isSmall ? 33 : 44;
        const h = isSmall ? 18 : 24;
        const knobSize = isSmall ? 13.5 : 18;
        const knobLeftOn = isSmall ? 17 : 23;
        const knobLeftOff = 3;
        const knobBottom = isSmall ? 2 : 3;
        const onColorAttr = ` data-wf-on-color="${onColor}" data-wf-knob-left-on="${knobLeftOn}" data-wf-knob-left-off="${knobLeftOff}" data-wf-knob-bottom="${knobBottom}"`;
        return `
            <label style="position: relative; display: inline-block; width: ${w}px; height: ${h}px; flex-shrink: 0; ${isDisabled ? 'opacity: 0.6; cursor: not-allowed;' : ''}">
                <input type="checkbox" id="${id}" ${dataAttr} ${isEnabled ? 'checked' : ''} ${disabledAttr} style="opacity: 0; width: 0; height: 0; position: absolute;">
                <span class="wf-toggle-slider" style="
                    position: absolute;
                    cursor: ${isDisabled ? 'not-allowed' : 'pointer'};
                    top: 0; left: 0; right: 0; bottom: 0;
                    background-color: ${sliderBg};
                    transition: 0.2s;
                    border-radius: 24px;
                "${onColorAttr}>
                    <span style="
                        position: absolute;
                        height: ${knobSize}px;
                        width: ${knobSize}px;
                        left: ${isEnabled ? knobLeftOn + 'px' : knobLeftOff + 'px'};
                        bottom: ${knobBottom}px;
                        background-color: ${knobBg};
                        transition: 0.2s;
                        border-radius: 50%;
                        box-shadow: ${knobShadow};
                    "></span>
                </span>
            </label>
        `;
    },
    
    _attachModalListeners(modal, plugins, devPlugins = []) {
        const self = this;
        const allPlugins = [...plugins, ...devPlugins];
        
        // Close button
        const closeBtn = Context.dom.query('#wf-settings-close', {
            root: modal,
            context: `${this.id}.settingsClose`
        });
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                self._closeModal();
            });
        }

        const settingsRefreshLink = Context.dom.query('#wf-settings-refresh-link', {
            root: modal,
            context: `${this.id}.settingsChangedRefreshLink`
        });
        if (settingsRefreshLink) {
            settingsRefreshLink.addEventListener('click', (e) => {
                e.preventDefault();
                if (typeof Context.requestExtensionReload === 'function') {
                    Context.requestExtensionReload('settings-ui settings changed refresh');
                } else {
                    window.location.reload();
                }
            });
        }

        // Click outside the panel (on the dialog backdrop) closes the settings dialog.
        modal.addEventListener('click', (e) => {
            if (!e.isTrusted || e.target !== modal) return;

            const content = Context.dom.query('#wf-settings-content', {
                root: modal,
                context: `${this.id}.settingsContent`
            });
            const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
            if (content && (path.includes(content) || content.contains(e.target))) return;

            Logger.debug('closing settings modal from backdrop click');
            self._closeModal();
        });

        this._attachUpdateBannerListeners(modal, 'settings-ui');
        this._attachOpsRefreshBannerListeners(modal, 'settings-ui');
        this._syncOpsRefreshBanner(modal);

        // Tab buttons
        this._attachTabListeners(modal);
        if (Context.opsTab && typeof Context.opsTab.attachSettingsListeners === 'function') {
            Context.opsTab.attachSettingsListeners(modal, this);
        } else if (Context.opsTab) {
            Logger.warn('Context.opsTab.attachSettingsListeners unavailable');
        }
        this._switchSettingsTab(modal, (() => {
            const pending = this._pendingSettingsTabId;
            this._pendingSettingsTabId = null;
            if (pending && this._getSettingsTabs().some((t) => t.id === pending)) {
                return pending;
            }
            return this._getDefaultSettingsTabId();
        })());

        // Global toggle (regular plugins only)
        const globalToggle = Context.dom.query('#wf-global-enabled', {
            root: modal,
            context: `${this.id}.globalToggle`
        });
        if (globalToggle) {
            globalToggle.addEventListener('change', (e) => {
                this._handleToggleChange(e);
                const isEnabled = e.target.checked;
                this._setGlobalEnabled(isEnabled);
                if (!isEnabled) {
                    this._storeGlobalSnapshot(plugins);
                    plugins.forEach(plugin => {
                        PluginManager.setEnabled(plugin.id, false);
                    });
                } else {
                    this._restoreGlobalSnapshot(plugins);
                }
                this._updateAllPluginsButtonsVisibility(modal, isEnabled);
                this._renderPluginList(modal, plugins);
                this._attachPluginToggleListeners(modal, plugins);
                this._attachPluginReorderListeners(modal, plugins);
                this._updateSettingsMessage(modal, plugins);
            });
        }

        const themeModeGroup = Context.dom.query('.fleet-ui-seg-group[aria-label="Preferred Visual Mode"]', {
            root: modal,
            context: `${this.id}.themeModeGroup`
        });
        if (themeModeGroup) {
            const ui = Context.uiLib;
            if (ui && typeof ui.bindSegmentGroup === 'function') {
                ui.bindSegmentGroup(themeModeGroup, {
                    valueAttr: 'data-theme-mode',
                    onChange: (next) => {
                        const prev = this._getPreferredThemeMode();
                        if (next === prev) return;
                        this._pendingSettingsTabId = this._getActiveSettingsTabId(modal);
                        this._setPreferredThemeMode(next);
                        Logger.log(`Preferred Visual Mode → ${next}`);
                        this._captureOpsState(modal);
                        const wasOpen = this._modalOpen;
                        modal.remove();
                        this._modalOpen = false;
                        if (wasOpen) {
                            this._openSettingsModal();
                        }
                    }
                });
            }
        }

        // All On / All Off buttons (regular plugins only)
        const allOnBtn = Context.dom.query('#wf-all-plugins-on', {
            root: modal,
            context: `${this.id}.allOnButton`
        });
        if (allOnBtn) {
            allOnBtn.addEventListener('click', () => {
                plugins.forEach(plugin => {
                    PluginManager.setEnabled(plugin.id, true);
                });
                this._renderPluginList(modal, plugins);
                this._attachPluginToggleListeners(modal, plugins);
                this._attachPluginReorderListeners(modal, plugins);
                this._updateSettingsMessage(modal, plugins);
            });
            allOnBtn.addEventListener('mouseenter', () => {
                allOnBtn.style.background = this._settingsThemeColors().hover;
                allOnBtn.style.borderColor = this._settingsThemeColors().borderHover;
            });
            allOnBtn.addEventListener('mouseleave', () => {
                allOnBtn.style.background = this._settingsThemeColors().card;
                allOnBtn.style.borderColor = this._settingsThemeColors().border;
            });
        }

        const allOffBtn = Context.dom.query('#wf-all-plugins-off', {
            root: modal,
            context: `${this.id}.allOffButton`
        });
        if (allOffBtn) {
            allOffBtn.addEventListener('click', () => {
                plugins.forEach(plugin => {
                    PluginManager.setEnabled(plugin.id, false);
                });
                this._renderPluginList(modal, plugins);
                this._attachPluginToggleListeners(modal, plugins);
                this._attachPluginReorderListeners(modal, plugins);
                this._updateSettingsMessage(modal, plugins);
            });
            allOffBtn.addEventListener('mouseenter', () => {
                allOffBtn.style.background = this._settingsThemeColors().hover;
                allOffBtn.style.borderColor = this._settingsThemeColors().borderHover;
            });
            allOffBtn.addEventListener('mouseleave', () => {
                allOffBtn.style.background = this._settingsThemeColors().card;
                allOffBtn.style.borderColor = this._settingsThemeColors().border;
            });
        }

        // Dev global toggle (dev plugins only)
        if (Context.isDevBranch && devPlugins.length > 0) {
            const devGlobalToggle = Context.dom.query('#wf-dev-global-enabled', {
                root: modal,
                context: `${this.id}.devGlobalToggle`
            });
            if (devGlobalToggle) {
                devGlobalToggle.addEventListener('change', (e) => {
                    this._handleToggleChange(e);
                    const isEnabled = e.target.checked;
                    this._setDevGlobalEnabled(isEnabled);
                    if (!isEnabled) {
                        this._storeDevGlobalSnapshot(devPlugins);
                        devPlugins.forEach(plugin => {
                            PluginManager.setEnabled(plugin.id, false);
                        });
                    } else {
                        this._restoreDevGlobalSnapshot(devPlugins);
                    }
                    this._updateDevPluginsButtonsVisibility(modal, isEnabled);
                    this._renderDevPluginList(modal, devPlugins);
                    this._attachPluginToggleListeners(modal, devPlugins, 'dev');
                    this._attachPluginReorderListeners(modal, devPlugins, 'dev');
                    this._updateSettingsMessage(modal, plugins);
                });
            }

            // Dev All On / All Off buttons (dev plugins only)
            const allDevOnBtn = Context.dom.query('#wf-all-dev-plugins-on', {
                root: modal,
                context: `${this.id}.allDevOnButton`
            });
            if (allDevOnBtn) {
                allDevOnBtn.addEventListener('click', () => {
                    devPlugins.forEach(plugin => {
                        PluginManager.setEnabled(plugin.id, true);
                    });
                    this._renderDevPluginList(modal, devPlugins);
                    this._attachPluginToggleListeners(modal, devPlugins, 'dev');
                    this._attachPluginReorderListeners(modal, devPlugins, 'dev');
                    this._updateSettingsMessage(modal, plugins);
                });
                allDevOnBtn.addEventListener('mouseenter', () => {
                    allDevOnBtn.style.background = this._settingsThemeColors().hover;
                    allDevOnBtn.style.borderColor = this._settingsThemeColors().borderHover;
                });
                allDevOnBtn.addEventListener('mouseleave', () => {
                    allDevOnBtn.style.background = this._settingsThemeColors().card;
                    allDevOnBtn.style.borderColor = this._settingsThemeColors().border;
                });
            }

            const allDevOffBtn = Context.dom.query('#wf-all-dev-plugins-off', {
                root: modal,
                context: `${this.id}.allDevOffButton`
            });
            if (allDevOffBtn) {
                allDevOffBtn.addEventListener('click', () => {
                    devPlugins.forEach(plugin => {
                        PluginManager.setEnabled(plugin.id, false);
                    });
                    this._renderDevPluginList(modal, devPlugins);
                    this._attachPluginToggleListeners(modal, devPlugins, 'dev');
                    this._attachPluginReorderListeners(modal, devPlugins, 'dev');
                    this._updateSettingsMessage(modal, plugins);
                });
                allDevOffBtn.addEventListener('mouseenter', () => {
                    allDevOffBtn.style.background = this._settingsThemeColors().hover;
                    allDevOffBtn.style.borderColor = this._settingsThemeColors().borderHover;
                });
                allDevOffBtn.addEventListener('mouseleave', () => {
                    allDevOffBtn.style.background = this._settingsThemeColors().card;
                    allDevOffBtn.style.borderColor = this._settingsThemeColors().border;
                });
            }
        }

        // Plugin toggles
        this._attachPluginToggleListeners(modal, plugins);
        this._attachPluginReorderListeners(modal, plugins);
        
        // Dev plugin toggles (if dev branch and dev plugins exist)
        if (Context.isDevBranch && devPlugins.length > 0) {
            this._attachPluginToggleListeners(modal, devPlugins, 'dev');
            this._attachPluginReorderListeners(modal, devPlugins, 'dev');
        }
        
        // Debug toggle (host Logger.debug only)
        const debugToggle = Context.dom.query('#wf-debug-enabled', {
            root: modal,
            context: `${this.id}.debugToggle`
        });
        if (debugToggle) {
            debugToggle.addEventListener('change', (e) => {
                this._handleToggleChange(e);
                Logger.setDebugEnabled(e.target.checked);
                this._updateSettingsMessage(modal, plugins);
            });
        }

        // Submodule logging toggle
        const submoduleToggle = Context.dom.query('#wf-submodule-logging-enabled', {
            root: modal,
            context: `${this.id}.submoduleToggle`
        });
        if (submoduleToggle) {
            submoduleToggle.addEventListener('change', (e) => {
                this._handleToggleChange(e);
                Logger.setSubmoduleLoggingEnabled(e.target.checked);
                this._updateAllModuleLoggingButtonsVisibility(modal, e.target.checked);
                this._renderPluginList(modal, plugins);
                this._attachPluginToggleListeners(modal, plugins);
                this._attachPluginReorderListeners(modal, plugins);
                if (Context.isDevBranch && devPlugins.length > 0) {
                    this._renderDevPluginList(modal, devPlugins);
                    this._attachPluginToggleListeners(modal, devPlugins, 'dev');
                    this._attachPluginReorderListeners(modal, devPlugins, 'dev');
                }
                this._renderCoreLibModuleLoggingList(modal);
                this._updateSettingsMessage(modal, plugins);
            });
        }

        this._attachCoreLibModuleLoggingListeners(modal, plugins);

        // All module logging On / Off — every loaded plugin (archetype, core, libs, ops, dev)
        const allModuleLogOnBtn = Context.dom.query('#wf-all-module-logging-on', {
            root: modal,
            context: `${this.id}.allModuleLogOnButton`
        });
        if (allModuleLogOnBtn) {
            allModuleLogOnBtn.addEventListener('click', () => {
                PluginManager.getAll().forEach(plugin => {
                    Logger.setModuleLoggingEnabled(plugin.id, true);
                });
                this._renderPluginList(modal, plugins);
                if (Context.isDevBranch && devPlugins.length > 0) {
                    this._renderDevPluginList(modal, devPlugins);
                    this._attachPluginToggleListeners(modal, devPlugins, 'dev');
                    this._attachPluginReorderListeners(modal, devPlugins, 'dev');
                }
                this._attachPluginToggleListeners(modal, plugins);
                this._renderCoreLibModuleLoggingList(modal);
                this._updateSettingsMessage(modal, plugins);
            });
            allModuleLogOnBtn.addEventListener('mouseenter', () => {
                allModuleLogOnBtn.style.background = this._settingsThemeColors().hover;
                allModuleLogOnBtn.style.borderColor = this._settingsThemeColors().borderHover;
            });
            allModuleLogOnBtn.addEventListener('mouseleave', () => {
                allModuleLogOnBtn.style.background = this._settingsThemeColors().card;
                allModuleLogOnBtn.style.borderColor = this._settingsThemeColors().border;
            });
        }
        const allModuleLogOffBtn = Context.dom.query('#wf-all-module-logging-off', {
            root: modal,
            context: `${this.id}.allModuleLogOffButton`
        });
        if (allModuleLogOffBtn) {
            allModuleLogOffBtn.addEventListener('click', () => {
                PluginManager.getAll().forEach(plugin => {
                    Logger.setModuleLoggingEnabled(plugin.id, false);
                });
                this._renderPluginList(modal, plugins);
                if (Context.isDevBranch && devPlugins.length > 0) {
                    this._renderDevPluginList(modal, devPlugins);
                    this._attachPluginToggleListeners(modal, devPlugins, 'dev');
                    this._attachPluginReorderListeners(modal, devPlugins, 'dev');
                }
                this._attachPluginToggleListeners(modal, plugins);
                this._renderCoreLibModuleLoggingList(modal);
                this._updateSettingsMessage(modal, plugins);
            });
            allModuleLogOffBtn.addEventListener('mouseenter', () => {
                allModuleLogOffBtn.style.background = this._settingsThemeColors().hover;
                allModuleLogOffBtn.style.borderColor = this._settingsThemeColors().borderHover;
            });
            allModuleLogOffBtn.addEventListener('mouseleave', () => {
                allModuleLogOffBtn.style.background = this._settingsThemeColors().card;
                allModuleLogOffBtn.style.borderColor = this._settingsThemeColors().border;
            });
        }
        
        // Simulate Update Banner toggle (dev branch only)
        if (Context.isDevBranch) {
            const pulseOverrideToggle = Context.dom.query('#wf-pulse-override-enabled', {
                root: modal,
                context: `${this.id}.pulseOverrideToggle`
            });
            if (pulseOverrideToggle) {
                pulseOverrideToggle.addEventListener('change', (e) => {
                    this._handleToggleChange(e);
                    const enabled = e.target.checked;
                    Logger.log(`Simulate Update Banner toggle changed to: ${enabled}`);
                    this._setPulseOverrideEnabled(enabled);
                    // Reapply button behavior to update styles
                    const settingsBtn = document.getElementById('wf-settings-btn');
                    if (settingsBtn) {
                        this._applySettingsButtonBehavior(settingsBtn);
                    }
                    // Recreate modal to show/hide update banner
                    this._closeModal();
                    setTimeout(() => {
                        this._toggleModal();
                    }, 100);
                });
            }
        }
        
        // Reload plugins link
        const reloadLink = Context.dom.query('#wf-reload-plugins', {
            root: modal,
            context: `${this.id}.reloadLink`
        });
        if (reloadLink) {
            reloadLink.addEventListener('click', (e) => {
                e.preventDefault();
                if (typeof Context.requestExtensionReload === 'function') {
                    Context.requestExtensionReload('settings-ui reload plugins link');
                } else {
                    window.location.reload();
                }
            });
        }

        // Clear cache button
        const clearCacheBtn = Context.dom.query('#wf-clear-cache', {
            root: modal,
            context: `${this.id}.clearCacheButton`
        });
        if (clearCacheBtn) {
            clearCacheBtn.addEventListener('click', () => {
                const confirmed = confirm(
                    'Are you sure? This will clear all settings and data stored by this userscript, ' +
                    'including server actions, dashboard caches, and plugin preferences. ' +
                    'Local build handshake keys on the page are not affected.'
                );
                if (confirmed) {
                    const allPlugins = PluginManager.getAll();
                    const clearedCount = Storage.clearAll(allPlugins);
                    Logger.log(`Cache cleared: ${clearedCount} keys removed`);
                    alert(`Cache cleared successfully. ${clearedCount} storage keys were removed. The page will now reload.`);
                    if (typeof Context.requestExtensionReload === 'function') {
                        Context.requestExtensionReload('settings-ui clear cache');
                    } else {
                        window.location.reload();
                    }
                }
            });
        }

        // Feedback: Create GitHub Issue
        const feedbackSubmitBtn = Context.dom.query('#wf-feedback-submit', {
            root: modal,
            context: `${this.id}.feedbackSubmit`
        });
        if (feedbackSubmitBtn) {
            feedbackSubmitBtn.addEventListener('click', () => {
                const titleEl = Context.dom.query('#wf-feedback-title', { root: modal, context: `${this.id}.feedbackTitle` });
                const descEl = Context.dom.query('#wf-feedback-description', { root: modal, context: `${this.id}.feedbackDescription` });
                const title = (titleEl && titleEl.value && titleEl.value.trim()) ? titleEl.value.trim() : 'Feedback';
                let body = (descEl && descEl.value) ? descEl.value.trim() : '';
                const version = Context.version || 'unknown';
                const archetypeId = Context.currentArchetype ? Context.currentArchetype.id : 'global';
                if (body) body += '\n\n';
                body += '---\n*Fleet Enhancer v' + version + ' · ' + archetypeId + '*';
                const owner = Context.githubOwner || 'Fleet-AI-Operations';
                const repo = Context.githubRepo || 'fleet-ux-improvements';
                const url = 'https://github.com/' + owner + '/' + repo + '/issues/new?title=' + encodeURIComponent(title) + '&body=' + encodeURIComponent(body);
                window.open(url, '_blank', 'noopener,noreferrer');
                Logger.log('Opened GitHub issue draft: ' + title);
                self._closeModal();
            });
            feedbackSubmitBtn.addEventListener('mouseenter', () => {
                feedbackSubmitBtn.style.background = 'var(--brand-hover, #4338ca)';
            });
            feedbackSubmitBtn.addEventListener('mouseleave', () => {
                feedbackSubmitBtn.style.background = 'var(--brand, #4f46e5)';
            });
        }
    },
    
    _handleToggleChange(e) {
        const slider = e.target.nextElementSibling;
        const knob = Context.dom.query('span', {
            root: slider,
            context: `${this.id}.toggleKnob`
        });
        const isChecked = e.target.checked;
        const onColor = slider.dataset.wfOnColor || 'var(--brand, #4f46e5)';
        const knobLeftOn = slider.dataset.wfKnobLeftOn != null ? slider.dataset.wfKnobLeftOn + 'px' : '23px';
        const knobLeftOff = slider.dataset.wfKnobLeftOff != null ? slider.dataset.wfKnobLeftOff + 'px' : '3px';
        slider.style.backgroundColor = isChecked ? onColor : this._settingsThemeColors().hover;
        if (knob) {
            knob.style.left = isChecked ? knobLeftOn : knobLeftOff;
        }
    },

    _renderPluginList(modal, plugins) {
        const c = this._settingsThemeColors();
        const container = Context.dom.query('#wf-plugin-list', {
            root: modal,
            context: `${this.id}.pluginList`
        });
        if (!container) return;
        if (!plugins || plugins.length === 0) {
            const noPluginsMsg = Context.isOutdated
                ? 'No plugins will load until you update the userscript.'
                : 'No plugins loaded for this page.';
            container.innerHTML = `<p style="color: ${c.muted}; font-size: 13px; font-style: italic;">${noPluginsMsg}</p>`;
            return;
        }
        const submoduleLoggingEnabled = Logger.isSubmoduleLoggingEnabled();
        const globalEnabled = this._getGlobalEnabled();
        const orderedPlugins = this._getOrderedPlugins(plugins, this._settingsArchetypeId, 'regular');
        container.innerHTML = orderedPlugins
            .map(plugin => this._createPluginToggleHTML(plugin, submoduleLoggingEnabled, globalEnabled))
            .join('');
    },

    _renderDevPluginList(modal, devPlugins) {
        const c = this._settingsThemeColors();
        const container = Context.dom.query('#wf-dev-plugin-list', {
            root: modal,
            context: `${this.id}.devPluginList`
        });
        if (!container) return;
        if (!devPlugins || devPlugins.length === 0) {
            container.innerHTML = `<p style="color: ${c.muted}; font-size: 13px; font-style: italic;">No dev plugins loaded.</p>`;
            return;
        }
        const submoduleLoggingEnabled = Logger.isSubmoduleLoggingEnabled();
        const devGlobalEnabled = this._getDevGlobalEnabled();
        const orderedDevPlugins = this._getOrderedPlugins(devPlugins, this._settingsArchetypeId, 'dev');
        container.innerHTML = orderedDevPlugins
            .map(plugin => this._createPluginToggleHTML(plugin, submoduleLoggingEnabled, devGlobalEnabled))
            .join('');
    },

    _attachPluginToggleListeners(modal, plugins, listType = 'regular') {
        const listId = listType === 'dev' ? 'wf-dev-plugin-list' : 'wf-plugin-list';
        plugins.forEach(plugin => {
            const checkbox = Context.dom.query(`#wf-plugin-${plugin.id}`, {
                root: modal,
                context: `${this.id}.pluginToggle`
            });
            if (checkbox) {
                checkbox.addEventListener('change', (e) => {
                    this._handleToggleChange(e);
                    PluginManager.setEnabled(plugin.id, e.target.checked);
                    if (listType === 'dev') {
                        this._renderDevPluginList(modal, plugins);
                        this._attachPluginToggleListeners(modal, plugins, 'dev');
                        this._attachPluginReorderListeners(modal, plugins, 'dev');
                    } else {
                        this._renderPluginList(modal, plugins);
                        this._attachPluginToggleListeners(modal, plugins);
                        this._attachPluginReorderListeners(modal, plugins);
                    }
                    // Get all plugins (regular + dev) for settings message
                    const allArchetypePlugins = PluginManager.getAll().filter(p => p.phase !== 'core' && !p._isDev);
                    this._updateSettingsMessage(modal, allArchetypePlugins);
                });
            }
            
            // Attach sub-option toggle listeners
            if (plugin.subOptions && Array.isArray(plugin.subOptions)) {
                plugin.subOptions.forEach(subOption => {
                    const subOptionCheckbox = Context.dom.query(`#wf-suboption-${plugin.id}-${subOption.id}`, {
                        root: modal,
                        context: `${this.id}.subOptionToggle`
                    });
                    if (subOptionCheckbox) {
                        subOptionCheckbox.addEventListener('change', (e) => {
                            this._handleToggleChange(e);
                            Storage.setSubOptionEnabled(plugin.id, subOption.id, e.target.checked);
                            this._updateSettingsMessage(modal, plugins);
                        });
                    }
                });
            }
            
            const moduleCheckbox = Context.dom.query(`#wf-plugin-log-${plugin.id}`, {
                root: modal,
                context: `${this.id}.pluginLogToggle`
            });
            if (moduleCheckbox) {
                moduleCheckbox.addEventListener('change', (e) => {
                    this._handleToggleChange(e);
                    Logger.setModuleLoggingEnabled(plugin.id, e.target.checked);
                    this._updateSettingsMessage(modal, plugins);
                });
            }

            const clearCacheBtn = Context.dom.query(`#wf-plugin-clear-cache-${plugin.id}`, {
                root: modal,
                context: `${this.id}.pluginClearCache`
            });
            if (clearCacheBtn) {
                clearCacheBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const live = PluginManager.get(plugin.id) || plugin;
                    try {
                        const result = Storage.clearModuleLocalData(live);
                        Logger.log(
                            `removed from cache: ${live.id}`
                            + (result && result.sourcePath ? ` (${result.sourcePath})` : '')
                        );
                        if (Context.buttonFeedback && typeof Context.buttonFeedback.flashSuccess === 'function') {
                            Context.buttonFeedback.flashSuccess(clearCacheBtn);
                        }
                    } catch (err) {
                        Logger.error(`Failed to remove ${plugin.id} from cache:`, err);
                        if (Context.buttonFeedback && typeof Context.buttonFeedback.flashFailure === 'function') {
                            Context.buttonFeedback.flashFailure(clearCacheBtn);
                        }
                    }
                });
            }
        });
    },

    _attachPluginReorderListeners(modal, plugins, listType = 'regular') {
        const listId = listType === 'dev' ? 'wf-dev-plugin-list' : 'wf-plugin-list';
        const boundKey = listType === 'dev' ? 'wfDevReorderBound' : 'wfReorderBound';
        const list = Context.dom.query(`#${listId}`, {
            root: modal,
            context: `${this.id}.pluginListReorder`
        });
        if (!list || list.dataset[boundKey] === 'true') return;
        list.dataset[boundKey] = 'true';

        const dragStateKey = listType === 'dev' ? '_wfDevPointerDragState' : '_wfPointerDragState';
        this[dragStateKey] = {
            list,
            listType,
            plugins,
            draggedItem: null,
            pointerStartX: 0,
            pointerStartY: 0,
            itemsGap: 0,
            rafPending: false
        };
        const dragState = this[dragStateKey];

        const getAllItems = () => Array.from(list.querySelectorAll('.wf-plugin-item[data-plugin-id]'));
        const getIdleItems = () => getAllItems().filter(item => item !== dragState.draggedItem);
        const getPointer = (e) => {
            const t = e.touches && e.touches[0] ? e.touches[0] : null;
            return {
                x: (typeof e.clientX === 'number' ? e.clientX : (t ? t.clientX : 0)),
                y: (typeof e.clientY === 'number' ? e.clientY : (t ? t.clientY : 0))
            };
        };
        const isItemAbove = (item) => item.hasAttribute('data-wf-is-above');
        const isItemToggled = (item) => item.hasAttribute('data-wf-is-toggled');

        const setItemsGap = () => {
            const idle = getIdleItems();
            if (idle.length <= 1) {
                dragState.itemsGap = 0;
                return;
            }
            const r1 = idle[0].getBoundingClientRect();
            const r2 = idle[1].getBoundingClientRect();
            dragState.itemsGap = Math.abs(r1.bottom - r2.top);
        };

        const disablePageScroll = () => {
            document.body.style.overflow = 'hidden';
            document.body.style.touchAction = 'none';
            document.body.style.userSelect = 'none';
        };

        const enablePageScroll = () => {
            document.body.style.overflow = '';
            document.body.style.touchAction = '';
            document.body.style.userSelect = '';
        };

        const initItemsState = () => {
            const all = getAllItems();
            const draggedIndex = all.indexOf(dragState.draggedItem);
            getIdleItems().forEach((item, i) => {
                // mark as above if its original index is above dragged item
                const idx = all.indexOf(item);
                if (idx !== -1 && idx < draggedIndex) {
                    item.setAttribute('data-wf-is-above', '');
                } else {
                    item.removeAttribute('data-wf-is-above');
                }
                item.removeAttribute('data-wf-is-toggled');
                item.style.willChange = 'transform';
            });
        };

        const updateIdleItemsStateAndPosition = () => {
            if (!dragState.draggedItem) return;
            const draggedRect = dragState.draggedItem.getBoundingClientRect();
            const draggedY = draggedRect.top + draggedRect.height / 2;

            // Update toggled state
            getIdleItems().forEach((item) => {
                const rect = item.getBoundingClientRect();
                const itemY = rect.top + rect.height / 2;
                if (isItemAbove(item)) {
                    if (draggedY <= itemY) item.setAttribute('data-wf-is-toggled', '');
                    else item.removeAttribute('data-wf-is-toggled');
                } else {
                    if (draggedY >= itemY) item.setAttribute('data-wf-is-toggled', '');
                    else item.removeAttribute('data-wf-is-toggled');
                }
            });

            // Update positions
            getIdleItems().forEach((item) => {
                if (isItemToggled(item)) {
                    const direction = isItemAbove(item) ? 1 : -1;
                    item.style.transform = `translateY(${direction * (draggedRect.height + dragState.itemsGap)}px)`;
                    item.style.transition = 'transform 0.2s ease';
                } else {
                    item.style.transform = '';
                    item.style.transition = 'transform 0.2s ease';
                }
            });
        };

        const applyNewItemsOrder = () => {
            const all = getAllItems();
            const reordered = [];

            all.forEach((item, index) => {
                if (item === dragState.draggedItem) return;
                if (!isItemToggled(item)) {
                    reordered[index] = item;
                    return;
                }
                const newIndex = isItemAbove(item) ? index + 1 : index - 1;
                reordered[newIndex] = item;
            });

            for (let i = 0; i < all.length; i++) {
                if (typeof reordered[i] === 'undefined') reordered[i] = dragState.draggedItem;
            }

            // Clear all transforms BEFORE DOM reorder to prevent visual artifacts
            all.forEach((item) => {
                item.style.transform = '';
                item.style.transition = '';
                item.style.zIndex = '';
            });

            reordered.forEach((item) => list.appendChild(item));

            // Persist order to storage from DOM order
            const orderRaw = Array.from(list.querySelectorAll('.wf-plugin-item[data-plugin-id]'))
                .map(el => el.getAttribute('data-plugin-id'))
                .filter(Boolean);
            const seen = new Set();
            const order = [];
            for (const id of orderRaw) {
                if (seen.has(id)) continue;
                seen.add(id);
                order.push(id);
            }
            this._setStoredPluginOrder(this._settingsArchetypeId, order, listType);

            // Update settings changed banner
            const allArchetypePlugins = PluginManager.getAll().filter(p => p.phase !== 'core' && !p._isDev);
            this._updateSettingsMessage(modal, allArchetypePlugins);
        };

        const cleanup = () => {
            if (!dragState.draggedItem) return;

            dragState.draggedItem.style.transform = '';
            dragState.draggedItem.style.transition = '';
            dragState.draggedItem.style.zIndex = '';
            dragState.draggedItem.style.willChange = '';
            dragState.draggedItem = null;

            getAllItems().forEach((item) => {
                item.removeAttribute('data-wf-is-above');
                item.removeAttribute('data-wf-is-toggled');
                item.style.transform = '';
                item.style.transition = '';
                item.style.willChange = '';
            });

            enablePageScroll();

            document.removeEventListener('mousemove', onPointerMove, true);
            document.removeEventListener('mouseup', onPointerUp, true);
            document.removeEventListener('touchmove', onPointerMove, { capture: true });
            document.removeEventListener('touchend', onPointerUp, true);
        };

        const onPointerMove = (e) => {
            if (!dragState.draggedItem) return;
            // prevent scrolling while dragging
            if (e.cancelable) e.preventDefault();

            const { x, y } = getPointer(e);
            const dx = x - dragState.pointerStartX;
            const dy = y - dragState.pointerStartY;

            dragState.draggedItem.style.transform = `translate(${dx}px, ${dy}px)`;
            dragState.draggedItem.style.zIndex = '10';
            dragState.draggedItem.style.willChange = 'transform';

            // Throttle expensive layout reads to rAF
            if (!dragState.rafPending) {
                dragState.rafPending = true;
                requestAnimationFrame(() => {
                    dragState.rafPending = false;
                    updateIdleItemsStateAndPosition();
                });
            }
        };

        const onPointerUp = () => {
            if (!dragState.draggedItem) return;
            applyNewItemsOrder();
            cleanup();
        };

        const onPointerDown = (e) => {
            // Only left click
            if (e.type === 'mousedown' && e.button !== 0) return;

            const handle = Context.dom.closest(e.target, '.wf-drag-handle', {
                root: list,
                context: `${this.id}.pluginPointerDragHandle`
            });
            if (!handle || !list.contains(handle)) return;

            const item = Context.dom.closest(handle, '.wf-plugin-item[data-plugin-id]', {
                root: list,
                context: `${this.id}.pluginPointerDragItem`
            });
            if (!item) return;

            dragState.draggedItem = item;
            const { x, y } = getPointer(e);
            dragState.pointerStartX = x;
            dragState.pointerStartY = y;

            setItemsGap();
            disablePageScroll();
            initItemsState();

            // Make dragged item feel draggable
            item.style.transition = 'none';

            document.addEventListener('mousemove', onPointerMove, true);
            document.addEventListener('mouseup', onPointerUp, true);
            document.addEventListener('touchmove', onPointerMove, { passive: false, capture: true });
            document.addEventListener('touchend', onPointerUp, true);

            Logger.debug(`Started pointer drag reorder (${listType})`);
        };

        list.addEventListener('mousedown', onPointerDown);
        list.addEventListener('touchstart', onPointerDown, { passive: true });
    },

    _getOrderedPlugins(plugins, archetypeId, listType = 'regular') {
        if (!plugins || plugins.length === 0) return [];
        const order = this._getStoredPluginOrder(archetypeId, plugins, listType);
        const byId = new Map(plugins.map(plugin => [plugin.id, plugin]));
        return order.map(id => byId.get(id)).filter(Boolean);
    },

    _getPluginOrderKey(archetypeId, listType = 'regular') {
        const prefix = listType === 'dev' ? 'dev-plugin-order' : 'plugin-order';
        return `${prefix}-${archetypeId || 'global'}`;
    },

    _setStoredPluginOrder(archetypeId, order, listType = 'regular') {
        const key = this._getPluginOrderKey(archetypeId, listType);
        Storage.set(key, JSON.stringify(order || []));
    },

    _getStoredPluginOrder(archetypeId, plugins, listType = 'regular') {
        const ids = plugins.map(plugin => plugin.id);
        const key = this._getPluginOrderKey(archetypeId, listType);
        const storedRaw = Storage.get(key, null);
        let stored = null;
        if (storedRaw) {
            try {
                stored = JSON.parse(storedRaw);
            } catch (e) {
                Logger.error(`Failed to parse plugin order for ${key}:`, e);
            }
        }
        if (!stored || !Array.isArray(stored)) {
            this._setStoredPluginOrder(archetypeId, ids, listType);
            return ids;
        }
        const valid = new Set(ids);
        const filtered = stored.filter(id => valid.has(id));

        // De-dupe while preserving first occurrence (fixes historical corrupted order)
        const seen = new Set();
        const deduped = [];
        for (const id of filtered) {
            if (seen.has(id)) continue;
            seen.add(id);
            deduped.push(id);
        }

        const missing = ids.filter(id => !seen.has(id));
        const normalized = deduped.concat(missing);

        if (JSON.stringify(stored) !== JSON.stringify(normalized)) {
            this._setStoredPluginOrder(archetypeId, normalized, listType);
        }
        return normalized;
    },

    _getSettingsSnapshot(plugins, archetypeId, devPlugins = []) {
        const sortedPlugins = plugins
            .map(plugin => plugin)
            .sort((a, b) => (a.id || '').localeCompare(b.id || ''));
        const snapshot = {
            globalEnabled: this._getGlobalEnabled(),
            pageRefreshConfirmationEnabled: this._getPageRefreshConfirmationEnabled(),
            extensionRefreshConfirmationEnabled: this._getExtensionRefreshConfirmationEnabled(),
            debug: Logger.isDebugEnabled(),
            submoduleLogging: Logger.isSubmoduleLoggingEnabled(),
            coreLibModuleLogging: this._getCoreLibPluginsForLogging().map(plugin => ({
                id: plugin.id,
                moduleLogging: Logger.isModuleLoggingEnabled(plugin.id)
            })),
            pluginStates: sortedPlugins.map(plugin => {
                const state = {
                    id: plugin.id,
                    enabled: PluginManager.isEnabled(plugin.id),
                    moduleLogging: Logger.isModuleLoggingEnabled(plugin.id)
                };
                // Include sub-option states if plugin has them
                if (plugin.subOptions && Array.isArray(plugin.subOptions)) {
                    state.subOptions = plugin.subOptions.map(subOption => ({
                        id: subOption.id,
                        enabled: Storage.getSubOptionEnabled(plugin.id, subOption.id, subOption.enabledByDefault !== false)
                    }));
                }
                return state;
            }),
            pluginOrder: this._getStoredPluginOrder(archetypeId, plugins)
        };
        if (devPlugins && devPlugins.length > 0) {
            snapshot.devGlobalEnabled = this._getDevGlobalEnabled();
            const sortedDev = devPlugins.slice().sort((a, b) => (a.id || '').localeCompare(b.id || ''));
            snapshot.devPluginStates = sortedDev.map(plugin => {
                const state = {
                    id: plugin.id,
                    enabled: PluginManager.isEnabled(plugin.id),
                    moduleLogging: Logger.isModuleLoggingEnabled(plugin.id)
                };
                if (plugin.subOptions && Array.isArray(plugin.subOptions)) {
                    state.subOptions = plugin.subOptions.map(subOption => ({
                        id: subOption.id,
                        enabled: Storage.getSubOptionEnabled(plugin.id, subOption.id, subOption.enabledByDefault !== false)
                    }));
                }
                return state;
            });
            snapshot.devPluginOrder = this._getStoredPluginOrder(archetypeId, devPlugins, 'dev');
        }
        return snapshot;
    },

    _getGlobalEnabled() {
        return Storage.get('global-plugins-enabled', true);
    },

    _setGlobalEnabled(enabled) {
        Storage.set('global-plugins-enabled', enabled);
    },

    _getPageRefreshConfirmationEnabled() {
        return Storage.get('page-refresh-confirmation-enabled', Context.defaultPageRefreshConfirmation);
    },

    _setPageRefreshConfirmationEnabled(enabled) {
        Storage.set('page-refresh-confirmation-enabled', enabled);
    },

    _getExtensionRefreshConfirmationEnabled() {
        return Storage.get('extension-refresh-confirmation-enabled', false);
    },

    _setExtensionRefreshConfirmationEnabled(enabled) {
        Storage.set('extension-refresh-confirmation-enabled', enabled);
    },
    
    _getPulseOverrideEnabled() {
        return Storage.get('pulse-override-enabled', false);
    },
    
    _setPulseOverrideEnabled(enabled) {
        Storage.set('pulse-override-enabled', enabled);
    },

    _storeGlobalSnapshot(plugins) {
        if (!Array.isArray(plugins)) return;
        const snapshot = plugins.map(plugin => ({
            id: plugin.id,
            enabled: PluginManager.isEnabled(plugin.id)
        }));
        Storage.set('global-plugins-previous', JSON.stringify(snapshot));
    },

    _restoreGlobalSnapshot(plugins) {
        if (!Array.isArray(plugins)) return;
        const raw = Storage.get('global-plugins-previous', null);
        if (!raw) return;
        let snapshot = null;
        try {
            snapshot = JSON.parse(raw);
        } catch (e) {
            Logger.error('Failed to parse global plugins snapshot:', e);
            return;
        }
        if (!Array.isArray(snapshot)) return;
        const byId = new Map(snapshot.map(item => [item.id, item.enabled]));
        plugins.forEach(plugin => {
            if (byId.has(plugin.id)) {
                PluginManager.setEnabled(plugin.id, Boolean(byId.get(plugin.id)));
            }
        });
    },

    _getDevGlobalEnabled() {
        // Main-like builds: default off. Dev branches: default on so dev archetype plugins load; per-plugin defaults still apply.
        return Storage.get('dev-global-plugins-enabled', Context.isDevBranch);
    },

    _setDevGlobalEnabled(enabled) {
        Storage.set('dev-global-plugins-enabled', enabled);
    },

    _storeDevGlobalSnapshot(devPlugins) {
        if (!Array.isArray(devPlugins)) return;
        const snapshot = devPlugins.map(plugin => ({
            id: plugin.id,
            enabled: PluginManager.isEnabled(plugin.id)
        }));
        Storage.set('dev-global-plugins-previous', JSON.stringify(snapshot));
    },

    _restoreDevGlobalSnapshot(devPlugins) {
        if (!Array.isArray(devPlugins)) return;
        const raw = Storage.get('dev-global-plugins-previous', null);
        if (!raw) return;
        let snapshot = null;
        try {
            snapshot = JSON.parse(raw);
        } catch (e) {
            Logger.error('Failed to parse dev global plugins snapshot:', e);
            return;
        }
        if (!Array.isArray(snapshot)) return;
        const byId = new Map(snapshot.map(item => [item.id, item.enabled]));
        devPlugins.forEach(plugin => {
            if (byId.has(plugin.id)) {
                PluginManager.setEnabled(plugin.id, Boolean(byId.get(plugin.id)));
            }
        });
    },

    _updateDevPluginsButtonsVisibility(modal, devGlobalEnabled) {
        const buttonsContainer = Context.dom.query('#wf-all-dev-plugins-buttons', {
            root: modal,
            context: `${this.id}.allDevPluginsButtonsVisibility`
        });
        if (buttonsContainer) {
            buttonsContainer.style.display = devGlobalEnabled ? 'flex' : 'none';
        }
    },

    _ensureMessageElement(modal) {
        let msg = modal.querySelector('#wf-settings-message');
        if (!msg) {
            const ab = this._alertBannerClasses();
            msg = document.createElement('div');
            msg.id = 'wf-settings-message';
            msg.className = ab.root + ' ' + ab.amberSoft;
            msg.style.cssText = 'display: none; margin-top: 12px; margin-bottom: 0; padding: 10px 12px; font-size: 13px; text-align: center;';
            msg.innerHTML = '<span class="' + ab.body + '">Settings changed. <a href="#" id="wf-settings-refresh-link" style="text-decoration: underline;">Refresh</a> the page for changes to take effect.</span>';
            const tabRow = modal.querySelector('#wf-settings-tab-row');
            if (tabRow && tabRow.parentElement) {
                tabRow.parentElement.insertBefore(msg, tabRow.nextSibling);
            } else {
                modal.insertBefore(msg, modal.firstChild);
            }
        }
        return msg;
    },

    _updateSettingsMessage(modal, plugins) {
        const msg = this._ensureMessageElement(modal);
        if (!msg) return;
        const devPlugins = this._settingsDevPlugins || [];
        const current = this._getSettingsSnapshot(plugins, this._settingsArchetypeId, devPlugins);
        const changed = JSON.stringify(current) !== JSON.stringify(this._initialSettingsSnapshot);
        msg.style.display = changed ? 'block' : 'none';
    },

    _updateAllPluginsButtonsVisibility(modal, globalEnabled) {
        const buttonsContainer = Context.dom.query('#wf-all-plugins-buttons', {
            root: modal,
            context: `${this.id}.allPluginsButtonsVisibility`
        });
        
        if (buttonsContainer) {
            buttonsContainer.style.display = globalEnabled ? 'flex' : 'none';
        }
    },

    _updateAllModuleLoggingButtonsVisibility(modal, submoduleLoggingEnabled) {
        const buttonsContainer = Context.dom.query('#wf-all-module-logging-buttons', {
            root: modal,
            context: `${this.id}.allModuleLoggingButtonsVisibility`
        });
        if (buttonsContainer) {
            buttonsContainer.style.display = submoduleLoggingEnabled ? 'flex' : 'none';
        }
        const coreLibContainer = Context.dom.query('#wf-core-lib-module-logging', {
            root: modal,
            context: `${this.id}.coreLibModuleLoggingVisibility`
        });
        if (coreLibContainer) {
            coreLibContainer.style.display = submoduleLoggingEnabled ? 'block' : 'none';
            if (submoduleLoggingEnabled) {
                this._renderCoreLibModuleLoggingList(modal);
            }
        }
    },

    _getCoreLibPluginsForLogging() {
        return PluginManager.getAll()
            .filter((p) => p && p.id && (p.phase === 'core' || p._isLib === true || p._isOps === true))
            .filter((p) => p._isDev !== true)
            .slice()
            .sort((a, b) => (a.name || a.id || '').localeCompare(b.name || b.id || ''));
    },

    _createCoreLibModuleLoggingHTML() {
        const c = this._settingsThemeColors();
        const plugins = this._getCoreLibPluginsForLogging();
        if (plugins.length === 0) {
            return `<p style="font-size: 12px; color: ${c.muted}; margin: 0;">No core or library modules loaded.</p>`;
        }
        const rows = plugins.map((plugin) => {
            const enabled = Logger.isModuleLoggingEnabled(plugin.id);
            const label = plugin.name || plugin.id;
            return `
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid ${c.border};">
                    <label style="font-size: 12px; color: ${c.fg}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding-right: 8px;" for="wf-core-lib-log-${plugin.id}" title="${plugin.id}">
                        ${label}
                    </label>
                    ${this._createSwitchHTML(`wf-core-lib-log-${plugin.id}`, enabled, null, false, { size: 'small', variant: 'log' })}
                </div>
            `;
        }).join('');
        return `
            <div style="font-size: 12px; font-weight: 600; color: ${c.fg}; margin-bottom: 6px;">Core and libraries</div>
            <div style="max-height: 180px; overflow-y: auto;">${rows}</div>
        `;
    },

    _renderCoreLibModuleLoggingList(modal) {
        const container = Context.dom.query('#wf-core-lib-module-logging', {
            root: modal,
            context: `${this.id}.renderCoreLibModuleLogging`
        });
        if (!container) return;
        const submoduleOn = Logger.isSubmoduleLoggingEnabled();
        container.style.display = submoduleOn ? 'block' : 'none';
        if (!submoduleOn) return;
        container.innerHTML = this._createCoreLibModuleLoggingHTML();
        this._attachCoreLibModuleLoggingListeners(modal);
    },

    _attachCoreLibModuleLoggingListeners(modal, pluginsForMessage) {
        const plugins = this._getCoreLibPluginsForLogging();
        plugins.forEach((plugin) => {
            const toggle = Context.dom.query(`#wf-core-lib-log-${plugin.id}`, {
                root: modal,
                context: `${this.id}.coreLibLog.${plugin.id}`
            });
            if (!toggle || toggle.dataset.wfBound === '1') return;
            toggle.dataset.wfBound = '1';
            toggle.addEventListener('change', (e) => {
                this._handleToggleChange(e);
                Logger.setModuleLoggingEnabled(plugin.id, e.target.checked);
                if (pluginsForMessage) {
                    this._updateSettingsMessage(modal, pluginsForMessage);
                }
            });
        });
    },
    
    _isOpsAccessConfigured() {
        return Context.opsTab ? Context.opsTab.isAccessConfigured() : false;
    },

    _getDefaultSettingsTabId() {
        return 'information';
    },

    _captureOpsState(modal) {
        if (Context.opsTab && typeof Context.opsTab.captureState === 'function') {
            Context.opsTab.captureState(modal);
        }
    },

    /** Public wrappers exposed for `Context.opsTab` (and potentially other core modules). */
    handleToggleChange(e) {
        return this._handleToggleChange(e);
    },

    rebuildSettingsTabRow(modal, preferredTabId, options) {
        return this._rebuildSettingsTabRow(modal, preferredTabId, options);
    },

    getActiveSettingsTabId(modal) {
        return this._getActiveSettingsTabId(modal);
    },

    _getActiveSettingsTabId(modal) {
        if (!modal) return this._getDefaultSettingsTabId();
        let active = null;
        modal.querySelectorAll('.wf-settings-pane').forEach(pane => {
            if (pane.style.display !== 'none') {
                active = pane.getAttribute('data-tab');
            }
        });
        return active || this._getDefaultSettingsTabId();
    },

    _syncTabRowActiveState(modal, tabId) {
        const tabRow = Context.dom.query('#wf-settings-tab-row', {
            root: modal,
            context: `${this.id}.tabRowSync`
        });
        if (!tabRow) return;
        const group = tabRow.querySelector('.fleet-ui-seg-group');
        if (group && Context.uiLib && typeof Context.uiLib.syncSegmentGroup === 'function') {
            Context.uiLib.syncSegmentGroup(group, tabId, 'data-tab');
            return;
        }
        tabRow.querySelectorAll('.wf-settings-tab').forEach((btn) => {
            const id = btn.getAttribute('data-tab');
            const isActive = id === tabId;
            btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
    },

    _rebuildSettingsTabRow(modal, preferredTabId, options = {}) {
        const tabRow = Context.dom.query('#wf-settings-tab-row', {
            root: modal,
            context: `${this.id}.tabRowRebuild`
        });
        if (!tabRow) return;
        const keepCurrentPane = options.keepCurrentPane === true;
        const tabs = this._getSettingsTabs();
        const validIds = tabs.map(t => t.id);
        let highlightTabId;
        if (keepCurrentPane) {
            highlightTabId = this._getActiveSettingsTabId(modal);
        } else if (preferredTabId != null) {
            highlightTabId = preferredTabId;
        } else {
            highlightTabId = this._getActiveSettingsTabId(modal);
        }
        if (!validIds.includes(highlightTabId)) {
            highlightTabId = this._getDefaultSettingsTabId();
        }
        const replacement = document.createElement('div');
        replacement.innerHTML = this._createTabRowHTML(tabs, highlightTabId);
        tabRow.replaceWith(replacement.firstElementChild);
        this._attachTabListeners(modal);
        if (keepCurrentPane) {
            this._syncTabRowActiveState(modal, highlightTabId);
            return;
        }
        this._switchSettingsTab(modal, highlightTabId);
    },


    _getSettingsTabs() {
        const tabs = [];
        tabs.push(
            { id: 'information', label: 'Information', doc: 'information-tab.md' },
            { id: 'settings', label: 'Settings' }
        );
        if (this._hasActiveDevSettings()) {
            tabs.push({ id: 'dev', label: 'Dev' });
        }
        tabs.push(
            { id: 'features', label: 'Features', doc: 'features-tab.md' },
            { id: 'feedback', label: 'Feedback' }
        );
        return tabs;
    },

    _createTabRowHTML(tabs, activeTabId) {
        const activeTab = activeTabId || this._getDefaultSettingsTabId();
        const ui = Context.uiLib;
        if (ui && typeof ui.segmentGroupHtml === 'function') {
            return (
                '<div id="wf-settings-tab-row" style="margin-top: 12px; max-width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch;">'
                + ui.segmentGroupHtml({
                    value: activeTab,
                    valueAttr: 'data-tab',
                    fill: true,
                    ariaLabel: 'Settings tabs',
                    options: tabs.map((t) => ({ value: t.id, label: t.label }))
                })
                + '</div>'
            );
        }
        const buttons = tabs.map((t) => {
            const isActive = t.id === activeTab;
            return `<button type="button" class="wf-settings-tab ${this._settingsBtnClass('basic', 'compact')}" data-tab="${t.id}" aria-pressed="${isActive ? 'true' : 'false'}">${t.label}</button>`;
        }).join('');
        return `<div id="wf-settings-tab-row" style="display: flex; gap: 8px; margin-top: 12px; flex-wrap: nowrap; overflow-x: auto; overflow-y: hidden; max-width: 100%; -webkit-overflow-scrolling: touch;">${buttons}</div>`;
    },

    _attachTabListeners(modal) {
        const tabRow = Context.dom.query('#wf-settings-tab-row', {
            root: modal,
            context: `${this.id}.tabRow`
        });
        if (!tabRow) return;
        const group = tabRow.querySelector('.fleet-ui-seg-group');
        if (group && Context.uiLib && typeof Context.uiLib.bindSegmentGroup === 'function') {
            delete group.dataset.fleetUiSegBound;
            Context.uiLib.bindSegmentGroup(group, {
                valueAttr: 'data-tab',
                onChange: (tabId) => this._switchSettingsTab(modal, tabId)
            });
            return;
        }
        tabRow.querySelectorAll('.wf-settings-tab').forEach((btn) => {
            btn.addEventListener('click', () => {
                const tabId = btn.getAttribute('data-tab');
                this._switchSettingsTab(modal, tabId);
            });
        });
    },

    _switchSettingsTab(modal, tabId) {
        const tabs = this._getSettingsTabs();
        this._syncTabRowActiveState(modal, tabId);
        modal.querySelectorAll('.wf-settings-pane').forEach(pane => {
            const id = pane.getAttribute('data-tab');
            pane.style.display = id === tabId ? 'block' : 'none';
        });
        const tabDef = tabs.find(t => t.id === tabId);
        if (tabDef && tabDef.doc) {
            const pane = Context.dom.query(`#wf-settings-pane-${tabId}`, { root: modal, context: `${this.id}.pane${tabId}` });
            if (pane && !pane.dataset.wfDocLoaded) {
                this._loadAndRenderDocTab(modal, tabId, tabDef.doc, pane);
            }
        }
    },

    _settingsModalDocBody(raw) {
        if (!raw || typeof raw !== 'string') return '';
        const firstNewline = raw.indexOf('\n');
        return firstNewline >= 0 ? raw.slice(firstNewline + 1).trim() : raw.trim();
    },

    _isMdTableRowLine(line) {
        return /^\s*\|.+\|/.test(line);
    },

    _parseMdTableCells(line) {
        const a = line.split('|').map(c => c.trim());
        let start = 0;
        let end = a.length;
        while (start < end && a[start] === '') start++;
        while (end > start && a[end - 1] === '') end--;
        return a.slice(start, end);
    },

    _isMdTableSeparatorCells(cells) {
        return cells.length > 0 && cells.every(c => /^[\s\-:]+$/.test(c));
    },

    _findEnvCodenameTableRange(lines) {
        const headingRe = /^####\s+Environment Codenames\s*$/i;
        let i = 0;
        while (i < lines.length && !headingRe.test(lines[i].trim())) i++;
        if (i >= lines.length) return null;
        let j = i + 1;
        while (j < lines.length && lines[j].trim() === '') j++;
        if (j >= lines.length || !this._isMdTableRowLine(lines[j])) return null;
        const tableStart = j;
        let k = tableStart;
        while (k < lines.length && this._isMdTableRowLine(lines[k])) k++;
        return { tableStart, tableEnd: k };
    },

    _extractInformationCodenameRows(body) {
        if (!body || typeof body !== 'string') return { rows: [] };
        const lines = body.split(/\r?\n/);
        const range = this._findEnvCodenameTableRange(lines);
        if (!range) return { rows: [] };
        const tableLines = lines.slice(range.tableStart, range.tableEnd);
        const rows = [];
        for (let r = 0; r < tableLines.length; r++) {
            const cells = this._parseMdTableCells(tableLines[r]);
            if (r === 0) continue;
            if (r === 1 && this._isMdTableSeparatorCells(cells)) continue;
            if (cells.length >= 2) {
                rows.push({ codename: cells[0], realApp: cells[1] });
            }
        }
        return { rows };
    },

    _prepareInformationTabMarkdown(body) {
        const lines = body.split(/\r?\n/);
        const range = this._findEnvCodenameTableRange(lines);
        if (!range) return { markdown: body, rows: [] };
        const { rows } = this._extractInformationCodenameRows(body);
        const newLines = [
            ...lines.slice(0, range.tableStart),
            ':::wf-env-codenames:::',
            ...lines.slice(range.tableEnd)
        ];
        return { markdown: newLines.join('\n'), rows };
    },

    _escapeHtmlCell(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    },

    _mountEnvCodenamesWidget(pane) {
        const c = this._settingsThemeColors();
        const root = pane.querySelector('#wf-env-codenames-root');
        if (!root) {
            Logger.debug('env codenames mount node missing');
            return;
        }
        if (root.dataset.wfEnvCodenamesMounted === '1') return;

        const raw = Context.settingsModalDocs && Context.settingsModalDocs['information-tab.md']
            ? Context.settingsModalDocs['information-tab.md'].raw
            : null;
        if (!raw || typeof raw !== 'string') {
            Logger.debug('information-tab raw missing for codenames widget');
            return;
        }
        const body = this._settingsModalDocBody(raw);
        const { rows } = this._extractInformationCodenameRows(body);
        if (rows.length === 0) {
            Logger.debug('no env codename rows parsed for widget');
            return;
        }

        root.dataset.wfEnvCodenamesMounted = '1';
        const tableCellStyle = `padding: 6px 10px; font-size: 13px; text-align: left; border: 1px solid ${c.border};`;
        const tableStyle = 'border-collapse: collapse; width: 100%; margin: 8px 0 0 0; font-size: 13px;';
        const thBtnStyle = 'cursor: pointer; user-select: none; text-align: left; width: 100%; font: inherit; color: inherit; background: transparent; border: none; padding: 0;';
        const esc = (t) => this._escapeHtmlCell(t);

        root.innerHTML = `
            <div style="margin: 8px 0 12px 0;">
                <label for="wf-env-codenames-search" style="display: block; font-size: 12px; font-weight: 600; margin-bottom: 6px; color: ${c.fg};">Search codenames or apps</label>
                <input type="search" id="wf-env-codenames-search" autocomplete="off" placeholder="Type to filter…" style="width: 100%; box-sizing: border-box; padding: 8px 10px; font-size: 13px; border: 1px solid ${c.border}; border-radius: 6px; margin-bottom: 10px; background: ${this._settingsThemeColors().card}; color: ${c.fg};" />
                <table style="${tableStyle}" aria-label="Environment codenames">
                    <thead>
                        <tr>
                            <th scope="col" style="${tableCellStyle} font-weight: 600;">
                                <button type="button" data-wf-col="0" style="${thBtnStyle}">Environment codename <span data-wf-sort-ind="0" aria-hidden="true"></span></button>
                            </th>
                            <th scope="col" style="${tableCellStyle} font-weight: 600;">
                                <button type="button" data-wf-col="1" style="${thBtnStyle}">Real app name <span data-wf-sort-ind="1" aria-hidden="true"></span></button>
                            </th>
                        </tr>
                    </thead>
                    <tbody id="wf-env-codenames-tbody"></tbody>
                </table>
            </div>
        `;

        const searchInput = root.querySelector('#wf-env-codenames-search');
        const tbody = root.querySelector('#wf-env-codenames-tbody');
        const sortIndicators = [root.querySelector('[data-wf-sort-ind="0"]'), root.querySelector('[data-wf-sort-ind="1"]')];
        const headers = root.querySelectorAll('button[data-wf-col]');

        let sortCol = 0;
        let sortDir = 'asc';

        const rowCmp = (a, b) => {
            const va = sortCol === 0 ? a.codename : a.realApp;
            const vb = sortCol === 0 ? b.codename : b.realApp;
            const r = va.localeCompare(vb, undefined, { sensitivity: 'base' });
            return sortDir === 'asc' ? r : -r;
        };

        const updateSortIndicators = () => {
            sortIndicators.forEach((el, i) => {
                if (!el) return;
                if (i === sortCol) {
                    el.textContent = sortDir === 'asc' ? '▲' : '▼';
                } else {
                    el.textContent = '';
                }
            });
        };

        const refresh = () => {
            const q = (searchInput && searchInput.value) ? searchInput.value.trim().toLowerCase() : '';
            let list = q
                ? rows.filter((row) =>
                    row.codename.toLowerCase().includes(q) || row.realApp.toLowerCase().includes(q))
                : rows.slice();
            list = list.sort(rowCmp);
            tbody.innerHTML = list.map((row) => `
                <tr>
                    <td style="${tableCellStyle}">${esc(row.codename)}</td>
                    <td style="${tableCellStyle}">${esc(row.realApp)}</td>
                </tr>
            `).join('');
            updateSortIndicators();
        };

        searchInput.addEventListener('input', refresh);
        headers.forEach((btn) => {
            btn.addEventListener('click', () => {
                const col = parseInt(btn.getAttribute('data-wf-col'), 10);
                if (col === sortCol) {
                    sortDir = sortDir === 'asc' ? 'desc' : 'asc';
                } else {
                    sortCol = col;
                    sortDir = 'asc';
                }
                refresh();
            });
        });

        refresh();
        Logger.log('mounted interactive environment codenames table');
    },

    _markdownToHtml(md) {
        if (!md || typeof md !== 'string') return '';
        const c = this._settingsThemeColors();
        const lines = md.trim().split(/\r?\n/);
        const out = [];
        let inList = false;
        let inTable = false;
        let tableRowIndex = 0;
        const escape = (s) => String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
        const linkRe = /\[([^\]]+)\]\(([^)]+)\)/g;
        const replaceLinks = (s) => escape(s).replace(linkRe, (_, text, href) => `<a href="${escape(href)}" target="_blank" rel="noopener noreferrer" style="color: var(--brand, #4f46e5); text-decoration: none;">${escape(text)}</a>`);
        const replaceBold = (s) => s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        const processInlines = (s) => replaceBold(replaceLinks(s));
        const isTableRow = (s) => /^\s*\|.+\|/.test(s);
        const parseTableCells = (s) => {
            const a = s.split('|').map(c => c.trim());
            let start = 0, end = a.length;
            while (start < end && a[start] === '') start++;
            while (end > start && a[end - 1] === '') end--;
            return a.slice(start, end);
        };
        const isTableSeparator = (cells) => cells.length > 0 && cells.every(c => /^[\s\-:]+$/.test(c));
        const tableCellStyle = `padding: 6px 10px; font-size: 13px; text-align: left; border: 1px solid ${c.border};`;
        const tableStyle = 'border-collapse: collapse; width: 100%; margin: 8px 0 12px 0; font-size: 13px;';
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();
            if (inTable && (!trimmed || !isTableRow(line))) {
                inTable = false;
                out.push('</tbody></table>');
            }
            if (inList && trimmed !== '' && !/^\s*-\s+/.test(line) && !isTableRow(line)) {
                inList = false;
                out.push('</ul>');
            }
            if (trimmed === '') {
                if (!inTable) out.push('<br>');
                continue;
            }
            if (trimmed === ':::wf-env-codenames:::') {
                out.push('<div id="wf-env-codenames-root"></div>');
                continue;
            }
            if (isTableRow(line)) {
                const cells = parseTableCells(line);
                if (cells.length === 0) continue;
                if (!inTable) {
                    inTable = true;
                    tableRowIndex = 0;
                    out.push(`<table style="${tableStyle}"><thead><tr>`);
                }
                if (tableRowIndex === 0) {
                    out.push(cells.map(cell => `<th style="${tableCellStyle} font-weight: 600;">${processInlines(cell)}</th>`).join(''));
                    out.push('</tr></thead><tbody>');
                    tableRowIndex = 1;
                } else if (tableRowIndex === 1 && isTableSeparator(cells)) {
                    tableRowIndex = 2;
                } else {
                    if (tableRowIndex === 1) tableRowIndex = 2;
                    out.push('<tr>' + cells.map(cell => `<td style="${tableCellStyle}">${processInlines(cell)}</td>`).join('') + '</tr>');
                }
                continue;
            }
            const h4 = /^####\s+(.+)$/.exec(trimmed);
            const h3 = /^###\s+(.+)$/.exec(trimmed);
            const h2 = /^##\s+(.+)$/.exec(trimmed);
            const h1 = /^#\s+(.+)$/.exec(trimmed);
            const ul = /^-\s+(.+)$/.exec(trimmed);
            if (h4) { out.push(`<h5 style="font-size: 13px; font-weight: 600; margin: 8px 0 4px 0; color: ${c.fg};">${processInlines(h4[1])}</h5>`); continue; }
            if (h3) { out.push(`<h4 style="font-size: 14px; font-weight: 600; margin: 8px 0 4px 0; color: ${c.fg};">${processInlines(h3[1])}</h4>`); continue; }
            if (h2) { out.push(`<h3 style="font-size: 15px; font-weight: 600; margin: 10px 0 6px 0; color: ${c.fg};">${processInlines(h2[1])}</h3>`); continue; }
            if (h1) { out.push(`<h2 style="font-size: 16px; font-weight: 600; margin: 12px 0 6px 0; color: ${c.fg};">${processInlines(h1[1])}</h2>`); continue; }
            if (ul) {
                if (!inList) { inList = true; out.push('<ul style="margin: 6px 0; padding-left: 24px; list-style-type: disc; color: inherit;">'); }
                out.push(`<li style="margin: 2px 0; display: list-item; color: inherit;">${processInlines(ul[1])}</li>`);
                continue;
            }
            out.push(`<p style="margin: 6px 0; font-size: 13px; line-height: 1.5; color: inherit;">${processInlines(trimmed)}</p>`);
        }
        if (inTable) out.push('</tbody></table>');
        if (inList) out.push('</ul>');
        return out.join('');
    },

    _loadAndRenderDocTab(modal, tabId, docFilename, pane) {
        const c = this._settingsThemeColors();
        const cacheKey = tabId;
        if (this._docPaneCache[cacheKey]) {
            pane.innerHTML = this._docPaneCache[cacheKey];
            pane.dataset.wfDocLoaded = 'true';
            if (tabId === 'information') {
                this._mountEnvCodenamesWidget(pane);
            }
            return;
        }
        if (!Context.settingsModalDocs || !Context.settingsModalDocs[docFilename]) {
            pane.innerHTML = `<p style="font-size: 13px; color: ${c.muted};">Could not load content.</p>`;
            pane.dataset.wfDocLoaded = 'true';
            return;
        }
        const raw = Context.settingsModalDocs[docFilename].raw;
        const body = this._settingsModalDocBody(raw);
        let mdBody = body;
        if (docFilename === 'information-tab.md') {
            const prep = this._prepareInformationTabMarkdown(body);
            mdBody = prep.markdown;
        }
        const html = this._markdownToHtml(mdBody);
        const docStyles = `<style>.wf-settings-doc-content h2{font-size:16px !important}.wf-settings-doc-content h3{font-size:15px !important;margin-top:12px !important}.wf-settings-doc-content h4{font-size:14px !important;margin-top:12px !important}.wf-settings-doc-content h5{font-size:13px !important;margin-top:12px !important}.wf-settings-doc-content ul{list-style-type:disc !important;padding-left:24px !important}.wf-settings-doc-content li{display:list-item !important}.wf-settings-doc-content strong{color:${c.fg} !important}</style>`;
        const wrapped = `${docStyles}<div class="wf-settings-doc-content" style="font-size: 13px; color: ${c.muted}; padding: 4px 0;">${html}</div>`;
        this._docPaneCache[cacheKey] = wrapped;
        pane.innerHTML = wrapped;
        pane.dataset.wfDocLoaded = 'true';
        if (docFilename === 'information-tab.md') {
            this._mountEnvCodenamesWidget(pane);
        }
    },

    _createOutdatedPluginsHTML(outdatedPlugins) {
        const pluginsList = outdatedPlugins.map(p => {
            let versionInfo = '';
            if (p.fetchedVersion) {
                versionInfo = `cached v${p.cachedVersion || 'none'}, fetched v${p.fetchedVersion}, required v${p.requiredVersion}`;
            } else if (p.nonJsResponse) {
                versionInfo = `cached v${p.cachedVersion}, server returned non-JS (CDN/network?), required v${p.requiredVersion}`;
            } else if (p.parseError) {
                const errHint = p.parseErrorMessage ? ` (${p.parseErrorMessage})` : '';
                versionInfo = `cached v${p.cachedVersion}, parse error during verification${errHint}, required v${p.requiredVersion}`;
            } else {
                versionInfo = `cached v${p.cachedVersion || 'none'}, required v${p.requiredVersion}`;
            }
            return `<li style="margin: 4px 0;"><strong>${p.filename}</strong>: ${versionInfo}</li>`;
        }).join('');
        
        const ab = this._alertBannerClasses();
        return `
            <div class="${ab.root} ${ab.amberSoft}">
                <div style="display: flex; align-items: center; margin-bottom: 8px;">
                    ${Context.uiLib.alertTriangleIconSvg({ size: 16, style: 'margin-right: 8px; color: #f59e0b;' })}
                    <h3 class="${ab.title}" style="font-size: 14px; font-weight: 600; margin: 0;">
                        Outdated Plugins (${outdatedPlugins.length})
                    </h3>
                </div>
                <p class="${ab.body}" style="font-size: 12px; margin: 8px 0 0 0; line-height: 1.5;">
                    The following plugins could not be updated to the required version. 
                    This may happen if you're offline, the server is unavailable, or GitHub's CDN 
                    hasn't updated yet (can take up to 5 minutes after a change).
                </p>
                <ul class="${ab.body}" style="font-size: 12px; margin: 8px 0 0 0; padding-left: 20px;">
                    ${pluginsList}
                </ul>
            </div>
        `;
    },
    
    _shouldShowUpdateNotification() {
        return (Context.isOutdated && Context.latestVersion) ||
            (Context.isDevBranch && this._getPulseOverrideEnabled());
    },

    _shouldShowOpsRefreshBanner() {
        if (!Context.opsTab || typeof Context.opsTab.needsOpsDashboardRefresh !== 'function') return false;
        return Context.opsTab.needsOpsDashboardRefresh();
    },

    _syncOpsRefreshBanner(modal) {
        if (!modal) return;
        const shouldShow = this._shouldShowOpsRefreshBanner();
        let banner = modal.querySelector('#wf-ops-refresh-banner');
        if (!shouldShow) {
            if (banner) banner.style.display = 'none';
            return;
        }
        if (!banner) {
            const tabRow = modal.querySelector('#wf-settings-tab-row');
            const wrapper = document.createElement('div');
            wrapper.innerHTML = this._createOpsRefreshBannerHTML();
            banner = wrapper.firstElementChild;
            if (tabRow && tabRow.parentElement) {
                tabRow.parentElement.insertBefore(banner, tabRow);
            } else {
                const header = modal.querySelector('#wf-settings-content');
                if (header) header.insertBefore(banner, header.firstChild);
            }
            this._attachOpsRefreshBannerListeners(modal, 'settings-ui');
        }
        banner.style.display = 'block';
        Logger.log('ops refresh banner shown');
    },

    _attachOpsRefreshBannerListeners(root, reloadSource) {
        const modal = root;
        if (!modal || modal.dataset.wfOpsRefreshBannerBound === '1') return;
        const refreshBtn = Context.dom.query('#wf-ops-refresh-fetch-btn', {
            root: modal,
            context: `${this.id}.opsRefreshFetchBtn`
        });
        if (!refreshBtn) return;
        modal.dataset.wfOpsRefreshBannerBound = '1';
        const source = reloadSource || 'settings-ui';
        refreshBtn.addEventListener('click', () => {
            if (typeof Context.requestExtensionReload === 'function') {
                Context.requestExtensionReload(source + ' ops refresh banner');
            } else {
                window.location.reload();
            }
        });
    },

    _createOpsRefreshBannerHTML() {
        const ab = this._alertBannerClasses();
        return `
            <div id="wf-ops-refresh-banner" class="${ab.root} ${ab.amber}">
                <div style="display: flex; align-items: flex-start; margin-bottom: 10px;">
                    ${Context.uiLib.alertTriangleIconSvg({ size: 18, style: 'margin-right: 10px; color: #b45309; margin-top: 2px;' })}
                    <div style="flex: 1;">
                        <h3 class="${ab.title}" style="font-size: 15px; font-weight: 600; margin: 0 0 8px 0;">
                            Ops Tab Unlock Pending
                        </h3>
                        <p class="${ab.body}" style="font-size: 13px; margin: 0; line-height: 1.5;">
                            Refresh the page to activate the Ops tab and load the dashboard plugins.
                        </p>
                    </div>
                </div>
                <div class="${ab.footer}">
                    <button type="button" id="wf-ops-refresh-fetch-btn" class="${ab.btnSecondary}">Refresh to Fetch</button>
                </div>
            </div>
        `;
    },

    syncOpsRefreshBanner(modal) {
        return this._syncOpsRefreshBanner(modal);
    },

    _attachUpdateBannerListeners(root, reloadSource) {
        const modal = root;
        if (!modal) return;
        const source = reloadSource || 'settings-ui';
        const newestLink = Context.dom.query('#wf-update-newest-link', { root: modal, context: `${this.id}.updateNewestLink` });
        const refreshRow = Context.dom.query('#wf-update-refresh-row', { root: modal, context: `${this.id}.updateRefreshRow` });
        const refreshBtn = Context.dom.query('#wf-update-refresh-btn', { root: modal, context: `${this.id}.updateRefreshBtn` });
        if (newestLink && refreshRow) {
            newestLink.addEventListener('click', () => {
                refreshRow.style.display = 'block';
            });
        }
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                if (typeof Context.requestExtensionReload === 'function') {
                    Context.requestExtensionReload(source + ' update banner refresh');
                } else {
                    window.location.reload();
                }
            });
        }
    },

    _getUpdateUrl() {
        return `https://raw.githubusercontent.com/${Context.githubOwner || 'Fleet-AI-Operations'}/${Context.githubRepo || 'fleet-ux-improvements'}/${Context.githubBranch || 'main'}/fleet.user.js`;
    },

    _autoOpenUpdateIfNeeded() {
        if (!Context.isOutdated || !Context.latestVersion) return;

        const latestVersion = String(Context.latestVersion);
        const storageKey = 'last-auto-opened-update-version';
        if (Storage.get(storageKey, null) === latestVersion) return;

        if (typeof Context.openInTab !== 'function') {
            Logger.warn(`could not automatically open update because the tab opener is unavailable`);
            return;
        }

        this._updateTabOpenedAutomatically = true;
        this.openModal({ forceSettings: true });
        if (!this._modalOpen) {
            this._updateTabOpenedAutomatically = false;
            Logger.warn(`could not automatically open update because the Settings modal failed to open`);
            return;
        }

        requestAnimationFrame(() => {
            try {
                Context.openInTab(this._getUpdateUrl(), { active: true, insert: true, setParent: true });
                Storage.set(storageKey, latestVersion);
                Logger.log(`opened Settings and automatically opened update ${latestVersion} in a new tab`);
            } catch (error) {
                Logger.error(`failed to automatically open update ${latestVersion}`, error);
            }
        });
    },

    _createUpdateNotificationHTML() {
        const currentVersion = Context.version || 'unknown';
        // If simulate update banner is enabled, simulate update by using current version + 0.1 as latest
        const isOverrideMode = Context.isDevBranch && this._getPulseOverrideEnabled() && !Context.isOutdated;
        let latestVersion = Context.latestVersion;
        
        if (isOverrideMode) {
            // Simulate update by making latest version slightly higher
            // Parse version and increment patch version
            const versionParts = currentVersion.split('.');
            if (versionParts.length >= 3) {
                const patch = parseInt(versionParts[2]) || 0;
                versionParts[2] = (patch + 1).toString();
                latestVersion = versionParts.join('.');
            } else {
                latestVersion = currentVersion;
            }
        } else {
            latestVersion = Context.latestVersion || 'unknown';
        }
        
        const ab = this._alertBannerClasses();
        return `
            <div id="wf-update-notification-banner" class="${ab.root} ${ab.danger}">
                <div style="display: flex; align-items: flex-start; margin-bottom: 10px;">
                    ${Context.uiLib.alertTriangleIconSvg({ size: 18, style: 'margin-right: 10px; color: #dc2626; margin-top: 2px;' })}
                    <div style="flex: 1;">
                        <h3 class="${ab.title}" style="font-size: 15px; font-weight: 600; margin: 0 0 8px 0;">
                            Extension Update Available
                        </h3>
                        <p class="${ab.body}" style="font-size: 13px; margin: 0 0 10px 0; line-height: 1.5;">
                            Your current version of this extension (<strong>${currentVersion}</strong>) is outdated. Please update to the <a id="wf-update-newest-link" href="${this._getUpdateUrl()}" target="_blank" rel="noopener noreferrer">newest version</a> (<strong>${latestVersion}</strong>).
                        </p>
                    </div>
                </div>
                <div id="wf-update-refresh-row" class="${ab.footer}" style="display: ${this._updateTabOpenedAutomatically ? 'flex' : 'none'};">
                    <button type="button" id="wf-update-refresh-btn" class="${ab.btnSecondary}">Refresh Page with New Version</button>
                </div>
            </div>
        `;
    }
};

return plugin;
},
        "core/main/fos-embedded-watcher.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {
// fos-embedded-watcher.js
// Parent-page watcher: detects FOS desktop envs via orchestrator + latch + either
// env_key "fos" substring or noVNC/child shape, authorizes embedded iframe clipboard
// bridge, and hosts VM Clipboard UI (system clipboard I/O stays on the parent).
// Bar hosts on CU creation/QA claim UI via Context.fosEmbedded; floating panel mounts only when no host claimed.

const FOS_ENV_HOST_PATTERN = /\.env\.[^.]+(?:\.[^.]+)*\.fleetai\.com$/;
const FOS_ORCHESTRATOR_INSTANCES_URL = 'https://orchestrator.fleetai.com/v1/env/instances';
const FOS_CHILD_READY_TYPE = 'fleet-fos-child-ready';
const FOS_EMBEDDED_READY_TYPE = 'fleet-fos-embedded-ready';
const FOS_EMBEDDED_ACK_TYPE = 'fleet-fos-embedded-ack';
const FOS_PUSH_TYPE = 'fleet-fos-push-clipboard';
const FOS_PUSH_RESULT_TYPE = 'fleet-fos-push-result';
const FOS_EXTRACT_REQ_TYPE = 'fleet-fos-extract-request';
const FOS_EXTRACT_RESULT_TYPE = 'fleet-fos-extract-result';
const FOS_CLIPBOARD_ALLOW_TOKENS = ['clipboard-read *', 'clipboard-write *'];
const FOS_PANEL_ATTR = 'data-fleet-fos-vm-clipboard';
const FOS_CLIP_FLASH_MS = 600;
const FOS_CLIPBOARD_MAX_CHARS = 262144;
const FOS_PARENT_ORIGINS = new Set(['https://www.fleetai.com', 'https://fleetai.com']);

function fosRandomNonce() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function fosIsExactEnvOrigin(origin) {
    try {
        const hostname = new URL(origin).hostname;
        return FOS_ENV_HOST_PATTERN.test(hostname) && new URL(origin).protocol === 'https:';
    } catch (_e) {
        return false;
    }
}

function fosEnsureInstanceNonce(rec) {
    if (!rec.bridgeNonce) {
        rec.bridgeNonce = fosRandomNonce();
    }
    return rec.bridgeNonce;
}

function fosInstanceIdFromHostname(hostname) {
    return String(hostname || '').split('.')[0] || '';
}

/** Case-insensitive: env_key contains "fos" (codename path; concurrent with desktop shape). */
function fosIsFosEnvKey(envKey) {
    return String(envKey || '').toLowerCase().includes('fos');
}

/**
 * FOS desktop / noVNC fetch shape (concurrent with env_key name check).
 * Root /api/v1/env/timestamp alone is NOT sufficient — single-app web envs use it too.
 */
function fosIsDesktopShapePath(pathname) {
    const path = String(pathname || '');
    if (!path) {
        return false;
    }
    if (path === '/websockify' || path.endsWith('/websockify')) {
        return true;
    }
    if (path === '/core/rfb.js' || path.endsWith('/core/rfb.js')) {
        return true;
    }
    if (path === '/app/ui.js' || path.endsWith('/app/ui.js')) {
        return true;
    }
    return false;
}

function fosIsEnvDesktopShapeRequest(meta) {
    return (
        !!meta.urlObj &&
        FOS_ENV_HOST_PATTERN.test(meta.urlObj.hostname) &&
        fosIsDesktopShapePath(meta.urlObj.pathname)
    );
}

/** Any env-subdomain GET whose path includes "timestamp" (readiness probe path varies by env). */
function fosIsEnvTimestampProbe(meta) {
    return (
        meta.method === 'GET' &&
        !!meta.urlObj &&
        FOS_ENV_HOST_PATTERN.test(meta.urlObj.hostname) &&
        meta.urlObj.pathname.includes('timestamp')
    );
}

function fosHostnameFromIframe(iframe) {
    if (!iframe) {
        return '';
    }
    const candidates = [iframe.src, iframe.getAttribute('src')];
    for (let i = 0; i < candidates.length; i++) {
        const raw = candidates[i];
        if (!raw) {
            continue;
        }
        try {
            return new URL(raw, window.location.href).hostname;
        } catch (_e) {
            /* ignore */
        }
    }
    return '';
}

function fosIsEnvIframe(iframe) {
    return FOS_ENV_HOST_PATTERN.test(fosHostnameFromIframe(iframe));
}

function fosAllowHasClipboardFeature(allowValue, feature) {
    const tokens = String(allowValue || '')
        .split(';')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);
    return tokens.some((t) => t === feature || t.startsWith(feature + ' '));
}

/**
 * Ensure cross-origin clipboard Permissions Policy is delegated on the iframe.
 * Returns true when the allow attribute was changed. (Does not unlock read without reload.)
 */
function fosEnsureClipboardAllow(iframe) {
    if (!iframe || iframe.tagName !== 'IFRAME') {
        return false;
    }
    const current = iframe.getAttribute('allow') || iframe.allow || '';
    const missing = FOS_CLIPBOARD_ALLOW_TOKENS.filter((token) => {
        const feature = token.split(/\s+/)[0].toLowerCase();
        return !fosAllowHasClipboardFeature(current, feature);
    });
    if (missing.length === 0) {
        return false;
    }
    const next = [current.trim(), ...missing].filter(Boolean).join('; ');
    iframe.setAttribute('allow', next);
    try {
        iframe.allow = next;
    } catch (_e) {
        /* ignore */
    }
    return true;
}

function fosFindIframeForSource(source) {
    if (!source) {
        return null;
    }
    const frames = document.querySelectorAll('iframe');
    for (let i = 0; i < frames.length; i++) {
        const frame = frames[i];
        try {
            if (frame.contentWindow === source) {
                return frame;
            }
        } catch (_e) {
            /* cross-origin access to contentWindow identity still works for === */
        }
    }
    return null;
}

function fosFindEnvIframeByHostname(hostname) {
    const want = String(hostname || '');
    if (!want) {
        return null;
    }
    const frames = document.querySelectorAll('iframe');
    for (let i = 0; i < frames.length; i++) {
        const frame = frames[i];
        if (fosHostnameFromIframe(frame) === want) {
            return frame;
        }
    }
    return null;
}

function fosNextRequestId() {
    return 'fos-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

function fosFlashBtn(btn, ok) {
    if (!btn) {
        return;
    }
    if (Context.buttonFeedback) {
        if (ok && typeof Context.buttonFeedback.flashSuccess === 'function') {
            Context.buttonFeedback.flashSuccess(btn);
            return;
        }
        if (!ok && typeof Context.buttonFeedback.flashFailure === 'function') {
            Context.buttonFeedback.flashFailure(btn);
            return;
        }
    }
    if (btn._fosClipResetTimeout) {
        clearTimeout(btn._fosClipResetTimeout);
    }
    btn.style.background = ok ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)';
    btn.style.color = '#ffffff';
    btn._fosClipResetTimeout = setTimeout(() => {
        btn._fosClipResetTimeout = null;
        btn.style.background = '';
        btn.style.color = '';
    }, FOS_CLIP_FLASH_MS);
}

const plugin = {
    id: 'fosEmbeddedWatcher',
    name: 'FOS Embedded Watcher',
    description:
        'Detects FOS desktop envs and hosts the VM Clipboard bridge (Safe UX Build: nonce-bound messaging)',
    _version: '5.4',
    phase: 'core',
    enabledByDefault: true,
    initialState: {
        fosInstances: null,
        pendingChildren: null,
        clipboardPanels: null,
        pendingRequests: null,
        readyInstances: null,
        uiHosts: null,
        readinessListeners: null,
        desktopListeners: null,
        messageListenerInstalled: false,
        resultListenerInstalled: false,
        ackListenerInstalled: false,
        iframeObserverInstalled: false,
        layoutListenersInstalled: false,
        activationLogged: false,
        clipboardPatchedLogged: false,
        panelMountedLogged: false,
        apiRegistered: false
    },

    init(state, _context) {
        if (!state.fosInstances) {
            state.fosInstances = new Map();
        }
        if (!state.pendingChildren) {
            state.pendingChildren = new Map();
        }
        if (!state.clipboardPanels) {
            state.clipboardPanels = new Map();
        }
        if (!state.pendingRequests) {
            state.pendingRequests = new Map();
        }
        if (!state.readyInstances) {
            state.readyInstances = new Map();
        }
        if (!state.uiHosts) {
            state.uiHosts = new Set();
        }
        if (!state.readinessListeners) {
            state.readinessListeners = new Set();
        }
        if (!state.desktopListeners) {
            state.desktopListeners = new Set();
        }
        this._state = state;
        this._exposeApi(state);
        this._subscribeOrchestrator(state);
        this._subscribeDesktopShape(state);
        this._subscribeLatch(state);
        this._listenChildReady(state);
        this._listenEmbeddedAck(state);
        this._listenClipboardResults(state);
        this._watchEnvIframes(state);
        this._installLayoutListeners(state);
        Logger.debug('parent watchers registered');
    },

    _exposeApi(state) {
        const self = this;
        Context.fosEmbedded = {
            claimUiHost(ownerId) {
                const id = String(ownerId || '');
                if (!id) {
                    return;
                }
                const wasEmpty = state.uiHosts.size === 0;
                state.uiHosts.add(id);
                if (wasEmpty && state.uiHosts.size > 0) {
                    self._teardownAllPanels(state);
                    Logger.log('UI host claimed — floating VM Clipboard suppressed');
                }
            },
            releaseUiHost(ownerId) {
                const id = String(ownerId || '');
                if (!id) {
                    return;
                }
                state.uiHosts.delete(id);
                if (state.uiHosts.size === 0) {
                    Logger.log('UI hosts cleared — floating VM Clipboard allowed');
                    state.readyInstances.forEach((entry, instanceId) => {
                        if (entry && entry.iframe && entry.child) {
                            self._mountClipboardPanel(state, instanceId, entry.child, entry.iframe);
                        }
                    });
                }
            },
            subscribe(listener) {
                if (typeof listener !== 'function') {
                    return () => {};
                }
                state.readinessListeners.add(listener);
                state.readyInstances.forEach((_entry, instanceId) => {
                    try {
                        listener({ instanceId, ready: true });
                    } catch (_e) {
                        /* ignore */
                    }
                });
                return () => {
                    state.readinessListeners.delete(listener);
                };
            },
            isFosDesktop(instanceId) {
                const id = String(instanceId || '');
                if (!id) {
                    return false;
                }
                const rec = state.fosInstances.get(id);
                return !!(rec && rec.isFosDesktop);
            },
            subscribeDesktop(listener) {
                if (typeof listener !== 'function') {
                    return () => {};
                }
                state.desktopListeners.add(listener);
                state.fosInstances.forEach((rec, instanceId) => {
                    if (rec && rec.isFosDesktop) {
                        try {
                            listener({ instanceId, isFosDesktop: true });
                        } catch (_e) {
                            /* ignore */
                        }
                    }
                });
                return () => {
                    state.desktopListeners.delete(listener);
                };
            },
            getReadyInstances() {
                return self._getReadyInstancesList(state);
            },
            overwrite(instanceId) {
                return self._overwriteInstance(state, instanceId);
            },
            extract(instanceId) {
                return self._extractInstance(state, instanceId);
            },
            hasUiHost() {
                return state.uiHosts.size > 0;
            }
        };
        if (!state.apiRegistered) {
            state.apiRegistered = true;
            Logger.log('Context.fosEmbedded registered');
        }
    },

    _getReadyInstancesList(state) {
        const list = [];
        state.readyInstances.forEach((entry, instanceId) => {
            if (!entry || !entry.iframe || !entry.iframe.isConnected || !entry.child) {
                return;
            }
            list.push({
                instanceId,
                iframe: entry.iframe,
                child: entry.child
            });
        });
        return list;
    },

    _notifyReadiness(state, instanceId, ready) {
        state.readinessListeners.forEach((listener) => {
            try {
                listener({ instanceId: String(instanceId), ready: !!ready });
            } catch (e) {
                Logger.warn('readiness listener threw', e);
            }
        });
    },

    _notifyDesktopIdentification(state, instanceId) {
        const id = String(instanceId || '');
        if (!id || !state.desktopListeners) {
            return;
        }
        state.desktopListeners.forEach((listener) => {
            try {
                listener({ instanceId: id, isFosDesktop: true });
            } catch (e) {
                Logger.warn('desktop listener threw', e);
            }
        });
    },

    _markInstanceReady(state, instanceId, child, iframe) {
        const id = String(instanceId);
        const prev = state.readyInstances.get(id);
        const wasReady = !!(prev && prev.iframe && prev.iframe.isConnected);
        state.readyInstances.set(id, { instanceId: id, child, iframe });
        if (!wasReady) {
            this._notifyReadiness(state, id, true);
        }
    },

    _unmarkInstanceReady(state, instanceId) {
        const id = String(instanceId);
        if (!state.readyInstances.has(id)) {
            return;
        }
        state.readyInstances.delete(id);
        this._notifyReadiness(state, id, false);
    },

    _resolveChild(state, instanceId) {
        const ready = state.readyInstances.get(String(instanceId));
        if (ready && ready.child && ready.child.source) {
            return ready.child;
        }
        const panel = state.clipboardPanels.get(String(instanceId));
        if (panel && panel.child && panel.child.source) {
            return panel.child;
        }
        const rec = state.fosInstances.get(String(instanceId));
        if (rec && rec.child && rec.child.source) {
            return rec.child;
        }
        return null;
    },

    _childFailureDetail(result, emptyFallback) {
        if (!result) {
            return 'no result';
        }
        if (result.timedOut) {
            return 'timed out';
        }
        if (result.reason) {
            const err =
                result.error != null && String(result.error)
                    ? String(result.error)
                    : '';
            return err ? result.reason + ': ' + err : String(result.reason);
        }
        if (emptyFallback && result.text === '') {
            return 'VM clipboard empty';
        }
        return 'unknown';
    },

    async _overwriteInstance(state, instanceId) {
        const id = String(instanceId || '');
        const child = this._resolveChild(state, id);
        if (!child || !child.source) {
            Logger.warn('overwrite failed — child missing for ' + id);
            return false;
        }
        let text;
        try {
            text = await navigator.clipboard.readText();
        } catch (e) {
            Logger.warn('overwrite failed — could not read system clipboard', e);
            return false;
        }
        if (text == null) {
            return false;
        }
        if (typeof text !== 'string' || text.length > FOS_CLIPBOARD_MAX_CHARS) {
            Logger.warn('overwrite skipped — clipboard text missing or too large');
            return false;
        }
        const requestId = fosNextRequestId();
        const resultPromise = this._waitForChildResult(state, requestId, 8000);
        const nonce = fosEnsureInstanceNonce(this._ensureInstance(state, id));
        if (!child.origin || child.origin === '*') {
            Logger.warn('overwrite failed — child origin missing for ' + id);
            return false;
        }
        try {
            child.source.postMessage(
                {
                    type: FOS_PUSH_TYPE,
                    text: String(text).slice(0, FOS_CLIPBOARD_MAX_CHARS),
                    requestId,
                    nonce,
                    instanceId: id
                },
                child.origin
            );
        } catch (ePost) {
            state.pendingRequests.delete(requestId);
            Logger.warn('push postMessage failed', ePost);
            return false;
        }
        const result = await resultPromise;
        if (result && result.ok) {
            Logger.log('overwrite ok for ' + id);
            return true;
        }
        Logger.warn('overwrite failed for ' + id + ' — ' + this._childFailureDetail(result, false));
        return false;
    },

    async _extractInstance(state, instanceId) {
        const id = String(instanceId || '');
        const child = this._resolveChild(state, id);
        if (!child || !child.source) {
            Logger.warn('extract failed — child missing for ' + id);
            return false;
        }
        const requestId = fosNextRequestId();
        const resultPromise = this._waitForChildResult(state, requestId, 8000);
        const nonce = fosEnsureInstanceNonce(this._ensureInstance(state, id));
        if (!child.origin || child.origin === '*') {
            Logger.warn('extract failed — child origin missing for ' + id);
            return false;
        }
        try {
            child.source.postMessage(
                { type: FOS_EXTRACT_REQ_TYPE, requestId, nonce, instanceId: id },
                child.origin
            );
        } catch (ePost) {
            state.pendingRequests.delete(requestId);
            Logger.warn('extract postMessage failed', ePost);
            return false;
        }
        const result = await resultPromise;
        if (!result || !result.ok || typeof result.text !== 'string' || !result.text) {
            Logger.warn('extract failed for ' + id + ' — ' + this._childFailureDetail(result, true));
            return false;
        }
        try {
            await navigator.clipboard.writeText(result.text);
            Logger.log('extract ok for ' + id);
            return true;
        } catch (eWrite) {
            Logger.warn('extract failed — could not write system clipboard', eWrite);
            return false;
        }
    },

    _ensureInstance(state, instanceId) {
        if (!state.fosInstances.has(instanceId)) {
            state.fosInstances.set(instanceId, {
                envKey: null,
                latchReady: false,
                isFosDesktop: false,
                child: null
            });
        }
        return state.fosInstances.get(instanceId);
    },

    _markFosDesktop(state, instanceId, reason) {
        const id = String(instanceId || '');
        if (!id) {
            return false;
        }
        const rec = this._ensureInstance(state, id);
        if (rec.isFosDesktop) {
            return false;
        }
        rec.isFosDesktop = true;
        Logger.log('FOS desktop shape for instance ' +
                id +
                (reason ? ' (' + reason + ')' : '')
        );
        this._notifyDesktopIdentification(state, id);
        this._onInstanceProgress(state, id);
        return true;
    },

    _logClipboardPatched(state, iframe) {
        const host = fosHostnameFromIframe(iframe) || 'unknown';
        if (!state.clipboardPatchedLogged) {
            state.clipboardPatchedLogged = true;
            Logger.log('enabled clipboard permissions on env iframe ' + host);
        } else {
            Logger.debug('clipboard permissions patched on ' + host);
        }
    },

    _patchIframeClipboardAllow(state, iframe) {
        if (!iframe || !fosIsEnvIframe(iframe)) {
            return false;
        }
        if (!fosEnsureClipboardAllow(iframe)) {
            return false;
        }
        this._logClipboardPatched(state, iframe);
        return true;
    },

    _patchIframeForChild(state, child, hostname) {
        let iframe = fosFindIframeForSource(child && child.source);
        if (!iframe && hostname) {
            iframe = fosFindEnvIframeByHostname(hostname);
        }
        if (iframe) {
            this._patchIframeClipboardAllow(state, iframe);
        }
        return iframe;
    },

    _scanEnvIframes(state) {
        const frames = document.querySelectorAll('iframe');
        for (let i = 0; i < frames.length; i++) {
            this._patchIframeClipboardAllow(state, frames[i]);
        }
        this._repositionAllPanels(state);
        this._pruneMissingReady(state);
    },

    _watchEnvIframes(state) {
        if (state.iframeObserverInstalled) {
            return;
        }
        state.iframeObserverInstalled = true;
        const self = this;
        const scan = () => {
            self._scanEnvIframes(state);
        };
        scan();
        const target = document.documentElement || document.body;
        if (!target) {
            return;
        }
        const observer = new MutationObserver((mutations) => {
            for (let i = 0; i < mutations.length; i++) {
                const m = mutations[i];
                if (m.type === 'attributes' && m.target && m.target.tagName === 'IFRAME') {
                    self._patchIframeClipboardAllow(state, m.target);
                    continue;
                }
                if (m.type !== 'childList') {
                    continue;
                }
                const nodes = m.addedNodes;
                for (let j = 0; j < nodes.length; j++) {
                    const node = nodes[j];
                    if (!node || node.nodeType !== 1) {
                        continue;
                    }
                    if (node.tagName === 'IFRAME') {
                        self._patchIframeClipboardAllow(state, node);
                    } else if (typeof node.querySelectorAll === 'function') {
                        const nested = node.querySelectorAll('iframe');
                        for (let k = 0; k < nested.length; k++) {
                            self._patchIframeClipboardAllow(state, nested[k]);
                        }
                    }
                }
            }
            self._repositionAllPanels(state);
            self._pruneMissingReady(state);
        });
        observer.observe(target, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['src', 'allow']
        });
        if (typeof CleanupRegistry !== 'undefined' && CleanupRegistry.registerObserver) {
            CleanupRegistry.registerObserver(observer);
        }
    },

    _installLayoutListeners(state) {
        if (state.layoutListenersInstalled) {
            return;
        }
        state.layoutListenersInstalled = true;
        const self = this;
        const onLayout = () => {
            self._repositionAllPanels(state);
        };
        window.addEventListener('resize', onLayout, true);
        window.addEventListener('scroll', onLayout, true);
        if (typeof CleanupRegistry !== 'undefined' && CleanupRegistry.registerEventListener) {
            CleanupRegistry.registerEventListener(window, 'resize', onLayout, true);
            CleanupRegistry.registerEventListener(window, 'scroll', onLayout, true);
        }
    },

    _positionPanel(panel, iframe) {
        if (!panel || !iframe || !iframe.isConnected) {
            return;
        }
        const rect = iframe.getBoundingClientRect();
        const left = Math.max(8, Math.round(rect.left + 16));
        const top = Math.max(8, Math.round(rect.bottom - 16 - panel.offsetHeight));
        panel.style.left = left + 'px';
        panel.style.top = top + 'px';
        panel.style.bottom = 'auto';
    },

    _repositionAllPanels(state) {
        state.clipboardPanels.forEach((entry) => {
            if (!entry || !entry.root || !entry.iframe) {
                return;
            }
            if (entry.userMoved) {
                return;
            }
            this._positionPanel(entry.root, entry.iframe);
        });
    },

    _pruneMissingReady(state) {
        const toRemove = [];
        state.readyInstances.forEach((entry, instanceId) => {
            if (!entry || !entry.iframe || !entry.iframe.isConnected) {
                toRemove.push(instanceId);
            }
        });
        // Also prune floating panels whose iframe is gone even if not in readyInstances
        state.clipboardPanels.forEach((entry, instanceId) => {
            if (!entry || !entry.iframe || !entry.iframe.isConnected) {
                if (toRemove.indexOf(instanceId) === -1) {
                    toRemove.push(instanceId);
                }
            }
        });
        toRemove.forEach((id) => {
            this._teardownPanel(state, id);
            this._unmarkInstanceReady(state, id);
        });
    },

    _teardownPanel(state, instanceId) {
        const entry = state.clipboardPanels.get(instanceId);
        if (!entry) {
            return;
        }
        if (entry.root && entry.root.parentNode) {
            entry.root.parentNode.removeChild(entry.root);
        }
        state.clipboardPanels.delete(instanceId);
        Logger.debug('VM Clipboard panel removed for ' + instanceId);
    },

    _teardownAllPanels(state) {
        const ids = [];
        state.clipboardPanels.forEach((_entry, instanceId) => {
            ids.push(instanceId);
        });
        ids.forEach((id) => {
            this._teardownPanel(state, id);
        });
    },

    _waitForChildResult(state, requestId, timeoutMs) {
        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                state.pendingRequests.delete(requestId);
                resolve({ ok: false, timedOut: true });
            }, timeoutMs || 8000);
            state.pendingRequests.set(requestId, {
                resolve: (payload) => {
                    clearTimeout(timer);
                    resolve(payload);
                }
            });
        });
    },

    _mountClipboardPanel(state, instanceId, child, iframe) {
        if (state.uiHosts.size > 0) {
            return;
        }
        if (!iframe || !child || !child.source) {
            return;
        }
        const existing = state.clipboardPanels.get(instanceId);
        if (existing && existing.root && existing.root.isConnected) {
            existing.child = child;
            existing.iframe = iframe;
            this._positionPanel(existing.root, iframe);
            return;
        }
        if (existing) {
            this._teardownPanel(state, instanceId);
        }

        if (!document.body) {
            return;
        }

        const self = this;
        if (Context.uiLib && typeof Context.uiLib.ensurePanelStyles === 'function') {
            Context.uiLib.ensurePanelStyles();
        }
        const pc = (Context.uiLib && Context.uiLib.PANEL_CLASSES) || {};
        const root = document.createElement('div');
        root.setAttribute(FOS_PANEL_ATTR, instanceId);
        root.className = pc.root || '';
        root.style.cssText =
            'position:fixed;z-index:2147483646;min-width:220px;max-width:280px;padding:0;user-select:none;';

        const clipHeader = document.createElement('div');
        clipHeader.className = pc.header || '';
        clipHeader.style.cssText =
            'display:flex;align-items:center;justify-content:space-between;' +
            'padding:6px 8px 4px 12px;cursor:grab;';

        const clipTitle = document.createElement('div');
        clipTitle.textContent = 'VM Clipboard';
        clipTitle.className = pc.sectionLabel || '';
        clipTitle.style.cssText = 'flex:1;min-width:0;';

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.setAttribute('aria-label', 'Close VM Clipboard');
        closeBtn.textContent = '×';
        closeBtn.className = pc.muted || '';
        closeBtn.style.cssText =
            'margin:0;padding:0 4px;border:none;background:transparent;' +
            'font:inherit;font-size:16px;line-height:1;cursor:pointer;border-radius:4px;color:inherit;';

        clipHeader.appendChild(clipTitle);
        clipHeader.appendChild(closeBtn);

        const clipBody = document.createElement('div');
        clipBody.style.cssText = 'padding:0 12px 10px 12px;';

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;gap:8px;';

        function makeBtn(label) {
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = label;
            b.className = pc.btn || '';
            b.style.flex = '1';
            return b;
        }

        const bExtract = makeBtn('Extract');
        const bOverwrite = makeBtn('Overwrite');

        bOverwrite.addEventListener('click', () => {
            self._overwriteInstance(state, instanceId).then((ok) => {
                fosFlashBtn(bOverwrite, !!ok);
            });
        });

        bExtract.addEventListener('click', () => {
            self._extractInstance(state, instanceId).then((ok) => {
                fosFlashBtn(bExtract, !!ok);
            });
        });

        closeBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            self._teardownPanel(state, instanceId);
            Logger.log('VM Clipboard panel dismissed for ' + instanceId);
        });

        btnRow.appendChild(bExtract);
        btnRow.appendChild(bOverwrite);
        clipBody.appendChild(btnRow);
        root.appendChild(clipHeader);
        root.appendChild(clipBody);
        document.body.appendChild(root);

        let dragging = false;
        let dragOx = 0;
        let dragOy = 0;
        let userMoved = false;

        function onDragMove(ev) {
            if (!dragging) {
                return;
            }
            root.style.left = Math.max(0, ev.clientX - dragOx) + 'px';
            root.style.top = Math.max(0, ev.clientY - dragOy) + 'px';
            userMoved = true;
        }

        function onDragUp() {
            if (!dragging) {
                return;
            }
            dragging = false;
            clipHeader.style.cursor = 'grab';
            document.removeEventListener('mousemove', onDragMove, true);
            document.removeEventListener('mouseup', onDragUp, true);
        }

        clipHeader.addEventListener('mousedown', (ev) => {
            if (ev.button !== 0 || closeBtn.contains(ev.target)) {
                return;
            }
            ev.preventDefault();
            const r = root.getBoundingClientRect();
            dragging = true;
            dragOx = ev.clientX - r.left;
            dragOy = ev.clientY - r.top;
            clipHeader.style.cursor = 'grabbing';
            document.addEventListener('mousemove', onDragMove, true);
            document.addEventListener('mouseup', onDragUp, true);
        });

        const entry = {
            root,
            iframe,
            child,
            userMoved: false,
            get moved() {
                return userMoved;
            }
        };
        Object.defineProperty(entry, 'userMoved', {
            get() {
                return userMoved;
            },
            set(v) {
                userMoved = !!v;
            }
        });

        state.clipboardPanels.set(instanceId, entry);
        this._positionPanel(root, iframe);

        if (!state.panelMountedLogged) {
            state.panelMountedLogged = true;
            Logger.log('mounted parent VM Clipboard for ' + instanceId);
        } else {
            Logger.debug('mounted VM Clipboard for ' + instanceId);
        }
    },

    _tryNotifyChild(state, instanceId, child) {
        const rec = state.fosInstances.get(instanceId);
        if (!rec || !rec.latchReady || !rec.envKey) {
            return false;
        }
        if (!rec.isFosDesktop) {
            if (!fosIsFosEnvKey(rec.envKey)) {
                return false;
            }
            // Codename hit: mark here without _markFosDesktop (avoids re-entrant flush).
            rec.isFosDesktop = true;
            Logger.log('FOS desktop shape for instance ' +
                    instanceId +
                    ' (env-key)'
            );
            this._notifyDesktopIdentification(state, instanceId);
        }
        if (!child || !child.source || typeof child.source.postMessage !== 'function') {
            return false;
        }
        if (!child.origin || child.origin === '*') {
            return false;
        }
        const nonce = fosEnsureInstanceNonce(rec);
        try {
            child.source.postMessage(
                {
                    type: FOS_EMBEDDED_READY_TYPE,
                    envKey: rec.envKey,
                    nonce,
                    instanceId
                },
                child.origin
            );
            rec.child = child;
            const hostname =
                (child.origin && (() => {
                    try {
                        return new URL(child.origin).hostname;
                    } catch (_e) {
                        return '';
                    }
                })()) ||
                '';
            const iframe =
                fosFindIframeForSource(child.source) ||
                (hostname ? fosFindEnvIframeByHostname(hostname) : null);
            if (iframe) {
                this._patchIframeClipboardAllow(state, iframe);
            }
            // Ready UI waits for fleet-fos-embedded-ack so push/extract are not offered before auth.
            if (!state.activationLogged) {
                state.activationLogged = true;
                Logger.log('signaled embedded FOS iframe for instance ' +
                        instanceId +
                        ' (' +
                        rec.envKey +
                        ')'
                );
            } else {
                Logger.debug('signaled instance ' + instanceId);
            }
            return true;
        } catch (e) {
            Logger.warn('postMessage to child failed for ' + instanceId, e);
            return false;
        }
    },

    _onEmbeddedAck(state, event) {
        if (!fosIsExactEnvOrigin(event.origin)) {
            return;
        }
        if (!fosFindIframeForSource(event.source)) {
            Logger.warn('embedded ack ignored — source is not a page iframe');
            return;
        }
        if (!event.data || event.data.ok !== true) {
            Logger.warn('embedded ack rejected from ' + event.origin);
            return;
        }
        let originHostname = '';
        try {
            originHostname = new URL(event.origin).hostname;
        } catch (_e) {
            return;
        }
        const instanceId = String(event.data.instanceId || fosInstanceIdFromHostname(originHostname));
        if (!instanceId) {
            return;
        }
        const rec = state.fosInstances.get(instanceId);
        if (!rec || !rec.bridgeNonce || event.data.nonce !== rec.bridgeNonce) {
            Logger.warn('embedded ack ignored — nonce mismatch for ' + instanceId);
            return;
        }
        const child =
            (rec.child && rec.child.source === event.source && rec.child) ||
            { source: event.source, origin: event.origin };
        rec.child = child;
        const iframe =
            fosFindIframeForSource(event.source) ||
            fosFindEnvIframeByHostname(originHostname);
        if (!iframe) {
            Logger.warn('embedded ack for ' + instanceId + ' — iframe not found');
            return;
        }
        this._patchIframeClipboardAllow(state, iframe);
        this._markInstanceReady(state, instanceId, child, iframe);
        this._mountClipboardPanel(state, instanceId, child, iframe);
        Logger.log('embedded bridge authorized for ' + instanceId);
    },

    _listenEmbeddedAck(state) {
        if (state.ackListenerInstalled) {
            return;
        }
        state.ackListenerInstalled = true;
        const self = this;
        window.addEventListener('message', (event) => {
            if (!event.data || event.data.type !== FOS_EMBEDDED_ACK_TYPE) {
                return;
            }
            self._onEmbeddedAck(state, event);
        });
    },

    _flushPendingChild(state, instanceId) {
        const pending = state.pendingChildren.get(instanceId);
        if (!pending) {
            return;
        }
        if (this._tryNotifyChild(state, instanceId, pending)) {
            state.pendingChildren.delete(instanceId);
        }
    },

    _onInstanceProgress(state, instanceId) {
        this._flushPendingChild(state, instanceId);
    },

    _subscribeOrchestrator(state) {
        if (!Context.networkObserver || typeof Context.networkObserver.subscribe !== 'function') {
            Logger.warn('NetworkObserver unavailable; orchestrator capture skipped');
            return;
        }
        const self = this;
        Context.networkObserver.subscribe({
            id: 'fos-embedded-watcher-orchestrator',
            matches(meta) {
                return (
                    meta.method === 'POST' &&
                    !!meta.urlObj &&
                    meta.urlObj.href.startsWith(FOS_ORCHESTRATOR_INSTANCES_URL)
                );
            },
            onResponse(meta, response) {
                if (!response.ok) {
                    return;
                }
                response
                    .json()
                    .then((body) => {
                        if (!body || !body.instance_id || body.env_key == null || body.env_key === '') {
                            return;
                        }
                        const instanceId = String(body.instance_id);
                        const rec = self._ensureInstance(state, instanceId);
                        rec.envKey = String(body.env_key);
                        Logger.log('env instance registered ' +
                                instanceId +
                                ' env=' +
                                rec.envKey
                        );
                        if (fosIsFosEnvKey(rec.envKey)) {
                            self._markFosDesktop(state, instanceId, 'env-key');
                        }
                        self._onInstanceProgress(state, instanceId);
                    })
                    .catch(() => { /* ignore non-JSON */ });
            }
        });
    },

    _subscribeDesktopShape(state) {
        if (!Context.networkObserver || typeof Context.networkObserver.subscribe !== 'function') {
            Logger.warn('NetworkObserver unavailable; desktop shape capture skipped');
            return;
        }
        const self = this;
        Context.networkObserver.subscribe({
            id: 'fos-embedded-watcher-desktop-shape',
            matches(meta) {
                return fosIsEnvDesktopShapeRequest(meta);
            },
            onRequest(meta) {
                const instanceId = fosInstanceIdFromHostname(meta.urlObj.hostname);
                if (!instanceId) {
                    return;
                }
                self._markFosDesktop(state, instanceId, meta.urlObj.pathname);
            },
            onResponse(meta, _response) {
                const instanceId = fosInstanceIdFromHostname(meta.urlObj.hostname);
                if (!instanceId) {
                    return;
                }
                self._markFosDesktop(state, instanceId, meta.urlObj.pathname);
            }
        });
    },

    _subscribeLatch(state) {
        if (!Context.networkObserver || typeof Context.networkObserver.subscribe !== 'function') {
            Logger.warn('NetworkObserver unavailable; latch capture skipped');
            return;
        }
        const self = this;
        Context.networkObserver.subscribe({
            id: 'fos-embedded-watcher-latch',
            matches(meta) {
                return fosIsEnvTimestampProbe(meta);
            },
            onResponse(meta, response) {
                if (response.status !== 200) {
                    return;
                }
                const instanceId = fosInstanceIdFromHostname(meta.urlObj.hostname);
                if (!instanceId) {
                    return;
                }
                const rec = self._ensureInstance(state, instanceId);
                if (!rec.latchReady) {
                    rec.latchReady = true;
                    Logger.log('env ready for instance ' +
                            instanceId +
                            ' (' +
                            meta.urlObj.pathname +
                            ')'
                    );
                }
                self._onInstanceProgress(state, instanceId);
            }
        });
    },

    _listenClipboardResults(state) {
        if (state.resultListenerInstalled) {
            return;
        }
        state.resultListenerInstalled = true;
        window.addEventListener('message', (event) => {
            if (!event.data || typeof event.data !== 'object' || typeof event.data.type !== 'string') {
                return;
            }
            const type = event.data.type;
            if (type !== FOS_PUSH_RESULT_TYPE && type !== FOS_EXTRACT_RESULT_TYPE) {
                return;
            }
            if (!fosIsExactEnvOrigin(event.origin) || !fosFindIframeForSource(event.source)) {
                return;
            }
            const requestId = event.data.requestId;
            if (!requestId || !state.pendingRequests.has(requestId)) {
                return;
            }
            const instanceId = String(event.data.instanceId || '');
            const rec = instanceId ? state.fosInstances.get(instanceId) : null;
            if (!rec || event.data.nonce !== rec.bridgeNonce) {
                Logger.warn('clipboard result ignored — nonce/instance mismatch');
                return;
            }
            if (rec.child && rec.child.source && rec.child.source !== event.source) {
                Logger.warn('clipboard result ignored — source does not match bound iframe');
                return;
            }
            if (type === FOS_EXTRACT_RESULT_TYPE && typeof event.data.text === 'string' &&
                event.data.text.length > FOS_CLIPBOARD_MAX_CHARS) {
                Logger.warn('clipboard extract ignored — text too large');
                return;
            }
            const pending = state.pendingRequests.get(requestId);
            state.pendingRequests.delete(requestId);
            if (pending && typeof pending.resolve === 'function') {
                pending.resolve(event.data);
            }
        });
    },

    _listenChildReady(state) {
        if (state.messageListenerInstalled) {
            return;
        }
        state.messageListenerInstalled = true;
        const self = this;
        window.addEventListener('message', (event) => {
            if (!event.data || event.data.type !== FOS_CHILD_READY_TYPE) {
                return;
            }
            if (!fosIsExactEnvOrigin(event.origin) || !fosFindIframeForSource(event.source)) {
                return;
            }
            let originHostname = '';
            try {
                originHostname = new URL(event.origin).hostname;
            } catch (_e) {
                return;
            }
            const hostname = String(event.data.hostname || originHostname);
            if (!FOS_ENV_HOST_PATTERN.test(hostname)) {
                return;
            }
            const instanceId = fosInstanceIdFromHostname(hostname);
            if (!instanceId) {
                return;
            }
            const child = { source: event.source, origin: event.origin };
            self._patchIframeForChild(state, child, hostname);
            self._markFosDesktop(state, instanceId, 'child-ready');
            Logger.debug('child-ready from ' + instanceId);
            // Iframe navigated/reloaded: clear prior ready until the new document acks.
            self._teardownPanel(state, instanceId);
            self._unmarkInstanceReady(state, instanceId);
            if (!self._tryNotifyChild(state, instanceId, child)) {
                state.pendingChildren.set(instanceId, child);
                Logger.debug('child queued pending latch for ' + instanceId);
            }
        });
    }
};

return plugin;
},
        "libs/accept-task-modal-improvements.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {
// ============= accept-task-modal-improvements.js (library) =============
// QA Accept/Approve Task modal: "Motivate worker" button above optional comments.

const ENCOURAGEMENT_BLURBS = [
    'Great work!',
    'Good submission!',
    'Nice job!',
    'Well done!',
    'Solid work!',
    'Looks good!',
    'Excellent submission!',
    'Keep it up!',
    'Really nice!',
    'Good going!',
    'Thumbs up!',
    'Nice one!',
    'On point!',
    'Clean work!',
    'Well put together!',
    'Strong submission!',
    'Good stuff!',
    'Right on!',
    'Approved!',
    'Looks solid!',
    'Well executed!',
    'Spot on!',
    'Quality work!',
    'All good!',
    'Smooth work!',
    'Right on target!',
    'Good form!',
    'Well handled!',
    'Good show!',
    'Nice and clear!',
    'Right way to do it!',
    'Clean and clear!',
    'Well thought out!',
    'Nice and thorough!',
    'On the money!',
    'Nice and complete!',
    'Good attention to detail!',
    'Way to go!'
];

const AcceptTaskModalApi = {
    run(state, options) {
        const pluginId = (options && options.pluginId) || 'acceptTaskModalImprovements';
        const logTag = (options && options.logTag) || pluginId;

        const dialogs = Context.dom.queryAll('div[role="dialog"][data-state="open"]', {
            context: logTag + '.dialogs'
        });

        let approveModal = null;
        for (const dialog of dialogs) {
            const heading = Context.dom.query('h2', { root: dialog, context: logTag + '.heading' });
            if (heading && heading.textContent.trim() === 'Approve Task') {
                approveModal = dialog;
                break;
            }
        }

        if (!approveModal) {
            if (state.lastProcessedDialog) {
                state.lastProcessedDialog = null;
                state.motivateButtonAdded = false;
            }
            state.warnLogged = false;
            if (!state.missingLogged) {
                Logger.debug('Approve Task dialog not found');
                state.missingLogged = true;
            }
            return;
        }

        state.missingLogged = false;

        const motivateEnabled = Storage.getSubOptionEnabled(pluginId, 'motivate-worker-button', true);
        if (motivateEnabled) {
            this.ensureMotivateButton(approveModal, state, pluginId, logTag);
        } else {
            this.removeMotivateButton(approveModal, pluginId);
            state.motivateButtonAdded = false;
        }
    },

    ensureMotivateButton(dialog, state, pluginId, logTag) {
        const notesSection = this.findOptionalNotesSection(dialog);
        if (!notesSection) {
            if (!state.missingLogged) {
                Logger.debug('optional notes section not found');
                state.missingLogged = true;
            }
            return;
        }

        let wrapper = notesSection.querySelector('[data-fleet-plugin="' + pluginId + '"]');
        if (wrapper) {
            state.motivateButtonAdded = true;
            return;
        }

        const labelRow = notesSection.querySelector('.flex.items-center.justify-between.mb-1');
        const textarea = notesSection.querySelector('textarea');
        if (!labelRow || !textarea) {
            if (!state.warnLogged) {
                Logger.warn('label or textarea not found in notes section');
                state.warnLogged = true;
            }
            return;
        }
        state.warnLogged = false;

        wrapper = document.createElement('div');
        wrapper.setAttribute('data-fleet-plugin', pluginId);
        wrapper.className = 'flex flex-col gap-2';

        const buttonClass = 'inline-flex items-center justify-center whitespace-nowrap font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-emerald-600 bg-transparent text-emerald-600 hover:bg-emerald-50 hover:border-emerald-700 h-8 rounded-sm pl-3 pr-3 text-xs transition-colors';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = buttonClass;
        btn.textContent = 'Motivate worker with positive comment?';
        btn.title = 'Insert a random positive feedback blurb into the optional comments box';
        btn.addEventListener('click', () => {
            const blurb = ENCOURAGEMENT_BLURBS[Math.floor(Math.random() * ENCOURAGEMENT_BLURBS.length)];
            this.setTextareaValueReactFriendly(textarea, blurb);
            Logger.log('set positive comment (React-friendly)');
        });
        wrapper.appendChild(btn);

        textarea.insertAdjacentElement('beforebegin', wrapper);
        state.motivateButtonAdded = true;
        Logger.log('motivate button added');
    },

    setTextareaValueReactFriendly(textarea, blurb) {
        textarea.focus();
        const previousValue = textarea.value;
        const proto = Object.getPrototypeOf(textarea);
        const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
        if (descriptor && descriptor.set) {
            descriptor.set.call(textarea, blurb);
        } else {
            textarea.value = blurb;
        }
        if (textarea._valueTracker && typeof textarea._valueTracker.setValue === 'function') {
            try {
                textarea._valueTracker.setValue(previousValue);
            } catch (_) { /* ignore */ }
        }
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
    },

    findOptionalNotesSection(dialog) {
        const labels = dialog.querySelectorAll('.text-sm.text-muted-foreground.font-medium');
        for (const label of labels) {
            if (label.textContent.trim() === 'Other Notes/Feedback (optional)') {
                const section = label.parentElement?.parentElement || label.closest('div');
                return section;
            }
        }
        return null;
    },

    removeMotivateButton(dialog, pluginId) {
        const wrapper = dialog.querySelector('[data-fleet-plugin="' + pluginId + '"]');
        if (wrapper) {
            wrapper.remove();
            Logger.debug('Accept Task Modal Improvements: motivate button removed');
        }
    }
};

const plugin = {
    id: 'acceptTaskModalImprovementsLib',
    name: '"Accept Task" Modal Improvements (library)',
    description: 'Shared Approve Task positive-comment button',
    _version: '2.3',
    phase: 'core',
    enabledByDefault: true,
    initialState: { registered: false },

    init(state) {
        Context.acceptTaskModalImprovements = {
            run: (s, options) => AcceptTaskModalApi.run(s, options)
        };
        if (!state.registered) {
            Logger.log('module registered (Context.acceptTaskModalImprovements)');
            state.registered = true;
        }
    }
};

return plugin;
},
        "libs/copy-verifier-output.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {
// ============= copy-verifier-output.js =============
// Adds a copy button in the Verifier Output panel: after "Stdout" (classic output) or after "Score: #" (checklist verifier). Stdout copies raw pre text; checklist copies failures/successes as markdown with separate code fences per section. Epic-style stdout ([C] Rubric / MUST-NICE criteria) is formatted into Must/Nice Haves sections.
// Checklist score row: legacy `gap-2` header or card layout (`justify-between`, sticky) inside `div.p-3` or `div.p-2`.
// Checklist cards: when "Raw Output" is expanded, a second copy icon copies only the <pre> body.
// If the score card has a collapsible Stdout section, expand it before copying; only read stdout pre when open.

const COPY_BUTTON_MARKER = 'data-fleet-copy-verifier-output';
const COPY_RAW_OUTPUT_MARKER = 'data-fleet-copy-verifier-raw-output';
const RAW_OUTPUT_ROW_MARKER = 'data-fleet-copy-verifier-raw-row';
const EPIC_CRITERION_LINE_RE = /^\[C\]\s+((?:\[NICE\]\s+)?.+:\s+(0\.0|1\.0)\/1\.0\s+—\s+.+)$/;
const VERIFIER_CHECK_PREFIX_RE = /^\[(?:C|X)\]\s*/i;

function stripVerifierCheckPrefix(text) {
    return String(text || '').replace(VERIFIER_CHECK_PREFIX_RE, '').trim();
}

function markdownFenceFor(content) {
    let maxRun = 0;
    let run = 0;
    for (let i = 0; i < content.length; i++) {
        if (content[i] === '`') {
            run++;
            if (run > maxRun) maxRun = run;
        } else {
            run = 0;
        }
    }
    return '`'.repeat(Math.max(3, maxRun + 1));
}

const CopyVerifierOutputApi = {
    id: 'copyVerifierOutput',
    name: 'Copy Verifier Output',
    description:
        'Copy buttons for Stdout, Score, and expanded Raw Output',
    _version: '5.4',
    enabledByDefault: true,
    phase: 'mutation',

    initialState: {
        buttonAdded: false,
        verifierTargetMissingLogged: false
    },

    run(state, context) {
        const scoreRow = this.findScoreRow();
        const stdoutRow = scoreRow ? null : this.findStdoutRow();
        const anchorRow = scoreRow || stdoutRow;
        const sig = (anchorRow ? anchorRow.outerHTML.length : 0) + '|' + (anchorRow ? (anchorRow.querySelector(`[${COPY_BUTTON_MARKER}="true"]`) ? 1 : 0) : 0);
        if (sig === state.lastRunSig) return;
        state.lastRunSig = sig;

        if (!anchorRow) {
            if (!state.verifierTargetMissingLogged) {
                Logger.debug('Stdout/Score row not found');
                state.verifierTargetMissingLogged = true;
            }
            return;
        }
        state.verifierTargetMissingLogged = false;

        let container;
        if (scoreRow) {
            container = scoreRow.closest('div.p-3') || scoreRow.closest('div.p-2');
            if (!container) {
                Logger.debug('Score card container not found');
                return;
            }
        } else {
            container = stdoutRow.closest('div.text-xs.w-full');
            if (!container) {
                Logger.debug('Stdout container not found');
                return;
            }
        }

        const copyButtonHost = scoreRow ? this.getScoreRowButtonHost(scoreRow) : anchorRow;
        if (!anchorRow.querySelector(`[${COPY_BUTTON_MARKER}="true"]`)) {
            const button = this.createCopyButton(container);
            copyButtonHost.appendChild(button);
            if (!copyButtonHost.classList.contains('flex')) {
                copyButtonHost.classList.add('flex', 'items-center', 'gap-2');
            }
            if (!state.buttonAdded) {
                state.buttonAdded = true;
                Logger.log('Copy button added');
            }
        }

        if (scoreRow) {
            this.syncRawOutputCopyButton(container);
        }
    },

    findRawOutputBlock(scoreContainer) {
        for (const block of scoreContainer.querySelectorAll(':scope > div.text-xs.mb-3')) {
            if (block.classList.contains('space-y-0.5')) continue;
            const hasRaw = Array.from(block.querySelectorAll('button')).some((b) =>
                (b.textContent || '').includes('Raw Output')
            );
            if (hasRaw) return block;
        }
        return null;
    },

    findStdoutBlock(container) {
        if (!container) return null;
        for (const block of container.querySelectorAll(':scope > div.mb-3.text-xs, :scope > div.text-xs.mb-3')) {
            if (block.querySelector('[class*="group/stdout"]')) {
                return block;
            }
            for (const el of block.querySelectorAll(
                'div.text-sm.text-muted-foreground.font-medium, div.text-sm.font-medium'
            )) {
                if (el.textContent.trim() === 'Stdout') {
                    return block;
                }
            }
        }
        return null;
    },

    findStdoutHeader(block) {
        if (!block) return null;
        return (
            block.querySelector('[class*="group/stdout"]') ||
            Array.from(block.querySelectorAll('div.cursor-pointer')).find((row) => {
                for (const el of row.querySelectorAll(
                    'div.text-sm.text-muted-foreground.font-medium, div.text-sm.font-medium'
                )) {
                    if (el.textContent.trim() === 'Stdout') {
                        return true;
                    }
                }
                return false;
            }) ||
            null
        );
    },

    findStdoutPre(block) {
        if (!block) return null;
        return (
            block.querySelector(':scope > div.border.bg-background pre') ||
            block.querySelector(':scope > div.rounded.border.bg-background pre') ||
            block.querySelector(':scope > div.overflow-x-auto.bg-background.border.rounded pre') ||
            block.querySelector('pre')
        );
    },

    isStdoutCollapsed(block) {
        const header = this.findStdoutHeader(block);
        if (!header) {
            return false;
        }
        const chevron = header.querySelector('svg.transition-transform');
        if (chevron) {
            return chevron.classList.contains('-rotate-90');
        }
        const pre = this.findStdoutPre(block);
        return !pre || !pre.textContent.trim();
    },

    expandStdoutSection(block) {
        const header = this.findStdoutHeader(block);
        if (!header) {
            return false;
        }
        header.click();
        Logger.debug('Expanded Stdout section');
        return true;
    },

    findRawOutputPre(block) {
        return block.querySelector(':scope > div.overflow-x-auto.bg-background.border.rounded pre');
    },

    findRawOutputToggle(block) {
        if (!block) return null;
        return Array.from(block.querySelectorAll('button')).find(
            (b) => (b.textContent || '').includes('Raw Output') && !b.hasAttribute(COPY_RAW_OUTPUT_MARKER)
        );
    },

    getStdoutBlockText(block) {
        if (!block || this.isStdoutCollapsed(block)) {
            return null;
        }
        const pre = this.findStdoutPre(block);
        const raw = pre && pre.textContent.trim();
        if (!raw) {
            return null;
        }
        return this.formatRawVerifierText(raw);
    },

    waitForStdoutExpanded(block, onReady, onFail) {
        let settled = false;
        const finish = (text) => {
            if (settled) return;
            settled = true;
            observer.disconnect();
            clearTimeout(timeoutId);
            if (text) {
                onReady(text);
            } else {
                onFail();
            }
        };
        const tryText = () => this.getStdoutBlockText(block);
        const immediate = tryText();
        if (immediate) {
            onReady(immediate);
            return;
        }
        const observer = new MutationObserver(() => {
            const next = tryText();
            if (next) {
                finish(next);
            }
        });
        observer.observe(block, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class'] });
        const timeoutId = setTimeout(() => finish(null), 3000);
    },

    attemptCopyFromStdoutSection(button, block) {
        const copyOrFail = (text, logSuffix) => {
            if (text) {
                this.copyVerifierTextWithFeedback(button, text, logSuffix);
                return;
            }
            Logger.warn('Copy Verifier Output: No verifier output to copy from Stdout');
            this.showVerifierCopyFailurePulse(button);
        };

        const openText = this.getStdoutBlockText(block);
        if (openText) {
            copyOrFail(openText, '');
            return;
        }

        if (!this.isStdoutCollapsed(block)) {
            copyOrFail(null);
            return;
        }

        if (button._fleetCopyExpandPending) {
            return;
        }
        button._fleetCopyExpandPending = true;

        if (!this.expandStdoutSection(block)) {
            button._fleetCopyExpandPending = false;
            copyOrFail(null);
            return;
        }

        const afterExpand = (text) => {
            button._fleetCopyExpandPending = false;
            copyOrFail(text, text ? ' (stdout)' : '');
        };

        const immediate = this.getStdoutBlockText(block);
        if (immediate) {
            afterExpand(immediate);
            return;
        }

        this.waitForStdoutExpanded(block, (text) => afterExpand(text), () => afterExpand(null));
    },

    attemptCopyVerifierOutput(button, container) {
        const stdoutBlock = this.findStdoutBlock(container);
        if (stdoutBlock) {
            this.attemptCopyFromStdoutSection(button, stdoutBlock);
            return;
        }

        const text = this.getVerifierOutputText(container);
        if (!text) {
            Logger.warn('Copy Verifier Output: No verifier output to copy');
            this.showVerifierCopyFailurePulse(button);
            return;
        }
        this.copyVerifierTextWithFeedback(button, text);
    },

    unwrapRawOutputCopyRow(block) {
        const wrapper = block.querySelector(`:scope > [${RAW_OUTPUT_ROW_MARKER}="true"]`);
        if (!wrapper) return;
        const toggleBtn = wrapper.querySelector(`button:not([${COPY_RAW_OUTPUT_MARKER}="true"])`);
        if (toggleBtn && (toggleBtn.textContent || '').includes('Raw Output')) {
            block.insertBefore(toggleBtn, wrapper);
            if (!toggleBtn.classList.contains('mb-1')) toggleBtn.classList.add('mb-1');
        }
        wrapper.remove();
    },

    syncRawOutputCopyButton(scoreContainer) {
        const block = this.findRawOutputBlock(scoreContainer);
        if (!block) return;
        const pre = this.findRawOutputPre(block);
        if (!pre || !pre.textContent.trim()) {
            this.unwrapRawOutputCopyRow(block);
            return;
        }
        let copyBtn = block.querySelector(`[${COPY_RAW_OUTPUT_MARKER}="true"]`);
        if (copyBtn) {
            copyBtn._fleetCopyRawPre = pre;
            return;
        }
        const toggleBtn = this.findRawOutputToggle(block);
        if (!toggleBtn) return;
        const wrapper = document.createElement('div');
        wrapper.className = 'flex items-center gap-2 mb-1';
        wrapper.setAttribute(RAW_OUTPUT_ROW_MARKER, 'true');
        toggleBtn.classList.remove('mb-1');
        toggleBtn.parentNode.insertBefore(wrapper, toggleBtn);
        wrapper.appendChild(toggleBtn);
        copyBtn = this.createRawOutputCopyButton(pre);
        wrapper.appendChild(copyBtn);
        Logger.debug('Raw Output copy control added');
    },

    getGradingPanelRoot() {
        const reportGradingBtn = Array.from(document.querySelectorAll('button')).find(
            (btn) => btn.textContent && btn.textContent.trim().includes('Report Grading Issues')
        );
        if (reportGradingBtn) {
            const panel = reportGradingBtn.closest('[data-panel]');
            if (panel) return panel;
        }
        const instanceContent = document.querySelector('[data-ui="qa-instance-content"]');
        if (instanceContent) {
            const instancePanel = instanceContent.closest('[data-panel]');
            if (instancePanel && instancePanel.parentElement) {
                const sibling = instancePanel.nextElementSibling || instancePanel.previousElementSibling;
                if (sibling && sibling.getAttribute?.('data-panel')) return sibling;
            }
        }
        // No "Report Grading Issues" found; scope search to the panel that contains the verifier labels
        const stdoutCandidates = document.querySelectorAll('div.text-sm.text-muted-foreground.font-medium.mb-1');
        for (const el of stdoutCandidates) {
            if (el.textContent.trim() === 'Stdout') {
                const panel = el.closest('[data-panel]');
                if (panel) return panel;
            }
        }
        const scoreRowCandidates = document.querySelectorAll('div.flex.items-center.text-sm.mb-3');
        for (const el of scoreRowCandidates) {
            for (const s of el.querySelectorAll('span')) {
                if (s.textContent.trim() === 'Score:') {
                    const panel = el.closest('[data-panel]');
                    if (panel) return panel;
                }
            }
        }
        return null;
    },

    /** When the score lives in an inner flex group and timing is a sibling (`justify-between`), append the copy control there so it stays beside the score. */
    getScoreRowButtonHost(scoreRow) {
        for (const s of scoreRow.querySelectorAll('span')) {
            if (s.textContent.trim() !== 'Score:') continue;
            const p = s.parentElement;
            if (p && p !== scoreRow) return p;
            return scoreRow;
        }
        return scoreRow;
    },

    findScoreRow() {
        const gradingPanel = this.getGradingPanelRoot();
        const roots = gradingPanel ? [gradingPanel, document] : [document];
        for (const root of roots) {
            const candidates = root.querySelectorAll('div.flex.items-center.text-sm.mb-3');
            for (const el of candidates) {
                for (const s of el.querySelectorAll('span')) {
                    if (s.textContent.trim() === 'Score:') {
                        return el;
                    }
                }
            }
        }
        return null;
    },

    findStdoutRow() {
        const gradingPanel = this.getGradingPanelRoot();
        const roots = gradingPanel ? [gradingPanel, document] : [document];
        for (const root of roots) {
            const candidates = root.querySelectorAll('div.text-sm.text-muted-foreground.font-medium.mb-1');
            for (const el of candidates) {
                if (el.textContent.trim() === 'Stdout') {
                    return el;
                }
            }
        }
        return null;
    },

    looksLikeEpicVerifierOutput(raw) {
        if (!raw) {
            return false;
        }
        const text = String(raw);
        return /\[C\]\s+Rubric:[^\n]*\[MUST\]/i.test(text) && /:\s+(?:0\.0|1\.0)\/1\.0\s+—/.test(text);
    },

    parseEpicVerifierCriteria(raw) {
        const must = [];
        const nice = [];
        let scoreIndex = 0;
        let inCriteriaBlock = false;
        for (const line of String(raw || '').split('\n')) {
            if (/^\[C\]\s+Score:/.test(line)) {
                scoreIndex++;
                inCriteriaBlock = true;
                continue;
            }
            if (
                /^\[C\]\s+(?:Feedback:|Rubric:|Grading|Judge call|Calling judge|No images)/.test(line) ||
                line.startsWith('>>>') ||
                line.startsWith('<<<')
            ) {
                inCriteriaBlock = false;
                continue;
            }
            const match = line.match(EPIC_CRITERION_LINE_RE);
            if (!match || !inCriteriaBlock || scoreIndex <= 0) {
                continue;
            }
            const entry = { line: match[1], score: match[2] };
            if (scoreIndex === 1) {
                must.push(entry);
            } else if (scoreIndex === 2) {
                nice.push(entry);
            }
        }
        return { must, nice };
    },

    appendEpicSectionMarkdown(lines, label, criteria) {
        if (!criteria.length) {
            return;
        }
        const passCount = criteria.filter((c) => c.score === '1.0').length;
        const total = criteria.length;
        const pct = total ? Math.round((passCount / total) * 100) : 0;
        lines.push(`## ${label}: ${passCount}/${total} (${pct}%)`);
        const sections = [];
        const failures = criteria
            .filter((c) => c.score === '0.0')
            .map((c) => `❌ ${stripVerifierCheckPrefix(c.line)}`);
        const successes = criteria
            .filter((c) => c.score === '1.0')
            .map((c) => `✅ ${stripVerifierCheckPrefix(c.line)}`);
        if (failures.length > 0) {
            sections.push({ label: 'Failures', items: failures });
        }
        if (successes.length > 0) {
            sections.push({ label: 'Successes', items: successes });
        }
        for (let i = 0; i < sections.length; i++) {
            if (i > 0) {
                lines.push('');
            }
            const { label: sectionLabel, items } = sections[i];
            const body = items.join('\n');
            const fence = markdownFenceFor(body);
            lines.push(sectionLabel);
            lines.push(`${fence}\n${body}\n${fence}`);
        }
    },

    buildEpicVerifierMarkdown(raw) {
        if (!this.looksLikeEpicVerifierOutput(raw)) {
            return null;
        }
        const { must, nice } = this.parseEpicVerifierCriteria(raw);
        if (!must.length && !nice.length) {
            return null;
        }
        const lines = ['## Verifier'];
        this.appendEpicSectionMarkdown(lines, 'Must Haves', must);
        if (nice.length) {
            lines.push('');
            this.appendEpicSectionMarkdown(lines, 'Nice to Haves', nice);
        }
        return lines.join('\n');
    },

    formatRawVerifierText(raw) {
        if (!raw) {
            return null;
        }
        const epicMd = this.buildEpicVerifierMarkdown(raw);
        return epicMd || raw;
    },

    getRawVerifierText(container) {
        const rawBlock = this.findRawOutputBlock(container);
        const rawPre = rawBlock ? this.findRawOutputPre(rawBlock) : null;
        if (rawPre && rawPre.textContent.trim()) {
            return rawPre.textContent.trim();
        }
        const stdoutBlock = this.findStdoutBlock(container);
        const stdoutPre = stdoutBlock ? this.findStdoutPre(stdoutBlock) : null;
        if (stdoutPre && stdoutPre.textContent.trim()) {
            return stdoutPre.textContent.trim();
        }
        const pre =
            container.querySelector('div.overflow-x-auto.bg-background.border.rounded pre') ||
            container.querySelector('div.border.bg-background pre');
        if (pre && pre.textContent.trim()) {
            return pre.textContent.trim();
        }
        return null;
    },

    buildScoreVerifierMarkdown(container) {
        const list = container.querySelector('div.text-xs.mb-3.space-y-0\\.5');
        if (!list) {
            return null;
        }
        const rows = list.querySelectorAll(':scope > div.flex.items-start');
        const successes = [];
        const failures = [];
        for (const row of rows) {
            const svg = row.querySelector(':scope > svg');
            if (!svg) continue;
            const cls = svg.getAttribute('class') || '';
            const span = row.querySelector(':scope > span');
            const text = stripVerifierCheckPrefix(
                span ? String(span.textContent || '').replace(/\s+/g, ' ').trim() : ''
            );
            if (!text) continue;
            if (cls.includes('text-emerald')) {
                successes.push(text);
            } else if (cls.includes('text-red')) {
                failures.push(text);
            }
        }
        if (successes.length === 0 && failures.length === 0) {
            return null;
        }
        const lines = ['## Verifier'];
        const sections = [];
        if (failures.length > 0) {
            sections.push({ label: 'Failures', items: failures.map((t) => `❌ ${t}`) });
        }
        if (successes.length > 0) {
            sections.push({ label: 'Successes', items: successes.map((t) => `✅ ${t}`) });
        }
        for (let i = 0; i < sections.length; i++) {
            if (i > 0) {
                lines.push('');
            }
            const { label, items } = sections[i];
            const body = items.join('\n');
            const fence = markdownFenceFor(body);
            lines.push(label);
            lines.push(`${fence}\n${body}\n${fence}`);
        }
        return lines.join('\n');
    },

    getVerifierOutputText(container) {
        const raw = this.getRawVerifierText(container);
        if (raw) {
            const epicMd = this.buildEpicVerifierMarkdown(raw);
            if (epicMd) {
                return epicMd;
            }
        }
        const scoreMd = this.buildScoreVerifierMarkdown(container);
        if (scoreMd) {
            return scoreMd;
        }
        return raw;
    },

    ensureWindowCopyCapture() {
        if (this._copyVerifierWindowCaptureInstalled) {
            return;
        }
        this._copyVerifierWindowCaptureInstalled = true;
        const win = typeof Context !== 'undefined' && Context.getPageWindow ? Context.getPageWindow() : window;
        const handler = (e) => {
            const rawBtn = e.target.closest(`[${COPY_RAW_OUTPUT_MARKER}="true"]`);
            if (rawBtn && rawBtn.getAttribute('data-fleet-plugin') === this.id) {
                const pre = rawBtn._fleetCopyRawPre;
                if (rawBtn._fleetCopyHandledAt && Date.now() - rawBtn._fleetCopyHandledAt < 150) {
                    return;
                }
                rawBtn._fleetCopyHandledAt = Date.now();
                e.stopImmediatePropagation();
                e.stopPropagation();
                e.preventDefault();
                const rawText = pre && pre.textContent.trim();
                if (!rawText) {
                    Logger.warn('Copy Verifier Output: No raw output to copy');
                    this.showVerifierCopyFailurePulse(rawBtn);
                    return;
                }
                const text = this.formatRawVerifierText(rawText);
                this.copyVerifierTextWithFeedback(rawBtn, text, ' (raw output)');
                return;
            }

            const btn = e.target.closest(`[${COPY_BUTTON_MARKER}="true"]`);
            if (!btn || btn.getAttribute('data-fleet-plugin') !== this.id) {
                return;
            }
            const cont = btn._fleetCopyVerifierContainer;
            if (!cont) {
                return;
            }
            if (btn._fleetCopyHandledAt && Date.now() - btn._fleetCopyHandledAt < 150) {
                return;
            }
            btn._fleetCopyHandledAt = Date.now();
            e.stopImmediatePropagation();
            e.stopPropagation();
            e.preventDefault();
            this.attemptCopyVerifierOutput(btn, cont);
        };
        win.addEventListener('pointerdown', handler, true);
        win.addEventListener('click', handler, true);
    },

    clearVerifierCopyButtonFeedback(button) {
        if (Context.buttonFeedback) Context.buttonFeedback.clear(button);
    },

    showVerifierCopyFailurePulse(button) {
        if (Context.buttonFeedback) Context.buttonFeedback.flashFailure(button, { restoreStyles: false });
    },

    copyVerifierTextWithFeedback(button, text, logSuffix = '') {
        const showOk = () => {
            Logger.log(`Copied ${text.length} chars to clipboard${logSuffix}`);
            if (Context.buttonFeedback) Context.buttonFeedback.flashSuccess(button, { restoreStyles: false });
        };

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard
                .writeText(text)
                .then(showOk)
                .catch((err) => {
                    Logger.warn('Copy Verifier Output: Clipboard API failed, trying fallback', err);
                    if (this.copyVerifierTextFallback(text)) {
                        showOk();
                    } else {
                        Logger.error('Copy Verifier Output: Failed to copy to clipboard', err);
                        this.showVerifierCopyFailurePulse(button);
                    }
                });
        } else if (this.copyVerifierTextFallback(text)) {
            showOk();
        } else {
            Logger.error('Copy Verifier Output: Failed to copy to clipboard');
            this.showVerifierCopyFailurePulse(button);
        }
    },

    copyVerifierTextFallback(text) {
        try {
            const temp = document.createElement('textarea');
            temp.value = text;
            temp.style.position = 'fixed';
            temp.style.top = '-1000px';
            document.body.appendChild(temp);
            temp.select();
            const ok = document.execCommand('copy');
            document.body.removeChild(temp);
            return ok;
        } catch (e) {
            return false;
        }
    },

    createCopyButton(container) {
        this.ensureWindowCopyCapture();

        const button = document.createElement('button');
        button.setAttribute(COPY_BUTTON_MARKER, 'true');
        button.setAttribute('data-fleet-plugin', this.id);
        button.type = 'button';
        button.className =
            'relative z-50 inline-flex items-center justify-center whitespace-nowrap rounded-sm text-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground size-7 h-6 w-6';
        button.setAttribute('data-state', 'closed');
        button.title = 'Copy verifier output to clipboard';
        button.setAttribute('aria-label', 'Copy verifier output to clipboard');
        button._fleetCopyVerifierContainer = container;

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', '12');
        svg.setAttribute('height', '12');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        svg.className = 'fill-current h-3 w-3 text-muted-foreground pointer-events-none';
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('fill', 'currentColor');
        path.setAttribute('fill-rule', 'evenodd');
        path.setAttribute('clip-rule', 'evenodd');
        path.setAttribute('d', 'M2 5C2 3.34315 3.34315 2 5 2H12C13.6569 2 15 3.34315 15 5C15 5.55228 14.5523 6 14 6C13.4477 6 13 5.55228 13 5C13 4.44772 12.5523 4 12 4H5C4.44772 4 4 4.44772 4 5V13C4 13.5523 4.44772 14 5 14H6C6.55228 14 7 14.4477 7 15C7 15.5523 6.55228 16 6 16H5C3.34315 16 2 14.6569 2 13V5ZM9 10.8462C9 9.20041 10.42 8 12 8H19C20.58 8 22 9.20041 22 10.8462V19.1538C22 20.7996 20.58 22 19 22H12C10.42 22 9 20.7996 9 19.1538V10.8462ZM12 10C11.3708 10 11 10.4527 11 10.8462V19.1538C11 19.5473 11.3708 20 12 20H19C19.6292 20 20 19.5473 20 19.1538V10.8462C20 10.4527 19.6292 10 19 10H12Z');
        svg.appendChild(path);
        button.appendChild(svg);

        const doCopy = () => {
            if (button._fleetCopyHandledAt && Date.now() - button._fleetCopyHandledAt < 200) {
                return;
            }
            button._fleetCopyHandledAt = Date.now();
            this.attemptCopyVerifierOutput(button, container);
        };

        button.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            e.preventDefault();
            doCopy();
        }, true);

        button.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            doCopy();
        }, true);

        return button;
    },

    createRawOutputCopyButton(pre) {
        this.ensureWindowCopyCapture();

        const button = document.createElement('button');
        button.setAttribute(COPY_RAW_OUTPUT_MARKER, 'true');
        button.setAttribute('data-fleet-plugin', this.id);
        button.type = 'button';
        button.className =
            'relative z-50 inline-flex items-center justify-center whitespace-nowrap rounded-sm text-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground size-7 h-6 w-6';
        button.setAttribute('data-state', 'closed');
        button.title = 'Copy raw verifier output to clipboard';
        button.setAttribute('aria-label', 'Copy raw verifier output to clipboard');
        button._fleetCopyRawPre = pre;

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', '12');
        svg.setAttribute('height', '12');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        svg.className = 'fill-current h-3 w-3 text-muted-foreground pointer-events-none';
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('fill', 'currentColor');
        path.setAttribute('fill-rule', 'evenodd');
        path.setAttribute('clip-rule', 'evenodd');
        path.setAttribute('d', 'M2 5C2 3.34315 3.34315 2 5 2H12C13.6569 2 15 3.34315 15 5C15 5.55228 14.5523 6 14 6C13.4477 6 13 5.55228 13 5C13 4.44772 12.5523 4 12 4H5C4.44772 4 4 4.44772 4 5V13C4 13.5523 4.44772 14 5 14H6C6.55228 14 7 14.4477 7 15C7 15.5523 6.55228 16 6 16H5C3.34315 16 2 14.6569 2 13V5ZM9 10.8462C9 9.20041 10.42 8 12 8H19C20.58 8 22 9.20041 22 10.8462V19.1538C22 20.7996 20.58 22 19 22H12C10.42 22 9 20.7996 9 19.1538V10.8462ZM12 10C11.3708 10 11 10.4527 11 10.8462V19.1538C11 19.5473 11.3708 20 12 20H19C19.6292 20 20 19.5473 20 19.1538V10.8462C20 10.4527 19.6292 10 19 10H12Z');
        svg.appendChild(path);
        button.appendChild(svg);

        const doCopy = () => {
            if (button._fleetCopyHandledAt && Date.now() - button._fleetCopyHandledAt < 200) {
                return;
            }
            button._fleetCopyHandledAt = Date.now();
            const rawText = pre && pre.textContent.trim();
            if (!rawText) {
                Logger.warn('Copy Verifier Output: No raw output to copy');
                this.showVerifierCopyFailurePulse(button);
                return;
            }
            const text = this.formatRawVerifierText(rawText);
            this.copyVerifierTextWithFeedback(button, text, ' (raw output)');
        };

        button.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            e.preventDefault();
            doCopy();
        }, true);

        button.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            doCopy();
        }, true);

        return button;
    }
};


const plugin = {
    id: 'copyVerifierOutputLib',
    name: 'Copy Verifier Output (library)',
    description: 'Shared copy controls for verifier expected/actual output',
    _version: '5.3',
    phase: 'core',
    enabledByDefault: true,
    initialState: { registered: false },

    init(state) {
        Context.copyVerifierOutput = {
            run: (s, options) => {
                const impl = Object.create(CopyVerifierOutputApi);
                if (options && options.pluginId) {
                    impl.id = options.pluginId;
                }
                return CopyVerifierOutputApi.run.call(impl, s, options);
            }
        };
        if (!state.registered) {
            Logger.log('module registered (Context.copyVerifierOutput)');
            state.registered = true;
        }
    }
};

return plugin;
},
        "libs/screenshot-upload-improvement.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {
// ============= screenshot-upload-improvement.js (library) =============
// Shared drag-drop / paste-image chrome that forwards files to a caller-supplied
// native <input type="file">. Callers find the label+input anchors.

const STYLE_ID = 'fleet-screenshot-upload-improvement-style';
const CONTROLS_WRAP_ATTR = 'data-fleet-screenshot-improvement-controls';
const UPLOAD_CONTROL_ATTR = 'data-fleet-screenshot-upload-improvement';
const PASTE_BUTTON_ATTR = 'data-fleet-screenshot-paste-image';
const NATIVE_LABEL_ATTR = 'data-fleet-screenshot-native-label';
const FILE_INPUT_ATTR = 'data-fleet-screenshot-forward-input';
const ZONE_WRAP_ATTR = 'data-fleet-screenshot-zone';

const MAX_FILES = 5;
const MAX_BYTES = 5 * 1024 * 1024;

const UPLOAD_CONTROL_CLASS =
    'flex flex-1 min-w-0 items-center justify-center gap-2 px-3 py-2 rounded-md border border-dashed border-border ' +
    'hover:border-brand/50 hover:bg-muted/50 cursor-pointer transition-colors';
const PASTE_BUTTON_CLASS =
    'inline-flex shrink-0 items-center justify-center gap-2 px-3 py-2 rounded-md border border-dashed border-border ' +
    'hover:border-brand/50 hover:bg-muted/50 cursor-pointer transition-colors text-sm';
const DRAG_OVER_CLASSES = ['ring-2', 'ring-brand/50'];

function imageFilesFromFileList(list) {
    if (!list || !list.length) return [];
    return Array.from(list).filter((f) => f.type && f.type.startsWith('image/'));
}

function imageFilesFromClipboard(clipboardData) {
    if (!clipboardData) return [];
    const fromFiles = imageFilesFromFileList(clipboardData.files);
    if (fromFiles.length) return fromFiles;
    const items = clipboardData.items;
    if (!items) return [];
    const out = [];
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind !== 'file') continue;
        const f = item.getAsFile();
        if (f && f.type.startsWith('image/')) out.push(f);
    }
    return out;
}

function shouldIgnorePasteTarget(target) {
    if (!target || target.nodeType !== Node.ELEMENT_NODE) return false;
    const el = target;
    if (el.closest('textarea, select, [contenteditable="true"]')) return true;
    const inp = el.closest('input');
    if (!inp) return false;
    const type = (inp.getAttribute('type') || 'text').toLowerCase();
    const passthrough = new Set(['file', 'button', 'submit', 'reset', 'checkbox', 'radio', 'hidden']);
    return !passthrough.has(type);
}

const ScreenshotUploadApi = {
    /**
     * @param {object} state
     * @param {object} options
     * @param {HTMLElement} options.label — native file-input label (caller-found)
     * @param {HTMLInputElement} options.input — native <input type="file"> (caller-found)
     * @param {string} [options.pluginId]
     * @param {string} [options.logTag]
     */
    run(state, options) {
        const opts = options || {};
        const pluginId = opts.pluginId || 'screenshotUploadImprovement';
        const label = opts.label;
        const input = opts.input;

        if (!label || !input) {
            if (!state.missingLogged) {
                Logger.debug('native file control not found');
                state.missingLogged = true;
            }
            return;
        }
        state.missingLogged = false;

        this.ensureStyles(state, pluginId);

        const zone = label.parentElement;
        if (zone) {
            this.removeDuplicateImprovementControls(zone, label);
            if (zone.querySelector(`[${CONTROLS_WRAP_ATTR}]`) && zone.contains(label)) {
                this.ensurePasteListener(state);
                return;
            }
        }

        const innerWrap = zone;
        if (innerWrap && !innerWrap.hasAttribute(ZONE_WRAP_ATTR)) {
            innerWrap.setAttribute(ZONE_WRAP_ATTR, '1');
            innerWrap.classList.add('relative');
        }

        label.setAttribute(NATIVE_LABEL_ATTR, '1');
        input.setAttribute(FILE_INPUT_ATTR, '1');

        const row = document.createElement('div');
        row.setAttribute(CONTROLS_WRAP_ATTR, '1');
        row.setAttribute('data-fleet-plugin', pluginId);
        row.className = 'flex flex-row flex-wrap gap-2 w-full min-w-0';

        const uploadControl = document.createElement('button');
        uploadControl.type = 'button';
        uploadControl.setAttribute(UPLOAD_CONTROL_ATTR, '1');
        uploadControl.className = UPLOAD_CONTROL_CLASS;
        uploadControl.setAttribute(
            'aria-label',
            'Drag and drop images here or click to upload screenshots'
        );
        uploadControl.innerHTML = `
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4 shrink-0" aria-hidden="true">
  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7"></path>
  <line x1="16" x2="22" y1="5" y2="5"></line>
  <line x1="19" x2="19" y1="2" y2="8"></line>
  <circle cx="9" cy="9" r="2"></circle>
  <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"></path>
</svg>
<span class="text-sm whitespace-nowrap">Drag &amp; Drop/Upload</span>
`;

        let dragDepth = 0;
        const onDragEnter = (e) => {
            e.preventDefault();
            e.stopPropagation();
            dragDepth++;
            uploadControl.classList.add(...DRAG_OVER_CLASSES);
        };
        const onDragLeave = (e) => {
            e.preventDefault();
            e.stopPropagation();
            dragDepth = Math.max(0, dragDepth - 1);
            if (dragDepth === 0) uploadControl.classList.remove(...DRAG_OVER_CLASSES);
        };
        const onDragOver = (e) => {
            e.preventDefault();
            e.stopPropagation();
        };
        const onDrop = (e) => {
            e.preventDefault();
            e.stopPropagation();
            dragDepth = 0;
            uploadControl.classList.remove(...DRAG_OVER_CLASSES);
            const files = imageFilesFromFileList(e.dataTransfer && e.dataTransfer.files);
            if (files.length) {
                this.mergeIntoFileInput(input, files);
            }
        };

        uploadControl.addEventListener('click', () => {
            input.click();
        });
        uploadControl.addEventListener('dragenter', onDragEnter);
        uploadControl.addEventListener('dragleave', onDragLeave);
        uploadControl.addEventListener('dragover', onDragOver);
        uploadControl.addEventListener('drop', onDrop);

        const pasteBtn = document.createElement('button');
        pasteBtn.type = 'button';
        pasteBtn.setAttribute(PASTE_BUTTON_ATTR, '1');
        pasteBtn.className = PASTE_BUTTON_CLASS;
        pasteBtn.textContent = 'Paste Image';
        pasteBtn.setAttribute('aria-label', 'Paste image from clipboard');
        pasteBtn.addEventListener('click', () => {
            this.pasteImageFromClipboardApi(input);
        });

        row.appendChild(uploadControl);
        row.appendChild(pasteBtn);
        label.parentNode.insertBefore(row, label);

        this.ensurePasteListener(state);

        if (!state.injectedLogged) {
            Logger.log('controls row injected');
            state.injectedLogged = true;
        }
    },

    /**
     * React may insert a thumbnail row between our controls and the label.
     * Scope checks to the zone and remove stray duplicates from older runs.
     */
    removeDuplicateImprovementControls(zone, label) {
        if (!zone.contains(label)) return;

        const wraps = zone.querySelectorAll(`[${CONTROLS_WRAP_ATTR}]`);
        for (let i = 1; i < wraps.length; i++) {
            wraps[i].remove();
        }

        const primaryWrap = zone.querySelector(`[${CONTROLS_WRAP_ATTR}]`);
        if (primaryWrap) {
            zone.querySelectorAll(`button[${UPLOAD_CONTROL_ATTR}]`).forEach((btn) => {
                if (!primaryWrap.contains(btn)) btn.remove();
            });
            zone.querySelectorAll(`button[${PASTE_BUTTON_ATTR}]`).forEach((btn) => {
                if (!primaryWrap.contains(btn)) btn.remove();
            });
            return;
        }

        zone.querySelectorAll(`button[${UPLOAD_CONTROL_ATTR}]`).forEach((btn) => btn.remove());
        zone.querySelectorAll(`button[${PASTE_BUTTON_ATTR}]`).forEach((btn) => btn.remove());
    },

    async pasteImageFromClipboardApi(input) {
        if (!navigator.clipboard || typeof navigator.clipboard.read !== 'function') {
            Logger.warn('Clipboard read API not available in this browser');
            return;
        }
        try {
            const items = await navigator.clipboard.read();
            const files = [];
            for (const item of items) {
                for (const type of item.types) {
                    if (!type.startsWith('image/')) continue;
                    const blob = await item.getType(type);
                    const sub = type.split('/')[1] || 'png';
                    const safeExt = sub.replace(/[^a-z0-9]/gi, '') || 'png';
                    files.push(
                        new File([blob], `paste-${Date.now()}.${safeExt}`, {
                            type: blob.type || type
                        })
                    );
                    break;
                }
            }
            if (!files.length) {
                Logger.debug('clipboard had no image');
                return;
            }
            this.mergeIntoFileInput(input, files);
        } catch (err) {
            Logger.error('clipboard read failed', err);
        }
    },

    ensurePasteListener(state) {
        if (state.pasteListenerAttached) return;
        state.pasteListenerAttached = true;
        const pasteHandler = (ev) => {
            const files = imageFilesFromClipboard(ev.clipboardData);
            if (!files.length) return;
            if (shouldIgnorePasteTarget(ev.target)) return;
            const input = document.querySelector(`input[${FILE_INPUT_ATTR}]`);
            if (!input || !document.contains(input)) return;
            ev.preventDefault();
            ev.stopPropagation();
            this.mergeIntoFileInput(input, files);
        };
        CleanupRegistry.registerEventListener(document, 'paste', pasteHandler, true);
        Logger.debug('document paste listener attached');
    },

    ensureStyles(state, pluginId) {
        if (state.styleReady && document.getElementById(STYLE_ID)) return;
        let style = document.getElementById(STYLE_ID);
        if (!style) {
            style = document.createElement('style');
            style.id = STYLE_ID;
            style.setAttribute('data-fleet-plugin', pluginId);
            document.head.appendChild(style);
        }
        style.textContent = `
label[${NATIVE_LABEL_ATTR}] {
    position: absolute !important;
    width: 1px !important;
    height: 1px !important;
    padding: 0 !important;
    margin: -1px !important;
    overflow: hidden !important;
    clip: rect(0, 0, 0, 0) !important;
    clip-path: inset(50%) !important;
    white-space: nowrap !important;
    border: 0 !important;
}
`;
        state.styleReady = true;
    },

    mergeIntoFileInput(input, newFiles) {
        const dt = new DataTransfer();
        const existing = Array.from(input.files || []);
        for (const f of existing) {
            if (dt.items.length >= MAX_FILES) break;
            dt.items.add(f);
        }
        for (const f of newFiles) {
            if (f.size > MAX_BYTES) {
                Logger.warn(`skipped "${f.name}" (over ${MAX_BYTES / (1024 * 1024)}MB)`);
                continue;
            }
            if (dt.items.length >= MAX_FILES) {
                Logger.warn(`max ${MAX_FILES} screenshots; extra file(s) ignored`);
                break;
            }
            dt.items.add(f);
        }
        const beforeLen = input.files ? input.files.length : 0;
        if (dt.files.length === beforeLen) {
            return;
        }
        input.files = dt.files;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        Logger.log(`merged paste/upload — ${input.files.length} file(s) on native input`);
    }
};
const plugin = {
    id: 'screenshotUploadImprovementLib',
    name: 'Screenshot Upload Improvement (library)',
    description:
        'Shared drag-and-drop, upload, and paste for screenshots',
    _version: '1.1',
    phase: 'core',
    enabledByDefault: true,
    initialState: { registered: false },

    init(state) {
        Context.screenshotUpload = {
            run: (s, options) => ScreenshotUploadApi.run(s, options)
        };
        if (!state.registered) {
            Logger.log('module registered (Context.screenshotUpload)');
            state.registered = true;
        }
    }
};

return plugin;
},
        "libs/action-counter.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {
// ============= action-counter.js (library) =============
// Shared +/- counter chrome and storage. Archetype wrappers supply find/mount.

const COUNTER_MARKER = 'data-fleet-action-counter';
const LEGACY_STORAGE_KEY = 'fleetai_qa_action_counter';

const ActionCounterApi = {
    id: 'compUseActionCounter',
    COUNTER_MARKER,

    storageKeys: {
        count: 'comp-use-action-counter'
    },

    /**
     * @param {object} state
     * @param {object} options
     * @param {string} [options.pluginId]
     * @param {string} [options.logTag]
     * @param {function(): boolean} options.alreadyMounted
     * @param {function(HTMLElement): void} options.mountCounter
     * @param {string} [options.activationDetail] — logged once on first inject
     */
    run(state, options) {
        const opts = options || {};
        const logTag = opts.logTag || this.id;
        const alreadyMounted = opts.alreadyMounted;
        const mountCounter = opts.mountCounter;

        if (typeof alreadyMounted !== 'function' || typeof mountCounter !== 'function') {
            return;
        }

        if (alreadyMounted()) {
            return;
        }

        document.querySelectorAll(`[${COUNTER_MARKER}="true"]`).forEach((el) => el.remove());
        const counter = this.buildCounter(state);
        mountCounter(counter);

        if (!state.activationLogged) {
            const detail = opts.activationDetail || 'counter injected';
            Logger.log(`${detail} (count=${this.getCount()})`);
            state.activationLogged = true;
        }
    },

    migrateLegacyCount(state) {
        if (state.migratedLegacy) return;
        state.migratedLegacy = true;
        const current = Storage.get(this.storageKeys.count, null);
        if (current !== null && current !== undefined && current !== '') return;
        try {
            const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
            if (legacy === null || legacy === '') return;
            const parsed = parseInt(legacy, 10);
            if (Number.isNaN(parsed)) return;
            Storage.set(this.storageKeys.count, this.clampCount(parsed));
            Logger.log(`migrated legacy count ${parsed} from standalone script`);
        } catch (error) {
            Logger.warn(`legacy count migration failed`, error);
        }
    },

    clampCount(val) {
        const parsed = typeof val === 'number' && !Number.isNaN(val) ? val : 0;
        return Math.max(0, Math.trunc(parsed));
    },

    getCount() {
        const raw = Storage.get(this.storageKeys.count, 0);
        const parsed = parseInt(raw, 10);
        return this.clampCount(Number.isNaN(parsed) ? 0 : parsed);
    },

    setCount(val, reason) {
        const prev = this.getCount();
        const next = this.clampCount(val);
        Storage.set(this.storageKeys.count, next);
        if (reason && prev !== next) {
            Logger.log(`count ${prev}→${next} (${reason})`);
        }
        return next;
    },

    countColor() {
        return 'var(--foreground, #111)';
    },

    applyCountDisplay(input, val) {
        input.value = String(val);
        input.style.color = this.countColor(val);
    },

    makeBtn(label, title, onClick) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = label;
        btn.title = title;
        const base = (Context.uiLib && typeof Context.uiLib.btnClass === 'function')
            ? Context.uiLib.btnClass('basic', 'compact')
            : 'wf-dash-btn wf-dash-btn--basic wf-dash-btn--compact';
        btn.className = base;
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            onClick();
        });
        return btn;
    },

    parseInputValue(text) {
        const trimmed = (text || '').trim();
        if (trimmed === '' || trimmed === '-') return 0;
        const parsed = parseInt(trimmed, 10);
        return this.clampCount(Number.isNaN(parsed) ? 0 : parsed);
    },

    buildCounter(state) {
        this.migrateLegacyCount(state);

        if (Context.uiLib && typeof Context.uiLib.ensureButtonStyles === 'function') {
            Context.uiLib.ensureButtonStyles('[data-fleet-action-counter="true"]');
        }

        const counter = document.createElement('div');
        counter.setAttribute(COUNTER_MARKER, 'true');
        counter.setAttribute('data-fleet-plugin', this.id);
        counter.style.cssText = `
            display: inline-flex;
            align-items: center;
            gap: 5px;
            padding: 0 4px;
            font-family: inherit;
            user-select: none;
        `;

        const input = document.createElement('input');
        input.type = 'text';
        input.inputMode = 'numeric';
        input.autocomplete = 'off';
        input.spellcheck = false;
        input.title = 'Click to edit count';
        input.style.cssText = `
            min-width: 26px;
            width: 36px;
            text-align: center;
            font-weight: 700;
            font-size: 14px;
            color: var(--foreground, #111);
            border: 1px solid transparent;
            border-radius: 4px;
            background: transparent;
            padding: 0 2px;
            line-height: 1.2;
            font-family: inherit;
        `;

        let editStartValue = this.getCount();
        this.applyCountDisplay(input, editStartValue);

        const commitEdit = (reason) => {
            const next = this.setCount(this.parseInputValue(input.value), reason);
            this.applyCountDisplay(input, next);
            editStartValue = next;
        };

        input.addEventListener('click', (e) => e.stopPropagation());
        input.addEventListener('mousedown', (e) => e.stopPropagation());
        input.addEventListener('focus', () => {
            editStartValue = this.getCount();
            input.select();
            input.style.borderColor = 'var(--border, #e2e8f0)';
            input.style.background = 'var(--background, #fff)';
        });
        input.addEventListener('blur', () => {
            input.style.borderColor = 'transparent';
            input.style.background = 'transparent';
            commitEdit('manual edit');
        });
        input.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter') {
                e.preventDefault();
                input.blur();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                this.applyCountDisplay(input, editStartValue);
                input.blur();
            }
        });

        const btnMinus = this.makeBtn(
            '−',
            'Subtract 1',
            () => this.applyCountDisplay(input, this.setCount(this.getCount() - 1, '−'))
        );
        const btnPlus = this.makeBtn(
            '+',
            'Add 1',
            () => this.applyCountDisplay(input, this.setCount(this.getCount() + 1, '+'))
        );

        counter.append(btnMinus, input, btnPlus);
        return counter;
    }
};

const plugin = {
    id: 'actionCounterLib',
    name: 'Action Counter (library)',
    description:
        'Shared Action Counter UI and storage',
    _version: '3.7',
    phase: 'core',
    enabledByDefault: true,
    initialState: { registered: false },

    init(state) {
        Context.actionCounter = {
            COUNTER_MARKER,
            run: (s, options) => {
                const impl = Object.create(ActionCounterApi);
                if (options && options.pluginId) {
                    impl.id = options.pluginId;
                }
                return ActionCounterApi.run.call(impl, s, options);
            },
            buildCounter: (s, options) => {
                const impl = Object.create(ActionCounterApi);
                if (options && options.pluginId) {
                    impl.id = options.pluginId;
                }
                return ActionCounterApi.buildCounter.call(impl, s);
            }
        };
        if (!state.registered) {
            Logger.log('module registered (Context.actionCounter)');
            state.registered = true;
        }
    }
};

return plugin;
},
        "libs/fos-vm-clipboard-bar.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {
// ============= fos-vm-clipboard-bar.js (library) =============
// Shared VM Clipboard Extract/Overwrite chrome for Action Counter bars.
// Archetype wrappers supply find/mount; readiness comes from Context.fosEmbedded.

const FOS_VM_CLIP_BAR_MARKER = 'data-fleet-fos-vm-clipboard-bar';
const FOS_VM_CLIP_BAR_SCOPE = '[data-fleet-fos-vm-clipboard-bar="true"]';

const FosVmClipboardBarApi = {
    id: 'fosVmClipboardBar',
    BAR_MARKER: FOS_VM_CLIP_BAR_MARKER,

    /**
     * @param {object} state
     * @param {object} options
     * @param {string} [options.pluginId]
     * @param {string} [options.logTag]
     * @param {function(): boolean} options.alreadyMounted
     * @param {function(HTMLElement): void} options.mountGroup
     * @param {string} [options.activationDetail]
     */
    run(state, options) {
        const opts = options || {};
        const logTag = opts.logTag || this.id;
        const pluginId = opts.pluginId || this.id;
        const alreadyMounted = opts.alreadyMounted;
        const mountGroup = opts.mountGroup;

        if (typeof alreadyMounted !== 'function' || typeof mountGroup !== 'function') {
            return;
        }

        if (alreadyMounted()) {
            this._ensureSubscription(state, logTag);
            this._syncVisibility(state, logTag);
            return;
        }

        document.querySelectorAll(`[${FOS_VM_CLIP_BAR_MARKER}="true"]`).forEach((el) => el.remove());
        const group = this.buildGroup(state, { pluginId, logTag });
        mountGroup(group);

        if (!state.activationLogged) {
            const detail = opts.activationDetail || 'VM Clipboard bar injected';
            Logger.log(`${detail}`);
            state.activationLogged = true;
        }

        this._ensureSubscription(state, logTag);
        this._syncVisibility(state, logTag);
    },

    _primaryInstanceId() {
        const api = Context.fosEmbedded;
        if (!api || typeof api.getReadyInstances !== 'function') {
            return null;
        }
        const list = api.getReadyInstances();
        if (!list || !list.length) {
            return null;
        }
        return list[0].instanceId || null;
    },

    _flash(btn, ok) {
        if (!btn) {
            return;
        }
        if (Context.buttonFeedback) {
            if (ok && typeof Context.buttonFeedback.flashSuccess === 'function') {
                Context.buttonFeedback.flashSuccess(btn);
                return;
            }
            if (!ok && typeof Context.buttonFeedback.flashFailure === 'function') {
                Context.buttonFeedback.flashFailure(btn);
                return;
            }
        }
    },

    _ensureSubscription(state, logTag) {
        const api = Context.fosEmbedded;
        if (!api || typeof api.subscribe !== 'function') {
            if (!state.apiMissingLogged) {
                state.apiMissingLogged = true;
                Logger.warn(`Context.fosEmbedded unavailable`);
            }
            return;
        }
        state.apiMissingLogged = false;
        if (state.unsubscribe) {
            return;
        }
        state.unsubscribe = api.subscribe((evt) => {
            this._syncVisibility(state, logTag);
            if (evt && evt.ready) {
                if (!state.readyShownLogged) {
                    state.readyShownLogged = true;
                    state.readyHiddenLogged = false;
                    Logger.log(`VM Clipboard shown (instance ${evt.instanceId})`);
                }
            } else if (evt && !evt.ready) {
                const stillReady = this._primaryInstanceId();
                if (!stillReady && !state.readyHiddenLogged) {
                    state.readyHiddenLogged = true;
                    state.readyShownLogged = false;
                    Logger.log(`VM Clipboard hidden (no ready instance)`);
                }
            }
        });
    },

    _trayArrowIcon(direction) {
        const ns = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(ns, 'svg');
        svg.setAttribute('width', '16');
        svg.setAttribute('height', '16');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '2');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        svg.setAttribute('aria-hidden', 'true');

        const tray = document.createElementNS(ns, 'path');
        tray.setAttribute('d', 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4');
        svg.appendChild(tray);

        const poly = document.createElementNS(ns, 'polyline');
        const line = document.createElementNS(ns, 'line');
        if (direction === 'up') {
            poly.setAttribute('points', '17 8 12 3 7 8');
            line.setAttribute('x1', '12');
            line.setAttribute('y1', '3');
            line.setAttribute('x2', '12');
            line.setAttribute('y2', '15');
        } else {
            poly.setAttribute('points', '7 10 12 15 17 10');
            line.setAttribute('x1', '12');
            line.setAttribute('y1', '15');
            line.setAttribute('x2', '12');
            line.setAttribute('y2', '3');
        }
        svg.append(poly, line);
        return svg;
    },

    _syncVisibility(state, logTag) {
        const root =
            (state.groupEl && state.groupEl.isConnected && state.groupEl) ||
            document.querySelector(`[${FOS_VM_CLIP_BAR_MARKER}="true"]`);
        if (!root) {
            return;
        }
        state.groupEl = root;
        const readyId = this._primaryInstanceId();
        const show = !!readyId;
        const nextDisplay = show ? 'inline-flex' : 'none';
        if (root.style.display !== nextDisplay) {
            root.style.display = nextDisplay;
            if (show && !state.readyShownLogged) {
                state.readyShownLogged = true;
                state.readyHiddenLogged = false;
                Logger.log(`VM Clipboard shown (instance ${readyId})`);
            } else if (!show && !state.readyHiddenLogged && state.activationLogged) {
                state.readyHiddenLogged = true;
                state.readyShownLogged = false;
                Logger.debug(`VM Clipboard hidden (waiting for FOS)`);
            }
        }
    },

    buildGroup(state, options) {
        const opts = options || {};
        const pluginId = opts.pluginId || this.id;
        const logTag = opts.logTag || pluginId;

        if (Context.uiLib && typeof Context.uiLib.ensureButtonStyles === 'function') {
            Context.uiLib.ensureButtonStyles(FOS_VM_CLIP_BAR_SCOPE);
        }

        const root = document.createElement('div');
        root.setAttribute(FOS_VM_CLIP_BAR_MARKER, 'true');
        root.setAttribute('data-fleet-plugin', pluginId);
        root.style.cssText =
            'display:none;align-items:center;gap:6px;margin-left:8px;flex-shrink:0;';

        const label = document.createElement('span');
        label.textContent = 'VM Clipboard';
        label.style.cssText =
            'font-size:11px;font-weight:600;color:var(--muted-foreground, #6b7280);letter-spacing:0.02em;white-space:nowrap;';

        const btnClass =
            Context.uiLib && typeof Context.uiLib.btnClass === 'function'
                ? (variant) => Context.uiLib.btnClass(variant, 'icon')
                : () => '';

        const bExtract = document.createElement('button');
        bExtract.type = 'button';
        bExtract.title = 'Extract';
        bExtract.setAttribute('aria-label', 'Extract');
        bExtract.className = btnClass('secondary');
        bExtract.appendChild(this._trayArrowIcon('up'));

        const bOverwrite = document.createElement('button');
        bOverwrite.type = 'button';
        bOverwrite.title = 'Overwrite';
        bOverwrite.setAttribute('aria-label', 'Overwrite');
        bOverwrite.className = btnClass('secondary');
        bOverwrite.appendChild(this._trayArrowIcon('down'));

        bExtract.addEventListener('click', () => {
            const api = Context.fosEmbedded;
            const instanceId = this._primaryInstanceId();
            if (!api || !instanceId || typeof api.extract !== 'function') {
                this._flash(bExtract, false);
                Logger.warn(`extract failed — no ready FOS instance`);
                return;
            }
            api.extract(instanceId).then((ok) => {
                this._flash(bExtract, !!ok);
                if (ok) {
                    Logger.log(`extract ok`);
                }
            }).catch((err) => {
                this._flash(bExtract, false);
                Logger.error(`extract promise rejected`, err);
            });
        });

        bOverwrite.addEventListener('click', () => {
            const api = Context.fosEmbedded;
            const instanceId = this._primaryInstanceId();
            if (!api || !instanceId || typeof api.overwrite !== 'function') {
                this._flash(bOverwrite, false);
                Logger.warn(`overwrite failed — no ready FOS instance`);
                return;
            }
            api.overwrite(instanceId).then((ok) => {
                this._flash(bOverwrite, !!ok);
                if (ok) {
                    Logger.log(`overwrite ok`);
                }
            }).catch((err) => {
                this._flash(bOverwrite, false);
                Logger.error(`overwrite promise rejected`, err);
            });
        });

        root.append(label, bExtract, bOverwrite);
        state.groupEl = root;
        return root;
    }
};

const plugin = {
    id: 'fosVmClipboardBarLib',
    name: 'FOS VM Clipboard Bar (library)',
    description:
        'Shared VM Clipboard Extract/Overwrite bar',
    _version: '1.8',
    phase: 'core',
    enabledByDefault: true,
    initialState: { registered: false },

    init(state) {
        Context.fosVmClipboardBar = {
            BAR_MARKER: FOS_VM_CLIP_BAR_MARKER,
            run: (s, options) => FosVmClipboardBarApi.run(s, options),
            buildGroup: (s, options) => FosVmClipboardBarApi.buildGroup(s, options)
        };
        if (!state.registered) {
            Logger.log('module registered (Context.fosVmClipboardBar)');
            state.registered = true;
        }
    }
};

return plugin;
},
        "libs/fos-iframe-autoconnect.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {
// ============= fos-iframe-autoconnect.js (library) =============
// Patch FOS env iframe src with noVNC remote-resize and autoconnect params,
// reconnect on tab visibility, and replace the native open-in-new-tab control.

const FOS_AUTOCONNECT_ENV_HOST = /\.env\.[^.]+(?:\.[^.]+)*\.fleetai\.com$/;
const FOS_AUTOCONNECT_OPEN_TAB_MARKER = 'data-fleet-fos-open-tab';
const FOS_AUTOCONNECT_OPEN_PATH_PREFIX = 'M14 4C14 3.44772';
const FOS_AUTOCONNECT_RELOAD_DEBOUNCE_MS = 300;

const FosIframeAutoconnectApi = {
    id: 'fosIframeAutoconnect',

    run(state, options) {
        const opts = options || {};
        if (opts.pluginId) {
            this.id = opts.pluginId;
        }

        this._ensureDesktopSubscription(state);
        this._ensureVisibilityListener(state);
        this._apply(state);
    },

    _apply(state) {
        const iframe = this._findEnvIframe();
        if (!iframe) {
            if (state.hadIframe) {
                Logger.debug('env iframe left DOM');
                state.hadIframe = false;
                state.patchedLogged = false;
                state.waitingFosLogged = false;
                state.waitingIframeLogged = false;
                state.pendingFocusReconnect = false;
            } else if (!state.waitingIframeLogged) {
                state.waitingIframeLogged = true;
                Logger.debug('waiting for env iframe');
            }
            this._teardownOpenTab(state);
            return;
        }

        state.waitingIframeLogged = false;
        state.hadIframe = true;

        const instanceId = this._instanceIdFromIframe(iframe);
        if (!instanceId || !this._isFosDesktop(instanceId)) {
            if (!state.waitingFosLogged) {
                state.waitingFosLogged = true;
                Logger.debug('waiting for FOS identification');
            }
            this._teardownOpenTab(state);
            return;
        }

        state.waitingFosLogged = false;
        this._patchIframeSrc(state, iframe);
        this._replaceOpenTabButton(state, iframe);
        if (state.pendingFocusReconnect && !this._isEnvPanelCollapsed(iframe)) {
            this._reconnectIframe(state);
        }
    },

    _ensureDesktopSubscription(state) {
        if (state.desktopUnsub) {
            return;
        }
        const api = Context.fosEmbedded;
        if (!api || typeof api.subscribeDesktop !== 'function') {
            return;
        }
        const self = this;
        state.desktopUnsub = api.subscribeDesktop(() => {
            self._apply(state);
        });
    },

    _ensureVisibilityListener(state) {
        if (state.visibilityInstalled) {
            return;
        }
        state.visibilityInstalled = true;
        state.wasHidden = false;

        const self = this;
        const onVisibility = () => {
            if (document.visibilityState === 'hidden') {
                state.wasHidden = true;
                return;
            }
            if (document.visibilityState !== 'visible' || !state.wasHidden) {
                return;
            }
            state.wasHidden = false;
            if (state.reloadTimer) {
                clearTimeout(state.reloadTimer);
            }
            state.reloadTimer = setTimeout(() => {
                state.reloadTimer = null;
                self._reconnectIframe(state);
            }, FOS_AUTOCONNECT_RELOAD_DEBOUNCE_MS);
        };

        if (typeof CleanupRegistry !== 'undefined' && CleanupRegistry.registerEventListener) {
            CleanupRegistry.registerEventListener(document, 'visibilitychange', onVisibility);
        } else {
            document.addEventListener('visibilitychange', onVisibility);
        }
    },

    _isFosDesktop(instanceId) {
        const api = Context.fosEmbedded;
        return !!(api && typeof api.isFosDesktop === 'function' && api.isFosDesktop(instanceId));
    },

    _hostnameFromSrc(raw) {
        if (!raw) {
            return '';
        }
        try {
            return new URL(raw, window.location.href).hostname;
        } catch (_e) {
            return '';
        }
    },

    _findEnvIframe() {
        const frames = document.querySelectorAll('iframe');
        for (let i = 0; i < frames.length; i++) {
            const frame = frames[i];
            const host = this._hostnameFromSrc(frame.src || frame.getAttribute('src'));
            if (host && FOS_AUTOCONNECT_ENV_HOST.test(host)) {
                return frame;
            }
        }
        return null;
    },

    _instanceIdFromIframe(iframe) {
        const host = this._hostnameFromSrc(iframe && (iframe.src || iframe.getAttribute('src')));
        return host ? String(host).split('.')[0] || '' : '';
    },

    _withAutoconnectParams(rawUrl) {
        if (!rawUrl) {
            return null;
        }
        try {
            const url = new URL(rawUrl, window.location.href);
            if (!FOS_AUTOCONNECT_ENV_HOST.test(url.hostname)) {
                return null;
            }
            url.searchParams.set('autoconnect', 'true');
            url.searchParams.set('resize', 'remote');
            return url.toString();
        } catch (_e) {
            return null;
        }
    },

    _hasAutoconnectParams(rawUrl) {
        if (!rawUrl) {
            return false;
        }
        try {
            const url = new URL(rawUrl, window.location.href);
            return (
                url.searchParams.get('autoconnect') === 'true' &&
                url.searchParams.get('resize') === 'remote'
            );
        } catch (_e) {
            return false;
        }
    },

    _patchIframeSrc(state, iframe) {
        if (!iframe || state.patchInProgress) {
            return;
        }
        const current = iframe.getAttribute('src') || iframe.src || '';
        if (this._hasAutoconnectParams(current)) {
            return;
        }
        const next = this._withAutoconnectParams(current);
        if (!next || next === current) {
            return;
        }
        state.patchInProgress = true;
        try {
            iframe.setAttribute('src', next);
            iframe.src = next;
            if (!state.patchedLogged) {
                state.patchedLogged = true;
                Logger.log('patched FOS iframe src with autoconnect');
            } else {
                Logger.debug('re-patched FOS iframe src with autoconnect');
            }
        } finally {
            state.patchInProgress = false;
        }
    },

    _isEnvPanelCollapsed(iframe) {
        return !!(iframe && iframe.closest('[data-panel][data-fleet-collapsed="true"]'));
    },

    _reconnectIframe(state) {
        const iframe = this._findEnvIframe();
        if (!iframe || !iframe.isConnected) {
            return;
        }
        if (this._isEnvPanelCollapsed(iframe)) {
            state.pendingFocusReconnect = true;
            Logger.debug('skipped FOS iframe reconnect; environment pane collapsed');
            return;
        }
        state.pendingFocusReconnect = false;
        const instanceId = this._instanceIdFromIframe(iframe);
        if (!instanceId || !this._isFosDesktop(instanceId)) {
            return;
        }
        const current = iframe.getAttribute('src') || iframe.src || '';
        const next = this._withAutoconnectParams(current);
        if (!next) {
            return;
        }
        state.patchInProgress = true;
        try {
            iframe.src = 'about:blank';
            setTimeout(() => {
                try {
                    if (!iframe.isConnected) {
                        return;
                    }
                    iframe.setAttribute('src', next);
                    iframe.src = next;
                    Logger.log('reconnected FOS iframe after tab focus');
                } finally {
                    state.patchInProgress = false;
                }
            }, 0);
        } catch (err) {
            state.patchInProgress = false;
            Logger.warn('FOS iframe reconnect failed', err);
        }
    },

    _findNativeOpenTabButton() {
        const paths = document.querySelectorAll('svg path');
        for (let i = 0; i < paths.length; i++) {
            const d = paths[i].getAttribute('d') || '';
            if (!d.startsWith(FOS_AUTOCONNECT_OPEN_PATH_PREFIX)) {
                continue;
            }
            const btn = paths[i].closest('button');
            if (btn && !btn.hasAttribute(FOS_AUTOCONNECT_OPEN_TAB_MARKER)) {
                return btn;
            }
        }
        return null;
    },

    _resolveOpenUrl(iframe) {
        if (iframe) {
            const fromIframe = this._withAutoconnectParams(
                iframe.getAttribute('src') || iframe.src || ''
            );
            if (fromIframe) {
                return fromIframe;
            }
        }
        const titled = document.querySelector('div[title^="https://"]');
        if (titled) {
            const title = titled.getAttribute('title') || '';
            if (FOS_AUTOCONNECT_ENV_HOST.test(this._hostnameFromSrc(title))) {
                return this._withAutoconnectParams(title);
            }
        }
        return null;
    },

    _replaceOpenTabButton(state, iframe) {
        const native = this._findNativeOpenTabButton();
        if (!native) {
            if (state.hadOpenBtn && !document.querySelector(`[${FOS_AUTOCONNECT_OPEN_TAB_MARKER}="1"]`)) {
                state.hadOpenBtn = false;
                state.openBtnLogged = false;
                Logger.debug('open-in-new-tab control left DOM');
            }
            return;
        }

        const existing = native.nextElementSibling;
        if (
            existing &&
            existing.getAttribute(FOS_AUTOCONNECT_OPEN_TAB_MARKER) === '1' &&
            existing.isConnected
        ) {
            native.style.display = 'none';
            native.setAttribute('aria-hidden', 'true');
            state.hadOpenBtn = true;
            return;
        }

        document.querySelectorAll(`[${FOS_AUTOCONNECT_OPEN_TAB_MARKER}="1"]`).forEach((el) => {
            el.remove();
        });

        native.style.display = 'none';
        native.setAttribute('aria-hidden', 'true');

        const clone = native.cloneNode(true);
        clone.style.display = '';
        clone.removeAttribute('aria-hidden');
        clone.setAttribute(FOS_AUTOCONNECT_OPEN_TAB_MARKER, '1');
        clone.type = 'button';
        clone.title = 'Open instance in new tab';
        clone.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const liveIframe = this._findEnvIframe();
            const url = this._resolveOpenUrl(liveIframe);
            if (!url) {
                Logger.warn('open in new tab — no FOS instance URL');
                return;
            }
            try {
                const win = window.open(url, '_blank');
                if (!win) {
                    Logger.error('open in new tab blocked by browser');
                    return;
                }
                Logger.log('opened FOS instance in new tab');
            } catch (err) {
                Logger.error('open in new tab failed', err);
            }
        });

        native.insertAdjacentElement('afterend', clone);
        state.hadOpenBtn = true;
        if (!state.openBtnLogged) {
            state.openBtnLogged = true;
            Logger.log('replaced open-in-new-tab with autoconnect URL');
        } else {
            Logger.debug('re-injected open-in-new-tab control');
        }
    },

    _teardownOpenTab(state) {
        document.querySelectorAll(`[${FOS_AUTOCONNECT_OPEN_TAB_MARKER}="1"]`).forEach((el) => {
            el.remove();
        });
        if (state.hadOpenBtn) {
            state.hadOpenBtn = false;
            state.openBtnLogged = false;
        }
    }
};

const plugin = {
    id: 'fosIframeAutoconnectLib',
    name: 'FOS Viewport Resize (library)',
    description:
        'Resizes embedded FOS environments to the viewport. Autoconnects instances and open-in-new-tab URLs; reconnects on tab focus unless the environment pane is hidden',
    _version: '1.2',
    phase: 'core',
    enabledByDefault: true,
    initialState: { registered: false },

    init(state) {
        Context.fosIframeAutoconnect = {
            run: (s, options) => {
                const impl = Object.create(FosIframeAutoconnectApi);
                if (options && options.pluginId) {
                    impl.id = options.pluginId;
                }
                return FosIframeAutoconnectApi.run.call(impl, s, options);
            }
        };
        if (!state.registered) {
            Logger.log('fosIframeAutoconnectLib: module registered (Context.fosIframeAutoconnect)');
            state.registered = true;
        }
    }
};

return plugin;
},
        "libs/notes-resize-handle.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {
// ============= notes-resize-handle.js (library) =============
// Shared logic: enable native vertical resizing on the "Notes for QA Reviewer" textarea.

const NotesResizeHandleApi = {
    run(state, options) {
        const logTag = (options && options.logTag) || 'notesResizeHandle';
        const notesTextarea = this.findNotesTextarea(logTag);
        if (!notesTextarea) {
            if (!state.missingLogged) {
                Logger.debug('QA notes textarea not found yet');
                state.missingLogged = true;
            }
            return;
        }

        if (notesTextarea.dataset.wfNotesResizeApplied === '1') return;

        notesTextarea.style.resize = 'vertical';
        notesTextarea.style.overflowY = 'auto';
        notesTextarea.style.minHeight = notesTextarea.style.minHeight || '60px';
        notesTextarea.dataset.wfNotesResizeApplied = '1';

        state.missingLogged = false;
        Logger.log('DOM ready — enabled vertical resize on QA notes textarea');
    },

    findNotesTextarea(logTag) {
        const tag = logTag || 'notesResizeHandle';
        const byPlaceholder = Context.dom.query(
            'textarea[placeholder*="help the QA reviewer understand your task"]',
            { context: tag + '.notesByPlaceholder' }
        );
        if (byPlaceholder) return byPlaceholder;

        const labels = Context.dom.queryAll('label', { context: tag + '.labels' });
        for (const label of labels) {
            const text = (label.textContent || '').toLowerCase();
            if (!text.includes('notes for qa reviewer')) continue;

            const container = label.closest('div');
            if (!container) continue;

            const textarea = container.querySelector('textarea');
            if (textarea) return textarea;
        }

        return null;
    }
};

const plugin = {
    id: 'notesResizeHandleLib',
    name: 'Notes Resize Handle (library)',
    description: 'Shared vertical resize for the QA reviewer notes textarea',
    _version: '2.2',
    phase: 'core',
    enabledByDefault: true,
    initialState: { registered: false },

    init(state) {
        Context.notesResizeHandle = {
            run: (s, options) => NotesResizeHandleApi.run(s, options),
            findNotesTextarea: (logTag) => NotesResizeHandleApi.findNotesTextarea(logTag)
        };
        if (!state.registered) {
            Logger.log('module registered (Context.notesResizeHandle)');
            state.registered = true;
        }
    }
};

return plugin;
},
        "libs/prompt-scratchpad.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {
// ============= prompt-scratchpad.js ============= (library)
// Adds an adjustable height scratchpad after the prompt section.

const PromptScratchpadApi = {
    id: 'promptScratchpad',
    name: 'Scratchpad',
    description: 'Adds an adjustable height scratchpad to the page',
    _version: '3.3',
    enabledByDefault: true,
    phase: 'mutation',

    storageKeys: {
        scratchpadHeight: 'comp-use-revision-scratchpad-height'
    },

    selectors: {
        promptSection: 'div.flex.flex-col.gap-2:has(span:contains("Prompt"), label:contains("Prompt"))'
    },

    initialState: {
        scratchpadInserted: false,
        resizeHandlerAttached: false,
        searchAttempted: false,
        insertionFailedLogged: false
    },

    run(state, context) {
        // Find the prompt section
        const promptSection = this.findPromptSection();
        if (!promptSection) {
            if (!state.searchAttempted) {
                state.searchAttempted = true;
                // Log detailed diagnostic information only once
                const candidates = Context.dom.queryAll('div', {
                    context: `${this.id}.diagnostic`
                });
                const foundLabels = [];
                candidates.forEach(candidate => {
                    const label = candidate.querySelector('label, span.text-sm');
                    if (label) {
                        foundLabels.push(label.textContent.trim());
                    }
                });
                Logger.debug(
                    `${this.id}: Prompt section not found. Found ${candidates.length} candidate divs with labels/spans: ${foundLabels.join(', ') || 'none'}`
                );
            }
            return;
        }

        // Check if scratchpad already exists
        let scratchpadContainer = promptSection.nextElementSibling;
        if (scratchpadContainer && scratchpadContainer.dataset.promptScratchpad === 'true') {
            // Scratchpad already exists, just attach resize handler if needed
            if (!state.resizeHandlerAttached) {
                this.attachResizeHandler(state, scratchpadContainer);
                state.resizeHandlerAttached = true;
                Logger.debug(`Resize handler attached`);
            }
            return;
        }

        // Insert scratchpad right after the prompt section
        const scratchpad = this.createScratchpad(state);
        promptSection.insertAdjacentElement('afterend', scratchpad);
        state.scratchpadInserted = true;
        state.insertionFailedLogged = false; // Reset on success
        Logger.log(`inserted after Prompt section`);

        // Attach resize handler
        scratchpadContainer = promptSection.nextElementSibling;
        if (scratchpadContainer && scratchpadContainer.dataset.promptScratchpad === 'true') {
            this.attachResizeHandler(state, scratchpadContainer);
            state.resizeHandlerAttached = true;
            Logger.debug(`Resize handler attached`);
        } else {
            Logger.warn(`Inserted but could not find container for resize handler`);
        }
    },

    findPromptSection() {
        // Primary (most stable): the prompt textarea on this page has a fixed id.
        const promptTextarea = document.querySelector('textarea#prompt-editor');
        if (promptTextarea) {
            // The DOM is nested like:
            // (space-y-2) -> (space-y-2 relative) -> ... -> textarea#prompt-editor
            // We want the outer section wrapper so the scratchpad lands after the whole Prompt block.
            const inner = promptTextarea.closest('div.space-y-2.relative');
            const outer = inner?.parentElement;
            if (outer && outer.classList && outer.classList.contains('space-y-2')) {
                return outer;
            }
            return inner || promptTextarea.closest('div.space-y-2') || promptTextarea.parentElement;
        }

        // Fallback: find the "Prompt" label and climb to an appropriate section wrapper.
        const labelCandidates = Context.dom.queryAll('div.text-sm.text-muted-foreground.font-medium', {
            context: `${this.id}.findPromptSection.labelCandidates`
        });

        for (const labelEl of labelCandidates) {
            const text = (labelEl.textContent || '').trim();
            if (!text.startsWith('Prompt')) continue;

            const section = labelEl.closest('div.space-y-2');
            if (!section) continue;

            // Prefer the wrapper that actually contains the prompt textarea.
            if (section.querySelector('textarea#prompt-editor')) {
                return section;
            }
        }

        return null;
    },

    createScratchpad(state) {
        const container = document.createElement('div');
        container.className = 'flex flex-col gap-2';
        container.dataset.promptScratchpad = 'true';

        // Header with label
        const header = document.createElement('div');
        header.className = 'flex items-center justify-between';

        const label = document.createElement('span');
        label.className = 'text-sm text-muted-foreground font-medium';
        label.textContent = 'Scratchpad';

        header.appendChild(label);

        // Textarea container with resize handle (default 2 lines, no height persistence)
        const TWO_LINE_HEIGHT_PX = 55;
        const textareaWrapper = document.createElement('div');
        textareaWrapper.className = 'relative flex flex-col rounded-md overflow-hidden border border-input bg-background shadow-sm';
        textareaWrapper.style.minHeight = `${TWO_LINE_HEIGHT_PX}px`;
        textareaWrapper.style.height = `${TWO_LINE_HEIGHT_PX}px`;

        const textarea = document.createElement('textarea');
        textarea.className = 'flex-1 w-full border-0 bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50 resize-none';
        textarea.placeholder = 'Use this space for notes, item IDs, JSON, etc. This is for your own use and not submitted with the task.';
        textarea.dataset.promptScratchpadTextarea = 'true';

        // Resize handle
        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'absolute bottom-0 left-0 right-0 h-3 cursor-ns-resize flex items-center justify-center transition-opacity duration-200';
        resizeHandle.style.opacity = '0';
        resizeHandle.style.background = 'transparent';

        const handleBar = document.createElement('div');
        handleBar.className = 'w-10 h-1 rounded-sm bg-current opacity-30';
        resizeHandle.appendChild(handleBar);

        // Show handle on hover
        textareaWrapper.addEventListener('mouseenter', () => {
            resizeHandle.style.opacity = '1';
        });
        textareaWrapper.addEventListener('mouseleave', () => {
            resizeHandle.style.opacity = '0';
        });

        textareaWrapper.appendChild(textarea);
        textareaWrapper.appendChild(resizeHandle);

        container.appendChild(header);
        container.appendChild(textareaWrapper);

        return container;
    },

    attachResizeHandler(state, container) {
        const textareaWrapper = container.querySelector('div.relative');
        const resizeHandle = textareaWrapper?.querySelector('div.cursor-ns-resize');

        if (!textareaWrapper || !resizeHandle) {
            Logger.warn(`Could not find textarea wrapper or resize handle for attachment`);
            return;
        }

        let isResizing = false;
        let startY = 0;
        let startHeight = 0;
        const minHeight = 55;

        const handleMouseDown = (e) => {
            isResizing = true;
            startY = e.clientY;
            startHeight = textareaWrapper.offsetHeight;

            e.preventDefault();
            e.stopPropagation();

            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);

            document.body.style.cursor = 'ns-resize';
            document.body.style.userSelect = 'none';
        };

        const handleMouseMove = (e) => {
            if (!isResizing) return;

            const deltaY = e.clientY - startY;
            const newHeight = Math.max(minHeight, startHeight + deltaY);

            textareaWrapper.style.height = `${newHeight}px`;
        };

        const handleMouseUp = (e) => {
            if (!isResizing) return;

            const endH = textareaWrapper.offsetHeight;
            if (endH !== startHeight) {
                Logger.debug(`user finished resizing prompt scratchpad`, { fromPx: startHeight, toPx: endH });
            }

            isResizing = false;

            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);

            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };

        resizeHandle.addEventListener('mousedown', handleMouseDown);
        CleanupRegistry.registerEventListener(resizeHandle, 'mousedown', handleMouseDown);
    }
};


const plugin = {
    id: 'promptScratchpadLib',
    name: 'Prompt Scratchpad (library)',
    description: 'Shared adjustable prompt scratchpad',
    _version: '3.2',
    phase: 'core',
    enabledByDefault: true,
    initialState: { registered: false },

    init(state) {
        Context.promptScratchpad = {
            run: (s, options) => {
                const impl = Object.create(PromptScratchpadApi);
                if (options && options.pluginId) {
                    impl.id = options.pluginId;
                }
                if (options && options.storageKey) {
                    impl.storageKeys = Object.assign({}, PromptScratchpadApi.storageKeys, {
                        scratchpadHeight: options.storageKey
                    });
                }
                return PromptScratchpadApi.run.call(impl, s, options);
            }
        };
        if (!state.registered) {
            Logger.log('promptScratchpadLib: module registered (Context.promptScratchpad)');
            state.registered = true;
        }
    }
};

return plugin;
},
        "libs/prompt-text-counter.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {
// ============= prompt-text-counter.js (library) =============
// Shared word/character count under editable Prompt / Problem Description fields.

const COUNTER_MARKER = 'data-fleet-prompt-text-counter';
const BOUND_FLAG = 'fleetPromptTextCounterBound';
const PROMPT_LABELS = new Set(['Prompt', 'Problem Description']);

const PromptTextCounterApi = {
    COUNTER_MARKER,

    countText(value) {
        const text = value == null ? '' : String(value);
        const chars = text.length;
        const trimmed = text.trim();
        const words = trimmed ? trimmed.split(/\s+/).length : 0;
        return { words, chars };
    },

    formatCounts(value) {
        const { words, chars } = this.countText(value);
        return `${words} words · ${chars} characters`;
    },

    findPromptTextarea() {
        const form = document.getElementById('problem-form');
        const scopes = form ? [form, document] : [document];
        const seen = new Set();
        for (const scope of scopes) {
            if (seen.has(scope)) continue;
            seen.add(scope);
            const labels = scope.querySelectorAll('.text-sm.text-muted-foreground.font-medium');
            for (const label of labels) {
                const text = (label.textContent || '').replace(/\*/g, '').trim();
                if (!PROMPT_LABELS.has(text)) continue;
                const section = label.closest('.relative.space-y-2') || label.closest('.space-y-2');
                const ta = section && section.querySelector('textarea');
                if (ta) return { textarea: ta, section };
            }
        }
        return null;
    },

    findExisting(root) {
        if (!root) return null;
        return root.querySelector(`[${COUNTER_MARKER}="true"]`);
    },

    syncEl(el, textarea) {
        if (!el || !textarea) return;
        el.textContent = this.formatCounts(textarea.value);
    },

    bindInput(textarea, el) {
        if (!textarea || !el) return;
        if (textarea.dataset[BOUND_FLAG] === '1') return;
        textarea.dataset[BOUND_FLAG] = '1';
        const onInput = () => PromptTextCounterApi.syncEl(el, textarea);
        if (typeof CleanupRegistry !== 'undefined' && CleanupRegistry.registerEventListener) {
            CleanupRegistry.registerEventListener(textarea, 'input', onInput);
        } else {
            textarea.addEventListener('input', onInput);
        }
    },

    buildCounter(textarea) {
        const el = document.createElement('div');
        el.setAttribute(COUNTER_MARKER, 'true');
        el.className = 'text-xs text-muted-foreground';
        el.style.cssText =
            'display:block;text-align:left;margin-top:4px;color:var(--muted-foreground,#64748b);';
        this.syncEl(el, textarea);
        this.bindInput(textarea, el);
        return el;
    },

    /**
     * @param {HTMLTextAreaElement} textarea
     * @param {{ mountParent?: HTMLElement }} [options]
     */
    attach(textarea, options) {
        const opts = options || {};
        const mountParent = opts.mountParent || (textarea && textarea.parentElement);
        if (!textarea || !mountParent) return null;
        const existing = this.findExisting(mountParent);
        if (existing) {
            this.syncEl(existing, textarea);
            this.bindInput(textarea, existing);
            return existing;
        }
        const el = this.buildCounter(textarea);
        mountParent.appendChild(el);
        return el;
    },

    run(state, options) {
        const found = this.findPromptTextarea();
        if (!found) {
            if (state && !state.missingLogged) {
                Logger.debug('prompt textarea not found yet');
                state.missingLogged = true;
            }
            return;
        }
        if (state) state.missingLogged = false;

        const { textarea, section } = found;
        const mountParent = section || textarea.parentElement;
        const existing = this.findExisting(mountParent);

        if (existing && state && state.boundTextarea && state.boundTextarea !== textarea) {
            existing.remove();
        }

        const el = this.attach(textarea, { mountParent });
        if (state) {
            state.boundTextarea = textarea;
            if (!state.activationLogged) {
                Logger.log('prompt text counter mounted');
                state.activationLogged = true;
            }
        }
        return el;
    }
};

const plugin = {
    id: 'promptTextCounterLib',
    name: 'Prompt Text Counter (library)',
    description: 'Shared word and character count for editable prompt textareas',
    _version: '1.0',
    phase: 'core',
    enabledByDefault: true,
    initialState: { registered: false },

    init(state) {
        Context.promptTextCounter = {
            COUNTER_MARKER,
            countText: (v) => PromptTextCounterApi.countText(v),
            formatCounts: (v) => PromptTextCounterApi.formatCounts(v),
            attach: (textarea, options) => PromptTextCounterApi.attach(textarea, options),
            run: (s, options) => PromptTextCounterApi.run(s, options)
        };
        if (!state.registered) {
            Logger.log('module registered (Context.promptTextCounter)');
            state.registered = true;
        }
    }
};

return plugin;
},
        "libs/request-revisions.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {
// ============= request-revisions.js (library) =============
// Shared Request Revisions modal improvements: guideline/copy buttons, prompt-quality
// restore, task-only issue selection, and screenshot upload via Context.screenshotUpload.

const FLEET_GUIDELINES = {
    general: 'https://www.fleetai.com/work/guidelines?doc=c007bc70-5202-4bfd-95bb-4f1699d8b9f3',
    toolUse: 'https://www.fleetai.com/work/guidelines?doc=1d4e376a-04e5-4636-93b9-faeeca44f80b',
    qa: 'https://www.fleetai.com/work/guidelines?doc=171f1c3e-3ba9-4531-a5e2-30a8f301ea43',
    timeSubmission: 'https://www.fleetai.com/work/guidelines?doc=f2536177-34a9-4a34-967e-0b8c374c203c'
};

const GUIDELINE_BUTTON_SPECS = [
    { group: 'general', subOptionId: 'copy-link-general-guidelines', title: 'General Guidelines', url: FLEET_GUIDELINES.general },
    { group: 'tool-use', subOptionId: 'copy-link-tool-use-guidelines', title: 'Tool Use Guidelines', url: FLEET_GUIDELINES.toolUse },
    { group: 'qa-guidelines', subOptionId: 'copy-link-qa-guidelines', title: 'QA Guidelines', url: FLEET_GUIDELINES.qa },
    { group: 'time-submission', subOptionId: 'copy-link-time-submission-guidelines', title: 'Time Submission Guidelines', url: FLEET_GUIDELINES.timeSubmission }
];

const GUIDELINE_COPY_WRAPPER_MARKER = 'data-fleet-guideline-copy-links';
const COPY_PROMPT_MARKER = 'data-fleet-revisions-copy-prompt';
const COPY_PROMPT_SUBOPTION_ID = 'copy-prompt-button';
const COPY_VERIFIER_OUTPUT_MARKER = 'data-fleet-revisions-copy-verifier';
const COPY_VERIFIER_SUBOPTION_ID = 'copy-verifier-output-button';
const TASK_ONLY_SUBOPTION_ID = 'task-only-issues';
const SCREENSHOT_SUBOPTION_ID = 'screenshot-upload-improvement';

const PROMPT_QUALITY_VALUES = ['Top 10%', 'Average', 'Bottom 10%'];
const PROMPT_QUALITY_LISTENER_MARKER = 'data-fleet-prompt-quality-listener';

const TASK_ONLY_STYLE_ID = 'fleet-request-revisions-task-only-style';
const TASK_ONLY_DIALOG_ATTR = 'data-fleet-rr-task-only';
const TASK_ONLY_HIDDEN_ATTR = 'data-fleet-rr-issue-hidden';

const RequestRevisionsApi = {
    run(state, options) {
        const pluginId = (options && options.pluginId) || 'requestRevisions';

        if (state.verifierWatchEligibleAt === undefined) {
            state.verifierWatchEligibleAt = Date.now() + 1500;
        }

        const dialogs = Context.dom.queryAll('div[role="dialog"][data-state="open"]', {
            context: `${pluginId}.dialogs`
        });

        if (dialogs.length === 0) {
            this.resetTaskOnlyOnClose(state);
            if (state.lastSig !== 0) state.lastSig = 0;
            return;
        }

        const modal = this.findRequestRevisionsModal(dialogs, pluginId);
        if (!modal) {
            this.resetTaskOnlyOnClose(state);
            if (!state.missingLogged) {
                Logger.debug('Request Revisions modal not found');
                state.missingLogged = true;
            }
            const copyVerifierEnabled = Storage.getSubOptionEnabled(pluginId, COPY_VERIFIER_SUBOPTION_ID, true);
            if (
                copyVerifierEnabled &&
                state.verifierWatchEligibleAt !== undefined &&
                Date.now() >= state.verifierWatchEligibleAt
            ) {
                this.watchVerifierOutput(state);
            }
            return;
        }

        state.missingLogged = false;
        state.verifierWatchEligibleAt = Math.min(state.verifierWatchEligibleAt ?? Infinity, Date.now());

        const copyVerifierEnabled = Storage.getSubOptionEnabled(pluginId, COPY_VERIFIER_SUBOPTION_ID, true);
        if (copyVerifierEnabled && Date.now() >= state.verifierWatchEligibleAt) {
            this.watchVerifierOutput(state);
        }

        const sig = dialogs.length + '|' + dialogs.map((d) => d.outerHTML.length).join(',');
        if (sig !== state.lastSig) {
            state.lastSig = sig;
            this.injectGuidelineCopyButtons(state, modal, pluginId);
            this.capturePromptQualityRating(state, modal, pluginId);
            this.restorePromptQualityRating(state, modal);
        }

        if (Storage.getSubOptionEnabled(pluginId, TASK_ONLY_SUBOPTION_ID, true)) {
            this.applyTaskOnly(state, modal, pluginId);
        }

        if (Storage.getSubOptionEnabled(pluginId, SCREENSHOT_SUBOPTION_ID, true)) {
            this.applyScreenshotUpload(state, pluginId);
        }
    },

    findRequestRevisionsModal(dialogs, pluginId) {
        for (const dialog of dialogs) {
            const heading = Context.dom.query('h2', {
                root: dialog,
                context: `${pluginId}.heading`
            });
            if (!heading || !heading.textContent.includes('Request Revisions')) continue;
            const hasFeedbackId = dialog.querySelector(
                '#feedback-Task, #feedback-Environment, [id^="feedback-"]'
            );
            if (hasFeedbackId) return dialog;
        }
        for (const dialog of dialogs) {
            const heading = Context.dom.query('h2', {
                root: dialog,
                context: `${pluginId}.heading`
            });
            if (heading && heading.textContent.includes('Request Revisions')) {
                return dialog;
            }
        }
        return null;
    },

    // --- Prompt discovery (comp-use section first, then tool-use task panel) ---

    findPromptSection() {
        const candidates = document.querySelectorAll('div.flex.flex-col.gap-2');
        for (const candidate of candidates) {
            const label = candidate.querySelector('label');
            const span = candidate.querySelector('span.text-sm.text-muted-foreground.font-medium');
            if (label && label.textContent.trim() === 'Prompt') {
                return candidate;
            }
            if (span && span.textContent.trim() === 'Prompt') {
                return candidate;
            }
        }
        return null;
    },

    getPromptTextFromSection(promptSection) {
        const textarea = promptSection.querySelector('textarea');
        if (textarea && textarea.value !== undefined) {
            return textarea.value.trim();
        }
        const preWrap = promptSection.querySelector('div.text-sm.whitespace-pre-wrap');
        if (preWrap) {
            return preWrap.textContent.trim();
        }
        return null;
    },

    findTaskPanel() {
        const panels = document.querySelectorAll('[data-panel][data-panel-id]');
        for (const p of panels) {
            const hasPromptLabel = Array.from(p.querySelectorAll('span, label')).some(
                (el) => (el.textContent || '').trim() === 'Prompt'
            );
            const promptContent = p.querySelector('.text-sm.whitespace-pre-wrap');
            if (hasPromptLabel && promptContent) return p;
        }
        for (const p of panels) {
            const hasPromptLabel = Array.from(p.querySelectorAll('span, label')).some((el) => {
                const t = (el.textContent || '').trim();
                return t === 'Prompt' || (t.length > 0 && t.includes('Prompt'));
            });
            const promptContent =
                p.querySelector('.text-sm.whitespace-pre-wrap') ||
                p.querySelector('[class*="whitespace-pre-wrap"]');
            if (hasPromptLabel && promptContent && promptContent.textContent.trim().length > 0) {
                return p;
            }
        }
        return document.querySelector('[id=":re:"]') || document.querySelector('[data-panel-id=":re:"]');
    },

    findWhereAreTheIssuesButtonRow(modal) {
        const section = this.findWhereAreTheIssuesSection(modal);
        return section && section.buttonRow ? section.buttonRow : null;
    },

    findWhereAreTheIssuesSection(modal) {
        const labels = modal.querySelectorAll('div.text-sm.text-muted-foreground.font-medium.mb-3');
        for (const label of labels) {
            if (label.textContent && label.textContent.includes('Where are the issues')) {
                const buttonRow = label.nextElementSibling;
                if (
                    buttonRow &&
                    buttonRow.classList.contains('flex') &&
                    buttonRow.classList.contains('gap-3')
                ) {
                    return { label, buttonRow };
                }
                return { label, buttonRow: null };
            }
        }
        return null;
    },

    injectGuidelineCopyButtons(state, modal, pluginId) {
        const buttonRow = this.findWhereAreTheIssuesButtonRow(modal);
        if (!buttonRow) return;

        const buttonClass =
            'inline-flex items-center justify-center whitespace-nowrap font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background transition-colors hover:bg-accent hover:text-accent-foreground h-8 rounded-sm pl-3 pr-3 text-xs';

        let wrapper = modal.querySelector(`[${GUIDELINE_COPY_WRAPPER_MARKER}="true"]`);
        if (wrapper) {
            this.removeLegacyGuidelineGroups(wrapper);
            this.syncGuidelineCopyButtons(state, wrapper, buttonClass, pluginId);
            return;
        }

        wrapper = document.createElement('div');
        wrapper.setAttribute('data-fleet-plugin', pluginId);
        wrapper.setAttribute(GUIDELINE_COPY_WRAPPER_MARKER, 'true');
        wrapper.className = 'flex flex-wrap gap-2 mt-2';

        for (const spec of GUIDELINE_BUTTON_SPECS) {
            wrapper.appendChild(
                this.createGuidelineOpenButton(buttonClass, spec.group, spec.url, spec.title, pluginId)
            );
        }

        if (this.hasResultParamsGrid()) {
            const copyResultParamsBtn = document.createElement('button');
            copyResultParamsBtn.type = 'button';
            copyResultParamsBtn.className = buttonClass;
            copyResultParamsBtn.setAttribute('data-fleet-plugin', pluginId);
            copyResultParamsBtn.textContent = 'Copy Result Params and Inputs';
            copyResultParamsBtn.title = 'Copy parameter labels and values to clipboard';
            copyResultParamsBtn.addEventListener('click', () =>
                this.handleCopyResultParamsClick(copyResultParamsBtn)
            );
            wrapper.appendChild(copyResultParamsBtn);
        }

        buttonRow.insertAdjacentElement('afterend', wrapper);
        Logger.log('Request Revisions: guideline buttons added');
        this.removeLegacyGuidelineGroups(wrapper);
        this.syncGuidelineCopyButtons(state, wrapper, buttonClass, pluginId);
    },

    removeLegacyGuidelineGroups(wrapper) {
        for (const legacy of ['kinesis', 'meridian']) {
            const n = wrapper.querySelector(`[data-guideline-group="${legacy}"]`);
            if (n) n.remove();
        }
    },

    _reorderGuidelineGroupsAfterUtilities(wrapper, orderedGroupIds) {
        let lastUtility = null;
        const v = wrapper.querySelector(`[${COPY_VERIFIER_OUTPUT_MARKER}="true"]`);
        const p = wrapper.querySelector(`[${COPY_PROMPT_MARKER}="true"]`);
        if (v) lastUtility = v;
        if (p) lastUtility = p;
        let ref = lastUtility;
        for (const gid of orderedGroupIds) {
            const node = wrapper.querySelector(`[data-guideline-group="${gid}"]`);
            if (!node || node.style.display === 'none') continue;
            if (ref) {
                if (ref.nextSibling !== node) wrapper.insertBefore(node, ref.nextSibling);
                ref = node;
            } else {
                wrapper.insertBefore(node, wrapper.firstChild);
                ref = node;
            }
        }
    },

    createGuidelineOpenButton(buttonClass, groupId, url, shortTitle, pluginId) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = buttonClass;
        btn.setAttribute('data-fleet-plugin', pluginId);
        btn.setAttribute('data-guideline-group', groupId);
        btn.textContent = shortTitle;
        btn.title = `Open ${shortTitle} in a new tab`;
        btn.addEventListener('click', () => {
            window.open(url, '_blank');
            Logger.log(`Request Revisions: opened ${shortTitle}`);
        });
        return btn;
    },

    migrateLegacyGuidelineOpenControl(wrapper, groupId, url, shortTitle, buttonClass, pluginId) {
        const el = wrapper.querySelector(`[data-guideline-group="${groupId}"]`);
        if (!el) return;
        const isLegacy = el.tagName === 'SPAN' && el.querySelector('a');
        if (!isLegacy) return;
        const btn = this.createGuidelineOpenButton(buttonClass, groupId, url, shortTitle, pluginId);
        el.replaceWith(btn);
        Logger.debug(`Request Revisions: migrated legacy ${shortTitle} control to open-only button`);
    },

    syncGuidelineCopyButtons(state, wrapper, buttonClass, pluginId) {
        this.removeLegacyGuidelineGroups(wrapper);
        for (const spec of GUIDELINE_BUTTON_SPECS) {
            this.migrateLegacyGuidelineOpenControl(
                wrapper,
                spec.group,
                spec.url,
                spec.title,
                buttonClass,
                pluginId
            );
        }
        for (const spec of GUIDELINE_BUTTON_SPECS) {
            const enabled = Storage.getSubOptionEnabled(pluginId, spec.subOptionId, true);
            let el = wrapper.querySelector(`[data-guideline-group="${spec.group}"]`);
            if (!enabled) {
                if (el) el.style.display = 'none';
                continue;
            }
            if (!el) {
                el = this.createGuidelineOpenButton(
                    buttonClass,
                    spec.group,
                    spec.url,
                    spec.title,
                    pluginId
                );
                wrapper.appendChild(el);
            } else {
                el.style.display = '';
                if (el.textContent !== spec.title) {
                    el.replaceWith(
                        this.createGuidelineOpenButton(
                            buttonClass,
                            spec.group,
                            spec.url,
                            spec.title,
                            pluginId
                        )
                    );
                }
            }
        }

        const copyVerifierEnabled = Storage.getSubOptionEnabled(pluginId, COPY_VERIFIER_SUBOPTION_ID, true);
        this.syncCopyVerifierOutputButton(state, wrapper, copyVerifierEnabled, buttonClass, pluginId);
        const copyPromptEnabled = Storage.getSubOptionEnabled(pluginId, COPY_PROMPT_SUBOPTION_ID, true);
        this.syncCopyPromptButton(state, wrapper, copyPromptEnabled, buttonClass, pluginId);
        this._reorderGuidelineGroupsAfterUtilities(
            wrapper,
            GUIDELINE_BUTTON_SPECS.map((s) => s.group)
        );

        const hasGrid = this.hasResultParamsGrid();
        const copyResultParamsBtn = Array.from(
            wrapper.querySelectorAll(`button[data-fleet-plugin="${pluginId}"]`)
        ).find((btn) => btn.textContent === 'Copy Result Params and Inputs');

        if (hasGrid) {
            if (copyResultParamsBtn) {
                copyResultParamsBtn.style.display = '';
            } else {
                const newBtn = document.createElement('button');
                newBtn.type = 'button';
                newBtn.className = buttonClass;
                newBtn.setAttribute('data-fleet-plugin', pluginId);
                newBtn.textContent = 'Copy Result Params and Inputs';
                newBtn.title = 'Copy parameter labels and values to clipboard';
                newBtn.addEventListener('click', () => this.handleCopyResultParamsClick(newBtn));
                wrapper.appendChild(newBtn);
                Logger.debug('Request Revisions: Copy Result Params button created dynamically');
            }
        } else if (copyResultParamsBtn) {
            copyResultParamsBtn.style.display = 'none';
        }

        const copyRp = Array.from(
            wrapper.querySelectorAll(`button[data-fleet-plugin="${pluginId}"]`)
        ).find((btn) => btn.textContent === 'Copy Result Params and Inputs');
        if (copyRp && copyRp.style.display !== 'none') wrapper.appendChild(copyRp);
    },

    syncCopyVerifierOutputButton(state, wrapper, copyVerifierEnabled, buttonClass, pluginId) {
        let btn = wrapper.querySelector(`[${COPY_VERIFIER_OUTPUT_MARKER}="true"]`);
        if (copyVerifierEnabled) {
            if (!btn) {
                btn = document.createElement('button');
                btn.type = 'button';
                btn.className = buttonClass;
                btn.setAttribute('data-fleet-plugin', pluginId);
                btn.setAttribute(COPY_VERIFIER_OUTPUT_MARKER, 'true');
                btn.textContent = 'Copy Verifier Output';
                btn.title = 'Copy verifier output to clipboard';
                btn.addEventListener('click', () => this.handleCopyVerifierOutputClick(state, btn));
                wrapper.insertBefore(btn, wrapper.firstChild);
                Logger.debug('Request Revisions: Copy Verifier Output button added');
            }
            btn.style.display = '';
        } else if (btn) {
            btn.style.display = 'none';
        }
    },

    syncCopyPromptButton(state, wrapper, copyPromptEnabled, buttonClass, pluginId) {
        let btn = wrapper.querySelector(`[${COPY_PROMPT_MARKER}="true"]`);
        if (copyPromptEnabled) {
            if (!btn) {
                btn = document.createElement('button');
                btn.type = 'button';
                btn.className = buttonClass;
                btn.setAttribute('data-fleet-plugin', pluginId);
                btn.setAttribute(COPY_PROMPT_MARKER, 'true');
                btn.textContent = 'Copy Prompt';
                btn.title = 'Copy task prompt to clipboard';
                btn.addEventListener('click', () => this.handleCopyPromptClick(state, btn));
                wrapper.insertBefore(btn, wrapper.firstChild);
                Logger.debug('Request Revisions: Copy Prompt button added');
            }
            btn.style.display = '';
        } else if (btn) {
            btn.style.display = 'none';
        }
    },

    getPromptTextForClipboard(state) {
        const section = this.findPromptSection();
        if (section) {
            const text = this.getPromptTextFromSection(section);
            if (text) {
                state.promptText = text;
                return text;
            }
        }
        const panel = this.findTaskPanel();
        if (panel) {
            const el =
                panel.querySelector('.text-sm.whitespace-pre-wrap') ||
                panel.querySelector('[class*="whitespace-pre-wrap"]');
            if (el) {
                const text = el.textContent.trim();
                if (text) {
                    state.promptText = text;
                    return text;
                }
            }
        }
        return (state.promptText && String(state.promptText).trim()) || '';
    },

    handleCopyPromptClick(state, button) {
        const text = this.getPromptTextForClipboard(state);
        if (!text) {
            Logger.warn('Request Revisions: No prompt text to copy');
            this.showCopyFailurePulse(button);
            return;
        }
        navigator.clipboard.writeText(text).then(() => {
            Logger.log(`Request Revisions: Copied prompt to clipboard (${text.length} chars)`);
            this.showCopySuccessFlash(button);
        }).catch((err) => {
            Logger.error('Request Revisions: Failed to copy prompt', err);
            this.showCopyFailurePulse(button);
        });
    },

    getVerifierTextForClipboard(state) {
        const fresh = this.tryCaptureVerifierOutput();
        if (fresh) {
            const text =
                fresh.kind === 'pre'
                    ? fresh.node.textContent.trim()
                    : (this.buildScoreVerifierMarkdown(fresh.node) || '').trim();
            if (text) return text;
        }
        return (state.verifierOutput && String(state.verifierOutput).trim()) || '';
    },

    handleCopyVerifierOutputClick(state, button) {
        const text = this.getVerifierTextForClipboard(state);
        if (!text) {
            Logger.warn('Request Revisions: No verifier output to copy');
            this.showCopyFailurePulse(button);
            return;
        }
        navigator.clipboard.writeText(text).then(() => {
            Logger.log(`Request Revisions: Copied verifier output to clipboard (${text.length} chars)`);
            this.showCopySuccessFlash(button);
        }).catch((err) => {
            Logger.error('Request Revisions: Failed to copy verifier output', err);
            this.showCopyFailurePulse(button);
        });
    },

    findYourAnswerSection(root = document) {
        const headings = root.querySelectorAll('h4');
        for (const h of headings) {
            if (h.textContent && h.textContent.trim() === 'Your Answer') {
                const blueBox = h.closest('.rounded-lg.border');
                if (
                    blueBox &&
                    (blueBox.classList.contains('border-blue-200') ||
                        blueBox.classList.contains('dark:border-blue-800'))
                ) {
                    return blueBox;
                }
                return (
                    h.closest('div.space-y-4') ||
                    h.closest('div[class*="border-blue"]') ||
                    h.parentElement?.parentElement
                );
            }
        }
        return null;
    },

    hasResultParamsGrid() {
        const section = this.findYourAnswerSection();
        if (!section) return false;
        const grid = section.querySelector('.grid.grid-cols-1.gap-4') || section.querySelector('.grid');
        if (!grid) return false;
        const rows = grid.querySelectorAll('.space-y-2');
        for (const row of rows) {
            const label = row.querySelector('label');
            const input = row.querySelector('input, textarea');
            if (label && input) return true;
        }
        return false;
    },

    getResultParamsTextFromPage() {
        const section = this.findYourAnswerSection();
        if (!section) return '';
        const grid = section.querySelector('.grid.grid-cols-1.gap-4') || section.querySelector('.grid');
        if (!grid) return '';
        const lines = [];
        const rows = grid.querySelectorAll('.space-y-2');
        for (const row of rows) {
            const label = row.querySelector('label');
            const input = row.querySelector('input, textarea');
            if (!label || !input) continue;
            const labelText = label.textContent.replace(/\s+/g, ' ').trim();
            const value =
                input.value != null && input.value !== undefined ? String(input.value).trim() : '';
            lines.push(`${labelText}: ${value}`);
        }
        return lines.join('\n');
    },

    showCopySuccessFlash(button) {
        if (Context.buttonFeedback) Context.buttonFeedback.flashSuccess(button, { restoreStyles: false });
    },

    showCopyFailurePulse(button) {
        if (Context.buttonFeedback) Context.buttonFeedback.flashFailure(button, { restoreStyles: false });
    },

    handleCopyResultParamsClick(button) {
        const text = this.getResultParamsTextFromPage();
        if (!text) {
            Logger.warn('Request Revisions: No result params to copy');
            this.showCopyFailurePulse(button);
            return;
        }
        navigator.clipboard.writeText(text).then(() => {
            Logger.log(`Request Revisions: Copied result params to clipboard (${text.length} chars)`);
            this.showCopySuccessFlash(button);
        }).catch((err) => {
            Logger.error('Request Revisions: Failed to copy result params', err);
            this.showCopyFailurePulse(button);
        });
    },

    findPromptQualityRatingSection(modal) {
        const labels = modal.querySelectorAll('label');
        for (const label of labels) {
            if (label.textContent && label.textContent.includes('Prompt Quality Rating')) {
                const container = label.closest('div.flex.flex-col.gap-2') || label.parentElement;
                if (container) {
                    const buttonGroup = container.querySelector('div.flex.gap-2');
                    if (buttonGroup) return { container, buttonGroup };
                }
                break;
            }
        }
        return null;
    },

    getRatingButtons(buttonGroup) {
        const buttons = buttonGroup.querySelectorAll('button');
        const result = {};
        for (const btn of buttons) {
            const text = btn.textContent.trim();
            if (PROMPT_QUALITY_VALUES.includes(text)) result[text] = btn;
        }
        return result;
    },

    isRatingButtonSelected(button) {
        return (
            button.classList.contains('border-brand') ||
            button.classList.contains('bg-brand') ||
            button.classList.contains('bg-brand/5') ||
            button.classList.contains('bg-gray-50') ||
            (button.getAttribute('class') || '').includes('dark:bg-gray-800')
        );
    },

    capturePromptQualityRating(state, modal, pluginId) {
        const section = this.findPromptQualityRatingSection(modal);
        if (!section || section.buttonGroup.getAttribute(PROMPT_QUALITY_LISTENER_MARKER) === 'true') {
            return;
        }
        section.buttonGroup.setAttribute(PROMPT_QUALITY_LISTENER_MARKER, 'true');
        section.buttonGroup.setAttribute('data-fleet-plugin', pluginId);
        section.buttonGroup.addEventListener('click', (e) => {
            const button = e.target.closest('button');
            if (!button) return;
            const text = button.textContent.trim();
            if (PROMPT_QUALITY_VALUES.includes(text)) {
                state.promptQualityRating = text;
                Logger.debug(`Request Revisions: prompt quality rating set to "${text}"`);
            }
        });
    },

    restorePromptQualityRating(state, modal) {
        if (!state.promptQualityRating || !PROMPT_QUALITY_VALUES.includes(state.promptQualityRating)) {
            return;
        }
        const section = this.findPromptQualityRatingSection(modal);
        if (!section) return;
        const buttons = this.getRatingButtons(section.buttonGroup);
        const targetButton = buttons[state.promptQualityRating];
        if (!targetButton || this.isRatingButtonSelected(targetButton)) return;
        targetButton.click();
        Logger.debug(`Request Revisions: restored prompt quality rating to "${state.promptQualityRating}"`);
    },

    findScoreRow() {
        const candidates = document.querySelectorAll('div.flex.items-center.text-sm.mb-3');
        for (const el of candidates) {
            for (const s of el.querySelectorAll('span')) {
                if (s.textContent.trim() === 'Score:') {
                    return el;
                }
            }
        }
        return null;
    },

    findStdoutRow() {
        const candidates = document.querySelectorAll(
            'div.text-sm.text-muted-foreground.font-medium.mb-1'
        );
        for (const el of candidates) {
            if (el.textContent.trim() === 'Stdout') {
                return el;
            }
        }
        return null;
    },

    buildScoreVerifierMarkdown(container) {
        const list = container.querySelector('div.text-xs.mb-3.space-y-0\\.5');
        if (!list) {
            return null;
        }
        const rows = list.querySelectorAll(':scope > div.flex.items-start');
        const successes = [];
        const failures = [];
        for (const row of rows) {
            const svg = row.querySelector(':scope > svg');
            if (!svg) continue;
            const cls = svg.getAttribute('class') || '';
            const span = row.querySelector(':scope > span');
            const text = (span ? String(span.textContent || '').replace(/\s+/g, ' ').trim() : '')
                .replace(/^\[(?:C|X)\]\s*/i, '')
                .trim();
            if (!text) continue;
            if (cls.includes('text-emerald')) {
                successes.push(text);
            } else if (cls.includes('text-red')) {
                failures.push(text);
            }
        }
        if (successes.length === 0 && failures.length === 0) {
            return null;
        }
        const lines = ['## Verifier'];
        if (successes.length > 0) {
            lines.push('#### Successes');
            for (const t of successes) {
                lines.push(`✅ ${t}`);
            }
        }
        if (failures.length > 0) {
            lines.push('');
            lines.push('#### Failures');
            for (const t of failures) {
                lines.push(`❌ ${t}`);
            }
        }
        const body = lines.join('\n');
        let maxRun = 0;
        let run = 0;
        for (let i = 0; i < body.length; i++) {
            if (body[i] === '`') {
                run++;
                if (run > maxRun) maxRun = run;
            } else {
                run = 0;
            }
        }
        const fenceLen = Math.max(3, maxRun + 1);
        const fence = '`'.repeat(fenceLen);
        return `${fence}\n${body}\n${fence}`;
    },

    getVerifierPreFromContainer(container) {
        const pre = container.querySelector('div.overflow-x-auto.bg-background.border.rounded pre');
        return pre && pre.textContent.trim().length > 0 ? pre : null;
    },

    tryCaptureVerifierOutput() {
        const scoreRow = this.findScoreRow();
        if (scoreRow) {
            const container = scoreRow.closest('div.p-3') || scoreRow.closest('div.p-2');
            if (container) {
                const md = this.buildScoreVerifierMarkdown(container);
                if (md && md.length > 0) {
                    return { kind: 'score', node: container };
                }
            }
        }
        const stdoutRow = this.findStdoutRow();
        if (!stdoutRow) return null;
        const container = stdoutRow.closest('div.text-xs.w-full');
        if (!container) return null;
        const pre = this.getVerifierPreFromContainer(container);
        return pre ? { kind: 'pre', node: pre } : null;
    },

    watchVerifierOutput(state) {
        if (state.verifierObserver) {
            return;
        }

        const tryCaptureVerifier = () => this.tryCaptureVerifierOutput();

        const captured = tryCaptureVerifier();
        if (captured) {
            Logger.debug(`Verifier container detected`);
            this.saveVerifierOutput(state, captured);
            return;
        }

        const containerObserver = new MutationObserver(() => {
            const next = tryCaptureVerifier();
            if (next) {
                Logger.debug(`Verifier container detected`);
                containerObserver.disconnect();
                state.verifierObserver = null;
                this.saveVerifierOutput(state, next);
            }
        });

        containerObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
        state.verifierObserver = containerObserver;
    },

    saveVerifierOutput(state, capture) {
        const getText = () => {
            if (capture.kind === 'pre') {
                return capture.node.textContent.trim();
            }
            return this.buildScoreVerifierMarkdown(capture.node) || '';
        };

        state.verifierOutput = getText();
        state.verifierElement = capture.node;

        Logger.debug(`Verifier output saved (${state.verifierOutput.length} chars)`);

        const changeObserver = new MutationObserver(() => {
            const newOutput = getText();
            if (newOutput !== state.verifierOutput && newOutput.length > 0) {
                state.verifierOutput = newOutput;
                Logger.debug(`Verifier output updated (${state.verifierOutput.length} chars)`);
            }
        });

        changeObserver.observe(capture.node, {
            childList: true,
            subtree: true,
            characterData: true
        });

        state.verifierChangeObserver = changeObserver;
    },

    // --- Task-only issues ---

    resetTaskOnlyOnClose(state) {
        if (state.activationLogged) {
            Logger.debug(`Request Revisions modal closed — reset`);
            state.activationLogged = false;
        }
        state.warnLogged = false;
    },

    applyTaskOnly(state, modal, pluginId) {
        this.ensureTaskOnlyStyles(state, pluginId);

        if (modal.getAttribute(TASK_ONLY_DIALOG_ATTR) === '1') return;

        const section = this.findWhereAreTheIssuesSection(modal);
        if (!section || !section.buttonRow) {
            if (!state.warnLogged) {
                Logger.warn(
                    `Request Revisions modal open but "Where are the issues?" button row missing`
                );
                state.warnLogged = true;
            }
            return;
        }
        state.warnLogged = false;

        const hidParts = [];
        let clickedTask = false;
        let taskAlreadySelected = false;

        const buttons = section.buttonRow.querySelectorAll('button[type="button"]');
        for (const btn of buttons) {
            const label = this.getIssueButtonLabel(btn);
            if (label === 'Task') {
                if (this.isIssueButtonSelected(btn)) {
                    taskAlreadySelected = true;
                } else {
                    btn.click();
                    clickedTask = true;
                }
                btn.setAttribute(TASK_ONLY_HIDDEN_ATTR, '1');
                hidParts.push('Task');
            } else if (label === 'Environment' || label === 'Grading') {
                btn.setAttribute(TASK_ONLY_HIDDEN_ATTR, '1');
                hidParts.push(label);
            }
        }

        if (section.label) {
            section.label.setAttribute(TASK_ONLY_HIDDEN_ATTR, '1');
        }
        section.buttonRow.setAttribute(TASK_ONLY_HIDDEN_ATTR, '1');

        modal.setAttribute(TASK_ONLY_DIALOG_ATTR, '1');

        const hidSummary = hidParts.length ? `hid ${hidParts.join('+')}` : 'no issue buttons to hide';
        const taskSummary = clickedTask
            ? 'auto-selected Task'
            : taskAlreadySelected
              ? 'Task already selected'
              : 'Task button not found';
        Logger.log(`${hidSummary}, ${taskSummary}`);
        state.activationLogged = true;
    },

    ensureTaskOnlyStyles(state, pluginId) {
        if (state.taskOnlyStyleReady && document.getElementById(TASK_ONLY_STYLE_ID)) return;
        let style = document.getElementById(TASK_ONLY_STYLE_ID);
        if (!style) {
            style = document.createElement('style');
            style.id = TASK_ONLY_STYLE_ID;
            style.setAttribute('data-fleet-plugin', pluginId);
            document.head.appendChild(style);
        }
        style.textContent = `
[${TASK_ONLY_HIDDEN_ATTR}="1"] {
    display: none !important;
}
`;
        state.taskOnlyStyleReady = true;
    },

    getIssueButtonLabel(btn) {
        const span = btn.querySelector('span.text-sm.font-medium');
        const text = span && span.textContent ? span.textContent : btn.textContent || '';
        return text.trim();
    },

    isIssueButtonSelected(btn) {
        return btn.classList.contains('border-brand');
    },

    // --- Screenshot upload (anchors here; chrome in Context.screenshotUpload) ---

    applyScreenshotUpload(state, pluginId) {
        const api = Context.screenshotUpload;
        if (!api || typeof api.run !== 'function') return;

        const found = this.findNativeScreenshotControl();
        if (!found) {
            if (!state.screenshotMissingLogged) {
                Logger.debug('native file control not found');
                state.screenshotMissingLogged = true;
            }
            return;
        }
        state.screenshotMissingLogged = false;

        api.run(state, {
            pluginId,
            logTag: pluginId,
            label: found.label,
            input: found.input
        });
    },

    findNativeScreenshotControl() {
        const dialogs = document.querySelectorAll('div[role="dialog"][data-state="open"]');
        for (const dialog of dialogs) {
            const heading = dialog.querySelector('h2');
            const headingText = (heading && heading.textContent ? heading.textContent : '').trim();
            if (!headingText.includes('Request Revisions')) continue;

            const labels = dialog.querySelectorAll('label');
            for (const label of labels) {
                const input = label.querySelector('input[type="file"][accept*="image"]');
                if (!input || !input.multiple) continue;
                const span = label.querySelector('span.text-sm');
                const text = ((span && span.textContent) || '').trim().replace(/\s+/g, ' ');
                if (text.includes('Add screenshots')) {
                    return { label, input };
                }
            }
        }
        return null;
    }
};

const plugin = {
    id: 'requestRevisionsLib',
    name: '"Request Revisions" Modal Improvements (library)',
    description:
        'Shared Request Revisions guidelines, copy actions, and screenshot upload',
    _version: '1.2',
    phase: 'core',
    enabledByDefault: true,
    initialState: { registered: false },

    init(state) {
        Context.requestRevisions = {
            run: (s, options) => RequestRevisionsApi.run(s, options)
        };
        if (!state.registered) {
            Logger.log('module registered (Context.requestRevisions)');
            state.registered = true;
        }
    }
};

return plugin;
},
        "libs/toggle-main-panels.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {
// ============= toggle-main-panels.js (library) =============
// Hide/Unhide toggles in each main pane header; CSS-only collapse with mutual exclusivity.

const STYLE_ID = 'fleet-toggle-main-panels';
const TOGGLE_MARKER = 'data-fleet-pane-toggle';
const SLIVER_MARKER = 'data-fleet-pane-sliver';
const SLOT_MARKER = 'data-fleet-pane-toggle-slot';
const COLLAPSED_STRIP_WIDTH = '2.75rem';
const ENV_IFRAME_HOST = /\.env\.[^.]+(?:\.[^.]+)*\.fleetai\.com$/;

const ToggleMainPanelsApi = {
    id: 'toggleMainPanels',

    run(state, options) {
        const opts = options || {};
        if (opts.pluginId) {
            this.id = opts.pluginId;
        }

        this.ensureStyle(state);

        const panels = this.getPanels();
        if (!panels.left || !panels.right) {
            if (state.hiddenPane) {
                state.hiddenPane = null;
                this.clearCollapsedMarkers(panels);
            }
            if (state.activationLogged) {
                Logger.debug('main panels gone — idle');
                state.activationLogged = false;
            }
            if (!state.missingLogged) {
                Logger.debug('main panels not found yet');
                state.missingLogged = true;
            }
            return;
        }
        state.missingLogged = false;

        const leftToolbar = this.findPanelHeaderToolbar(panels.left, 'left');
        const rightToolbar = this.findPanelHeaderToolbar(panels.right, 'right');
        if (!leftToolbar || !rightToolbar) {
            if (!state.headerMissingLogged) {
                Logger.debug(
                    `pane header toolbar not found (left=${!!leftToolbar}, right=${!!rightToolbar})`
                );
                state.headerMissingLogged = true;
            }
            return;
        }
        state.headerMissingLogged = false;

        this.ensureToggleButton(state, 'left', leftToolbar, panels.left);
        this.ensureToggleButton(state, 'right', rightToolbar, panels.right);
        this.applyCollapsedState(state, panels);
        this.relocateToggleButtons(state, panels);
        this.updateButtonLabels(state);

        if (!state.activationLogged) {
            Logger.log('Hide/Unhide toggles attached to both main pane headers');
            state.activationLogged = true;
        }
    },

    getPanels() {
        const qa = this._getQaPanels();
        if (qa.left && qa.right) {
            return qa;
        }
        return this._getSplitPanels();
    },

    _getQaPanels() {
        const taskDetail = document.querySelector('[data-ui="qa-task-detail-panel"]');
        if (!taskDetail) {
            return { left: null, right: null, group: null };
        }

        const left = taskDetail.matches('[data-panel]') ? taskDetail : taskDetail.closest('[data-panel]');
        if (!left || !left.parentElement) {
            return { left: null, right: null, group: null };
        }

        const group =
            left.closest('[data-ui="qa-task-card"]') ||
            left.closest('[data-panel-group][data-panel-group-direction="horizontal"]') ||
            left.parentElement;

        let right = null;
        for (const child of group.children) {
            if (child !== left && child.hasAttribute('data-panel')) {
                right = child;
                break;
            }
        }

        if (!right) {
            const instanceTab = document.querySelector('[data-ui="qa-instance-tab"]');
            if (instanceTab && group.contains(instanceTab)) {
                for (const child of group.children) {
                    if (child !== left && child.hasAttribute('data-panel') && child.contains(instanceTab)) {
                        right = child;
                        break;
                    }
                }
            }
        }

        return { left, right, group };
    },

    _getSplitPanels() {
        const groups = document.querySelectorAll(
            '[data-panel-group][data-panel-group-direction="horizontal"]'
        );
        let fallback = null;
        for (const group of groups) {
            const direct = [];
            for (const child of group.children) {
                if (child.hasAttribute('data-panel')) {
                    direct.push(child);
                }
            }
            if (direct.length !== 2) {
                continue;
            }
            const candidate = { left: direct[0], right: direct[1], group };
            if (this._groupContainsEnvIframe(group)) {
                return candidate;
            }
            if (!fallback) {
                fallback = candidate;
            }
        }
        return fallback || { left: null, right: null, group: null };
    },

    _groupContainsEnvIframe(group) {
        if (!group) {
            return false;
        }
        const frames = group.querySelectorAll('iframe');
        for (let i = 0; i < frames.length; i++) {
            const raw = frames[i].src || frames[i].getAttribute('src') || '';
            if (!raw) {
                continue;
            }
            try {
                if (ENV_IFRAME_HOST.test(new URL(raw, window.location.href).hostname)) {
                    return true;
                }
            } catch (_e) {
                /* ignore */
            }
        }
        return false;
    },

    _hasBorderB(el) {
        if (!el || !el.classList) {
            return false;
        }
        for (const name of el.classList) {
            if (name === 'border-b' || name.indexOf('border-b-') === 0) {
                return true;
            }
        }
        return false;
    },

    findPanelHeaderToolbar(panel, side) {
        if (!panel) {
            return null;
        }

        let header = null;
        if (side === 'right') {
            const tab = panel.querySelector('[data-ui="qa-instance-tab"], [data-ui="qa-verifier-tab"]');
            header = tab ? tab.closest('div.h-9.border-b') : null;
        }
        if (!header) {
            header = panel.querySelector('div.h-9.border-b');
        }
        if (header) {
            const rows = header.querySelectorAll('div.flex');
            for (const row of rows) {
                if (row.classList.contains('items-center') && row.classList.contains('justify-between')) {
                    return row;
                }
            }

            return (
                header.querySelector('div.flex.items-center.justify-between') ||
                header.querySelector('div.flex.w-full.items-center.justify-between') ||
                header.querySelector('div.flex.items-center.justify-between.w-full') ||
                header.querySelector('div.flex.w-full.items-center') ||
                header.querySelector('div.flex.items-center') ||
                header
            );
        }

        const candidates = panel.querySelectorAll('div.flex');
        for (const el of candidates) {
            if (!el.classList.contains('items-center')) {
                continue;
            }
            if (!this._hasBorderB(el)) {
                continue;
            }
            return el;
        }
        return null;
    },

    findNativeGradingToggle(toolbar) {
        if (!toolbar) {
            return null;
        }

        for (const btn of toolbar.querySelectorAll('button')) {
            if (btn.hasAttribute(TOGGLE_MARKER)) {
                continue;
            }
            if (btn.closest('[' + SLOT_MARKER + '="true"][data-fleet-plugin="' + this.id + '"]')) {
                continue;
            }
            const text = (btn.textContent || '').replace(/\s+/g, ' ').trim();
            if (text === 'Hide Grading' || text === 'Show Grading') {
                return btn;
            }
        }
        return null;
    },

    ensureToggleSlot(toolbar) {
        let slot = toolbar.querySelector('[' + SLOT_MARKER + '="true"][data-fleet-plugin="' + this.id + '"]');
        if (!slot) {
            slot = document.createElement('div');
            slot.setAttribute(SLOT_MARKER, 'true');
            slot.setAttribute('data-fleet-plugin', this.id);
            toolbar.appendChild(slot);
        }
        slot.className = 'flex items-center justify-end shrink-0 gap-2 ml-auto';
        return slot;
    },

    placeToggleInToolbar(btn, side, toolbar) {
        if (side === 'left') {
            if (!btn.classList.contains('ml-auto')) {
                btn.classList.add('ml-auto');
            }
            if (btn.parentElement !== toolbar || btn !== toolbar.lastElementChild) {
                toolbar.appendChild(btn);
            }
            return;
        }

        btn.classList.remove('ml-auto');

        const slot = this.ensureToggleSlot(toolbar);
        if (btn.parentElement !== slot) {
            slot.appendChild(btn);
        }

        const gradingBtn = this.findNativeGradingToggle(toolbar);
        if (gradingBtn) {
            if (slot.nextElementSibling !== gradingBtn) {
                toolbar.insertBefore(slot, gradingBtn);
            }
            return;
        }

        if (slot.parentElement !== toolbar || slot !== toolbar.lastElementChild) {
            toolbar.appendChild(slot);
        }
    },

    ensureStyle(state) {
        if (state.styleInjected || document.getElementById(STYLE_ID)) {
            state.styleInjected = true;
            return;
        }
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.setAttribute('data-fleet-plugin', this.id);
        style.textContent = [
            '[data-panel][data-fleet-collapsed="true"] {',
            '  flex: 0 0 ' + COLLAPSED_STRIP_WIDTH + ' !important;',
            '  min-width: ' + COLLAPSED_STRIP_WIDTH + ' !important;',
            '  max-width: ' + COLLAPSED_STRIP_WIDTH + ' !important;',
            '  width: ' + COLLAPSED_STRIP_WIDTH + ' !important;',
            '  overflow: hidden !important;',
            '}',
            '[data-panel][data-fleet-collapsed="true"] > *:not([' + SLIVER_MARKER + '="true"]) {',
            '  display: none !important;',
            '}',
            '[' + SLIVER_MARKER + '="true"] {',
            '  display: none;',
            '}',
            '[data-panel][data-fleet-collapsed="true"] > [' + SLIVER_MARKER + '="true"] {',
            '  display: flex !important;',
            '  flex-direction: column !important;',
            '  align-items: center !important;',
            '  justify-content: flex-start !important;',
            '  width: 100% !important;',
            '  height: 100% !important;',
            '  min-height: 100% !important;',
            '  padding: 0.35rem 0.15rem !important;',
            '  box-sizing: border-box !important;',
            '  background: var(--background, #fff) !important;',
            '  border-right: 1px solid var(--border, #e5e5e5) !important;',
            '}',
            '[data-panel][data-fleet-collapsed="true"] [' + SLIVER_MARKER + '="true"] [' + TOGGLE_MARKER + '="true"] {',
            '  writing-mode: vertical-rl !important;',
            '  text-orientation: mixed !important;',
            '  white-space: nowrap !important;',
            '  height: auto !important;',
            '  min-height: 3.5rem !important;',
            '  padding: 0.5rem 0.25rem !important;',
            '}',
            '[data-panel-group][data-fleet-has-collapsed] > [data-panel]:not([data-fleet-collapsed="true"]) {',
            '  flex: 1 1 auto !important;',
            '  min-width: 0 !important;',
            '  max-width: none !important;',
            '}',
            '[data-panel-group][data-fleet-has-collapsed] > [data-resize-handle][data-panel-group-direction="horizontal"] {',
            '  display: none !important;',
            '  flex: 0 0 0 !important;',
            '  width: 0 !important;',
            '  min-width: 0 !important;',
            '  overflow: hidden !important;',
            '  pointer-events: none !important;',
            '}'
        ].join('\n');
        document.head.appendChild(style);
        CleanupRegistry.registerElement(style);
        state.styleInjected = true;
    },

    toggleButtonSelector(side) {
        return (
            '[' +
            TOGGLE_MARKER +
            '="true"][data-fleet-pane="' +
            side +
            '"][data-fleet-plugin="' +
            this.id +
            '"]'
        );
    },

    findToggleButtons(panel, side) {
        if (!panel) {
            return [];
        }
        return Array.from(panel.querySelectorAll(this.toggleButtonSelector(side)));
    },

    findToggleButton(panel, side) {
        return this.findToggleButtons(panel, side)[0] || null;
    },

    dedupeToggleButtons(panel, side) {
        const buttons = this.findToggleButtons(panel, side);
        if (buttons.length <= 1) {
            return buttons[0] || null;
        }
        const keep = buttons[0];
        for (let i = 1; i < buttons.length; i++) {
            buttons[i].remove();
        }
        Logger.debug(`removed ${buttons.length - 1} duplicate Hide/Unhide button(s) on ${side}`);
        return keep;
    },

    bindToggleButton(btn, side, state) {
        btn.onclick = (e) => {
            e.stopPropagation();
            e.preventDefault();
            this.onToggleClick(side, state);
        };
    },

    markPaneHeader(toolbar) {
        if (!toolbar) {
            return;
        }
        let header = toolbar;
        if (!this._hasBorderB(toolbar)) {
            header =
                toolbar.closest('div.h-9.border-b') ||
                toolbar.closest('div.border-b') ||
                toolbar;
        }
        header.setAttribute('data-fleet-pane-header', 'true');
    },

    ensureToggleButton(state, side, toolbar, panel) {
        this.markPaneHeader(toolbar);

        let btn = this.dedupeToggleButtons(panel || toolbar.closest('[data-panel]'), side);
        if (btn && btn.getAttribute('data-fleet-plugin') !== this.id) {
            btn.remove();
            btn = null;
        }
        if (!btn) {
            btn = document.createElement('button');
            btn.type = 'button';
            btn.setAttribute(TOGGLE_MARKER, 'true');
            btn.setAttribute('data-fleet-pane', side);
            btn.setAttribute('data-fleet-plugin', this.id);
            btn.setAttribute('data-slot', 'button');
            btn.className =
                'inline-flex items-center justify-center whitespace-nowrap rounded-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 transition-colors hover:bg-accent hover:text-accent-foreground h-7 text-xs pl-2 pr-2 py-1 text-muted-foreground shrink-0';
        }

        this.bindToggleButton(btn, side, state);
        btn._fleetToolbar = toolbar;

        const collapsed = state.hiddenPane === side;
        if (!collapsed) {
            this.placeToggleInToolbar(btn, side, toolbar);
        }
    },

    ensureCollapseSliver(panel) {
        let sliver = panel.querySelector('[' + SLIVER_MARKER + '="true"][data-fleet-plugin="' + this.id + '"]');
        if (!sliver) {
            sliver = document.createElement('div');
            sliver.setAttribute(SLIVER_MARKER, 'true');
            sliver.setAttribute('data-fleet-plugin', this.id);
            panel.insertBefore(sliver, panel.firstChild);
        }
        return sliver;
    },

    relocateToggleButtons(state, panels) {
        ['left', 'right'].forEach((side) => {
            const panel = side === 'left' ? panels.left : panels.right;
            if (!panel) {
                return;
            }

            const toolbar = this.findPanelHeaderToolbar(panel, side);
            const btn = this.dedupeToggleButtons(panel, side);
            if (!btn) {
                return;
            }

            if (toolbar) {
                btn._fleetToolbar = toolbar;
            }

            const collapsed = state.hiddenPane === side;
            const sliver = panel.querySelector('[' + SLIVER_MARKER + '="true"][data-fleet-plugin="' + this.id + '"]');

            if (collapsed) {
                const targetSliver = this.ensureCollapseSliver(panel);
                if (btn.parentElement !== targetSliver) {
                    targetSliver.appendChild(btn);
                }
            } else if (toolbar) {
                this.placeToggleInToolbar(btn, side, toolbar);
            }

            if (!collapsed && sliver && !sliver.contains(btn)) {
                sliver.remove();
            }
        });
    },

    onToggleClick(side, state) {
        const prev = state.hiddenPane;
        if (state.hiddenPane === side) {
            state.hiddenPane = null;
            Logger.log('shown both panes');
        } else {
            state.hiddenPane = side;
            const paneName = side === 'left' ? 'task detail' : 'environment';
            if (prev && prev !== side) {
                Logger.log(`hidden ${paneName} pane (replaced ${prev})`);
            } else {
                Logger.log(`hidden ${paneName} pane`);
            }
        }
        const panels = this.getPanels();
        this.applyCollapsedState(state, panels);
        this.relocateToggleButtons(state, panels);
        this.dedupeToggleButtons(panels.left, 'left');
        this.dedupeToggleButtons(panels.right, 'right');
        this.updateButtonLabels(state);
    },

    applyCollapsedState(state, panels) {
        const left = panels.left;
        const right = panels.right;
        const group = panels.group;

        if (left) {
            left.removeAttribute('data-fleet-collapsed');
        }
        if (right) {
            right.removeAttribute('data-fleet-collapsed');
        }

        if (state.hiddenPane === 'left' && left) {
            left.setAttribute('data-fleet-collapsed', 'true');
        } else if (state.hiddenPane === 'right' && right) {
            right.setAttribute('data-fleet-collapsed', 'true');
        }

        if (group) {
            if (state.hiddenPane) {
                group.setAttribute('data-fleet-has-collapsed', 'true');
            } else {
                group.removeAttribute('data-fleet-has-collapsed');
            }
        }
    },

    clearCollapsedMarkers(panels) {
        if (panels.left) {
            panels.left.removeAttribute('data-fleet-collapsed');
        }
        if (panels.right) {
            panels.right.removeAttribute('data-fleet-collapsed');
        }
        if (panels.group) {
            panels.group.removeAttribute('data-fleet-has-collapsed');
        }
    },

    updateButtonLabels(state) {
        document.querySelectorAll('[' + TOGGLE_MARKER + '="true"][data-fleet-plugin="' + this.id + '"]').forEach((btn) => {
            const side = btn.getAttribute('data-fleet-pane');
            const collapsed = state.hiddenPane === side;
            const paneName = side === 'left' ? 'task detail' : 'environment';
            btn.textContent = collapsed ? 'Unhide' : 'Hide Panel';
            btn.title = collapsed ? 'Show the ' + paneName + ' pane' : 'Hide the ' + paneName + ' pane';
        });
    }
};

const plugin = {
    id: 'toggleMainPanelsLib',
    name: 'Toggle Main Panels (library)',
    description:
        'Shared Hide/Unhide for the two main panes (task detail or environment); the other pane expands to full width',
    _version: '1.12',
    phase: 'core',
    enabledByDefault: true,
    initialState: { registered: false },

    init(state) {
        Context.toggleMainPanels = {
            run: (s, options) => {
                const impl = Object.create(ToggleMainPanelsApi);
                if (options && options.pluginId) {
                    impl.id = options.pluginId;
                }
                return ToggleMainPanelsApi.run.call(impl, s, options);
            }
        };
        if (!state.registered) {
            Logger.log('module registered (Context.toggleMainPanels)');
            state.registered = true;
        }
    }
};

return plugin;
},
        "libs/user-story-markdown.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {
// ============= user-story-markdown.js (library) =============
// Hides native User Story blue bodies and injects blue-framed markdown replicas.

const USER_STORY_STYLE_ID = 'fleet-user-story-markdown-hide';
const ORIGINAL_MARKER = 'data-fleet-user-story-original';
const REPLICA_MARKER = 'data-fleet-user-story-replica';
const CHECKMARK_MARKER = 'data-fleet-user-story-checkmark-hidden';
const PROSE_ATTR = 'data-fleet-user-story-prose';
const LABEL_TEXT = 'User Story';
const NOTES_FROM_TASK_CREATOR_LABEL = 'Notes from Task Creator';
const COLLAPSE_TOGGLE_SLOT = 'user-story-collapse-toggle';
const DIV_MARKDOWN_LABELS = new Set(['User Story', 'Annotator Instructions']);
const TASK_INSTRUCTIONS_RE = /^\s*Task Instructions\s*$/i;
const SCENARIO_INTRO_RE = /Write a problem inspired by the following scenario/i;
const INSTRUCTIONS_INTRO_RE = /^\s*Instructions for Task Creation:?\s*$/i;

const MODAL_FRAME_CLASSES = [
    'mt-1',
    'rounded',
    'border',
    'border-l-4',
    'border-blue-200',
    'border-l-blue-300',
    'bg-blue-50',
    'p-3',
    'text-sm',
    'text-blue-700',
    'dark:border-blue-800',
    'dark:border-l-blue-600',
    'dark:bg-blue-950/30',
    'dark:text-blue-300'
].join(' ');

const EMBEDDED_BODY_CLASSES = [
    'mt-1',
    'text-sm',
    'text-blue-700',
    'dark:text-blue-300'
].join(' ');

const CREATION_EMBEDDED_BODY_CLASSES = [
    'mt-2',
    'text-sm',
    'text-blue-700',
    'dark:text-blue-300'
].join(' ');

const CREATION_QUOTE_CLASSES = [
    'border-l-4',
    'border-blue-300',
    'pl-4',
    'text-base',
    'text-blue-700',
    'dark:text-blue-300'
].join(' ');

const CREATION_AMBER_BODY_CLASSES = [
    'text-sm',
    'text-amber-800',
    'dark:text-amber-200'
].join(' ');

const UserStoryMarkdownApi = {
    ensureHideStyles(state) {
        if (state.styleInjected || document.getElementById(USER_STORY_STYLE_ID)) {
            state.styleInjected = true;
            return;
        }
        const style = document.createElement('style');
        style.id = USER_STORY_STYLE_ID;
        style.textContent = [
            '[' + ORIGINAL_MARKER + '="true"] {',
            '  position: absolute !important;',
            '  width: 1px !important;',
            '  height: 1px !important;',
            '  overflow: hidden !important;',
            '  clip: rect(0,0,0,0) !important;',
            '  white-space: nowrap !important;',
            '  border: 0 !important;',
            '  padding: 0 !important;',
            '  margin: 0 !important;',
            '  pointer-events: none !important;',
            '  user-select: none !important;',
            '}',
            '[' + CHECKMARK_MARKER + '="true"] {',
            '  display: none !important;',
            '}'
        ].join('\n');
        (document.head || document.documentElement).appendChild(style);
        if (typeof CleanupRegistry !== 'undefined' && CleanupRegistry.registerElement) {
            CleanupRegistry.registerElement(style);
        }
        state.styleInjected = true;
    },

    ensureProseStyles() {
        if (Context.uiLib && typeof Context.uiLib.ensureUserStoryMarkdownStyles === 'function') {
            Context.uiLib.ensureUserStoryMarkdownStyles();
        }
    },

    normalizeLabelText(text) {
        return String(text || '').replace(/\s+/g, ' ').trim();
    },

    /** Label text with collapse Hide/Show stripped (matches user-story-collapse). */
    labelTextFromEl(el) {
        if (!el) return '';
        const clone = el.cloneNode(true);
        clone.querySelectorAll('[data-slot="' + COLLAPSE_TOGGLE_SLOT + '"]').forEach((n) => n.remove());
        return this.normalizeLabelText(clone.textContent);
    },

    isUserStoryLabel(el) {
        if (!el) return false;
        return this.labelTextFromEl(el) === LABEL_TEXT;
    },

    isDivMarkdownLabel(el) {
        if (!el || el.tagName !== 'DIV') return false;
        return DIV_MARKDOWN_LABELS.has(this.labelTextFromEl(el));
    },

    isTaskInstructionsHeading(el) {
        if (!el) return false;
        return TASK_INSTRUCTIONS_RE.test(this.labelTextFromEl(el));
    },

    isInstructionIntro(el) {
        if (!el) return false;
        return INSTRUCTIONS_INTRO_RE.test(this.labelTextFromEl(el));
    },

    isAmberBox(el) {
        if (!el || !el.className) return false;
        const cls = String(el.className);
        return /\bborder-amber-200\b/.test(cls) && /\bbg-amber-50\b/.test(cls);
    },

    isAmberInstructionBody(el) {
        if (!el) return false;
        const box = el.closest && el.closest('div.rounded-lg.border');
        if (!box || !this.isAmberBox(box)) return false;
        const heading = box.querySelector('p');
        return heading ? this.isInstructionIntro(heading) : false;
    },

    isNotesFromTaskCreatorBody(el) {
        if (!el) return false;
        const cls = String(el.className || '');
        if (/\bborder-amber-200\b/.test(cls) || /\bbg-amber-50\b/.test(cls)) return true;
        let prev = el.previousElementSibling;
        while (prev) {
            if (prev.getAttribute && prev.getAttribute(REPLICA_MARKER) === 'true') {
                prev = prev.previousElementSibling;
                continue;
            }
            if (prev.tagName === 'LABEL' || prev.tagName === 'SPAN' || prev.tagName === 'DIV') {
                return this.labelTextFromEl(prev) === NOTES_FROM_TASK_CREATOR_LABEL;
            }
            break;
        }
        return false;
    },

    findBodyForLabel(label) {
        if (!label) return null;
        const parent = label.parentElement;
        if (!parent) return null;

        let sibling = label.nextElementSibling;
        while (sibling) {
            if (sibling.getAttribute && sibling.getAttribute(REPLICA_MARKER) === 'true') {
                sibling = sibling.nextElementSibling;
                continue;
            }
            if (sibling.matches && sibling.matches('.whitespace-pre-wrap')) {
                if (this.isNotesFromTaskCreatorBody(sibling)) {
                    sibling = sibling.nextElementSibling;
                    continue;
                }
                return sibling;
            }
            sibling = sibling.nextElementSibling;
        }

        const nestedAll = parent.querySelectorAll('.whitespace-pre-wrap');
        for (const nested of nestedAll) {
            if (nested.closest('[' + REPLICA_MARKER + '="true"]')) continue;
            if (this.isNotesFromTaskCreatorBody(nested)) continue;
            return nested;
        }
        return null;
    },

    findLabeledBodies(seen) {
        // label/span: native form fields (User Story only)
        // div.font-medium: section labels — User Story + Annotator Instructions (disputes modal / detail)
        const formLabels = document.querySelectorAll('label, span');
        const divLabels = document.querySelectorAll(
            'div.text-sm.text-muted-foreground.font-medium, div.font-medium.text-sm.text-muted-foreground'
        );
        const bodies = [];
        for (const el of formLabels) {
            if (!this.isUserStoryLabel(el)) continue;
            const body = this.findBodyForLabel(el);
            if (!body || seen.has(body) || this.isNotesFromTaskCreatorBody(body)) continue;
            seen.add(body);
            bodies.push(body);
        }
        for (const el of divLabels) {
            if (!this.isDivMarkdownLabel(el)) continue;
            const body = this.findBodyForLabel(el);
            if (!body || seen.has(body) || this.isNotesFromTaskCreatorBody(body)) continue;
            seen.add(body);
            bodies.push(body);
        }
        return bodies;
    },

    findCreationInstructionBodies(seen) {
        const dialogs = document.querySelectorAll('[role="alertdialog"], [role="dialog"]');
        const bodies = [];
        for (const dialog of dialogs) {
            const heading = dialog.querySelector('h2');
            if (!heading || !this.isTaskInstructionsHeading(heading)) continue;

            const quotes = dialog.querySelectorAll('blockquote.whitespace-pre-wrap');
            for (const quote of quotes) {
                if (seen.has(quote)) continue;
                if (quote.closest('[' + REPLICA_MARKER + '="true"]')) continue;
                if (this.isNotesFromTaskCreatorBody(quote)) continue;
                seen.add(quote);
                bodies.push(quote);
            }

            const intros = dialog.querySelectorAll('p');
            for (const intro of intros) {
                if (!this.isInstructionIntro(intro)) continue;
                const box = intro.closest('div.rounded-lg.border');
                if (!box || !this.isAmberBox(box)) continue;
                const candidates = box.querySelectorAll('div.whitespace-pre-wrap, p.whitespace-pre-wrap');
                for (const body of candidates) {
                    if (body === intro) continue;
                    if (seen.has(body)) continue;
                    if (body.closest('[' + REPLICA_MARKER + '="true"]')) continue;
                    seen.add(body);
                    bodies.push(body);
                }
            }
        }
        return bodies;
    },

    isBlueStoryBox(el) {
        if (!el || !el.className) return false;
        const cls = String(el.className);
        return /\bborder-blue-200\b/.test(cls) && /\bbg-blue-50\b/.test(cls);
    },

    findLeadingCheckmark(body) {
        if (!body || !body.closest) return null;
        const blueBox = body.closest('div.rounded-lg.border');
        if (!blueBox || !this.isBlueStoryBox(blueBox)) return null;
        const col = body.closest('div.flex-1');
        if (!col || !blueBox.contains(col)) return null;
        const prev = col.previousElementSibling;
        if (!prev || !prev.classList.contains('flex-shrink-0')) return null;
        const svg = prev.querySelector('svg');
        if (!svg || !svg.classList.contains('text-blue-600')) return null;
        return prev;
    },

    hideLeadingCheckmark(body) {
        const wrap = this.findLeadingCheckmark(body);
        if (!wrap) return;
        wrap.setAttribute(CHECKMARK_MARKER, 'true');
    },

    unhideLeadingCheckmark(body) {
        const wrap = this.findLeadingCheckmark(body);
        if (!wrap) return;
        const blueBox = wrap.closest('div.rounded-lg.border');
        if (blueBox && blueBox.querySelector('[' + ORIGINAL_MARKER + '="true"]')) return;
        wrap.removeAttribute(CHECKMARK_MARKER);
    },

    findCreationScenarioBodies(seen) {
        const intros = document.querySelectorAll('p');
        const bodies = [];
        for (const intro of intros) {
            if (!SCENARIO_INTRO_RE.test(this.labelTextFromEl(intro))) continue;

            const blueBox = intro.closest('div.rounded-lg.border');
            if (!blueBox || !this.isBlueStoryBox(blueBox)) continue;

            const scope = intro.parentElement || blueBox;
            const candidates = scope.querySelectorAll('p.whitespace-pre-wrap, div.whitespace-pre-wrap');
            for (const body of candidates) {
                if (body === intro) continue;
                if (seen.has(body)) continue;
                if (body.closest('[' + REPLICA_MARKER + '="true"]')) continue;
                if (this.isNotesFromTaskCreatorBody(body)) continue;
                seen.add(body);
                bodies.push(body);
            }
        }
        return bodies;
    },

    findBodies() {
        const seen = new Set();
        return this.findLabeledBodies(seen)
            .concat(this.findCreationInstructionBodies(seen))
            .concat(this.findCreationScenarioBodies(seen));
    },

    getVariant(body) {
        const cls = body.className || '';
        const isBlockquote = body.tagName === 'BLOCKQUOTE';
        const hasLeftAccent = /\bborder-l-4\b/.test(cls);
        const hasBlueFill = /\bbg-blue-50\b/.test(cls) || /\bborder-blue-200\b/.test(cls);

        if (this.isAmberInstructionBody(body)) {
            return 'creationAmber';
        }
        if (isBlockquote || (hasLeftAccent && !hasBlueFill)) {
            return 'creationQuote';
        }
        if (hasLeftAccent || hasBlueFill) {
            return 'modal';
        }
        if (/\bmt-2\b/.test(cls)) {
            return 'creationEmbedded';
        }
        return 'embedded';
    },

    escapeHtml(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    },

    stripWrappingQuotes(text) {
        let s = String(text || '').trim();
        const pairs = [
            ['\u201C', '\u201D'],
            ['"', '"'],
            ['\u2018', '\u2019'],
            ["'", "'"]
        ];
        let changed = true;
        while (changed && s.length >= 2) {
            changed = false;
            for (const [open, close] of pairs) {
                if (s.startsWith(open) && s.endsWith(close)) {
                    s = s.slice(open.length, s.length - close.length).trim();
                    changed = true;
                    break;
                }
            }
        }
        return s;
    },

    processInlines(escapedLine) {
        let s = escapedLine;
        s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
        s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, href) => {
            const safeHref = /^(https?:|mailto:|\/|#)/i.test(href) ? href : '#';
            return '<a href="' + safeHref + '" target="_blank" rel="noopener noreferrer">' + text + '</a>';
        });
        s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        // Autolink bare URLs only in text segments (not inside tags we just emitted).
        s = s.split(/(<[^>]+>)/).map((part, idx) => {
            if (idx % 2 === 1) return part;
            return part.replace(/(https?:\/\/[^\s<]+)/g, (url) => {
                const trimmed = url.replace(/[.,;:!?)]+$/, '');
                const trailing = url.slice(trimmed.length);
                return '<a href="' + trimmed + '" target="_blank" rel="noopener noreferrer">' + trimmed + '</a>' + trailing;
            });
        }).join('');
        return s;
    },

    markdownToHtml(md) {
        const raw = this.stripWrappingQuotes(md);
        if (!raw) return '';
        const lines = raw.split(/\r?\n/);
        const out = [];
        let listKind = null; // 'ul' | 'ol' | null

        const closeList = () => {
            if (listKind) {
                out.push('</' + listKind + '>');
                listKind = null;
            }
        };

        const openList = (kind) => {
            if (listKind === kind) return;
            closeList();
            listKind = kind;
            out.push('<' + kind + '>');
        };

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();
            if (trimmed === '') {
                closeList();
                continue;
            }

            const h4 = /^####\s+(.+)$/.exec(trimmed);
            const h3 = /^###\s+(.+)$/.exec(trimmed);
            const h2 = /^##\s+(.+)$/.exec(trimmed);
            const h1 = /^#\s+(.+)$/.exec(trimmed);
            const ul = /^[-•]\s+(.+)$/.exec(trimmed);
            const ol = /^\d+\.\s+(.+)$/.exec(trimmed);

            if (h1 || h2 || h3 || h4) {
                closeList();
                const content = this.processInlines(this.escapeHtml((h1 || h2 || h3 || h4)[1]));
                if (h1) out.push('<h1>' + content + '</h1>');
                else if (h2) out.push('<h2>' + content + '</h2>');
                else if (h3) out.push('<h3>' + content + '</h3>');
                else out.push('<h4>' + content + '</h4>');
                continue;
            }

            if (ul) {
                openList('ul');
                out.push('<li>' + this.processInlines(this.escapeHtml(ul[1])) + '</li>');
                continue;
            }

            if (ol) {
                openList('ol');
                out.push('<li>' + this.processInlines(this.escapeHtml(ol[1])) + '</li>');
                continue;
            }

            closeList();
            out.push('<p>' + this.processInlines(this.escapeHtml(trimmed)) + '</p>');
        }
        closeList();
        return out.join('');
    },

    replicaClassName(body) {
        const variant = this.getVariant(body);
        if (variant === 'creationAmber') return CREATION_AMBER_BODY_CLASSES;
        if (variant === 'creationQuote') return CREATION_QUOTE_CLASSES;
        if (variant === 'modal') return MODAL_FRAME_CLASSES;
        if (variant === 'creationEmbedded') return CREATION_EMBEDDED_BODY_CLASSES;
        return EMBEDDED_BODY_CLASSES;
    },

    syncReplica(original, replica) {
        if (!original || !replica) return;
        const next = original.textContent || '';
        if (replica.dataset.fleetUserStorySource === next) return;
        replica.dataset.fleetUserStorySource = next;
        replica.innerHTML = this.markdownToHtml(next);
    },

    detachObserver(entry) {
        if (entry && entry.observer) {
            entry.observer.disconnect();
            entry.observer = null;
        }
    },

    attachObserver(original, replica, entry) {
        if (entry.observer && entry.source === original) return;
        this.detachObserver(entry);
        const self = this;
        const observer = new MutationObserver(() => {
            self.syncReplica(original, replica);
        });
        observer.observe(original, {
            characterData: true,
            childList: true,
            subtree: true
        });
        if (typeof CleanupRegistry !== 'undefined' && CleanupRegistry.registerObserver) {
            CleanupRegistry.registerObserver(observer);
        }
        entry.observer = observer;
        entry.source = original;
        entry.replica = replica;
    },

    ensureReplica(body, state, logTag) {
        body.setAttribute(ORIGINAL_MARKER, 'true');
        this.hideLeadingCheckmark(body);

        let replica = body.nextElementSibling;
        if (!replica || replica.getAttribute(REPLICA_MARKER) !== 'true') {
            replica = document.createElement('div');
            replica.setAttribute(REPLICA_MARKER, 'true');
            replica.setAttribute(PROSE_ATTR, '');
            replica.setAttribute('data-fleet-plugin', logTag);
            body.insertAdjacentElement('afterend', replica);
        }

        replica.className = this.replicaClassName(body);
        replica.setAttribute(PROSE_ATTR, '');
        this.syncReplica(body, replica);

        let entry = state.activeByBody.get(body);
        if (!entry) {
            entry = { observer: null, source: null, replica: null };
            state.activeByBody.set(body, entry);
        }
        this.attachObserver(body, replica, entry);
    },

    teardownBody(body, entry) {
        this.detachObserver(entry);
        if (body && body.getAttribute(ORIGINAL_MARKER) === 'true') {
            body.removeAttribute(ORIGINAL_MARKER);
        }
        const replica = body && body.nextElementSibling;
        if (replica && replica.getAttribute(REPLICA_MARKER) === 'true') {
            replica.remove();
        }
        this.unhideLeadingCheckmark(body);
    },

    teardownAll(state, logTag) {
        if (!state.activeByBody || state.activeByBody.size === 0) return;
        for (const [body, entry] of state.activeByBody.entries()) {
            this.teardownBody(body, entry);
        }
        state.activeByBody.clear();
        if (state.activationLogged) {
            Logger.debug('User Story markdown replicas cleared');
            state.activationLogged = false;
        }
    },

    run(state, options) {
        const logTag = (options && (options.logTag || options.pluginId)) || 'userStoryMarkdown';

        if (!state.activeByBody) {
            state.activeByBody = new Map();
        }

        const bodies = this.findBodies();
        if (bodies.length === 0) {
            if (state.activeByBody.size > 0) {
                this.teardownAll(state, logTag);
            }
            if (!state.missingLogged) {
                Logger.debug('User Story body not found yet');
                state.missingLogged = true;
            }
            return;
        }
        state.missingLogged = false;

        this.ensureHideStyles(state);
        this.ensureProseStyles();

        const live = new Set(bodies);
        for (const [body, entry] of Array.from(state.activeByBody.entries())) {
            if (!live.has(body) || !body.isConnected) {
                this.teardownBody(body, entry);
                state.activeByBody.delete(body);
            }
        }

        for (const body of bodies) {
            this.ensureReplica(body, state, logTag);
        }

        if (!state.activationLogged) {
            Logger.log('User Story markdown replicas active (' + bodies.length + ')');
            state.activationLogged = true;
        }
    }
};

const plugin = {
    id: 'userStoryMarkdownLib',
    name: 'User Story Markdown (library)',
    description: 'Shared User Story markdown rendering',
    _version: '1.10',
    phase: 'core',
    enabledByDefault: true,
    initialState: { registered: false },

    init(state) {
        Context.userStoryMarkdown = {
            run: (s, options) => UserStoryMarkdownApi.run(s, options),
            markdownToHtml: (md) => UserStoryMarkdownApi.markdownToHtml(md),
            ensureProseStyles: () => UserStoryMarkdownApi.ensureProseStyles(),
            PROSE_ATTR
        };
        if (!state.registered) {
            Logger.log('module registered (Context.userStoryMarkdown)');
            state.registered = true;
        }
    }
};

return plugin;
},
        "libs/user-story-collapse.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {
// ============= user-story-collapse.js (library) =============
// Hide/Show User Story (or creation scenario / annotator instructions) body
// from a right-aligned toggle on the label.

const SCOPE = '[data-fleet-user-story-collapse="1"]';
const CONTAINER_ATTR = 'data-fleet-user-story-collapse';
const TOGGLE_SLOT = 'user-story-collapse-toggle';
const HIDDEN_ATTR = 'data-fleet-user-story-section-hidden';
const SAVED_DISPLAY_ATTR = 'data-fleet-user-story-saved-display';
const OLD_HEADER_ATTR = 'data-fleet-user-story-header';
const KIND_ATTR = 'data-fleet-collapse-kind';
const LABEL_TEXT = 'User Story';
const SCENARIO_INTRO_RE = /Write a problem inspired by the following scenario/i;
const INSTRUCTIONS_INTRO_RE = /^\s*Instructions for Task Creation:?\s*$/i;
const ORIGINAL_MARKER = 'data-fleet-user-story-original';
const REPLICA_MARKER = 'data-fleet-user-story-replica';
const PROSE_ATTR = 'data-fleet-user-story-prose';

const UserStoryCollapseApi = {
    id: 'userStoryCollapse',

    normalizeLabelText(text) {
        return String(text || '').replace(/\s+/g, ' ').trim();
    },

    isUserStoryLabel(el) {
        if (!el) return false;
        const clone = el.cloneNode(true);
        clone.querySelectorAll('[data-slot="' + TOGGLE_SLOT + '"]').forEach((n) => n.remove());
        return this.normalizeLabelText(clone.textContent) === LABEL_TEXT;
    },

    isScenarioIntro(el) {
        if (!el || el.tagName !== 'P') return false;
        const clone = el.cloneNode(true);
        clone.querySelectorAll('[data-slot="' + TOGGLE_SLOT + '"]').forEach((n) => n.remove());
        return SCENARIO_INTRO_RE.test(this.normalizeLabelText(clone.textContent));
    },

    isInstructionIntro(el) {
        if (!el || el.tagName !== 'P') return false;
        const clone = el.cloneNode(true);
        clone.querySelectorAll('[data-slot="' + TOGGLE_SLOT + '"]').forEach((n) => n.remove());
        return INSTRUCTIONS_INTRO_RE.test(this.normalizeLabelText(clone.textContent));
    },

    isSectionHeader(el) {
        return this.isUserStoryLabel(el) || this.isScenarioIntro(el) || this.isInstructionIntro(el);
    },

    sectionNoun(kind) {
        return kind === 'instructions' ? 'Instructions' : 'User Story';
    },

    isStoryBody(el) {
        if (!el || !el.getAttribute) return false;
        if (el.getAttribute(ORIGINAL_MARKER) === 'true') return true;
        if (el.getAttribute(REPLICA_MARKER) === 'true') return true;
        if (el.hasAttribute(PROSE_ATTR)) return true;
        if (el.classList && el.classList.contains('whitespace-pre-wrap')) return true;
        return false;
    },

    collectBodiesInContainer(container, headerEl) {
        const bodies = [];
        if (!container) return bodies;
        for (const child of container.children) {
            if (child === headerEl) continue;
            if (child.querySelector && child.querySelector('[data-slot="' + TOGGLE_SLOT + '"]') && !this.isStoryBody(child)) {
                // skip leftover empty header wrappers
                if (child.getAttribute(OLD_HEADER_ATTR) === '1') continue;
            }
            if (child.getAttribute && child.getAttribute(OLD_HEADER_ATTR) === '1') continue;
            if (this.isStoryBody(child)) bodies.push(child);
        }
        return bodies;
    },

    findSections() {
        const seenParents = new Set();
        const sections = [];

        const labels = document.querySelectorAll('label, span');
        for (const label of labels) {
            if (!this.isUserStoryLabel(label)) continue;
            // Skip labels still stuck inside obsolete wrapper rows
            const parent = label.parentElement;
            if (!parent) continue;
            const container =
                parent.getAttribute && parent.getAttribute(OLD_HEADER_ATTR) === '1'
                    ? parent.parentElement
                    : parent;
            if (!container || seenParents.has(container)) continue;
            const bodies = this.collectBodiesInContainer(container, label);
            if (bodies.length === 0) continue;
            seenParents.add(container);
            sections.push({ kind: 'label', headerEl: label, container, bodies });
        }

        const intros = document.querySelectorAll('p');
        for (const intro of intros) {
            if (!this.isScenarioIntro(intro)) continue;
            const parent = intro.parentElement;
            if (!parent) continue;
            const container =
                parent.getAttribute && parent.getAttribute(OLD_HEADER_ATTR) === '1'
                    ? parent.parentElement
                    : parent;
            if (!container || seenParents.has(container)) continue;
            const bodies = this.collectBodiesInContainer(container, intro);
            if (bodies.length === 0) continue;
            seenParents.add(container);
            sections.push({ kind: 'scenario', headerEl: intro, container, bodies });
        }

        for (const intro of intros) {
            if (!this.isInstructionIntro(intro)) continue;
            const parent = intro.parentElement;
            if (!parent) continue;
            const container =
                parent.getAttribute && parent.getAttribute(OLD_HEADER_ATTR) === '1'
                    ? parent.parentElement
                    : parent;
            if (!container || seenParents.has(container)) continue;
            const bodies = this.collectBodiesInContainer(container, intro);
            if (bodies.length === 0) continue;
            seenParents.add(container);
            sections.push({ kind: 'instructions', headerEl: intro, container, bodies });
        }

        return sections;
    },

    cleanupOrphanHeaders(container) {
        if (!container) return;
        const orphans = container.querySelectorAll('[' + OLD_HEADER_ATTR + '="1"]');
        for (const row of orphans) {
            // Move any real label/intro back out, then remove the wrapper
            const keep = [];
            for (const child of Array.from(row.children)) {
                if (child.getAttribute && child.getAttribute('data-slot') === TOGGLE_SLOT) {
                    child.remove();
                    continue;
                }
                keep.push(child);
            }
            for (const child of keep) {
                container.insertBefore(child, row);
            }
            row.remove();
        }
    },

    isSectionHidden(bodies) {
        return bodies.some(
            (b) => b.getAttribute(HIDDEN_ATTR) === '1' || b.style.display === 'none'
        );
    },

    setBodiesHidden(bodies, hidden) {
        for (const body of bodies) {
            if (hidden) {
                if (!body.hasAttribute(SAVED_DISPLAY_ATTR)) {
                    body.setAttribute(SAVED_DISPLAY_ATTR, body.style.display || '');
                }
                body.style.display = 'none';
                body.setAttribute(HIDDEN_ATTR, '1');
            } else {
                const saved = body.getAttribute(SAVED_DISPLAY_ATTR);
                body.style.display = saved != null ? saved : '';
                body.removeAttribute(SAVED_DISPLAY_ATTR);
                body.removeAttribute(HIDDEN_ATTR);
            }
        }
    },

    applyHeaderLayout(headerEl) {
        headerEl.style.display = 'flex';
        headerEl.style.alignItems = 'center';
        headerEl.style.justifyContent = 'space-between';
        headerEl.style.width = '100%';
        headerEl.style.gap = '8px';
    },

    applyToggleChrome(btn) {
        if (Context.uiLib && typeof Context.uiLib.btnClass === 'function') {
            btn.className = Context.uiLib.btnClass('basic', 'compact');
        } else {
            btn.className =
                'inline-flex items-center justify-center whitespace-nowrap rounded-sm font-medium h-7 text-xs pl-2 pr-2 py-1';
        }
        btn.style.flexShrink = '0';
        btn.style.marginLeft = 'auto';
        btn.style.pointerEvents = 'auto';
        btn.style.position = 'relative';
        btn.style.zIndex = '2';
    },

    syncToggleLabel(btn, hidden, kind) {
        const noun = this.sectionNoun(kind || (btn && btn.getAttribute(KIND_ATTR)) || 'story');
        const label = hidden ? 'Show' : 'Hide';
        btn.textContent = label;
        btn.setAttribute('aria-label', hidden ? 'Show ' + noun : 'Hide ' + noun);
        btn.title = btn.getAttribute('aria-label');
    },

    findToggleInContainer(container, logTag) {
        return (
            container.querySelector(
                '[data-fleet-plugin="' + logTag + '"][data-slot="' + TOGGLE_SLOT + '"]'
            ) || container.querySelector('[data-slot="' + TOGGLE_SLOT + '"]')
        );
    },

    ensureToggle(section, logTag) {
        const { headerEl, container, kind } = section;
        if (!headerEl || !container) return;

        this.cleanupOrphanHeaders(container);
        container.setAttribute(CONTAINER_ATTR, '1');

        if (Context.uiLib && typeof Context.uiLib.ensureButtonStyles === 'function') {
            Context.uiLib.ensureButtonStyles(SCOPE);
        }

        // Re-resolve header if cleanup moved nodes
        let header = headerEl;
        if (!header.isConnected || !container.contains(header)) {
            header =
                Array.from(container.children).find((el) => this.isSectionHeader(el)) || headerEl;
        }

        this.applyHeaderLayout(header);

        let btn = this.findToggleInContainer(container, logTag);
        const bodies = this.collectBodiesInContainer(container, header);
        const hidden = this.isSectionHidden(bodies);
        const noun = this.sectionNoun(kind);

        if (btn) {
            // Prefer button living on the live header
            if (btn.parentElement !== header && header.isConnected) {
                header.appendChild(btn);
            }
            btn.setAttribute(KIND_ATTR, kind || 'story');
            this.applyToggleChrome(btn);
            this.syncToggleLabel(btn, hidden, kind);
            if (hidden) this.setBodiesHidden(bodies, true);
            return;
        }

        btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('data-fleet-plugin', logTag);
        btn.setAttribute('data-slot', TOGGLE_SLOT);
        btn.setAttribute(KIND_ATTR, kind || 'story');
        this.applyToggleChrome(btn);
        this.syncToggleLabel(btn, hidden, kind);

        const self = this;
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const liveKind = btn.getAttribute(KIND_ATTR) || kind || 'story';
            const liveContainer =
                btn.closest('[' + CONTAINER_ATTR + '="1"]') || container;
            const liveHeader =
                Array.from(liveContainer.children).find((el) => self.isSectionHeader(el))
                || btn.parentElement;
            const liveBodies = self.collectBodiesInContainer(liveContainer, liveHeader);
            if (liveBodies.length === 0) {
                Logger.warn('click — no ' + self.sectionNoun(liveKind) + ' bodies found in container');
                return;
            }
            const nowHidden = self.isSectionHidden(liveBodies);
            self.setBodiesHidden(liveBodies, !nowHidden);
            self.syncToggleLabel(btn, !nowHidden, liveKind);
            self.applyToggleChrome(btn);
            Logger.log(self.sectionNoun(liveKind) + ' ' +
                    (!nowHidden ? 'hidden' : 'shown') +
                    ' (' +
                    liveBodies.length +
                    ' nodes)'
            );
        });

        header.appendChild(btn);
        if (typeof CleanupRegistry !== 'undefined' && CleanupRegistry.registerElement) {
            CleanupRegistry.registerElement(btn);
        }
        Logger.debug('Hide/Show control ready on ' + noun + ' row');

        if (hidden) this.setBodiesHidden(bodies, true);
    },

    run(state, options) {
        const logTag = (options && (options.logTag || options.pluginId)) || this.id;
        const sections = this.findSections();

        if (sections.length === 0) {
            if (state.activationLogged) {
                Logger.debug('User Story sections gone — idle');
                state.activationLogged = false;
            }
            if (!state.missingLogged) {
                Logger.debug('no User Story section yet');
                state.missingLogged = true;
            }
            return;
        }

        state.missingLogged = false;
        for (const section of sections) {
            this.ensureToggle(section, logTag);
        }

        if (!state.activationLogged) {
            Logger.log('User Story collapse active (' + sections.length + ' section(s))');
            state.activationLogged = true;
        }
    }
};

const plugin = {
    id: 'userStoryCollapseLib',
    name: 'User Story Collapse (library)',
    description: 'Shared Hide/Show for User Story bodies',
    _version: '1.6',
    phase: 'core',
    enabledByDefault: true,
    initialState: { registered: false },

    init(state) {
        Context.userStoryCollapse = {
            run: (s, options) => {
                const impl = Object.create(UserStoryCollapseApi);
                if (options && options.pluginId) impl.id = options.pluginId;
                return UserStoryCollapseApi.run.call(impl, s, options);
            }
        };
        if (!state.registered) {
            Logger.log('module registered (Context.userStoryCollapse)');
            state.registered = true;
        }
    }
};

return plugin;
},
        "archetypes/tool-use-task-creation/main/notes-resize-handle.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {
// ============= notes-resize-handle.js =============
// Thin wrapper: shared Context.notesResizeHandle library.

const plugin = {
    id: 'notesResizeHandle',
    name: 'Notes Resize Handle',
    description: 'Adds a vertical resize handle to the QA reviewer notes textarea',
    _version: '1.2',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: { missingLogged: false },

    onMutation(state) {
        const api = Context.notesResizeHandle;
        if (!api || typeof api.run !== 'function') {
            return;
        }
        api.run(state, { logTag: this.id });
    }
};

return plugin;
},
        "archetypes/tool-use-task-creation/main/prompt-text-counter.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {
// ============= prompt-text-counter.js =============
// Thin wrapper: shared Context.promptTextCounter library.

const plugin = {
    id: 'promptTextCounter',
    name: 'Prompt Text Counter',
    description: 'Shows a live word and character count below the prompt',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: { missingLogged: false, activationLogged: false, boundTextarea: null },

    onMutation(state) {
        const api = Context.promptTextCounter;
        if (!api || typeof api.run !== 'function') {
            return;
        }
        api.run(state, { logTag: this.id, pluginId: this.id });
    }
};

return plugin;
},
        "archetypes/tool-use-task-creation/main/text-sanitizer.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {
// ============= text-sanitizer.js =============
// Adds a Text Sanitizer module in the same area as the QA scratchpad (below it when present).
// Independent of scratchpad: appears after Prompt section or after scratchpad/guideline buttons.
// Actions: dropdown + Execute. Date/Time to ISO is first and default. Date/Time to ISO uses a working ISO 8601 converter (date + optional time).

const DEFAULT_ACTION_ID = 'dateTimeToIso';

const MONTHS = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
    jan: 1, feb: 2, mar: 3, apr: 4, jun: 6,
    jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12
};

const MP = '(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Sept?|Jun|Jul|Aug|Oct|Nov|Dec)\\.?';

/**
 * Parse date and optional time from normalized input (single spaces, trimmed).
 * Returns { iso } or null. ISO is local time, no Z suffix.
 */
function parseDateInputToIso(text) {
    let year;
    let month;
    let day;
    let dateStr;

    const patterns = [
        { re: new RegExp(`(${MP})\\s+(\\d{1,2})\\s*(?:st|nd|rd|th)?\\s*,?\\s*(\\d{4})`, 'i'),
          parse: m => ({ month: MONTHS[m[1].replace('.', '').toLowerCase()], day: +m[2], year: +m[3] }) },
        { re: new RegExp(`(\\d{1,2})\\s*(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MP})\\s*,?\\s*(\\d{4})`, 'i'),
          parse: m => ({ day: +m[1], month: MONTHS[m[2].replace('.', '').toLowerCase()], year: +m[3] }) },
        { re: new RegExp(`(\\d{4})\\s+(?:,\\s*)?(${MP})\\s+(\\d{1,2})\\s*(?:st|nd|rd|th)?`, 'i'),
          parse: m => ({ year: +m[1], month: MONTHS[m[2].replace('.', '').toLowerCase()], day: +m[3] }) },
        { re: /(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/,
          parse: m => ({ year: +m[1], month: +m[2], day: +m[3] }) },
        { re: /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/,
          parse: m => ({ month: +m[1], day: +m[2], year: +m[3] }) }
    ];

    for (const p of patterns) {
        const m = text.match(p.re);
        if (m) {
            ({ year, month, day } = p.parse(m));
            dateStr = m[0];
            break;
        }
    }

    if (year === undefined) return null;
    if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1) return null;
    const testDate = new Date(year, month - 1, day);
    if (testDate.getMonth() !== month - 1 || testDate.getDate() !== day) return null;

    let remainder = text.replace(dateStr, ' ');
    let hours = null;
    let minutes = null;
    let seconds = null;

    if (/\bnoon\b/i.test(remainder)) {
        hours = 12;
        minutes = 0;
        seconds = 0;
    } else if (/\bmidnight\b/i.test(remainder)) {
        hours = 0;
        minutes = 0;
        seconds = 0;
    }

    if (hours === null) {
        const tm = remainder.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?/i);
        if (tm) {
            hours = +tm[1];
            minutes = +tm[2];
            seconds = tm[3] ? +tm[3] : 0;
            const ap = (tm[4] || '').replace(/\./g, '').toLowerCase();
            if (ap === 'pm' && hours !== 12) hours += 12;
            if (ap === 'am' && hours === 12) hours = 0;
        }
    }

    if (hours === null) {
        const tm = remainder.match(/(\d{1,2})\s*(am|pm|a\.m\.|p\.m\.)/i);
        if (tm) {
            hours = +tm[1];
            minutes = 0;
            seconds = 0;
            const ap = tm[2].replace(/\./g, '').toLowerCase();
            if (ap === 'pm' && hours !== 12) hours += 12;
            if (ap === 'am' && hours === 12) hours = 0;
        }
    }

    if (hours !== null) {
        if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59) return null;
    }

    const pad = (n, w = 2) => String(n).padStart(w, '0');
    let iso = `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
    if (hours !== null) iso += `T${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;

    return { iso };
}

const plugin = {
    id: 'textSanitizer',
    name: 'Text Sanitizer',
    description: 'Adds a text sanitizer utility for quickly cleaning and transforming text',
    _version: '4.2',
    enabledByDefault: false,
    phase: 'mutation',

    initialState: {
        promptMissingLogged: false,
        copyFeedbackTimeoutId: null,
    },

    onMutation(state, context) {
        const promptPanel = document.querySelector('[data-ui="prompt-panel"]');
        const tabBars = this.findTaskNotesTabBars(promptPanel);

        if (tabBars.length === 0) {
            const promptSection = this.findPromptSection(promptPanel || document);
            if (!promptSection) {
                if (!state.promptMissingLogged) {
                    state.promptMissingLogged = true;
                    Logger.debug('Text Sanitizer: Prompt section not found');
                }
                return;
            }
            state.promptMissingLogged = false;
            const anchor = this.getInsertAnchor(promptSection);
            this.ensureTextSanitizerBelowAnchor(state, anchor);
            return;
        }

        for (const tabBar of tabBars) {
            const contentRoot = this.getPanelContentRoot(tabBar);
            if (!contentRoot) continue;

            if (!this.isTaskTabActive(tabBar)) {
                contentRoot.querySelectorAll('[data-qa-text-sanitizer="true"]').forEach((el) => {
                    el.remove();
                    Logger.debug('Text Sanitizer: Removed from panel (Notes tab active)');
                });
                continue;
            }

            const promptSection = this.findPromptSection(contentRoot);
            if (!promptSection) continue;

            state.promptMissingLogged = false;
            const anchor = this.getInsertAnchor(promptSection);
            this.ensureTextSanitizerBelowAnchor(state, anchor);
        }
    },

    findPromptSection(scopeRoot) {
        const root = scopeRoot || document;
        if (root.querySelector && root.querySelector('#prompt-editor')) {
            const promptEditor = root.querySelector('#prompt-editor');
            const section = promptEditor.closest('div.space-y-2.relative') || promptEditor.closest('div.space-y-2') || promptEditor.closest('div.flex.flex-col.gap-2');
            if (section) return section;
        }
        const options = { context: `${this.id}.findPromptSection`, root };

        // Label-based fallback: find "Prompt" or "Problem Description" label then climb to section wrapper (resilient to DOM changes).
        const labelSelectors = ['span.text-sm.text-muted-foreground.font-medium', 'div.text-sm.text-muted-foreground.font-medium'];
        for (const sel of labelSelectors) {
            const elements = Context.dom.queryAll(sel, options);
            for (const el of elements) {
                const text = (el.textContent || '').trim();
                const isPrompt = text === 'Prompt' || text.startsWith('Prompt');
                const isProblemDesc = text === 'Problem Description' || text.startsWith('Problem Description');
                if (!isPrompt && !isProblemDesc) continue;
                const section = el.closest('div.space-y-2.relative') || el.closest('div.space-y-2') || el.closest('div.flex.flex-col.gap-2');
                if (section) return section;
            }
        }

        const candidates = Context.dom.queryAll('div.flex.flex-col.gap-2', options);
        for (const candidate of candidates) {
            const label = candidate.querySelector('label');
            const span = candidate.querySelector('span.text-sm.text-muted-foreground.font-medium');
            if (label && label.textContent.trim() === 'Prompt') return candidate;
            if (span && span.textContent.trim() === 'Prompt') return candidate;
        }
        return null;
    },

    /**
     * Returns the element after which to insert. Walk nextElementSibling while sibling is
     * scratchpad, guideline buttons, or our own container; use last such as anchor.
     * On task-creation, prefer inserting after the Scratchpad (div.mt-3 with "Scratchpad" label).
     */
    getInsertAnchor(promptSection) {
        let anchor = promptSection;
        let el = promptSection.nextElementSibling;
        while (el) {
            if (el.dataset && el.dataset.qaScratchpad === 'true') {
                anchor = el;
            } else if (el.getAttribute && el.getAttribute('data-fleet-plugin') === 'guidelineButtons') {
                anchor = el;
            } else if (el.dataset && el.dataset.qaTextSanitizer === 'true') {
                anchor = el;
            } else if (el.classList && el.classList.contains('mt-3')) {
                const label = el.querySelector('label');
                if (label && (label.textContent || '').trim().startsWith('Scratchpad')) {
                    anchor = el;
                }
            }
            el = el.nextElementSibling;
        }
        return anchor;
    },

    findTaskNotesTabBars(scopeRoot) {
        const root = scopeRoot || document;
        const tabBars = [];
        const candidates = root.querySelectorAll('div.flex.items-center.gap-1.px-2.border-b');
        for (const el of candidates) {
            const buttons = el.querySelectorAll('button');
            let hasTask = false;
            let hasNotes = false;
            for (const btn of buttons) {
                const text = btn.textContent.trim();
                if (text === 'Task') hasTask = true;
                if (text === 'Notes') hasNotes = true;
            }
            if (hasTask && hasNotes) tabBars.push(el);
        }
        return tabBars;
    },

    isTaskTabActive(tabBar) {
        const taskBtn = Array.from(tabBar.querySelectorAll('button')).find(
            (btn) => btn.textContent.trim() === 'Task'
        );
        if (!taskBtn) return false;
        const c = taskBtn.className || '';
        return c.includes('border-primary') || c.includes('text-primary');
    },

    getPanelContentRoot(tabBar) {
        const panel = tabBar.parentElement;
        if (!panel || !panel.querySelector) return null;
        const found = panel.querySelector('div.flex-1.min-h-0.overflow-auto.p-3') || panel.querySelector('div.overflow-auto');
        if (found) return found;
        return panel.parentElement || null;
    },

    /**
     * Parse date and optional time from text; return ISO 8601 (local time, no Z).
     * Based on the working ISO 8601 converter. Returns original input on failure or when no date found.
     */
    parseDateThenTimeToIso(text) {
        try {
            const raw = (text || '').trim().replace(/\s+/g, ' ');
            if (!raw) return text || '';

            const result = parseDateInputToIso(raw);
            return result ? result.iso : text;
        } catch (e) {
            Logger.warn('Text Sanitizer: parseDateThenTimeToIso failed', e);
            return text || '';
        }
    },

    findExistingTextSanitizerAmongSiblings(anchor) {
        let el = anchor.nextElementSibling;
        while (el) {
            if (el.dataset && el.dataset.qaTextSanitizer === 'true') return el;
            el = el.nextElementSibling;
        }
        return null;
    },

    findAllTextSanitizersAmongSiblings(anchor) {
        const found = [];
        let el = anchor.nextElementSibling;
        while (el) {
            if (el.dataset && el.dataset.qaTextSanitizer === 'true') found.push(el);
            el = el.nextElementSibling;
        }
        return found;
    },

    ensureTextSanitizerBelowAnchor(state, anchor) {
        if (anchor.dataset && anchor.dataset.qaTextSanitizer === 'true') {
            const duplicates = this.findAllTextSanitizersAmongSiblings(anchor);
            duplicates.forEach((el) => {
                el.remove();
                Logger.debug('Text Sanitizer: Removed duplicate');
            });
            return;
        }

        const existing = this.findExistingTextSanitizerAmongSiblings(anchor);
        if (existing) {
            const all = this.findAllTextSanitizersAmongSiblings(anchor);
            if (all.length > 1) {
                for (let i = 1; i < all.length; i++) {
                    all[i].remove();
                    Logger.debug('Text Sanitizer: Removed duplicate');
                }
            }
            const remaining = this.findAllTextSanitizersAmongSiblings(anchor);
            const toUse = remaining.length > 0 ? remaining[0] : existing;
            if (toUse && toUse !== anchor.nextElementSibling) {
                anchor.insertAdjacentElement('afterend', toUse);
                Logger.debug('Text Sanitizer: Moved to follow anchor');
            }
            return;
        }

        // Remove any sanitizer already in this container but in the wrong place (e.g. after prompt when anchor is scratchpad).
        const parent = anchor.parentElement;
        if (parent) {
            parent.querySelectorAll('[data-qa-text-sanitizer="true"]').forEach((el) => {
                el.remove();
                Logger.debug('Text Sanitizer: Removed from wrong position');
            });
        }
        const container = this.createContainer(state);
        anchor.insertAdjacentElement('afterend', container);
        Logger.log('Text Sanitizer: Inserted below scratchpad area');
    },

    createContainer(state) {
        const container = document.createElement('div');
        container.className = 'flex flex-col gap-2';
        container.dataset.qaTextSanitizer = 'true';
        container.setAttribute('data-fleet-plugin', this.id);

        const ONE_LINE_HEIGHT = 40;
        const MIN_WRAPPER_HEIGHT = 60;
        const RESIZE_HANDLE_HEIGHT = 12;

        const textareaWrapper = document.createElement('div');
        textareaWrapper.className = 'relative flex flex-col rounded-md overflow-hidden border border-input bg-background shadow-sm';
        textareaWrapper.dataset.qaTextSanitizerWrapper = 'true';
        textareaWrapper.style.minHeight = ONE_LINE_HEIGHT + 'px';
        textareaWrapper.style.height = ONE_LINE_HEIGHT + 'px';

        const textarea = document.createElement('textarea');
        textarea.className = 'w-full border-0 bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0 resize-none overflow-y-auto flex-1 min-h-0';
        textarea.placeholder = 'Paste text to sanitize…';
        textarea.rows = 1;
        textarea.dataset.qaTextSanitizerTextarea = 'true';
        textarea.style.height = ONE_LINE_HEIGHT + 'px';

        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'absolute bottom-0 left-0 right-0 h-3 cursor-ns-resize flex items-center justify-center transition-opacity duration-200 flex-shrink-0';
        resizeHandle.style.opacity = '0';
        resizeHandle.style.display = 'none';
        resizeHandle.style.background = 'transparent';
        const handleBar = document.createElement('div');
        handleBar.className = 'w-10 h-1 rounded-sm bg-current opacity-30';
        resizeHandle.appendChild(handleBar);

        const setWrapperOneLine = () => {
            textareaWrapper.style.height = ONE_LINE_HEIGHT + 'px';
            textarea.style.height = ONE_LINE_HEIGHT + 'px';
            resizeHandle.style.display = 'none';
        };

        const updateTextareaHeight = () => {
            const content = textarea.value || '';
            const isEmpty = !content.trim();
            const hasMultiLine = !isEmpty && (content.includes('\n') || textarea.scrollHeight > ONE_LINE_HEIGHT);
            if (hasMultiLine) {
                resizeHandle.style.display = 'flex';
                resizeHandle.style.opacity = '1';
                if (parseInt(textareaWrapper.style.height, 10) <= ONE_LINE_HEIGHT) {
                    textareaWrapper.style.height = '80px';
                    textarea.style.height = (80 - RESIZE_HANDLE_HEIGHT) + 'px';
                }
            } else {
                resizeHandle.style.display = 'none';
                resizeHandle.style.opacity = '0';
                setWrapperOneLine();
            }
        };

        const onInput = () => updateTextareaHeight();
        textarea.addEventListener('input', onInput);
        CleanupRegistry.registerEventListener(textarea, 'input', onInput);

        let isResizing = false;
        let startY = 0;
        let startHeight = 0;
        const handleMouseDown = (e) => {
            isResizing = true;
            startY = e.clientY;
            startHeight = textareaWrapper.offsetHeight;
            e.preventDefault();
            e.stopPropagation();
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = 'ns-resize';
            document.body.style.userSelect = 'none';
        };
        const handleMouseMove = (e) => {
            if (!isResizing) return;
            const deltaY = e.clientY - startY;
            const requested = startHeight + deltaY;
            const maxHeight = textarea.scrollHeight + RESIZE_HANDLE_HEIGHT;
            const newHeight = Math.max(MIN_WRAPPER_HEIGHT, Math.min(maxHeight, requested));
            textareaWrapper.style.height = newHeight + 'px';
            textarea.style.height = (newHeight - RESIZE_HANDLE_HEIGHT) + 'px';
        };
        const handleMouseUp = () => {
            if (!isResizing) return;
            isResizing = false;
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
        resizeHandle.addEventListener('mousedown', handleMouseDown);
        CleanupRegistry.registerEventListener(resizeHandle, 'mousedown', handleMouseDown);

        textareaWrapper.addEventListener('mouseenter', () => { if (resizeHandle.style.display === 'flex') resizeHandle.style.opacity = '1'; });
        textareaWrapper.addEventListener('mouseleave', () => { if (resizeHandle.style.display === 'flex') resizeHandle.style.opacity = '0.6'; });

        textareaWrapper.appendChild(textarea);
        textareaWrapper.appendChild(resizeHandle);
        container.appendChild(textareaWrapper);

        const header = document.createElement('div');
        header.className = 'flex items-center justify-between gap-2';
        const label = document.createElement('span');
        label.className = 'text-sm text-muted-foreground font-medium';
        label.textContent = 'Text Sanitizer';
        header.appendChild(label);
        container.insertBefore(header, textareaWrapper);

        const actionRow = document.createElement('div');
        actionRow.className = 'flex flex-wrap items-center gap-2';
        const copyBtn = this.createCopyButton(state, { onAfterClear: setWrapperOneLine });
        copyBtn.style.marginLeft = 'auto';

        const select = document.createElement('select');
        select.setAttribute('data-fleet-plugin', this.id);
        select.className = 'h-8 rounded-sm border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';
        const actionIds = ['dateTimeToIso', 'removeAllWhitespace', 'trimWhitespace', 'removeSpecialCharacters'];
        actionIds.forEach((id) => {
            const action = this.actions[id];
            if (!action) return;
            const opt = document.createElement('option');
            opt.value = id;
            opt.textContent = action.label;
            if (id === DEFAULT_ACTION_ID) opt.selected = true;
            select.appendChild(opt);
        });
        select.value = DEFAULT_ACTION_ID;

        const buttonClass = 'inline-flex items-center justify-center whitespace-nowrap font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background transition-colors hover:bg-accent hover:text-accent-foreground h-8 rounded-sm pl-3 pr-3 text-xs';
        const executeBtn = document.createElement('button');
        executeBtn.type = 'button';
        executeBtn.className = buttonClass;
        executeBtn.setAttribute('data-fleet-plugin', this.id);
        executeBtn.textContent = 'Execute';
        const onExecute = () => {
            const id = select.value;
            const action = this.actions[id];
            if (!action) return;
            const input = textarea.value || '';
            let ok = true;
            try {
                const output = action.run(input);
                textarea.value = output;
                updateTextareaHeight();
                Logger.log('Text Sanitizer: Executed ' + action.label);
            } catch (e) {
                Logger.error('Text Sanitizer: Execute failed', e);
                textarea.value = input;
                ok = false;
            }
            if (ok) {
                if (Context.buttonFeedback) Context.buttonFeedback.flashSuccess(executeBtn, { restoreStyles: false });
            } else if (Context.buttonFeedback) {
                Context.buttonFeedback.flashFailure(executeBtn, { restoreStyles: false });
            }
        };
        CleanupRegistry.registerEventListener(executeBtn, 'click', onExecute);

        actionRow.appendChild(select);
        actionRow.appendChild(executeBtn);
        actionRow.appendChild(copyBtn);
        container.appendChild(actionRow);

        return container;
    },

    createCopyButton(state, opts) {
        const buttonClass = 'inline-flex items-center justify-center whitespace-nowrap font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background transition-colors hover:bg-accent hover:text-accent-foreground h-8 rounded-sm pl-3 pr-3 text-xs';
        const button = document.createElement('button');
        button.type = 'button';
        button.setAttribute('data-fleet-plugin', this.id);
        button.className = buttonClass;
        button.textContent = 'Copy';
        button.title = 'Copy text';
        button.setAttribute('aria-label', 'Copy text');

        const pulseCopyFailure = () => {
            if (Context.buttonFeedback) Context.buttonFeedback.flashFailure(button, { restoreStyles: false });
        };
        const handleCopy = () => {
            const container = button.closest('[data-qa-text-sanitizer="true"]');
            const textarea = container ? container.querySelector('[data-qa-text-sanitizer-textarea="true"]') : null;
            if (!textarea) {
                pulseCopyFailure();
                return;
            }
            const text = textarea.value || '';
            if (!text) {
                Logger.debug('Text Sanitizer: No text to copy');
                pulseCopyFailure();
                return;
            }
            navigator.clipboard.writeText(text).then(() => {
                Logger.log(`Text Sanitizer: Copied ${text.length} chars and cleared`);
                if (Context.buttonFeedback) Context.buttonFeedback.flashSuccess(button, { restoreStyles: false });
                textarea.value = '';
                if (opts && opts.onAfterClear) opts.onAfterClear();
            }).catch((err) => {
                Logger.error('Text Sanitizer: Failed to copy to clipboard', err);
                pulseCopyFailure();
            });
        };

        button.addEventListener('click', handleCopy);
        CleanupRegistry.registerEventListener(button, 'click', handleCopy);
        return button;
    }
};

plugin.actions = {
    removeAllWhitespace: {
        id: 'removeAllWhitespace',
        label: 'Remove All Whitespace',
        run(input) {
            return (input || '').replace(/\s/g, '');
        }
    },
    trimWhitespace: {
        id: 'trimWhitespace',
        label: 'Trim Whitespace',
        run(input) {
            const s = (input || '').trim();
            return s.split(/\n/).map((line) => line.trim()).filter((line) => line.length > 0).join('\n');
        }
    },
    removeSpecialCharacters: {
        id: 'removeSpecialCharacters',
        label: 'Remove Special Characters',
        run(input) {
            const step = (input || '').replace(/[^a-zA-Z0-9\s]/g, '');
            return plugin.actions.trimWhitespace.run(step);
        }
    },
    dateTimeToIso: {
        id: 'dateTimeToIso',
        label: 'Date/Time to ISO',
        run(input) {
            return plugin.parseDateThenTimeToIso(input || '');
        }
    }
};

return plugin;
},
        "archetypes/tool-use-task-creation/main/tool-results-resize-handle.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {

// ============= tool-results-resize-handle.js =============
// Adds a drag-to-resize handle to the bottom of tool result boxes.

const plugin = {
    id: 'toolResultsResizeHandle',
    name: 'Tool Results Resize Handle',
    description: 'Adds a resize handle to tool result boxes so their height can be adjusted by dragging',
    _version: '2.4',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: { panelId: null, missingLogged: false },

    selectors: {
        workflowPanel: '[data-ui="workflow-panel"]',
        workflowStepsContainer: '[data-ui="workflow-steps-container"]',
        workflowStep: '[data-ui="workflow-step"]',
        stepResult: '[data-ui="step-result"]',
        toolCardFallback: 'div.rounded-lg.border.transition-colors',
        resultScrollable: 'div.p-3.rounded-md.border.text-xs.font-mono.whitespace-pre-wrap.overflow-auto'
    },

    onMutation(state, context) {
        const panel = this.findWorkflowPanel();
        if (!panel) {
            if (!state.missingLogged) {
                Logger.warn(`workflow panel not found`);
                state.missingLogged = true;
            }
            return;
        }

        const currentPanelId = panel.getAttribute('data-panel-id');
        if (state.panelId !== currentPanelId) {
            state.panelId = currentPanelId;
            state.missingLogged = false;
        }

        const toolsContainer = this.findToolsArea(panel);
        if (!toolsContainer) {
            if (!state.missingLogged) {
                Logger.warn(`tools container not found`);
                state.missingLogged = true;
            }
            return;
        }

        let toolCards = Context.dom.queryAll(this.selectors.workflowStep, { root: toolsContainer, context: `${this.id}.toolCards` });
        if (!toolCards.length) toolCards = Context.dom.queryAll(this.selectors.toolCardFallback, { root: toolsContainer, context: `${this.id}.toolCards` });

        let handlesAdded = 0;

        toolCards.forEach(card => {
            const resultDiv = this.findResultDiv(card);
            if (!resultDiv) return;

            // Check if handle already attached and still in DOM
            if (resultDiv.dataset.wfResultResizeAttached === '1') {
                const nextEl = resultDiv.nextElementSibling;
                if (nextEl && nextEl.classList.contains('wf-result-resize-handle')) {
                    this.ensureResetButton(card, resultDiv);
                    return; // Handle present, nothing to do
                }
                // Handle was removed (e.g. React re-render), reset flag
                delete resultDiv.dataset.wfResultResizeAttached;
            }

            this.attachResizeHandle(resultDiv);
            resultDiv.dataset.wfResultResizeAttached = '1';
            this.ensureResetButton(card, resultDiv);
            handlesAdded++;
        });

        if (handlesAdded > 0) {
            Logger.debug(`Added ${handlesAdded} result resize handle(s)`);
        }
    },

    findResultDiv(card) {
        const stepResult = card.querySelector(this.selectors.stepResult);
        if (stepResult) {
            const scrollable = stepResult.querySelector(this.selectors.resultScrollable);
            if (scrollable) return scrollable;
        }
        const sections = card.querySelectorAll('div.space-y-2');
        for (const section of sections) {
            const header = section.querySelector('div.text-xs.font-medium.text-muted-foreground.uppercase');
            if (header && header.textContent.trim() === 'Result') {
                const el = section.querySelector(this.selectors.resultScrollable);
                if (el) return el;
            }
        }
        return null;
    },

    attachResizeHandle(resultDiv) {
        // --- Build handle element ---
        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'wf-result-resize-handle';
        Object.assign(resizeHandle.style, {
            height: '8px',
            cursor: 'ns-resize',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: '0',
            transition: 'opacity 0.15s',
            userSelect: 'none'
        });

        const handleBar = document.createElement('div');
        Object.assign(handleBar.style, {
            width: '40px',
            height: '3px',
            borderRadius: '1.5px',
            backgroundColor: 'currentColor',
            opacity: '0.3'
        });
        resizeHandle.appendChild(handleBar);

        // --- Hover behaviour: show on result-div or handle hover ---
        resultDiv.addEventListener('mouseenter', () => {
            resizeHandle.style.opacity = '1';
        });
        resultDiv.addEventListener('mouseleave', (e) => {
            if (!e.relatedTarget || !resizeHandle.contains(e.relatedTarget)) {
                resizeHandle.style.opacity = '0';
            }
        });
        resizeHandle.addEventListener('mouseenter', () => {
            resizeHandle.style.opacity = '1';
        });
        resizeHandle.addEventListener('mouseleave', (e) => {
            if (!e.relatedTarget || !resultDiv.contains(e.relatedTarget)) {
                resizeHandle.style.opacity = '0';
            }
        });

        // Insert handle right after result div
        resultDiv.insertAdjacentElement('afterend', resizeHandle);

        // --- Drag-to-resize logic ---
        let isResizing = false;
        let startY = 0;
        let startHeight = 0;
        const minHeight = 40;
        let lastClientY = 0;
        let accumulatedScrollDelta = 0;
        let animFrameId = null;
        const scrollContainer = resultDiv.closest('.overflow-y-auto');
        const edgeThreshold = 50;
        const maxScrollSpeed = 15;

        const autoScroll = () => {
            if (!isResizing || !scrollContainer) return;

            const distFromBottom = window.innerHeight - lastClientY;
            const distFromTop = lastClientY;
            let scrollAmount = 0;

            if (distFromBottom < edgeThreshold) {
                scrollAmount = Math.ceil(maxScrollSpeed * (1 - distFromBottom / edgeThreshold));
            } else if (distFromTop < edgeThreshold) {
                scrollAmount = -Math.ceil(maxScrollSpeed * (1 - distFromTop / edgeThreshold));
            }

            if (scrollAmount !== 0) {
                scrollContainer.scrollTop += scrollAmount;
                accumulatedScrollDelta += scrollAmount;

                const totalDelta = (lastClientY - startY) + accumulatedScrollDelta;
                const newHeight = Math.max(minHeight, startHeight + totalDelta);
                resultDiv.style.maxHeight = `${newHeight}px`;
            }

            animFrameId = requestAnimationFrame(autoScroll);
        };

        const handleMouseDown = (e) => {
            isResizing = true;
            startY = e.clientY;
            startHeight = resultDiv.offsetHeight;
            lastClientY = e.clientY;
            accumulatedScrollDelta = 0;

            e.preventDefault();
            e.stopPropagation();

            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);

            document.body.style.cursor = 'ns-resize';
            document.body.style.userSelect = 'none';

            animFrameId = requestAnimationFrame(autoScroll);
        };

        const handleMouseMove = (e) => {
            if (!isResizing) return;

            lastClientY = e.clientY;
            const totalDelta = (e.clientY - startY) + accumulatedScrollDelta;
            const newHeight = Math.max(minHeight, startHeight + totalDelta);
            resultDiv.style.maxHeight = `${newHeight}px`;
        };

        const handleMouseUp = () => {
            if (!isResizing) return;
            const endH = resultDiv.offsetHeight;
            if (endH !== startHeight) {
                Logger.debug(`user finished resizing result box`, { fromPx: startHeight, toPx: endH });
            }
            isResizing = false;

            if (animFrameId) {
                cancelAnimationFrame(animFrameId);
                animFrameId = null;
            }

            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);

            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };

        CleanupRegistry.registerEventListener(resizeHandle, 'mousedown', handleMouseDown);
    },

    ensureResetButton(card, resultDiv) {
        const buttonContainer = this.findResultButtonContainer(card);
        if (!buttonContainer) return;

        // Check if button already exists
        if (buttonContainer.querySelector('.wf-result-reset-btn')) return;

        const resetBtn = document.createElement('button');
        resetBtn.className = 'wf-result-reset-btn inline-flex items-center justify-center whitespace-nowrap rounded-sm text-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground size-7 h-6 w-6';
        resetBtn.title = 'Reset result box size';
        // Inward-pointing arrows icon (each arrow from the expand icon rotated 180°)
        resetBtn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="fill-current h-3 w-3 text-muted-foreground"><path fill-rule="evenodd" clip-rule="evenodd" d="M19 9C19.5523 9 20 9.44772 20 10C20 10.5523 19.5523 11 19 11H14C13.4477 11 13 10.5523 13 10V5C13 4.44772 13.4477 4 14 4C14.5523 4 15 4.44772 15 5V7.58579L19.2929 3.2929C19.6834 2.9024 20.3166 2.9024 20.7071 3.2929C21.0976 3.6834 21.0976 4.31658 20.7071 4.70711L16.4142 9H19ZM4.70711 20.7071C4.31658 21.0976 3.6834 21.0976 3.2929 20.7071C2.9024 20.3166 2.9024 19.6834 3.2929 19.2929L7.58579 15H5C4.44772 15 4 14.5523 4 14C4 13.4477 4.44772 13 5 13H10C10.5523 13 11 13.4477 11 14V19C11 19.5523 10.5523 20 10 20C9.44772 20 9 19.5523 9 19V16.4142L4.70711 20.7071Z"/></svg>';

        resetBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            resultDiv.style.maxHeight = '';
            Logger.log(`user reset result box height to default`);
        });

        // Insert after the divider in the result toolbar
        const divider = buttonContainer.querySelector('.w-px.h-4.bg-border.mx-1');
        if (divider) {
            divider.insertAdjacentElement('afterend', resetBtn);
        } else {
            buttonContainer.appendChild(resetBtn);
        }
    },

    findResultButtonContainer(card) {
        const stepResult = card.querySelector(this.selectors.stepResult);
        if (stepResult) {
            const divider = stepResult.querySelector('.w-px.h-4.bg-border.mx-1');
            if (divider) return divider.parentElement;
        }
        const sections = card.querySelectorAll('div.space-y-2');
        for (const section of sections) {
            const header = section.querySelector('div.text-xs.font-medium.text-muted-foreground.uppercase');
            if (header && header.textContent.trim() === 'Result') {
                const divider = section.querySelector('.w-px.h-4.bg-border.mx-1');
                if (divider) return divider.parentElement;
            }
        }
        return null;
    },

    findWorkflowPanel() {
        const byDataUi = document.querySelector(this.selectors.workflowPanel);
        if (byDataUi) return byDataUi;
        const panels = Context.dom.queryAll('[data-panel-id][data-panel]', { context: `${this.id}.panels` });
        for (const candidate of panels) {
            const toolbar = candidate.querySelector('.border-b.h-9');
            if (toolbar) {
                const workflowText = Array.from(toolbar.querySelectorAll('span')).find(
                    span => span.textContent.trim() === 'Workflow'
                );
                if (workflowText) return candidate;
            }
        }
        return null;
    },

    findToolsArea(panel) {
        if (!panel) return null;
        const container = panel.querySelector(this.selectors.workflowStepsContainer);
        if (container) {
            const spaceY3 = container.querySelector(':scope > .space-y-3');
            return spaceY3 || container;
        }
        const scrollable = panel.querySelector('.overflow-y-auto');
        if (!scrollable) return null;
        return scrollable.querySelector('.space-y-3');
    }
};

return plugin;
},
        "archetypes/tool-use-task-creation/main/user-story-markdown.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {
// ============= user-story-markdown.js =============
// Thin wrapper: shared Context.userStoryMarkdown library.

const plugin = {
    id: 'userStoryMarkdown',
    name: 'User Story Markdown',
    description: 'Renders the User Story as markdown',
    _version: '1.1',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        styleInjected: false,
        activationLogged: false,
        missingLogged: false,
        activeByBody: null
    },

    onMutation(state) {
        const api = Context.userStoryMarkdown;
        if (!api || typeof api.run !== 'function') return;
        api.run(state, {
            pluginId: this.id,
            logTag: this.id
        });
    }
};

return plugin;
},
        "archetypes/tool-use-task-creation/main/user-story-collapse.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {
// ============= user-story-collapse.js =============
// Thin wrapper: shared Context.userStoryCollapse library.

const plugin = {
    id: 'userStoryCollapse',
    name: 'User Story Collapse',
    description:
        'Adds Hide/Show on the User Story row to collapse the story body below the label',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        missingLogged: false,
        activationLogged: false
    },

    onMutation(state) {
        const api = Context.userStoryCollapse;
        if (!api || typeof api.run !== 'function') return;
        api.run(state, { pluginId: this.id, logTag: this.id });
    }
};

return plugin;
},
        "archetypes/tool-use-task-creation-openclaw/main/notes-resize-handle.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {
// ============= notes-resize-handle.js =============
// Thin wrapper: shared Context.notesResizeHandle library.

const plugin = {
    id: 'notesResizeHandle',
    name: 'Notes Resize Handle',
    description: 'Adds a vertical resize handle to the QA reviewer notes textarea',
    _version: '1.2',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: { missingLogged: false },

    onMutation(state) {
        const api = Context.notesResizeHandle;
        if (!api || typeof api.run !== 'function') {
            return;
        }
        api.run(state, { logTag: this.id });
    }
};

return plugin;
},
        "archetypes/tool-use-task-creation-openclaw/main/prompt-text-counter.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {
// ============= prompt-text-counter.js =============
// Thin wrapper: shared Context.promptTextCounter library.

const plugin = {
    id: 'promptTextCounter',
    name: 'Prompt Text Counter',
    description: 'Shows a live word and character count below the prompt',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: { missingLogged: false, activationLogged: false, boundTextarea: null },

    onMutation(state) {
        const api = Context.promptTextCounter;
        if (!api || typeof api.run !== 'function') {
            return;
        }
        api.run(state, { logTag: this.id, pluginId: this.id });
    }
};

return plugin;
},
        "archetypes/tool-use-task-creation-openclaw/main/text-sanitizer.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {
// ============= text-sanitizer.js =============
// Adds a Text Sanitizer module in the same area as the QA scratchpad (below it when present).
// Independent of scratchpad: appears after Prompt section or after scratchpad/guideline buttons.
// Actions: dropdown + Execute. Date/Time to ISO is first and default. Date/Time to ISO uses a working ISO 8601 converter (date + optional time).

const DEFAULT_ACTION_ID = 'dateTimeToIso';

const MONTHS = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
    jan: 1, feb: 2, mar: 3, apr: 4, jun: 6,
    jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12
};

const MP = '(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Sept?|Jun|Jul|Aug|Oct|Nov|Dec)\\.?';

/**
 * Parse date and optional time from normalized input (single spaces, trimmed).
 * Returns { iso } or null. ISO is local time, no Z suffix.
 */
function parseDateInputToIso(text) {
    let year;
    let month;
    let day;
    let dateStr;

    const patterns = [
        { re: new RegExp(`(${MP})\\s+(\\d{1,2})\\s*(?:st|nd|rd|th)?\\s*,?\\s*(\\d{4})`, 'i'),
          parse: m => ({ month: MONTHS[m[1].replace('.', '').toLowerCase()], day: +m[2], year: +m[3] }) },
        { re: new RegExp(`(\\d{1,2})\\s*(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MP})\\s*,?\\s*(\\d{4})`, 'i'),
          parse: m => ({ day: +m[1], month: MONTHS[m[2].replace('.', '').toLowerCase()], year: +m[3] }) },
        { re: new RegExp(`(\\d{4})\\s+(?:,\\s*)?(${MP})\\s+(\\d{1,2})\\s*(?:st|nd|rd|th)?`, 'i'),
          parse: m => ({ year: +m[1], month: MONTHS[m[2].replace('.', '').toLowerCase()], day: +m[3] }) },
        { re: /(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/,
          parse: m => ({ year: +m[1], month: +m[2], day: +m[3] }) },
        { re: /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/,
          parse: m => ({ month: +m[1], day: +m[2], year: +m[3] }) }
    ];

    for (const p of patterns) {
        const m = text.match(p.re);
        if (m) {
            ({ year, month, day } = p.parse(m));
            dateStr = m[0];
            break;
        }
    }

    if (year === undefined) return null;
    if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1) return null;
    const testDate = new Date(year, month - 1, day);
    if (testDate.getMonth() !== month - 1 || testDate.getDate() !== day) return null;

    let remainder = text.replace(dateStr, ' ');
    let hours = null;
    let minutes = null;
    let seconds = null;

    if (/\bnoon\b/i.test(remainder)) {
        hours = 12;
        minutes = 0;
        seconds = 0;
    } else if (/\bmidnight\b/i.test(remainder)) {
        hours = 0;
        minutes = 0;
        seconds = 0;
    }

    if (hours === null) {
        const tm = remainder.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?/i);
        if (tm) {
            hours = +tm[1];
            minutes = +tm[2];
            seconds = tm[3] ? +tm[3] : 0;
            const ap = (tm[4] || '').replace(/\./g, '').toLowerCase();
            if (ap === 'pm' && hours !== 12) hours += 12;
            if (ap === 'am' && hours === 12) hours = 0;
        }
    }

    if (hours === null) {
        const tm = remainder.match(/(\d{1,2})\s*(am|pm|a\.m\.|p\.m\.)/i);
        if (tm) {
            hours = +tm[1];
            minutes = 0;
            seconds = 0;
            const ap = tm[2].replace(/\./g, '').toLowerCase();
            if (ap === 'pm' && hours !== 12) hours += 12;
            if (ap === 'am' && hours === 12) hours = 0;
        }
    }

    if (hours !== null) {
        if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59) return null;
    }

    const pad = (n, w = 2) => String(n).padStart(w, '0');
    let iso = `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
    if (hours !== null) iso += `T${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;

    return { iso };
}

const plugin = {
    id: 'textSanitizer',
    name: 'Text Sanitizer',
    description: 'Adds a text sanitizer utility for quickly cleaning and transforming text',
    _version: '4.2',
    enabledByDefault: true,
    phase: 'mutation',

    initialState: {
        promptMissingLogged: false,
        copyFeedbackTimeoutId: null,
    },

    onMutation(state, context) {
        const promptPanel = document.querySelector('[data-ui="prompt-panel"]');
        const tabBars = this.findTaskNotesTabBars(promptPanel);

        if (tabBars.length === 0) {
            const promptSection = this.findPromptSection(promptPanel || document);
            if (!promptSection) {
                if (!state.promptMissingLogged) {
                    state.promptMissingLogged = true;
                    Logger.debug('Text Sanitizer: Prompt section not found');
                }
                return;
            }
            state.promptMissingLogged = false;
            const anchor = this.getInsertAnchor(promptSection);
            this.ensureTextSanitizerBelowAnchor(state, anchor);
            return;
        }

        for (const tabBar of tabBars) {
            const contentRoot = this.getPanelContentRoot(tabBar);
            if (!contentRoot) continue;

            if (!this.isTaskTabActive(tabBar)) {
                contentRoot.querySelectorAll('[data-qa-text-sanitizer="true"]').forEach((el) => {
                    el.remove();
                    Logger.debug('Text Sanitizer: Removed from panel (Notes tab active)');
                });
                continue;
            }

            const promptSection = this.findPromptSection(contentRoot);
            if (!promptSection) continue;

            state.promptMissingLogged = false;
            const anchor = this.getInsertAnchor(promptSection);
            this.ensureTextSanitizerBelowAnchor(state, anchor);
        }
    },

    findPromptSection(scopeRoot) {
        const root = scopeRoot || document;
        if (root.querySelector && root.querySelector('#prompt-editor')) {
            const promptEditor = root.querySelector('#prompt-editor');
            const section = promptEditor.closest('div.space-y-2.relative') || promptEditor.closest('div.space-y-2') || promptEditor.closest('div.flex.flex-col.gap-2');
            if (section) return section;
        }
        const options = { context: `${this.id}.findPromptSection`, root };

        // Label-based fallback: find "Prompt" or "Problem Description" label then climb to section wrapper (resilient to DOM changes).
        const labelSelectors = ['span.text-sm.text-muted-foreground.font-medium', 'div.text-sm.text-muted-foreground.font-medium'];
        for (const sel of labelSelectors) {
            const elements = Context.dom.queryAll(sel, options);
            for (const el of elements) {
                const text = (el.textContent || '').trim();
                const isPrompt = text === 'Prompt' || text.startsWith('Prompt');
                const isProblemDesc = text === 'Problem Description' || text.startsWith('Problem Description');
                if (!isPrompt && !isProblemDesc) continue;
                const section = el.closest('div.space-y-2.relative') || el.closest('div.space-y-2') || el.closest('div.flex.flex-col.gap-2');
                if (section) return section;
            }
        }

        const candidates = Context.dom.queryAll('div.flex.flex-col.gap-2', options);
        for (const candidate of candidates) {
            const label = candidate.querySelector('label');
            const span = candidate.querySelector('span.text-sm.text-muted-foreground.font-medium');
            if (label && label.textContent.trim() === 'Prompt') return candidate;
            if (span && span.textContent.trim() === 'Prompt') return candidate;
        }
        return null;
    },

    /**
     * Returns the element after which to insert. Walk nextElementSibling while sibling is
     * scratchpad, guideline buttons, or our own container; use last such as anchor.
     * On task-creation, prefer inserting after the Scratchpad (div.mt-3 with "Scratchpad" label).
     */
    getInsertAnchor(promptSection) {
        let anchor = promptSection;
        let el = promptSection.nextElementSibling;
        while (el) {
            if (el.dataset && el.dataset.qaScratchpad === 'true') {
                anchor = el;
            } else if (el.getAttribute && el.getAttribute('data-fleet-plugin') === 'guidelineButtons') {
                anchor = el;
            } else if (el.dataset && el.dataset.qaTextSanitizer === 'true') {
                anchor = el;
            } else if (el.classList && el.classList.contains('mt-3')) {
                const label = el.querySelector('label');
                if (label && (label.textContent || '').trim().startsWith('Scratchpad')) {
                    anchor = el;
                }
            }
            el = el.nextElementSibling;
        }
        return anchor;
    },

    findTaskNotesTabBars(scopeRoot) {
        const root = scopeRoot || document;
        const tabBars = [];
        const candidates = root.querySelectorAll('div.flex.items-center.gap-1.px-2.border-b');
        for (const el of candidates) {
            const buttons = el.querySelectorAll('button');
            let hasTask = false;
            let hasNotes = false;
            for (const btn of buttons) {
                const text = btn.textContent.trim();
                if (text === 'Task') hasTask = true;
                if (text === 'Notes') hasNotes = true;
            }
            if (hasTask && hasNotes) tabBars.push(el);
        }
        return tabBars;
    },

    isTaskTabActive(tabBar) {
        const taskBtn = Array.from(tabBar.querySelectorAll('button')).find(
            (btn) => btn.textContent.trim() === 'Task'
        );
        if (!taskBtn) return false;
        const c = taskBtn.className || '';
        return c.includes('border-primary') || c.includes('text-primary');
    },

    getPanelContentRoot(tabBar) {
        const panel = tabBar.parentElement;
        if (!panel || !panel.querySelector) return null;
        const found = panel.querySelector('div.flex-1.min-h-0.overflow-auto.p-3') || panel.querySelector('div.overflow-auto');
        if (found) return found;
        return panel.parentElement || null;
    },

    /**
     * Parse date and optional time from text; return ISO 8601 (local time, no Z).
     * Based on the working ISO 8601 converter. Returns original input on failure or when no date found.
     */
    parseDateThenTimeToIso(text) {
        try {
            const raw = (text || '').trim().replace(/\s+/g, ' ');
            if (!raw) return text || '';

            const result = parseDateInputToIso(raw);
            return result ? result.iso : text;
        } catch (e) {
            Logger.warn('Text Sanitizer: parseDateThenTimeToIso failed', e);
            return text || '';
        }
    },

    findExistingTextSanitizerAmongSiblings(anchor) {
        let el = anchor.nextElementSibling;
        while (el) {
            if (el.dataset && el.dataset.qaTextSanitizer === 'true') return el;
            el = el.nextElementSibling;
        }
        return null;
    },

    findAllTextSanitizersAmongSiblings(anchor) {
        const found = [];
        let el = anchor.nextElementSibling;
        while (el) {
            if (el.dataset && el.dataset.qaTextSanitizer === 'true') found.push(el);
            el = el.nextElementSibling;
        }
        return found;
    },

    ensureTextSanitizerBelowAnchor(state, anchor) {
        if (anchor.dataset && anchor.dataset.qaTextSanitizer === 'true') {
            const duplicates = this.findAllTextSanitizersAmongSiblings(anchor);
            duplicates.forEach((el) => {
                el.remove();
                Logger.debug('Text Sanitizer: Removed duplicate');
            });
            return;
        }

        const existing = this.findExistingTextSanitizerAmongSiblings(anchor);
        if (existing) {
            const all = this.findAllTextSanitizersAmongSiblings(anchor);
            if (all.length > 1) {
                for (let i = 1; i < all.length; i++) {
                    all[i].remove();
                    Logger.debug('Text Sanitizer: Removed duplicate');
                }
            }
            const remaining = this.findAllTextSanitizersAmongSiblings(anchor);
            const toUse = remaining.length > 0 ? remaining[0] : existing;
            if (toUse && toUse !== anchor.nextElementSibling) {
                anchor.insertAdjacentElement('afterend', toUse);
                Logger.debug('Text Sanitizer: Moved to follow anchor');
            }
            return;
        }

        // Remove any sanitizer already in this container but in the wrong place (e.g. after prompt when anchor is scratchpad).
        const parent = anchor.parentElement;
        if (parent) {
            parent.querySelectorAll('[data-qa-text-sanitizer="true"]').forEach((el) => {
                el.remove();
                Logger.debug('Text Sanitizer: Removed from wrong position');
            });
        }
        const container = this.createContainer(state);
        anchor.insertAdjacentElement('afterend', container);
        Logger.log('Text Sanitizer: Inserted below scratchpad area');
    },

    createContainer(state) {
        const container = document.createElement('div');
        container.className = 'flex flex-col gap-2';
        container.dataset.qaTextSanitizer = 'true';
        container.setAttribute('data-fleet-plugin', this.id);

        const ONE_LINE_HEIGHT = 40;
        const MIN_WRAPPER_HEIGHT = 60;
        const RESIZE_HANDLE_HEIGHT = 12;

        const textareaWrapper = document.createElement('div');
        textareaWrapper.className = 'relative flex flex-col rounded-md overflow-hidden border border-input bg-background shadow-sm';
        textareaWrapper.dataset.qaTextSanitizerWrapper = 'true';
        textareaWrapper.style.minHeight = ONE_LINE_HEIGHT + 'px';
        textareaWrapper.style.height = ONE_LINE_HEIGHT + 'px';

        const textarea = document.createElement('textarea');
        textarea.className = 'w-full border-0 bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0 resize-none overflow-y-auto flex-1 min-h-0';
        textarea.placeholder = 'Paste text to sanitize…';
        textarea.rows = 1;
        textarea.dataset.qaTextSanitizerTextarea = 'true';
        textarea.style.height = ONE_LINE_HEIGHT + 'px';

        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'absolute bottom-0 left-0 right-0 h-3 cursor-ns-resize flex items-center justify-center transition-opacity duration-200 flex-shrink-0';
        resizeHandle.style.opacity = '0';
        resizeHandle.style.display = 'none';
        resizeHandle.style.background = 'transparent';
        const handleBar = document.createElement('div');
        handleBar.className = 'w-10 h-1 rounded-sm bg-current opacity-30';
        resizeHandle.appendChild(handleBar);

        const setWrapperOneLine = () => {
            textareaWrapper.style.height = ONE_LINE_HEIGHT + 'px';
            textarea.style.height = ONE_LINE_HEIGHT + 'px';
            resizeHandle.style.display = 'none';
        };

        const updateTextareaHeight = () => {
            const content = textarea.value || '';
            const isEmpty = !content.trim();
            const hasMultiLine = !isEmpty && (content.includes('\n') || textarea.scrollHeight > ONE_LINE_HEIGHT);
            if (hasMultiLine) {
                resizeHandle.style.display = 'flex';
                resizeHandle.style.opacity = '1';
                if (parseInt(textareaWrapper.style.height, 10) <= ONE_LINE_HEIGHT) {
                    textareaWrapper.style.height = '80px';
                    textarea.style.height = (80 - RESIZE_HANDLE_HEIGHT) + 'px';
                }
            } else {
                resizeHandle.style.display = 'none';
                resizeHandle.style.opacity = '0';
                setWrapperOneLine();
            }
        };

        const onInput = () => updateTextareaHeight();
        textarea.addEventListener('input', onInput);
        CleanupRegistry.registerEventListener(textarea, 'input', onInput);

        let isResizing = false;
        let startY = 0;
        let startHeight = 0;
        const handleMouseDown = (e) => {
            isResizing = true;
            startY = e.clientY;
            startHeight = textareaWrapper.offsetHeight;
            e.preventDefault();
            e.stopPropagation();
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = 'ns-resize';
            document.body.style.userSelect = 'none';
        };
        const handleMouseMove = (e) => {
            if (!isResizing) return;
            const deltaY = e.clientY - startY;
            const requested = startHeight + deltaY;
            const maxHeight = textarea.scrollHeight + RESIZE_HANDLE_HEIGHT;
            const newHeight = Math.max(MIN_WRAPPER_HEIGHT, Math.min(maxHeight, requested));
            textareaWrapper.style.height = newHeight + 'px';
            textarea.style.height = (newHeight - RESIZE_HANDLE_HEIGHT) + 'px';
        };
        const handleMouseUp = () => {
            if (!isResizing) return;
            isResizing = false;
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
        resizeHandle.addEventListener('mousedown', handleMouseDown);
        CleanupRegistry.registerEventListener(resizeHandle, 'mousedown', handleMouseDown);

        textareaWrapper.addEventListener('mouseenter', () => { if (resizeHandle.style.display === 'flex') resizeHandle.style.opacity = '1'; });
        textareaWrapper.addEventListener('mouseleave', () => { if (resizeHandle.style.display === 'flex') resizeHandle.style.opacity = '0.6'; });

        textareaWrapper.appendChild(textarea);
        textareaWrapper.appendChild(resizeHandle);
        container.appendChild(textareaWrapper);

        const header = document.createElement('div');
        header.className = 'flex items-center justify-between gap-2';
        const label = document.createElement('span');
        label.className = 'text-sm text-muted-foreground font-medium';
        label.textContent = 'Text Sanitizer';
        header.appendChild(label);
        container.insertBefore(header, textareaWrapper);

        const actionRow = document.createElement('div');
        actionRow.className = 'flex flex-wrap items-center gap-2';
        const copyBtn = this.createCopyButton(state, { onAfterClear: setWrapperOneLine });
        copyBtn.style.marginLeft = 'auto';

        const select = document.createElement('select');
        select.setAttribute('data-fleet-plugin', this.id);
        select.className = 'h-8 rounded-sm border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';
        const actionIds = ['dateTimeToIso', 'removeAllWhitespace', 'trimWhitespace', 'removeSpecialCharacters'];
        actionIds.forEach((id) => {
            const action = this.actions[id];
            if (!action) return;
            const opt = document.createElement('option');
            opt.value = id;
            opt.textContent = action.label;
            if (id === DEFAULT_ACTION_ID) opt.selected = true;
            select.appendChild(opt);
        });
        select.value = DEFAULT_ACTION_ID;

        const buttonClass = 'inline-flex items-center justify-center whitespace-nowrap font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background transition-colors hover:bg-accent hover:text-accent-foreground h-8 rounded-sm pl-3 pr-3 text-xs';
        const executeBtn = document.createElement('button');
        executeBtn.type = 'button';
        executeBtn.className = buttonClass;
        executeBtn.setAttribute('data-fleet-plugin', this.id);
        executeBtn.textContent = 'Execute';
        const onExecute = () => {
            const id = select.value;
            const action = this.actions[id];
            if (!action) return;
            const input = textarea.value || '';
            let ok = true;
            try {
                const output = action.run(input);
                textarea.value = output;
                updateTextareaHeight();
                Logger.log('Text Sanitizer: Executed ' + action.label);
            } catch (e) {
                Logger.error('Text Sanitizer: Execute failed', e);
                textarea.value = input;
                ok = false;
            }
            if (ok) {
                if (Context.buttonFeedback) Context.buttonFeedback.flashSuccess(executeBtn, { restoreStyles: false });
            } else if (Context.buttonFeedback) {
                Context.buttonFeedback.flashFailure(executeBtn, { restoreStyles: false });
            }
        };
        CleanupRegistry.registerEventListener(executeBtn, 'click', onExecute);

        actionRow.appendChild(select);
        actionRow.appendChild(executeBtn);
        actionRow.appendChild(copyBtn);
        container.appendChild(actionRow);

        return container;
    },

    createCopyButton(state, opts) {
        const buttonClass = 'inline-flex items-center justify-center whitespace-nowrap font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background transition-colors hover:bg-accent hover:text-accent-foreground h-8 rounded-sm pl-3 pr-3 text-xs';
        const button = document.createElement('button');
        button.type = 'button';
        button.setAttribute('data-fleet-plugin', this.id);
        button.className = buttonClass;
        button.textContent = 'Copy';
        button.title = 'Copy text';
        button.setAttribute('aria-label', 'Copy text');

        const pulseCopyFailure = () => {
            if (Context.buttonFeedback) Context.buttonFeedback.flashFailure(button, { restoreStyles: false });
        };
        const handleCopy = () => {
            const container = button.closest('[data-qa-text-sanitizer="true"]');
            const textarea = container ? container.querySelector('[data-qa-text-sanitizer-textarea="true"]') : null;
            if (!textarea) {
                pulseCopyFailure();
                return;
            }
            const text = textarea.value || '';
            if (!text) {
                Logger.debug('Text Sanitizer: No text to copy');
                pulseCopyFailure();
                return;
            }
            navigator.clipboard.writeText(text).then(() => {
                Logger.log(`Text Sanitizer: Copied ${text.length} chars and cleared`);
                if (Context.buttonFeedback) Context.buttonFeedback.flashSuccess(button, { restoreStyles: false });
                textarea.value = '';
                if (opts && opts.onAfterClear) opts.onAfterClear();
            }).catch((err) => {
                Logger.error('Text Sanitizer: Failed to copy to clipboard', err);
                pulseCopyFailure();
            });
        };

        button.addEventListener('click', handleCopy);
        CleanupRegistry.registerEventListener(button, 'click', handleCopy);
        return button;
    }
};

plugin.actions = {
    removeAllWhitespace: {
        id: 'removeAllWhitespace',
        label: 'Remove All Whitespace',
        run(input) {
            return (input || '').replace(/\s/g, '');
        }
    },
    trimWhitespace: {
        id: 'trimWhitespace',
        label: 'Trim Whitespace',
        run(input) {
            const s = (input || '').trim();
            return s.split(/\n/).map((line) => line.trim()).filter((line) => line.length > 0).join('\n');
        }
    },
    removeSpecialCharacters: {
        id: 'removeSpecialCharacters',
        label: 'Remove Special Characters',
        run(input) {
            const step = (input || '').replace(/[^a-zA-Z0-9\s]/g, '');
            return plugin.actions.trimWhitespace.run(step);
        }
    },
    dateTimeToIso: {
        id: 'dateTimeToIso',
        label: 'Date/Time to ISO',
        run(input) {
            return plugin.parseDateThenTimeToIso(input || '');
        }
    }
};

return plugin;
},
        "archetypes/tool-use-task-creation-openclaw/main/tool-results-resize-handle.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {

// ============= tool-results-resize-handle.js =============
// Adds a drag-to-resize handle to the bottom of tool result boxes.

const plugin = {
    id: 'toolResultsResizeHandle',
    name: 'Tool Results Resize Handle',
    description: 'Adds a resize handle to tool result boxes so their height can be adjusted by dragging',
    _version: '2.4',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: { panelId: null, missingLogged: false },

    selectors: {
        workflowPanel: '[data-ui="workflow-panel"]',
        workflowStepsContainer: '[data-ui="workflow-steps-container"]',
        workflowStep: '[data-ui="workflow-step"]',
        stepResult: '[data-ui="step-result"]',
        toolCardFallback: 'div.rounded-lg.border.transition-colors',
        resultScrollable: 'div.p-3.rounded-md.border.text-xs.font-mono.whitespace-pre-wrap.overflow-auto'
    },

    onMutation(state, context) {
        const panel = this.findWorkflowPanel();
        if (!panel) {
            if (!state.missingLogged) {
                Logger.warn(`workflow panel not found`);
                state.missingLogged = true;
            }
            return;
        }

        const currentPanelId = panel.getAttribute('data-panel-id');
        if (state.panelId !== currentPanelId) {
            state.panelId = currentPanelId;
            state.missingLogged = false;
        }

        const toolsContainer = this.findToolsArea(panel);
        if (!toolsContainer) {
            if (!state.missingLogged) {
                Logger.warn(`tools container not found`);
                state.missingLogged = true;
            }
            return;
        }

        let toolCards = Context.dom.queryAll(this.selectors.workflowStep, { root: toolsContainer, context: `${this.id}.toolCards` });
        if (!toolCards.length) toolCards = Context.dom.queryAll(this.selectors.toolCardFallback, { root: toolsContainer, context: `${this.id}.toolCards` });

        let handlesAdded = 0;

        toolCards.forEach(card => {
            const resultDiv = this.findResultDiv(card);
            if (!resultDiv) return;

            // Check if handle already attached and still in DOM
            if (resultDiv.dataset.wfResultResizeAttached === '1') {
                const nextEl = resultDiv.nextElementSibling;
                if (nextEl && nextEl.classList.contains('wf-result-resize-handle')) {
                    this.ensureResetButton(card, resultDiv);
                    return; // Handle present, nothing to do
                }
                // Handle was removed (e.g. React re-render), reset flag
                delete resultDiv.dataset.wfResultResizeAttached;
            }

            this.attachResizeHandle(resultDiv);
            resultDiv.dataset.wfResultResizeAttached = '1';
            this.ensureResetButton(card, resultDiv);
            handlesAdded++;
        });

        if (handlesAdded > 0) {
            Logger.debug(`Added ${handlesAdded} result resize handle(s)`);
        }
    },

    findResultDiv(card) {
        const stepResult = card.querySelector(this.selectors.stepResult);
        if (stepResult) {
            const scrollable = stepResult.querySelector(this.selectors.resultScrollable);
            if (scrollable) return scrollable;
        }
        const sections = card.querySelectorAll('div.space-y-2');
        for (const section of sections) {
            const header = section.querySelector('div.text-xs.font-medium.text-muted-foreground.uppercase');
            if (header && header.textContent.trim() === 'Result') {
                const el = section.querySelector(this.selectors.resultScrollable);
                if (el) return el;
            }
        }
        return null;
    },

    attachResizeHandle(resultDiv) {
        // --- Build handle element ---
        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'wf-result-resize-handle';
        Object.assign(resizeHandle.style, {
            height: '8px',
            cursor: 'ns-resize',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: '0',
            transition: 'opacity 0.15s',
            userSelect: 'none'
        });

        const handleBar = document.createElement('div');
        Object.assign(handleBar.style, {
            width: '40px',
            height: '3px',
            borderRadius: '1.5px',
            backgroundColor: 'currentColor',
            opacity: '0.3'
        });
        resizeHandle.appendChild(handleBar);

        // --- Hover behaviour: show on result-div or handle hover ---
        resultDiv.addEventListener('mouseenter', () => {
            resizeHandle.style.opacity = '1';
        });
        resultDiv.addEventListener('mouseleave', (e) => {
            if (!e.relatedTarget || !resizeHandle.contains(e.relatedTarget)) {
                resizeHandle.style.opacity = '0';
            }
        });
        resizeHandle.addEventListener('mouseenter', () => {
            resizeHandle.style.opacity = '1';
        });
        resizeHandle.addEventListener('mouseleave', (e) => {
            if (!e.relatedTarget || !resultDiv.contains(e.relatedTarget)) {
                resizeHandle.style.opacity = '0';
            }
        });

        // Insert handle right after result div
        resultDiv.insertAdjacentElement('afterend', resizeHandle);

        // --- Drag-to-resize logic ---
        let isResizing = false;
        let startY = 0;
        let startHeight = 0;
        const minHeight = 40;
        let lastClientY = 0;
        let accumulatedScrollDelta = 0;
        let animFrameId = null;
        const scrollContainer = resultDiv.closest('.overflow-y-auto');
        const edgeThreshold = 50;
        const maxScrollSpeed = 15;

        const autoScroll = () => {
            if (!isResizing || !scrollContainer) return;

            const distFromBottom = window.innerHeight - lastClientY;
            const distFromTop = lastClientY;
            let scrollAmount = 0;

            if (distFromBottom < edgeThreshold) {
                scrollAmount = Math.ceil(maxScrollSpeed * (1 - distFromBottom / edgeThreshold));
            } else if (distFromTop < edgeThreshold) {
                scrollAmount = -Math.ceil(maxScrollSpeed * (1 - distFromTop / edgeThreshold));
            }

            if (scrollAmount !== 0) {
                scrollContainer.scrollTop += scrollAmount;
                accumulatedScrollDelta += scrollAmount;

                const totalDelta = (lastClientY - startY) + accumulatedScrollDelta;
                const newHeight = Math.max(minHeight, startHeight + totalDelta);
                resultDiv.style.maxHeight = `${newHeight}px`;
            }

            animFrameId = requestAnimationFrame(autoScroll);
        };

        const handleMouseDown = (e) => {
            isResizing = true;
            startY = e.clientY;
            startHeight = resultDiv.offsetHeight;
            lastClientY = e.clientY;
            accumulatedScrollDelta = 0;

            e.preventDefault();
            e.stopPropagation();

            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);

            document.body.style.cursor = 'ns-resize';
            document.body.style.userSelect = 'none';

            animFrameId = requestAnimationFrame(autoScroll);
        };

        const handleMouseMove = (e) => {
            if (!isResizing) return;

            lastClientY = e.clientY;
            const totalDelta = (e.clientY - startY) + accumulatedScrollDelta;
            const newHeight = Math.max(minHeight, startHeight + totalDelta);
            resultDiv.style.maxHeight = `${newHeight}px`;
        };

        const handleMouseUp = () => {
            if (!isResizing) return;
            const endH = resultDiv.offsetHeight;
            if (endH !== startHeight) {
                Logger.debug(`user finished resizing result box`, { fromPx: startHeight, toPx: endH });
            }
            isResizing = false;

            if (animFrameId) {
                cancelAnimationFrame(animFrameId);
                animFrameId = null;
            }

            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);

            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };

        CleanupRegistry.registerEventListener(resizeHandle, 'mousedown', handleMouseDown);
    },

    ensureResetButton(card, resultDiv) {
        const buttonContainer = this.findResultButtonContainer(card);
        if (!buttonContainer) return;

        // Check if button already exists
        if (buttonContainer.querySelector('.wf-result-reset-btn')) return;

        const resetBtn = document.createElement('button');
        resetBtn.className = 'wf-result-reset-btn inline-flex items-center justify-center whitespace-nowrap rounded-sm text-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground size-7 h-6 w-6';
        resetBtn.title = 'Reset result box size';
        // Inward-pointing arrows icon (each arrow from the expand icon rotated 180°)
        resetBtn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="fill-current h-3 w-3 text-muted-foreground"><path fill-rule="evenodd" clip-rule="evenodd" d="M19 9C19.5523 9 20 9.44772 20 10C20 10.5523 19.5523 11 19 11H14C13.4477 11 13 10.5523 13 10V5C13 4.44772 13.4477 4 14 4C14.5523 4 15 4.44772 15 5V7.58579L19.2929 3.2929C19.6834 2.9024 20.3166 2.9024 20.7071 3.2929C21.0976 3.6834 21.0976 4.31658 20.7071 4.70711L16.4142 9H19ZM4.70711 20.7071C4.31658 21.0976 3.6834 21.0976 3.2929 20.7071C2.9024 20.3166 2.9024 19.6834 3.2929 19.2929L7.58579 15H5C4.44772 15 4 14.5523 4 14C4 13.4477 4.44772 13 5 13H10C10.5523 13 11 13.4477 11 14V19C11 19.5523 10.5523 20 10 20C9.44772 20 9 19.5523 9 19V16.4142L4.70711 20.7071Z"/></svg>';

        resetBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            resultDiv.style.maxHeight = '';
            Logger.log(`user reset result box height to default`);
        });

        // Insert after the divider in the result toolbar
        const divider = buttonContainer.querySelector('.w-px.h-4.bg-border.mx-1');
        if (divider) {
            divider.insertAdjacentElement('afterend', resetBtn);
        } else {
            buttonContainer.appendChild(resetBtn);
        }
    },

    findResultButtonContainer(card) {
        const stepResult = card.querySelector(this.selectors.stepResult);
        if (stepResult) {
            const divider = stepResult.querySelector('.w-px.h-4.bg-border.mx-1');
            if (divider) return divider.parentElement;
        }
        const sections = card.querySelectorAll('div.space-y-2');
        for (const section of sections) {
            const header = section.querySelector('div.text-xs.font-medium.text-muted-foreground.uppercase');
            if (header && header.textContent.trim() === 'Result') {
                const divider = section.querySelector('.w-px.h-4.bg-border.mx-1');
                if (divider) return divider.parentElement;
            }
        }
        return null;
    },

    findWorkflowPanel() {
        const byDataUi = document.querySelector(this.selectors.workflowPanel);
        if (byDataUi) return byDataUi;
        const panels = Context.dom.queryAll('[data-panel-id][data-panel]', { context: `${this.id}.panels` });
        for (const candidate of panels) {
            const toolbar = candidate.querySelector('.border-b.h-9');
            if (toolbar) {
                const workflowText = Array.from(toolbar.querySelectorAll('span')).find(
                    span => span.textContent.trim() === 'Workflow'
                );
                if (workflowText) return candidate;
            }
        }
        return null;
    },

    findToolsArea(panel) {
        if (!panel) return null;
        const container = panel.querySelector(this.selectors.workflowStepsContainer);
        if (container) {
            const spaceY3 = container.querySelector(':scope > .space-y-3');
            return spaceY3 || container;
        }
        const scrollable = panel.querySelector('.overflow-y-auto');
        if (!scrollable) return null;
        return scrollable.querySelector('.space-y-3');
    }
};

return plugin;
},
        "archetypes/tool-use-task-creation-openclaw/main/user-story-markdown.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {
// ============= user-story-markdown.js =============
// Thin wrapper: shared Context.userStoryMarkdown library.

const plugin = {
    id: 'userStoryMarkdown',
    name: 'User Story Markdown',
    description: 'Renders the User Story as markdown',
    _version: '1.1',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        styleInjected: false,
        activationLogged: false,
        missingLogged: false,
        activeByBody: null
    },

    onMutation(state) {
        const api = Context.userStoryMarkdown;
        if (!api || typeof api.run !== 'function') return;
        api.run(state, {
            pluginId: this.id,
            logTag: this.id
        });
    }
};

return plugin;
},
        "archetypes/tool-use-task-creation-openclaw/main/user-story-collapse.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {
// ============= user-story-collapse.js =============
// Thin wrapper: shared Context.userStoryCollapse library.

const plugin = {
    id: 'userStoryCollapse',
    name: 'User Story Collapse',
    description:
        'Adds Hide/Show on the User Story row to collapse the story body below the label',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        missingLogged: false,
        activationLogged: false
    },

    onMutation(state) {
        const api = Context.userStoryCollapse;
        if (!api || typeof api.run !== 'function') return;
        api.run(state, { pluginId: this.id, logTag: this.id });
    }
};

return plugin;
},
        "archetypes/tool-use-revision/main/prompt-scratchpad.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {
// ============= prompt-scratchpad.js =============
// Thin wrapper: shared Context.promptScratchpad library.

const plugin = {
    id: 'promptScratchpad',
    name: 'Scratchpad',
    description: 'Adds an adjustable height scratchpad to the page',
    _version: '2.3',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        scratchpadInserted: false,
        resizeHandlerAttached: false,
        searchAttempted: false,
        insertionFailedLogged: false
    },

    onMutation(state) {
        const api = Context.promptScratchpad;
        if (!api || typeof api.run !== 'function') return;
        api.run(state, {
            pluginId: this.id,
            logTag: this.id,
            storageKey: 'tool-use-revision-scratchpad-height'
        });
    }
};

return plugin;
},
        "archetypes/tool-use-revision/main/prompt-text-counter.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {
// ============= prompt-text-counter.js =============
// Thin wrapper: shared Context.promptTextCounter library.

const plugin = {
    id: 'promptTextCounter',
    name: 'Prompt Text Counter',
    description: 'Shows a live word and character count below the prompt',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: { missingLogged: false, activationLogged: false, boundTextarea: null },

    onMutation(state) {
        const api = Context.promptTextCounter;
        if (!api || typeof api.run !== 'function') {
            return;
        }
        api.run(state, { logTag: this.id, pluginId: this.id });
    }
};

return plugin;
},
        "archetypes/tool-use-revision/main/tool-results-resize-handle.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {

// ============= tool-results-resize-handle.js =============
// Adds a drag-to-resize handle to the bottom of tool result boxes.

const plugin = {
    id: 'toolResultsResizeHandle',
    name: 'Tool Results Resize Handle',
    description: 'Adds a resize handle to tool result boxes so their height can be adjusted by dragging',
    _version: '3.4',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: { panelId: null, missingLogged: false },

    selectors: {
        toolCard: '[data-ui="workflow-step"]',
        toolCardFallback: 'div.rounded-lg.border.transition-colors',
        stepResult: '[data-ui="step-result"]'
    },

    onMutation(state, context) {
        const panel = this.findWorkflowPanel();
        if (!panel) {
            if (!state.missingLogged) {
                Logger.warn(`workflow panel not found`);
                state.missingLogged = true;
            }
            return;
        }

        const currentPanelId = panel.getAttribute('data-panel-id');
        if (state.panelId !== currentPanelId) {
            state.panelId = currentPanelId;
            state.missingLogged = false;
        }

        const toolsContainer = this.findToolsArea(panel);
        if (!toolsContainer) {
            if (!state.missingLogged) {
                Logger.warn(`tools container not found`);
                state.missingLogged = true;
            }
            return;
        }

        const toolCardsByDataUi = toolsContainer.querySelectorAll(this.selectors.toolCard);
        const toolCards = toolCardsByDataUi.length ? Array.from(toolCardsByDataUi) : Context.dom.queryAll(this.selectors.toolCardFallback, { root: toolsContainer, context: `${this.id}.toolCards` });

        let handlesAdded = 0;

        toolCards.forEach(card => {
            const resultDiv = this.findResultDiv(card);
            if (!resultDiv) return;

            // Check if handle already attached and still in DOM
            if (resultDiv.dataset.wfResultResizeAttached === '1') {
                const nextEl = resultDiv.nextElementSibling;
                if (nextEl && nextEl.classList.contains('wf-result-resize-handle')) {
                    this.ensureResetButton(card, resultDiv);
                    return; // Handle present, nothing to do
                }
                // Handle was removed (e.g. React re-render), reset flag
                delete resultDiv.dataset.wfResultResizeAttached;
            }

            this.attachResizeHandle(resultDiv);
            resultDiv.dataset.wfResultResizeAttached = '1';
            this.ensureResetButton(card, resultDiv);
            handlesAdded++;
        });

        if (handlesAdded > 0) {
            Logger.debug(`Added ${handlesAdded} result resize handle(s)`);
        }
    },

    findResultDiv(card) {
        const stepResult = card.querySelector(this.selectors.stepResult);
        if (stepResult) {
            const box = stepResult.querySelector('div.p-3.rounded-md.border.text-xs.font-mono.whitespace-pre-wrap.overflow-auto');
            if (box) return box;
        }
        const sections = card.querySelectorAll('div.space-y-2');
        for (const section of sections) {
            const header = section.querySelector('div.text-xs.font-medium.text-muted-foreground.uppercase');
            if (header && header.textContent.trim() === 'Result') {
                return section.querySelector(
                    'div.p-3.rounded-md.border.text-xs.font-mono.whitespace-pre-wrap.overflow-auto'
                );
            }
        }
        return null;
    },

    attachResizeHandle(resultDiv) {
        // --- Build handle element ---
        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'wf-result-resize-handle';
        Object.assign(resizeHandle.style, {
            height: '8px',
            cursor: 'ns-resize',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: '0',
            transition: 'opacity 0.15s',
            userSelect: 'none'
        });

        const handleBar = document.createElement('div');
        Object.assign(handleBar.style, {
            width: '40px',
            height: '3px',
            borderRadius: '1.5px',
            backgroundColor: 'currentColor',
            opacity: '0.3'
        });
        resizeHandle.appendChild(handleBar);

        // --- Hover behaviour: show on result-div or handle hover ---
        resultDiv.addEventListener('mouseenter', () => {
            resizeHandle.style.opacity = '1';
        });
        resultDiv.addEventListener('mouseleave', (e) => {
            if (!e.relatedTarget || !resizeHandle.contains(e.relatedTarget)) {
                resizeHandle.style.opacity = '0';
            }
        });
        resizeHandle.addEventListener('mouseenter', () => {
            resizeHandle.style.opacity = '1';
        });
        resizeHandle.addEventListener('mouseleave', (e) => {
            if (!e.relatedTarget || !resultDiv.contains(e.relatedTarget)) {
                resizeHandle.style.opacity = '0';
            }
        });

        // Insert handle right after result div
        resultDiv.insertAdjacentElement('afterend', resizeHandle);

        // --- Drag-to-resize logic ---
        let isResizing = false;
        let startY = 0;
        let startHeight = 0;
        const minHeight = 40;
        let lastClientY = 0;
        let accumulatedScrollDelta = 0;
        let animFrameId = null;
        const scrollContainer = resultDiv.closest('.overflow-y-auto');
        const edgeThreshold = 50;
        const maxScrollSpeed = 15;

        const autoScroll = () => {
            if (!isResizing || !scrollContainer) return;

            const distFromBottom = window.innerHeight - lastClientY;
            const distFromTop = lastClientY;
            let scrollAmount = 0;

            if (distFromBottom < edgeThreshold) {
                scrollAmount = Math.ceil(maxScrollSpeed * (1 - distFromBottom / edgeThreshold));
            } else if (distFromTop < edgeThreshold) {
                scrollAmount = -Math.ceil(maxScrollSpeed * (1 - distFromTop / edgeThreshold));
            }

            if (scrollAmount !== 0) {
                scrollContainer.scrollTop += scrollAmount;
                accumulatedScrollDelta += scrollAmount;

                const totalDelta = (lastClientY - startY) + accumulatedScrollDelta;
                const newHeight = Math.max(minHeight, startHeight + totalDelta);
                resultDiv.style.maxHeight = `${newHeight}px`;
            }

            animFrameId = requestAnimationFrame(autoScroll);
        };

        const handleMouseDown = (e) => {
            isResizing = true;
            startY = e.clientY;
            startHeight = resultDiv.offsetHeight;
            lastClientY = e.clientY;
            accumulatedScrollDelta = 0;

            e.preventDefault();
            e.stopPropagation();

            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);

            document.body.style.cursor = 'ns-resize';
            document.body.style.userSelect = 'none';

            animFrameId = requestAnimationFrame(autoScroll);
        };

        const handleMouseMove = (e) => {
            if (!isResizing) return;

            lastClientY = e.clientY;
            const totalDelta = (e.clientY - startY) + accumulatedScrollDelta;
            const newHeight = Math.max(minHeight, startHeight + totalDelta);
            resultDiv.style.maxHeight = `${newHeight}px`;
        };

        const handleMouseUp = () => {
            if (!isResizing) return;
            const endH = resultDiv.offsetHeight;
            if (endH !== startHeight) {
                Logger.debug(`user finished resizing result box`, { fromPx: startHeight, toPx: endH });
            }
            isResizing = false;

            if (animFrameId) {
                cancelAnimationFrame(animFrameId);
                animFrameId = null;
            }

            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);

            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };

        CleanupRegistry.registerEventListener(resizeHandle, 'mousedown', handleMouseDown);
    },

    ensureResetButton(card, resultDiv) {
        const buttonContainer = this.findResultButtonContainer(card);
        if (!buttonContainer) return;

        // Check if button already exists
        if (buttonContainer.querySelector('.wf-result-reset-btn')) return;

        const resetBtn = document.createElement('button');
        resetBtn.className = 'wf-result-reset-btn inline-flex items-center justify-center whitespace-nowrap rounded-sm text-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground size-7 h-6 w-6';
        resetBtn.title = 'Reset result box size';
        // Inward-pointing arrows icon (each arrow from the expand icon rotated 180°)
        resetBtn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="fill-current h-3 w-3 text-muted-foreground"><path fill-rule="evenodd" clip-rule="evenodd" d="M19 9C19.5523 9 20 9.44772 20 10C20 10.5523 19.5523 11 19 11H14C13.4477 11 13 10.5523 13 10V5C13 4.44772 13.4477 4 14 4C14.5523 4 15 4.44772 15 5V7.58579L19.2929 3.2929C19.6834 2.9024 20.3166 2.9024 20.7071 3.2929C21.0976 3.6834 21.0976 4.31658 20.7071 4.70711L16.4142 9H19ZM4.70711 20.7071C4.31658 21.0976 3.6834 21.0976 3.2929 20.7071C2.9024 20.3166 2.9024 19.6834 3.2929 19.2929L7.58579 15H5C4.44772 15 4 14.5523 4 14C4 13.4477 4.44772 13 5 13H10C10.5523 13 11 13.4477 11 14V19C11 19.5523 10.5523 20 10 20C9.44772 20 9 19.5523 9 19V16.4142L4.70711 20.7071Z"/></svg>';

        resetBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            resultDiv.style.maxHeight = '';
            Logger.log(`user reset result box height to default`);
        });

        // Insert after the divider in the result toolbar
        const divider = buttonContainer.querySelector('.w-px.h-4.bg-border.mx-1');
        if (divider) {
            divider.insertAdjacentElement('afterend', resetBtn);
        } else {
            buttonContainer.appendChild(resetBtn);
        }
    },

    findResultButtonContainer(card) {
        // Find the Result section's toolbar button row (contains search input, divider, action buttons)
        const sections = card.querySelectorAll('div.space-y-2');
        for (const section of sections) {
            const header = section.querySelector('div.text-xs.font-medium.text-muted-foreground.uppercase');
            if (header && header.textContent.trim() === 'Result') {
                const divider = section.querySelector('.w-px.h-4.bg-border.mx-1');
                if (divider) return divider.parentElement;
            }
        }
        return null;
    },

    findWorkflowPanel() {
        const byDataUi = document.querySelector('[data-ui="workflow-panel"]');
        if (byDataUi) return byDataUi;
        const panels = Context.dom.queryAll('[data-panel-id][data-panel]', { context: `${this.id}.panels` });
        for (const candidate of panels) {
            const toolbar = candidate.querySelector('[data-ui="workflow-toolbar"]') || candidate.querySelector('.border-b.h-9');
            if (toolbar) {
                const workflowText = Array.from(toolbar.querySelectorAll('span')).find(span => span.textContent.trim() === 'Workflow');
                if (workflowText) return candidate;
            }
        }
        return null;
    },

    findToolsArea(panel) {
        if (!panel) return null;
        const stepsContainer = panel.querySelector('[data-ui="workflow-steps-container"]');
        if (stepsContainer) return stepsContainer;
        const scrollable = panel.querySelector('.overflow-y-auto');
        if (!scrollable) return null;
        return scrollable.querySelector('.space-y-3');
    }
};

return plugin;
},
        "archetypes/tool-use-revision/main/user-story-markdown.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {
// ============= user-story-markdown.js =============
// Thin wrapper: shared Context.userStoryMarkdown library.

const plugin = {
    id: 'userStoryMarkdown',
    name: 'User Story Markdown',
    description: 'Renders the User Story as markdown',
    _version: '1.1',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        styleInjected: false,
        activationLogged: false,
        missingLogged: false,
        activeByBody: null
    },

    onMutation(state) {
        const api = Context.userStoryMarkdown;
        if (!api || typeof api.run !== 'function') return;
        api.run(state, {
            pluginId: this.id,
            logTag: this.id
        });
    }
};

return plugin;
},
        "archetypes/tool-use-revision/main/user-story-collapse.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {
// ============= user-story-collapse.js =============
// Thin wrapper: shared Context.userStoryCollapse library.

const plugin = {
    id: 'userStoryCollapse',
    name: 'User Story Collapse',
    description:
        'Adds Hide/Show on the User Story row to collapse the story body below the label',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        missingLogged: false,
        activationLogged: false
    },

    onMutation(state) {
        const api = Context.userStoryCollapse;
        if (!api || typeof api.run !== 'function') return;
        api.run(state, { pluginId: this.id, logTag: this.id });
    }
};

return plugin;
},
        "archetypes/comp-use-task-creation/main/action-counter.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {
// ============= action-counter.js =============
// Creation placement: page header right cluster via Context.actionCounter library.

const plugin = {
    id: 'compUseActionCounter',
    name: 'Action Counter',
    description:
        'Persistent +/- counter in the page header; click the number to type a value',
    _version: '3.2',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        headerMissingLogged: false,
        activationLogged: false,
        hadHeader: false,
        migratedLegacy: false,
        stepsHiddenLogged: false
    },

    isPageHeaderRow(el) {
        if (!el || el.tagName !== 'DIV') return false;
        const text = (el.textContent || '').toLowerCase();
        return text.includes('create problem') && text.includes('create demonstration');
    },

    resolveJustifyBetweenHeader(fromEl) {
        let node = fromEl;
        while (node && node !== document.body) {
            if (node.tagName === 'DIV') {
                const style = node.className || '';
                if (
                    typeof style === 'string' &&
                    style.includes('justify-between') &&
                    this.isPageHeaderRow(node)
                ) {
                    return node;
                }
            }
            node = node.parentElement;
        }
        return null;
    },

    findPageHeaderRowFromLabels(root) {
        const candidates = root.querySelectorAll('div');
        for (const el of candidates) {
            if (!this.isPageHeaderRow(el)) continue;
            // Prefer the innermost flex row that still contains both step labels.
            let best = el;
            for (const child of el.querySelectorAll('div')) {
                if (this.isPageHeaderRow(child) && el.contains(child)) {
                    best = child;
                }
            }
            const justified = this.resolveJustifyBetweenHeader(best);
            if (justified) return justified;
            return best;
        }
        return null;
    },

    findPageHeaderRowFromToolbarButton() {
        const buttons = Array.from(document.querySelectorAll('button'));
        const toolbarBtn = buttons.find((btn) => {
            const text = (btn.textContent || '').trim();
            return text.includes('Start Recording') || text.includes('Reset Instance');
        });
        if (!toolbarBtn) return null;
        return this.resolveJustifyBetweenHeader(toolbarBtn);
    },

    findPageHeaderRow() {
        // Creation: #prompt-editor is a textarea inside the left form, not a panel.
        // Scoping from that (or #problem-form) and stopping at the first flex-col
        // never reaches the page header above the panel group — search from main.
        const root = document.querySelector('main') || document.body;
        return this.findPageHeaderRowFromLabels(root) || this.findPageHeaderRowFromToolbarButton();
    },

    findRightHost(headerRow) {
        if (!headerRow) return null;
        for (const child of headerRow.children) {
            if (child.tagName !== 'DIV') continue;
            const cls = child.className || '';
            if (typeof cls === 'string' && cls.includes('ml-auto')) {
                return child;
            }
        }
        // Fallback: any sibling of the steps cluster that holds buttons.
        for (const child of headerRow.children) {
            if (child.tagName !== 'DIV') continue;
            const text = (child.textContent || '').toLowerCase();
            if (text.includes('create problem')) continue;
            if (child.querySelector('button')) return child;
        }
        return headerRow;
    },

    hideCreationStepLabels(headerRow, state) {
        if (!headerRow) return;
        if (headerRow.getAttribute('data-fleet-hide-creation-steps') === '1') return;

        let left = null;
        for (const child of headerRow.children) {
            if (child.tagName !== 'DIV') continue;
            const cls = child.className || '';
            if (typeof cls === 'string' && cls.includes('ml-auto')) continue;
            const text = (child.textContent || '').toLowerCase();
            if (text.includes('create problem') && text.includes('create demonstration')) {
                left = child;
                break;
            }
        }
        if (!left) return;

        const kids = Array.from(left.children);
        const stepSpans = kids.filter((el) => {
            if (el.tagName !== 'SPAN') return false;
            const t = (el.textContent || '').toLowerCase();
            return /create problem|create demonstration/.test(t);
        });
        if (!stepSpans.length) return;

        for (const span of stepSpans) {
            span.style.display = 'none';
        }

        if (stepSpans.length >= 2) {
            const start = kids.indexOf(stepSpans[0]);
            const end = kids.indexOf(stepSpans[stepSpans.length - 1]);
            for (let i = start + 1; i < end; i++) {
                const el = kids[i];
                if (!el || typeof el.tagName !== 'string') continue;
                if (el.tagName.toLowerCase() === 'svg') {
                    el.style.display = 'none';
                }
            }
        }

        headerRow.setAttribute('data-fleet-hide-creation-steps', '1');
        if (!state.stepsHiddenLogged) {
            Logger.log('step labels hidden');
            state.stepsHiddenLogged = true;
        }
    },

    onMutation(state) {
        const api = Context.actionCounter;
        if (!api || typeof api.run !== 'function') return;

        const marker = api.COUNTER_MARKER || 'data-fleet-action-counter';
        const headerRow = this.findPageHeaderRow();
        if (!headerRow) {
            if (state.hadHeader) {
                Logger.debug(`page header left DOM — counter inactive`);
                state.hadHeader = false;
                state.activationLogged = false;
                state.stepsHiddenLogged = false;
            }
            if (!state.headerMissingLogged) {
                Logger.debug(`page header not found yet`);
                state.headerMissingLogged = true;
            }
            return;
        }

        state.headerMissingLogged = false;
        state.hadHeader = true;
        this.hideCreationStepLabels(headerRow, state);

        const host = this.findRightHost(headerRow);
        if (!host) return;

        api.run(state, {
            pluginId: this.id,
            logTag: this.id,
            activationDetail: 'counter injected in page header',
            alreadyMounted: () => Boolean(host.querySelector(`[${marker}="true"]`)),
            mountCounter: (counter) => {
                if (host === headerRow) {
                    counter.style.marginLeft = 'auto';
                    host.appendChild(counter);
                    return;
                }
                counter.style.marginLeft = '';
                host.insertBefore(counter, host.firstChild);
            }
        });
    }
};

return plugin;
},
        "archetypes/comp-use-task-creation/main/fos-vm-clipboard.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {
// ============= fos-vm-clipboard.js =============
// Creation placement: page header beside Action Counter via Context.fosVmClipboardBar.

const plugin = {
    id: 'fosVmClipboardBar',
    name: 'VM Clipboard',
    description:
        'Extract/Overwrite VM Clipboard controls in the page header (shown when FOS env is ready)',
    _version: '2.1',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        headerMissingLogged: false,
        activationLogged: false,
        hadHeader: false,
        uiHostClaimed: false,
        unsubscribe: null,
        groupEl: null,
        readyShownLogged: false,
        readyHiddenLogged: false,
        apiMissingLogged: false
    },

    init(state) {
        if (Context.fosEmbedded && typeof Context.fosEmbedded.claimUiHost === 'function') {
            Context.fosEmbedded.claimUiHost(this.id);
            state.uiHostClaimed = true;
            Logger.log(`claimed FOS UI host (floating panel suppressed)`);
        } else {
            Logger.debug(`Context.fosEmbedded missing at init — will retry on mutation`);
        }
    },

    isPageHeaderRow(el) {
        if (!el || el.tagName !== 'DIV') return false;
        const text = (el.textContent || '').toLowerCase();
        return text.includes('create problem') && text.includes('create demonstration');
    },

    resolveJustifyBetweenHeader(fromEl) {
        let node = fromEl;
        while (node && node !== document.body) {
            if (node.tagName === 'DIV') {
                const style = node.className || '';
                if (
                    typeof style === 'string' &&
                    style.includes('justify-between') &&
                    this.isPageHeaderRow(node)
                ) {
                    return node;
                }
            }
            node = node.parentElement;
        }
        return null;
    },

    findPageHeaderRowFromLabels(root) {
        const candidates = root.querySelectorAll('div');
        for (const el of candidates) {
            if (!this.isPageHeaderRow(el)) continue;
            let best = el;
            for (const child of el.querySelectorAll('div')) {
                if (this.isPageHeaderRow(child) && el.contains(child)) {
                    best = child;
                }
            }
            const justified = this.resolveJustifyBetweenHeader(best);
            if (justified) return justified;
            return best;
        }
        return null;
    },

    findPageHeaderRowFromToolbarButton() {
        const buttons = Array.from(document.querySelectorAll('button'));
        const toolbarBtn = buttons.find((btn) => {
            const text = (btn.textContent || '').trim();
            return text.includes('Start Recording') || text.includes('Reset Instance');
        });
        if (!toolbarBtn) return null;
        return this.resolveJustifyBetweenHeader(toolbarBtn);
    },

    findPageHeaderRow() {
        // Creation: #prompt-editor is a textarea inside the left form, not a panel.
        // Scoping from that (or #problem-form) and stopping at the first flex-col
        // never reaches the page header above the panel group — search from main.
        const root = document.querySelector('main') || document.body;
        return this.findPageHeaderRowFromLabels(root) || this.findPageHeaderRowFromToolbarButton();
    },

    findRightHost(headerRow) {
        if (!headerRow) return null;
        for (const child of headerRow.children) {
            if (child.tagName !== 'DIV') continue;
            const cls = child.className || '';
            if (typeof cls === 'string' && cls.includes('ml-auto')) {
                return child;
            }
        }
        for (const child of headerRow.children) {
            if (child.tagName !== 'DIV') continue;
            const text = (child.textContent || '').toLowerCase();
            if (text.includes('create problem')) continue;
            if (child.querySelector('button')) return child;
        }
        return headerRow;
    },

    onMutation(state) {
        if (!state.uiHostClaimed && Context.fosEmbedded && typeof Context.fosEmbedded.claimUiHost === 'function') {
            Context.fosEmbedded.claimUiHost(this.id);
            state.uiHostClaimed = true;
            Logger.log(`claimed FOS UI host (floating panel suppressed)`);
        }

        const api = Context.fosVmClipboardBar;
        if (!api || typeof api.run !== 'function') return;

        const marker = api.BAR_MARKER || 'data-fleet-fos-vm-clipboard-bar';
        const counterMarker = 'data-fleet-action-counter';
        const headerRow = this.findPageHeaderRow();
        if (!headerRow) {
            if (state.hadHeader) {
                Logger.debug(`page header left DOM — clipboard bar inactive`);
                state.hadHeader = false;
                state.activationLogged = false;
                state.readyShownLogged = false;
                state.readyHiddenLogged = false;
            }
            if (!state.headerMissingLogged) {
                Logger.debug(`page header not found yet`);
                state.headerMissingLogged = true;
            }
            return;
        }

        state.headerMissingLogged = false;
        state.hadHeader = true;

        const host = this.findRightHost(headerRow);
        if (!host) return;

        const counter = host.querySelector(`[${counterMarker}="true"]`);
        if (!counter) {
            return;
        }

        api.run(state, {
            pluginId: this.id,
            logTag: this.id,
            activationDetail: 'VM Clipboard injected in page header',
            alreadyMounted: () => Boolean(host.querySelector(`[${marker}="true"]`)),
            mountGroup: (group) => {
                counter.insertAdjacentElement('afterend', group);
            }
        });
    }
};

return plugin;
},
        "archetypes/comp-use-task-creation/main/fos-iframe-autoconnect.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {
// ============= fos-iframe-autoconnect.js =============
// Thin wrapper: shared Context.fosIframeAutoconnect library.

const plugin = {
    id: 'compUseTaskCreationFosIframeAutoconnect',
    name: 'FOS Viewport Resize',
    description:
        'Resizes the embedded FOS environment to the viewport. Autoconnects the instance and open-in-new-tab URL; reconnects when the tab is focused again unless the environment pane is hidden',
    _version: '1.2',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        waitingIframeLogged: false,
        waitingFosLogged: false,
        patchedLogged: false,
        openBtnLogged: false,
        hadIframe: false,
        hadOpenBtn: false,
        patchInProgress: false,
        visibilityInstalled: false,
        wasHidden: false,
        desktopUnsub: null,
        reloadTimer: null,
        pendingFocusReconnect: false
    },

    onMutation(state) {
        const api = Context.fosIframeAutoconnect;
        if (!api || typeof api.run !== 'function') return;
        api.run(state, { pluginId: this.id });
    }
};

return plugin;
},
        "archetypes/comp-use-task-creation/main/notes-resize-handle.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {
// ============= notes-resize-handle.js =============
// Thin wrapper: shared Context.notesResizeHandle library.

const plugin = {
    id: 'notesResizeHandle',
    name: 'Notes Resize Handle',
    description: 'Adds a vertical resize handle to the QA reviewer notes textarea',
    _version: '1.2',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: { missingLogged: false },

    onMutation(state) {
        const api = Context.notesResizeHandle;
        if (!api || typeof api.run !== 'function') {
            return;
        }
        api.run(state, { logTag: this.id });
    }
};

return plugin;
},
        "archetypes/comp-use-task-creation/main/prompt-text-counter.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {
// ============= prompt-text-counter.js =============
// Thin wrapper: shared Context.promptTextCounter library.

const plugin = {
    id: 'promptTextCounter',
    name: 'Prompt Text Counter',
    description: 'Shows a live word and character count below the prompt',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: { missingLogged: false, activationLogged: false, boundTextarea: null },

    onMutation(state) {
        const api = Context.promptTextCounter;
        if (!api || typeof api.run !== 'function') {
            return;
        }
        api.run(state, { logTag: this.id, pluginId: this.id });
    }
};

return plugin;
},
        "archetypes/comp-use-task-creation/main/user-story-markdown.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {
// ============= user-story-markdown.js =============
// Thin wrapper: shared Context.userStoryMarkdown library.

const plugin = {
    id: 'userStoryMarkdown',
    name: 'User Story Markdown',
    description: 'Renders the User Story as markdown',
    _version: '1.1',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        styleInjected: false,
        activationLogged: false,
        missingLogged: false,
        activeByBody: null
    },

    onMutation(state) {
        const api = Context.userStoryMarkdown;
        if (!api || typeof api.run !== 'function') return;
        api.run(state, {
            pluginId: this.id,
            logTag: this.id
        });
    }
};

return plugin;
},
        "archetypes/comp-use-task-creation/main/user-story-collapse.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {
// ============= user-story-collapse.js =============
// Thin wrapper: shared Context.userStoryCollapse library.

const plugin = {
    id: 'userStoryCollapse',
    name: 'User Story Collapse',
    description:
        'Adds Hide/Show on the User Story row to collapse the story body below the label',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        missingLogged: false,
        activationLogged: false
    },

    onMutation(state) {
        const api = Context.userStoryCollapse;
        if (!api || typeof api.run !== 'function') return;
        api.run(state, { pluginId: this.id, logTag: this.id });
    }
};

return plugin;
},
        "archetypes/comp-use-task-creation/main/toggle-main-panels.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {
// ============= toggle-main-panels.js =============
// Thin wrapper: shared Context.toggleMainPanels library.

const plugin = {
    id: 'toggleMainPanels',
    name: 'Toggle Main Panels',
    description: 'Hide or unhide either main pane (task detail or environment); the other pane expands to full width',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        styleInjected: false,
        missingLogged: false,
        headerMissingLogged: false,
        activationLogged: false,
        hiddenPane: null
    },

    onMutation(state) {
        const api = Context.toggleMainPanels;
        if (!api || typeof api.run !== 'function') return;
        api.run(state, { pluginId: this.id, logTag: this.id });
    }
};

return plugin;
},
        "archetypes/comp-use-revision/main/action-counter.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {
// ============= action-counter.js =============
// Revision placement: page header right cluster via Context.actionCounter library.

const plugin = {
    id: 'compUseActionCounter',
    name: 'Action Counter',
    description:
        'Persistent +/- counter in the page header; click the number to type a value',
    _version: '3.1',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        headerMissingLogged: false,
        activationLogged: false,
        hadHeader: false,
        migratedLegacy: false
    },

    isPageHeaderRow(el) {
        if (!el || el.tagName !== 'DIV') return false;
        const text = (el.textContent || '').toLowerCase();
        return text.includes('edit problem') && text.includes('create demonstration');
    },

    findPageHeaderRow() {
        const panel =
            document.getElementById('prompt-editor') ||
            document.getElementById('instance-preview');
        let root = panel;
        while (root && root !== document.body) {
            if (root.tagName === 'MAIN' || (root.classList && root.classList.contains('flex-col'))) {
                break;
            }
            root = root.parentElement;
        }
        if (!root) {
            root = document.querySelector('main') || document.body;
        }

        const candidates = root.querySelectorAll('div');
        for (const el of candidates) {
            if (!this.isPageHeaderRow(el)) continue;
            // Prefer the innermost flex row that still contains both step labels.
            let best = el;
            for (const child of el.querySelectorAll('div')) {
                if (this.isPageHeaderRow(child) && el.contains(child)) {
                    best = child;
                }
            }
            // Walk up to the justify-between row when nested.
            let node = best;
            while (node && node !== el.parentElement) {
                const style = node.className || '';
                if (
                    typeof style === 'string' &&
                    style.includes('justify-between') &&
                    this.isPageHeaderRow(node)
                ) {
                    return node;
                }
                node = node.parentElement;
            }
            return best;
        }
        return null;
    },

    findRightHost(headerRow) {
        if (!headerRow) return null;
        for (const child of headerRow.children) {
            if (child.tagName !== 'DIV') continue;
            const cls = child.className || '';
            if (typeof cls === 'string' && cls.includes('ml-auto')) {
                return child;
            }
        }
        // Fallback: any sibling of the steps cluster that holds buttons.
        for (const child of headerRow.children) {
            if (child.tagName !== 'DIV') continue;
            const text = (child.textContent || '').toLowerCase();
            if (text.includes('edit problem')) continue;
            if (child.querySelector('button')) return child;
        }
        return headerRow;
    },

    onMutation(state) {
        const api = Context.actionCounter;
        if (!api || typeof api.run !== 'function') return;

        const marker = api.COUNTER_MARKER || 'data-fleet-action-counter';
        const headerRow = this.findPageHeaderRow();
        if (!headerRow) {
            if (state.hadHeader) {
                Logger.debug(`page header left DOM — counter inactive`);
                state.hadHeader = false;
                state.activationLogged = false;
            }
            if (!state.headerMissingLogged) {
                Logger.debug(`page header not found yet`);
                state.headerMissingLogged = true;
            }
            return;
        }

        state.headerMissingLogged = false;
        state.hadHeader = true;

        const host = this.findRightHost(headerRow);
        if (!host) return;

        api.run(state, {
            pluginId: this.id,
            logTag: this.id,
            activationDetail: 'counter injected in page header',
            alreadyMounted: () => Boolean(host.querySelector(`[${marker}="true"]`)),
            mountCounter: (counter) => {
                if (host === headerRow) {
                    counter.style.marginLeft = 'auto';
                    host.appendChild(counter);
                    return;
                }
                counter.style.marginLeft = '';
                host.insertBefore(counter, host.firstChild);
            }
        });
    }
};

return plugin;
},
        "archetypes/comp-use-revision/main/fos-vm-clipboard.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {
// ============= fos-vm-clipboard.js =============
// Revision placement: page header beside Action Counter via Context.fosVmClipboardBar.

const plugin = {
    id: 'fosVmClipboardBar',
    name: 'VM Clipboard',
    description:
        'Extract/Overwrite VM Clipboard controls in the page header (shown when FOS env is ready)',
    _version: '2.0',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        headerMissingLogged: false,
        activationLogged: false,
        hadHeader: false,
        uiHostClaimed: false,
        unsubscribe: null,
        groupEl: null,
        readyShownLogged: false,
        readyHiddenLogged: false,
        apiMissingLogged: false
    },

    init(state) {
        if (Context.fosEmbedded && typeof Context.fosEmbedded.claimUiHost === 'function') {
            Context.fosEmbedded.claimUiHost(this.id);
            state.uiHostClaimed = true;
            Logger.log(`claimed FOS UI host (floating panel suppressed)`);
        } else {
            Logger.debug(`Context.fosEmbedded missing at init — will retry on mutation`);
        }
    },

    isPageHeaderRow(el) {
        if (!el || el.tagName !== 'DIV') return false;
        const text = (el.textContent || '').toLowerCase();
        return text.includes('edit problem') && text.includes('create demonstration');
    },

    findPageHeaderRow() {
        const panel =
            document.getElementById('prompt-editor') ||
            document.getElementById('instance-preview');
        let root = panel;
        while (root && root !== document.body) {
            if (root.tagName === 'MAIN' || (root.classList && root.classList.contains('flex-col'))) {
                break;
            }
            root = root.parentElement;
        }
        if (!root) {
            root = document.querySelector('main') || document.body;
        }

        const candidates = root.querySelectorAll('div');
        for (const el of candidates) {
            if (!this.isPageHeaderRow(el)) continue;
            let best = el;
            for (const child of el.querySelectorAll('div')) {
                if (this.isPageHeaderRow(child) && el.contains(child)) {
                    best = child;
                }
            }
            let node = best;
            while (node && node !== el.parentElement) {
                const style = node.className || '';
                if (
                    typeof style === 'string' &&
                    style.includes('justify-between') &&
                    this.isPageHeaderRow(node)
                ) {
                    return node;
                }
                node = node.parentElement;
            }
            return best;
        }
        return null;
    },

    findRightHost(headerRow) {
        if (!headerRow) return null;
        for (const child of headerRow.children) {
            if (child.tagName !== 'DIV') continue;
            const cls = child.className || '';
            if (typeof cls === 'string' && cls.includes('ml-auto')) {
                return child;
            }
        }
        for (const child of headerRow.children) {
            if (child.tagName !== 'DIV') continue;
            const text = (child.textContent || '').toLowerCase();
            if (text.includes('edit problem')) continue;
            if (child.querySelector('button')) return child;
        }
        return headerRow;
    },

    onMutation(state) {
        if (!state.uiHostClaimed && Context.fosEmbedded && typeof Context.fosEmbedded.claimUiHost === 'function') {
            Context.fosEmbedded.claimUiHost(this.id);
            state.uiHostClaimed = true;
            Logger.log(`claimed FOS UI host (floating panel suppressed)`);
        }

        const api = Context.fosVmClipboardBar;
        if (!api || typeof api.run !== 'function') return;

        const marker = api.BAR_MARKER || 'data-fleet-fos-vm-clipboard-bar';
        const counterMarker = 'data-fleet-action-counter';
        const headerRow = this.findPageHeaderRow();
        if (!headerRow) {
            if (state.hadHeader) {
                Logger.debug(`page header left DOM — clipboard bar inactive`);
                state.hadHeader = false;
                state.activationLogged = false;
                state.readyShownLogged = false;
                state.readyHiddenLogged = false;
            }
            if (!state.headerMissingLogged) {
                Logger.debug(`page header not found yet`);
                state.headerMissingLogged = true;
            }
            return;
        }

        state.headerMissingLogged = false;
        state.hadHeader = true;

        const host = this.findRightHost(headerRow);
        if (!host) return;

        const counter = host.querySelector(`[${counterMarker}="true"]`);
        if (!counter) {
            return;
        }

        api.run(state, {
            pluginId: this.id,
            logTag: this.id,
            activationDetail: 'VM Clipboard injected in page header',
            alreadyMounted: () => Boolean(host.querySelector(`[${marker}="true"]`)),
            mountGroup: (group) => {
                counter.insertAdjacentElement('afterend', group);
            }
        });
    }
};

return plugin;
},
        "archetypes/comp-use-revision/main/fos-iframe-autoconnect.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {
// ============= fos-iframe-autoconnect.js =============
// Thin wrapper: shared Context.fosIframeAutoconnect library.

const plugin = {
    id: 'compUseRevisionFosIframeAutoconnect',
    name: 'FOS Viewport Resize',
    description:
        'Resizes the embedded FOS environment to the viewport. Autoconnects the instance and open-in-new-tab URL; reconnects when the tab is focused again unless the environment pane is hidden',
    _version: '1.2',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        waitingIframeLogged: false,
        waitingFosLogged: false,
        patchedLogged: false,
        openBtnLogged: false,
        hadIframe: false,
        hadOpenBtn: false,
        patchInProgress: false,
        visibilityInstalled: false,
        wasHidden: false,
        desktopUnsub: null,
        reloadTimer: null,
        pendingFocusReconnect: false
    },

    onMutation(state) {
        const api = Context.fosIframeAutoconnect;
        if (!api || typeof api.run !== 'function') return;
        api.run(state, { pluginId: this.id });
    }
};

return plugin;
},
        "archetypes/comp-use-revision/main/prompt-scratchpad.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {
// ============= prompt-scratchpad.js =============
// Thin wrapper: shared Context.promptScratchpad library.

const plugin = {
    id: 'promptScratchpad',
    name: 'Scratchpad',
    description: 'Adds an adjustable height scratchpad to the page',
    _version: '2.3',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        scratchpadInserted: false,
        resizeHandlerAttached: false,
        searchAttempted: false,
        insertionFailedLogged: false
    },

    onMutation(state) {
        const api = Context.promptScratchpad;
        if (!api || typeof api.run !== 'function') return;
        api.run(state, {
            pluginId: this.id,
            logTag: this.id,
            storageKey: 'comp-use-revision-scratchpad-height'
        });
    }
};

return plugin;
},
        "archetypes/comp-use-revision/main/prompt-text-counter.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {
// ============= prompt-text-counter.js =============
// Thin wrapper: shared Context.promptTextCounter library.

const plugin = {
    id: 'promptTextCounter',
    name: 'Prompt Text Counter',
    description: 'Shows a live word and character count below the prompt',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: { missingLogged: false, activationLogged: false, boundTextarea: null },

    onMutation(state) {
        const api = Context.promptTextCounter;
        if (!api || typeof api.run !== 'function') {
            return;
        }
        api.run(state, { logTag: this.id, pluginId: this.id });
    }
};

return plugin;
},
        "archetypes/comp-use-revision/main/user-story-markdown.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {
// ============= user-story-markdown.js =============
// Thin wrapper: shared Context.userStoryMarkdown library.

const plugin = {
    id: 'userStoryMarkdown',
    name: 'User Story Markdown',
    description: 'Renders the User Story as markdown',
    _version: '1.1',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        styleInjected: false,
        activationLogged: false,
        missingLogged: false,
        activeByBody: null
    },

    onMutation(state) {
        const api = Context.userStoryMarkdown;
        if (!api || typeof api.run !== 'function') return;
        api.run(state, {
            pluginId: this.id,
            logTag: this.id
        });
    }
};

return plugin;
},
        "archetypes/comp-use-revision/main/user-story-collapse.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {
// ============= user-story-collapse.js =============
// Thin wrapper: shared Context.userStoryCollapse library.

const plugin = {
    id: 'userStoryCollapse',
    name: 'User Story Collapse',
    description:
        'Adds Hide/Show on the User Story row to collapse the story body below the label',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        missingLogged: false,
        activationLogged: false
    },

    onMutation(state) {
        const api = Context.userStoryCollapse;
        if (!api || typeof api.run !== 'function') return;
        api.run(state, { pluginId: this.id, logTag: this.id });
    }
};

return plugin;
},
        "archetypes/comp-use-revision/main/toggle-main-panels.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {
// ============= toggle-main-panels.js =============
// Thin wrapper: shared Context.toggleMainPanels library.

const plugin = {
    id: 'toggleMainPanels',
    name: 'Toggle Main Panels',
    description: 'Hide or unhide either main pane (task detail or environment); the other pane expands to full width',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        styleInjected: false,
        missingLogged: false,
        headerMissingLogged: false,
        activationLogged: false,
        hiddenPane: null
    },

    onMutation(state) {
        const api = Context.toggleMainPanels;
        if (!api || typeof api.run !== 'function') return;
        api.run(state, { pluginId: this.id, logTag: this.id });
    }
};

return plugin;
},
        "archetypes/qa-tool-use/main/accept-task-modal-improvements.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {
// ============= accept-task-modal-improvements.js =============
// Thin wrapper: shared Context.acceptTaskModalImprovements library.

const plugin = {
    id: 'acceptTaskModalImprovements',
    name: '"Accept Task" Modal Improvements',
    description: 'Add a button above the optional comments box to paste a positive blurb',
    _version: '1.8',
    enabledByDefault: true,
    phase: 'mutation',

    subOptions: [
        {
            id: 'motivate-worker-button',
            name: 'Motivate worker with positive comment',
            description: "Add a green button above the optional comments box that pastes a random positive blurb when clicked",
            enabledByDefault: true
        }
    ],

    initialState: {
        missingLogged: false,
        lastProcessedDialog: null,
        motivateButtonAdded: false
    },

    onMutation(state) {
        const api = Context.acceptTaskModalImprovements;
        if (!api || typeof api.run !== 'function') return;
        api.run(state, { pluginId: this.id, logTag: this.id });
    }
};

return plugin;
},
        "archetypes/qa-tool-use/main/copy-verifier-output.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {
// ============= copy-verifier-output.js =============
// Thin wrapper: shared Context.copyVerifierOutput library.

const plugin = {
    id: 'copyVerifierOutput',
    name: 'Copy Verifier Output',
    description:
        'Copy buttons for Stdout, Score, and expanded Raw Output',
    _version: '4.2',
    enabledByDefault: true,
    phase: 'mutation',

    initialState: {
        buttonAdded: false,
        verifierTargetMissingLogged: false
    },

    onMutation(state, context) {
        const api = Context.copyVerifierOutput;
        if (!api || typeof api.run !== 'function') return;
        api.run(state, { pluginId: this.id, logTag: this.id });
    }
};

return plugin;
},
        "archetypes/qa-tool-use/main/hide-verifier-output.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {
// ============= hide-verifier-output.js =============
// Hide/Show Verifier body on QA Tool Use; auto-show when Run Verifier goes disabled.

const SCOPE = '#instance-bottom';
const HIDDEN_BODY_ATTR = 'data-fleet-verifier-body-hidden';
const COLLAPSED_PANEL_ATTR = 'data-fleet-verifier-collapsed';
const SAVED_FLEX_ATTR = 'data-fleet-verifier-saved-flex';
const SAVED_PANEL_MAX_ATTR = 'data-fleet-verifier-saved-panel-max';
const SAVED_PANEL_MIN_ATTR = 'data-fleet-verifier-saved-panel-min';
const SAVED_PANEL_OVERFLOW_ATTR = 'data-fleet-verifier-saved-panel-overflow';
const SAVED_CARD_HEIGHT_ATTR = 'data-fleet-verifier-saved-card-height';
const SAVED_CARD_MAX_ATTR = 'data-fleet-verifier-saved-card-max';
const SAVED_CARD_MIN_ATTR = 'data-fleet-verifier-saved-card-min';
const DEFAULT_HEADER_PX = 40;

const plugin = {
    id: 'hideVerifierOutput',
    name: 'Hide Verifier Output',
    description:
        'Hide/Show Verifier Output on the bottom panel',
    _version: '1.8',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        missingLogged: false,
        activationLogged: false,
        injectLogged: false,
        hidden: false,
        runBtn: null,
        runObserver: null,
        runClickHandler: null,
        wasRunDisabled: false,
        bodyEl: null,
        panelEl: null,
        toolbarEl: null,
        cardEl: null,
        headerRowEl: null
    },

    onMutation(state) {
        const ctx = this.findVerifierContext();
        if (!ctx) {
            this.resetPane(state);
            return;
        }

        state.missingLogged = false;
        // DOM is source of truth after collapse / React remounts
        state.hidden = this.isBodyHidden(ctx.body);
        this.storeCtxRefs(ctx, state);
        this.ensureToggle(ctx, state);
        this.ensureRunWatch(ctx.runBtn, state);

        if (!state.activationLogged) {
            Logger.log('Hide Verifier control ready');
            state.activationLogged = true;
        }

        this.syncFromRunButton(ctx.runBtn, state);
    },

    resetPane(state) {
        this.teardownRunWatch(state);
        if (state.activationLogged || state.hidden) {
            Logger.debug('Verifier Output pane gone — reset');
        }
        state.missingLogged = false;
        state.activationLogged = false;
        state.injectLogged = false;
        state.hidden = false;
        state.wasRunDisabled = false;
        state.bodyEl = null;
        state.panelEl = null;
        state.toolbarEl = null;
        state.cardEl = null;
        state.headerRowEl = null;
    },

    storeCtxRefs(ctx, state) {
        state.bodyEl = ctx.body;
        state.panelEl = ctx.panel;
        state.toolbarEl = ctx.toolbar;
        state.cardEl = ctx.card || null;
        state.headerRowEl = ctx.headerRow || null;
    },

    isBodyHidden(body) {
        if (!body) return false;
        return (
            body.getAttribute(HIDDEN_BODY_ATTR) === '1' ||
            body.style.display === 'none'
        );
    },

    isRunVerifierButton(btn) {
        const text = (btn.textContent || '').replace(/\s+/g, ' ').trim();
        return text === 'Run Verifier' || /^Run Verifier\b/i.test(text);
    },

    findRunVerifierButton(root) {
        const scope = root || document;
        const buttons = scope.querySelectorAll ? scope.querySelectorAll('button') : [];
        for (const btn of buttons) {
            if (this.isRunVerifierButton(btn)) return btn;
        }
        return null;
    },

    findInstanceBottom(fromEl) {
        if (!fromEl || !fromEl.closest) return null;
        return (
            fromEl.closest('#instance-bottom') ||
            fromEl.closest('[data-panel-id="instance-bottom"]') ||
            null
        );
    },

    /**
     * Body must be the flex-1 sibling under the Verifier Output card inside
     * #instance-bottom — never a page-level flex-1 (e.g. #instance-top).
     */
    resolveHeaderAndBody(toolbar) {
        const panel = this.findInstanceBottom(toolbar);
        if (!panel) return null;

        let headerRow = toolbar.closest('.h-9.border-b');
        if (!headerRow || !panel.contains(headerRow)) {
            headerRow = null;
            const candidates = panel.querySelectorAll('.border-b');
            for (const el of candidates) {
                if (!el.contains(toolbar)) continue;
                if (!/Verifier Output/i.test(el.textContent || '')) continue;
                headerRow = el;
                break;
            }
        }
        if (!headerRow || !panel.contains(headerRow)) return null;
        if (!/Verifier Output/i.test(headerRow.textContent || '')) return null;

        const card = headerRow.parentElement;
        if (!card || !panel.contains(card)) return null;

        let body = null;
        for (const child of card.children) {
            if (child === headerRow) continue;
            if (child.classList && child.classList.contains('flex-1')) {
                body = child;
                break;
            }
        }
        if (!body) body = headerRow.nextElementSibling;

        if (!body || !panel.contains(body)) return null;
        if (body.contains(headerRow) || body.contains(toolbar)) return null;
        if (body.id === 'instance-top' || body.querySelector('#instance-top, [data-ui="qa-header"]')) {
            return null;
        }

        return { headerRow, card, body, panel };
    },

    findVerifierContext() {
        const runBtn = this.findRunVerifierButton(document);
        if (!runBtn) return null;

        const toolbar = runBtn.parentElement;
        if (!toolbar) return null;

        const resolved = this.resolveHeaderAndBody(toolbar);
        if (!resolved) return null;

        return { runBtn, toolbar, ...resolved };
    },

    isSafeBodyRef(body, panel) {
        return Boolean(
            body &&
                body.isConnected &&
                panel &&
                panel.isConnected &&
                panel.contains(body) &&
                body.id !== 'instance-top' &&
                !body.querySelector('#instance-top, [data-ui="qa-header"]')
        );
    },

    contextFromToggle(btn, state) {
        const toolbar = btn.parentElement || state.toolbarEl;
        const panel =
            (state.panelEl && state.panelEl.isConnected
                ? state.panelEl
                : null) || this.findInstanceBottom(toolbar || btn);
        const body =
            this.isSafeBodyRef(state.bodyEl, panel) ? state.bodyEl : null;

        if (body && toolbar) {
            return {
                runBtn: state.runBtn,
                toolbar,
                body,
                panel,
                headerRow:
                    state.headerRowEl && state.headerRowEl.isConnected
                        ? state.headerRowEl
                        : null,
                card: state.cardEl && state.cardEl.isConnected ? state.cardEl : body.parentElement
            };
        }

        if (!toolbar) return null;
        const resolved = this.resolveHeaderAndBody(toolbar);
        if (!resolved) return null;

        const runBtn =
            (state.runBtn && state.runBtn.isConnected && this.isRunVerifierButton(state.runBtn)
                ? state.runBtn
                : null) || this.findRunVerifierButton(toolbar) || this.findRunVerifierButton(document);

        return { runBtn, toolbar, ...resolved };
    },

    applyToggleChrome(btn) {
        if (Context.uiLib && typeof Context.uiLib.btnClass === 'function') {
            btn.className = Context.uiLib.btnClass('basic', 'compact');
        } else if (!btn.className) {
            btn.className =
                'inline-flex items-center justify-center whitespace-nowrap rounded-sm font-medium h-7 text-xs pl-2 pr-2 py-1';
        }
        btn.style.flexShrink = '0';
        btn.style.pointerEvents = 'auto';
        btn.style.position = 'relative';
        btn.style.zIndex = '2';
    },

    ensureToggle(ctx, state) {
        if (Context.uiLib && typeof Context.uiLib.ensureButtonStyles === 'function') {
            Context.uiLib.ensureButtonStyles(SCOPE);
        }

        const existing = ctx.toolbar.querySelector(
            '[data-fleet-plugin="hideVerifierOutput"][data-slot="hide-verifier-toggle"]'
        );
        if (existing) {
            this.applyToggleChrome(existing);
            this.syncToggleLabel(existing, state.hidden);
            return existing;
        }

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('data-fleet-plugin', this.id);
        btn.setAttribute('data-slot', 'hide-verifier-toggle');
        this.applyToggleChrome(btn);
        this.syncToggleLabel(btn, state.hidden);

        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.handleToggleClick(btn, state);
        });

        ctx.toolbar.insertBefore(btn, ctx.runBtn);
        if (typeof CleanupRegistry !== 'undefined' && CleanupRegistry.registerElement) {
            CleanupRegistry.registerElement(btn);
        }
        if (!state.injectLogged) {
            Logger.log('toggle injected before Run Verifier');
            state.injectLogged = true;
        } else {
            Logger.debug('toggle reinjected before Run Verifier');
        }
        return btn;
    },

    handleToggleClick(btn, state) {
        const live = this.contextFromToggle(btn, state);
        if (!live || !live.body) {
            Logger.warn('click — could not resolve verifier body');
            return;
        }

        this.storeCtxRefs(live, state);

        const hidden = this.isBodyHidden(live.body) || state.hidden;
        if (hidden) {
            this.showVerifier(live, state, 'click');
        } else {
            this.hideVerifier(live, state, 'click');
        }
        this.syncToggleLabel(btn, state.hidden);
        this.applyToggleChrome(btn);
    },

    syncToggleLabel(btn, hidden) {
        const label = hidden ? 'Show Verifier' : 'Hide Verifier';
        btn.textContent = label;
        btn.setAttribute('aria-label', label);
        btn.title = label;
    },

    measureHeaderPx(ctx) {
        const header = ctx.headerRow;
        if (header && header.isConnected) {
            const rect = header.getBoundingClientRect();
            // Include toolbar mb-1 overhang so controls are not clipped
            const h = Math.ceil(Math.max(header.scrollHeight, rect.height, header.offsetHeight) + 4);
            if (h > 0) return h;
        }
        return DEFAULT_HEADER_PX;
    },

    collapsePanel(ctx, headerPx) {
        const panel = ctx.panel;
        const card = ctx.card || (ctx.body && ctx.body.parentElement);
        if (!panel) return;

        if (!panel.hasAttribute(SAVED_FLEX_ATTR)) {
            panel.setAttribute(SAVED_FLEX_ATTR, panel.style.flex || '');
        }
        if (!panel.hasAttribute(SAVED_PANEL_MAX_ATTR)) {
            panel.setAttribute(SAVED_PANEL_MAX_ATTR, panel.style.maxHeight || '');
        }
        if (!panel.hasAttribute(SAVED_PANEL_MIN_ATTR)) {
            panel.setAttribute(SAVED_PANEL_MIN_ATTR, panel.style.minHeight || '');
        }
        if (!panel.hasAttribute(SAVED_PANEL_OVERFLOW_ATTR)) {
            panel.setAttribute(SAVED_PANEL_OVERFLOW_ATTR, panel.style.overflow || '');
        }

        panel.setAttribute(COLLAPSED_PANEL_ATTR, '1');
        // Explicit basis + minHeight; overflow visible so Show stays clickable
        panel.style.flex = `0 0 ${headerPx}px`;
        panel.style.minHeight = `${headerPx}px`;
        panel.style.maxHeight = '';
        panel.style.overflow = 'visible';

        if (ctx.headerRow) {
            ctx.headerRow.style.flexShrink = '0';
        }

        if (!card) return;

        if (!card.hasAttribute(SAVED_CARD_HEIGHT_ATTR)) {
            card.setAttribute(SAVED_CARD_HEIGHT_ATTR, card.style.height || '');
        }
        if (!card.hasAttribute(SAVED_CARD_MAX_ATTR)) {
            card.setAttribute(SAVED_CARD_MAX_ATTR, card.style.maxHeight || '');
        }
        if (!card.hasAttribute(SAVED_CARD_MIN_ATTR)) {
            card.setAttribute(SAVED_CARD_MIN_ATTR, card.style.minHeight || '');
        }
        card.style.height = 'auto';
        card.style.maxHeight = 'none';
        card.style.minHeight = '0';
        card.style.overflow = 'visible';
    },

    restorePanel(ctx) {
        const panel = ctx.panel;
        const card =
            ctx.card ||
            (ctx.body && ctx.body.parentElement) ||
            null;

        if (panel) {
            panel.removeAttribute(COLLAPSED_PANEL_ATTR);
            if (panel.hasAttribute(SAVED_FLEX_ATTR)) {
                panel.style.flex = panel.getAttribute(SAVED_FLEX_ATTR) || '';
                panel.removeAttribute(SAVED_FLEX_ATTR);
            }
            if (panel.hasAttribute(SAVED_PANEL_MAX_ATTR)) {
                panel.style.maxHeight = panel.getAttribute(SAVED_PANEL_MAX_ATTR) || '';
                panel.removeAttribute(SAVED_PANEL_MAX_ATTR);
            }
            if (panel.hasAttribute(SAVED_PANEL_MIN_ATTR)) {
                panel.style.minHeight = panel.getAttribute(SAVED_PANEL_MIN_ATTR) || '';
                panel.removeAttribute(SAVED_PANEL_MIN_ATTR);
            }
            if (panel.hasAttribute(SAVED_PANEL_OVERFLOW_ATTR)) {
                panel.style.overflow = panel.getAttribute(SAVED_PANEL_OVERFLOW_ATTR) || '';
                panel.removeAttribute(SAVED_PANEL_OVERFLOW_ATTR);
            }
        }

        if (card && card.hasAttribute(SAVED_CARD_HEIGHT_ATTR)) {
            card.style.height = card.getAttribute(SAVED_CARD_HEIGHT_ATTR) || '';
            card.removeAttribute(SAVED_CARD_HEIGHT_ATTR);
        }
        if (card && card.hasAttribute(SAVED_CARD_MAX_ATTR)) {
            card.style.maxHeight = card.getAttribute(SAVED_CARD_MAX_ATTR) || '';
            card.removeAttribute(SAVED_CARD_MAX_ATTR);
        }
        if (card && card.hasAttribute(SAVED_CARD_MIN_ATTR)) {
            card.style.minHeight = card.getAttribute(SAVED_CARD_MIN_ATTR) || '';
            card.removeAttribute(SAVED_CARD_MIN_ATTR);
        }
        if (card) {
            card.style.overflow = '';
        }
        if (ctx.headerRow) {
            ctx.headerRow.style.flexShrink = '';
        }
    },

    hideVerifier(ctx, state, reason) {
        if (!ctx.body) {
            Logger.warn(`hide failed — no body (${reason})`);
            return;
        }
        if (this.isBodyHidden(ctx.body) && state.hidden) {
            Logger.debug(`hide skipped — already hidden (${reason})`);
            return;
        }

        const headerPx = this.measureHeaderPx(ctx);
        const card = ctx.card || ctx.body.parentElement;
        if (card && !ctx.card) ctx.card = card;

        ctx.body.style.display = 'none';
        ctx.body.setAttribute(HIDDEN_BODY_ATTR, '1');

        this.collapsePanel(ctx, headerPx);

        state.hidden = true;
        Logger.log(`hidden (${reason})`);
    },

    showVerifier(ctx, state, reason) {
        if (!ctx.body) {
            Logger.warn(`show failed — no body (${reason})`);
            return;
        }

        const wasHidden = this.isBodyHidden(ctx.body) || state.hidden;
        if (!wasHidden) {
            Logger.debug(`show skipped — already visible (${reason})`);
            return;
        }

        ctx.body.style.display = '';
        ctx.body.removeAttribute(HIDDEN_BODY_ATTR);

        if (!ctx.card) {
            ctx.card =
                (state.cardEl && state.cardEl.isConnected ? state.cardEl : null) ||
                ctx.body.parentElement;
        }
        if (!ctx.headerRow && state.headerRowEl && state.headerRowEl.isConnected) {
            ctx.headerRow = state.headerRowEl;
        }
        this.restorePanel(ctx);

        state.hidden = false;
        const toolbar = ctx.toolbar || state.toolbarEl;
        const toggle =
            toolbar &&
            toolbar.querySelector(
                '[data-fleet-plugin="hideVerifierOutput"][data-slot="hide-verifier-toggle"]'
            );
        if (toggle) {
            this.syncToggleLabel(toggle, false);
            this.applyToggleChrome(toggle);
        }
        Logger.log(`shown (${reason})`);
    },

    ensureRunWatch(runBtn, state) {
        if (state.runBtn === runBtn && state.runObserver) {
            this.syncFromRunButton(runBtn, state);
            return;
        }

        // React often remounts Run Verifier already disabled — compare against prior node state
        const prevDisabled = state.wasRunDisabled;
        this.teardownRunWatch(state);
        state.runBtn = runBtn;

        const disabled = this.isRunButtonDisabled(runBtn);
        state.wasRunDisabled = disabled;

        const self = this;
        const observer = new MutationObserver(() => {
            self.syncFromRunButton(runBtn, state);
        });
        observer.observe(runBtn, {
            attributes: true,
            attributeFilter: ['disabled', 'class', 'aria-disabled']
        });
        state.runObserver = observer;
        if (typeof CleanupRegistry !== 'undefined' && CleanupRegistry.registerObserver) {
            CleanupRegistry.registerObserver(observer);
        }

        // Capture click as well: show immediately when the operator starts a run
        const onRunClick = () => {
            self.autoShowIfHidden(state, 'run-verifier-click');
        };
        runBtn.addEventListener('click', onRunClick, true);
        state.runClickHandler = onRunClick;
        if (typeof CleanupRegistry !== 'undefined' && CleanupRegistry.registerEventListener) {
            CleanupRegistry.registerEventListener(runBtn, 'click', onRunClick, true);
        }

        if (disabled && !prevDisabled) {
            this.autoShowIfHidden(state, 'run-verifier-disabled');
        }
    },

    isRunButtonDisabled(runBtn) {
        if (!runBtn) return false;
        return Boolean(runBtn.disabled) || runBtn.getAttribute('aria-disabled') === 'true';
    },

    autoShowIfHidden(state, reason) {
        const hidden =
            state.hidden ||
            this.isBodyHidden(state.bodyEl) ||
            (state.panelEl && state.panelEl.getAttribute(COLLAPSED_PANEL_ATTR) === '1');
        if (!hidden) return;

        const ctx =
            (this.isSafeBodyRef(state.bodyEl, state.panelEl)
                ? {
                      body: state.bodyEl,
                      panel: state.panelEl,
                      toolbar: state.toolbarEl,
                      card: state.cardEl && state.cardEl.isConnected ? state.cardEl : null,
                      headerRow:
                          state.headerRowEl && state.headerRowEl.isConnected
                              ? state.headerRowEl
                              : null
                  }
                : null) || this.findVerifierContext();
        if (!ctx || !ctx.body) {
            Logger.warn(`auto-show failed — could not resolve verifier body (${reason})`);
            return;
        }
        this.showVerifier(ctx, state, reason);
    },

    syncFromRunButton(runBtn, state) {
        if (!runBtn || !runBtn.isConnected) return;
        const disabled = this.isRunButtonDisabled(runBtn);
        const becameDisabled = disabled && !state.wasRunDisabled;
        state.wasRunDisabled = disabled;

        if (!becameDisabled) return;
        this.autoShowIfHidden(state, 'run-verifier-disabled');
    },

    teardownRunWatch(state) {
        if (state.runObserver) {
            try {
                state.runObserver.disconnect();
            } catch (e) {
                /* ignore */
            }
            state.runObserver = null;
        }
        if (state.runBtn && state.runClickHandler) {
            try {
                state.runBtn.removeEventListener('click', state.runClickHandler, true);
            } catch (e) {
                /* ignore */
            }
        }
        state.runClickHandler = null;
        state.runBtn = null;
    }
};

return plugin;
},
        "archetypes/qa-tool-use/main/request-revisions.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {
// ============= request-revisions.js =============
// Thin wrapper: shared Context.requestRevisions library.

const plugin = {
    id: 'requestRevisions',
    name: '"Request Revisions" Modal Improvements',
    description:
        'Guidelines, copy actions, task-only issue selection, and screenshot upload on Request Revisions',
    _version: '8.0',
    enabledByDefault: true,
    phase: 'mutation',

    subOptions: [
        {
            id: 'copy-prompt-button',
            name: 'Copy Prompt button',
            enabledByDefault: true
        },
        {
            id: 'copy-verifier-output-button',
            name: 'Copy Verifier Output button',
            enabledByDefault: true
        },
        {
            id: 'copy-link-general-guidelines',
            name: 'General Guidelines',
            enabledByDefault: true
        },
        {
            id: 'copy-link-tool-use-guidelines',
            name: 'Tool Use Guidelines',
            enabledByDefault: true
        },
        {
            id: 'copy-link-qa-guidelines',
            name: 'QA Guidelines',
            enabledByDefault: true
        },
        {
            id: 'copy-link-time-submission-guidelines',
            name: 'Time Submission Guidelines',
            enabledByDefault: true
        },
        {
            id: 'task-only-issues',
            name: 'Task-only issues',
            enabledByDefault: true
        },
        {
            id: 'screenshot-upload-improvement',
            name: 'Screenshot upload improvement',
            enabledByDefault: true
        }
    ],

    initialState: {
        missingLogged: false,
        warnLogged: false,
        activationLogged: false,
        taskOnlyStyleReady: false,
        screenshotStyleReady: false,
        screenshotMissingLogged: false,
        injectedLogged: false,
        pasteListenerAttached: false,
        promptText: null,
        verifierOutput: null,
        verifierObserver: null,
        verifierElement: null,
        verifierChangeObserver: null,
        verifierWatchEligibleAt: undefined,
        promptQualityRating: null,
        lastSig: 0
    },

    onMutation(state) {
        const api = Context.requestRevisions;
        if (!api || typeof api.run !== 'function') return;
        api.run(state, { pluginId: this.id, logTag: this.id });
    }
};

return plugin;
},
        "archetypes/qa-tool-use/main/text-sanitizer.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {
// ============= text-sanitizer.js =============
// Adds a Text Sanitizer module in the same area as the QA scratchpad (below it when present).
// Independent of scratchpad: appears after Prompt section or after scratchpad/guideline buttons.
// Actions: dropdown + Execute. Date/Time to ISO is first and default. Date/Time to ISO uses a working ISO 8601 converter (date + optional time).

const DEFAULT_ACTION_ID = 'dateTimeToIso';

const MONTHS = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
    jan: 1, feb: 2, mar: 3, apr: 4, jun: 6,
    jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12
};

const MP = '(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Sept?|Jun|Jul|Aug|Oct|Nov|Dec)\\.?';

/**
 * Parse date and optional time from normalized input (single spaces, trimmed).
 * Returns { iso } or null. ISO is local time, no Z suffix.
 */
function parseDateInputToIso(text) {
    let year;
    let month;
    let day;
    let dateStr;

    const patterns = [
        { re: new RegExp(`(${MP})\\s+(\\d{1,2})\\s*(?:st|nd|rd|th)?\\s*,?\\s*(\\d{4})`, 'i'),
          parse: m => ({ month: MONTHS[m[1].replace('.', '').toLowerCase()], day: +m[2], year: +m[3] }) },
        { re: new RegExp(`(\\d{1,2})\\s*(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MP})\\s*,?\\s*(\\d{4})`, 'i'),
          parse: m => ({ day: +m[1], month: MONTHS[m[2].replace('.', '').toLowerCase()], year: +m[3] }) },
        { re: new RegExp(`(\\d{4})\\s+(?:,\\s*)?(${MP})\\s+(\\d{1,2})\\s*(?:st|nd|rd|th)?`, 'i'),
          parse: m => ({ year: +m[1], month: MONTHS[m[2].replace('.', '').toLowerCase()], day: +m[3] }) },
        { re: /(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/,
          parse: m => ({ year: +m[1], month: +m[2], day: +m[3] }) },
        { re: /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/,
          parse: m => ({ month: +m[1], day: +m[2], year: +m[3] }) }
    ];

    for (const p of patterns) {
        const m = text.match(p.re);
        if (m) {
            ({ year, month, day } = p.parse(m));
            dateStr = m[0];
            break;
        }
    }

    if (year === undefined) return null;
    if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1) return null;
    const testDate = new Date(year, month - 1, day);
    if (testDate.getMonth() !== month - 1 || testDate.getDate() !== day) return null;

    let remainder = text.replace(dateStr, ' ');
    let hours = null;
    let minutes = null;
    let seconds = null;

    if (/\bnoon\b/i.test(remainder)) {
        hours = 12;
        minutes = 0;
        seconds = 0;
    } else if (/\bmidnight\b/i.test(remainder)) {
        hours = 0;
        minutes = 0;
        seconds = 0;
    }

    if (hours === null) {
        const tm = remainder.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?/i);
        if (tm) {
            hours = +tm[1];
            minutes = +tm[2];
            seconds = tm[3] ? +tm[3] : 0;
            const ap = (tm[4] || '').replace(/\./g, '').toLowerCase();
            if (ap === 'pm' && hours !== 12) hours += 12;
            if (ap === 'am' && hours === 12) hours = 0;
        }
    }

    if (hours === null) {
        const tm = remainder.match(/(\d{1,2})\s*(am|pm|a\.m\.|p\.m\.)/i);
        if (tm) {
            hours = +tm[1];
            minutes = 0;
            seconds = 0;
            const ap = tm[2].replace(/\./g, '').toLowerCase();
            if (ap === 'pm' && hours !== 12) hours += 12;
            if (ap === 'am' && hours === 12) hours = 0;
        }
    }

    if (hours !== null) {
        if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59) return null;
    }

    const pad = (n, w = 2) => String(n).padStart(w, '0');
    let iso = `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
    if (hours !== null) iso += `T${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;

    return { iso };
}

const plugin = {
    id: 'textSanitizer',
    name: 'Text Sanitizer',
    description: 'Adds a text sanitizer utility for quickly cleaning and transforming text',
    _version: '3.2',
    enabledByDefault: false,
    phase: 'mutation',

    initialState: {
        promptMissingLogged: false,
        copyFeedbackTimeoutId: null,
    },

    onMutation(state, context) {
        const tabBars = this.findTaskNotesTabBars();

        if (tabBars.length === 0) {
            const promptSection = this.findPromptSection();
            if (!promptSection) {
                if (!state.promptMissingLogged) {
                    state.promptMissingLogged = true;
                    Logger.debug('Text Sanitizer: Prompt section not found');
                }
                return;
            }
            state.promptMissingLogged = false;
            const anchor = this.getInsertAnchor(promptSection);
            this.ensureTextSanitizerBelowAnchor(state, anchor);
            return;
        }

        for (const tabBar of tabBars) {
            const contentRoot = this.getPanelContentRoot(tabBar);
            if (!contentRoot) continue;

            if (!this.isTaskTabActive(tabBar)) {
                contentRoot.querySelectorAll('[data-qa-text-sanitizer="true"]').forEach((el) => {
                    el.remove();
                    Logger.debug('Text Sanitizer: Removed from panel (Notes tab active)');
                });
                continue;
            }

            const promptSection = this.findPromptSection(contentRoot);
            if (!promptSection) continue;

            state.promptMissingLogged = false;
            const anchor = this.getInsertAnchor(promptSection);
            this.ensureTextSanitizerBelowAnchor(state, anchor);
        }
    },

    findPromptSection(scopeRoot) {
        const root = scopeRoot || document.querySelector('[data-ui="qa-task-detail-panel"]') || document;
        if (root.querySelector && root.querySelector('#prompt-editor')) {
            const promptEditor = root.querySelector('#prompt-editor');
            const section = promptEditor.closest('div.space-y-2.relative') || promptEditor.closest('div.space-y-2') || promptEditor.closest('div.flex.flex-col.gap-2');
            if (section) return section;
        }
        const options = { context: `${this.id}.findPromptSection`, root };

        // Label-based fallback: find "Prompt" or "Problem Description" label then climb to section wrapper.
        const labelSelectors = ['span.text-sm.text-muted-foreground.font-medium', 'div.text-sm.text-muted-foreground.font-medium'];
        for (const sel of labelSelectors) {
            const elements = Context.dom.queryAll(sel, options);
            for (const el of elements) {
                const text = (el.textContent || '').trim();
                const isPrompt = text === 'Prompt' || text.startsWith('Prompt');
                const isProblemDesc = text === 'Problem Description' || text.startsWith('Problem Description');
                if (!isPrompt && !isProblemDesc) continue;
                const section = el.closest('div.space-y-2.relative') || el.closest('div.space-y-2') || el.closest('div.flex.flex-col.gap-2');
                if (section) return section;
            }
        }

        const candidates = Context.dom.queryAll('div.flex.flex-col.gap-2', options);
        for (const candidate of candidates) {
            const label = candidate.querySelector('label');
            const span = candidate.querySelector('span.text-sm.text-muted-foreground.font-medium');
            if (label && label.textContent.trim() === 'Prompt') return candidate;
            if (span && span.textContent.trim() === 'Prompt') return candidate;
        }
        return null;
    },

    /**
     * Returns the element after which to insert. Walk nextElementSibling while sibling is
     * scratchpad, guideline buttons, or our own container; use last such as anchor.
     */
    getInsertAnchor(promptSection) {
        let anchor = promptSection;
        let el = promptSection.nextElementSibling;
        while (el) {
            if (el.dataset && el.dataset.qaScratchpad === 'true') {
                anchor = el;
            } else if (el.getAttribute && el.getAttribute('data-fleet-plugin') === 'guidelineButtons') {
                anchor = el;
            } else if (el.dataset && el.dataset.qaTextSanitizer === 'true') {
                anchor = el;
            }
            el = el.nextElementSibling;
        }
        return anchor;
    },

    findTaskNotesTabBars() {
        const tabBars = [];
        const taskDetailPanel = document.querySelector('[data-ui="qa-task-detail-panel"]');
        const roots = taskDetailPanel ? [taskDetailPanel] : [document];
        for (const root of roots) {
            const candidates = root.querySelectorAll('div.flex.items-center.gap-1.px-2.border-b');
            for (const el of candidates) {
                const buttons = el.querySelectorAll('button');
                let hasTask = false;
                let hasNotes = false;
                for (const btn of buttons) {
                    const text = btn.textContent.trim();
                    if (text === 'Task') hasTask = true;
                    if (text === 'Notes') hasNotes = true;
                }
                if (hasTask && hasNotes) tabBars.push(el);
            }
            if (tabBars.length > 0) break;
        }
        return tabBars;
    },

    isTaskTabActive(tabBar) {
        const taskBtn = Array.from(tabBar.querySelectorAll('button')).find(
            (btn) => btn.textContent.trim() === 'Task'
        );
        if (!taskBtn) return false;
        const c = taskBtn.className || '';
        return c.includes('border-primary') || c.includes('text-primary');
    },

    getPanelContentRoot(tabBar) {
        const panel = tabBar.parentElement;
        if (!panel || !panel.querySelector) return null;
        return panel.querySelector('div.flex-1.min-h-0.overflow-auto.p-3') || panel.querySelector('div.overflow-auto') || null;
    },

    /**
     * Parse date and optional time from text; return ISO 8601 (local time, no Z).
     * Based on the working ISO 8601 converter. Returns original input on failure or when no date found.
     */
    parseDateThenTimeToIso(text) {
        try {
            const raw = (text || '').trim().replace(/\s+/g, ' ');
            if (!raw) return text || '';

            const result = parseDateInputToIso(raw);
            return result ? result.iso : text;
        } catch (e) {
            Logger.warn('Text Sanitizer: parseDateThenTimeToIso failed', e);
            return text || '';
        }
    },

    findExistingTextSanitizerAmongSiblings(anchor) {
        let el = anchor.nextElementSibling;
        while (el) {
            if (el.dataset && el.dataset.qaTextSanitizer === 'true') return el;
            el = el.nextElementSibling;
        }
        return null;
    },

    findAllTextSanitizersAmongSiblings(anchor) {
        const found = [];
        let el = anchor.nextElementSibling;
        while (el) {
            if (el.dataset && el.dataset.qaTextSanitizer === 'true') found.push(el);
            el = el.nextElementSibling;
        }
        return found;
    },

    ensureTextSanitizerBelowAnchor(state, anchor) {
        if (anchor.dataset && anchor.dataset.qaTextSanitizer === 'true') {
            const duplicates = this.findAllTextSanitizersAmongSiblings(anchor);
            duplicates.forEach((el) => {
                el.remove();
                Logger.debug('Text Sanitizer: Removed duplicate');
            });
            return;
        }

        const existing = this.findExistingTextSanitizerAmongSiblings(anchor);
        if (existing) {
            const all = this.findAllTextSanitizersAmongSiblings(anchor);
            if (all.length > 1) {
                for (let i = 1; i < all.length; i++) {
                    all[i].remove();
                    Logger.debug('Text Sanitizer: Removed duplicate');
                }
            }
            const remaining = this.findAllTextSanitizersAmongSiblings(anchor);
            const toUse = remaining.length > 0 ? remaining[0] : existing;
            if (toUse && toUse !== anchor.nextElementSibling) {
                anchor.insertAdjacentElement('afterend', toUse);
                Logger.debug('Text Sanitizer: Moved to follow anchor');
            }
            return;
        }

        const container = this.createContainer(state);
        anchor.insertAdjacentElement('afterend', container);
        Logger.log('Text Sanitizer: Inserted below scratchpad area');
    },

    createContainer(state) {
        const container = document.createElement('div');
        container.className = 'flex flex-col gap-2';
        container.dataset.qaTextSanitizer = 'true';
        container.setAttribute('data-fleet-plugin', this.id);

        const ONE_LINE_HEIGHT = 40;
        const MIN_WRAPPER_HEIGHT = 60;
        const RESIZE_HANDLE_HEIGHT = 12;

        const textareaWrapper = document.createElement('div');
        textareaWrapper.className = 'relative flex flex-col rounded-md overflow-hidden border border-input bg-background shadow-sm';
        textareaWrapper.dataset.qaTextSanitizerWrapper = 'true';
        textareaWrapper.style.minHeight = ONE_LINE_HEIGHT + 'px';
        textareaWrapper.style.height = ONE_LINE_HEIGHT + 'px';

        const textarea = document.createElement('textarea');
        textarea.className = 'w-full border-0 bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0 resize-none overflow-y-auto flex-1 min-h-0';
        textarea.placeholder = 'Paste text to sanitize…';
        textarea.rows = 1;
        textarea.dataset.qaTextSanitizerTextarea = 'true';
        textarea.style.height = ONE_LINE_HEIGHT + 'px';

        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'absolute bottom-0 left-0 right-0 h-3 cursor-ns-resize flex items-center justify-center transition-opacity duration-200 flex-shrink-0';
        resizeHandle.style.opacity = '0';
        resizeHandle.style.display = 'none';
        resizeHandle.style.background = 'transparent';
        const handleBar = document.createElement('div');
        handleBar.className = 'w-10 h-1 rounded-sm bg-current opacity-30';
        resizeHandle.appendChild(handleBar);

        const setWrapperOneLine = () => {
            textareaWrapper.style.height = ONE_LINE_HEIGHT + 'px';
            textarea.style.height = ONE_LINE_HEIGHT + 'px';
            resizeHandle.style.display = 'none';
        };

        const updateTextareaHeight = () => {
            const content = textarea.value || '';
            const isEmpty = !content.trim();
            const hasMultiLine = !isEmpty && (content.includes('\n') || textarea.scrollHeight > ONE_LINE_HEIGHT);
            if (hasMultiLine) {
                resizeHandle.style.display = 'flex';
                resizeHandle.style.opacity = '1';
                if (parseInt(textareaWrapper.style.height, 10) <= ONE_LINE_HEIGHT) {
                    textareaWrapper.style.height = '80px';
                    textarea.style.height = (80 - RESIZE_HANDLE_HEIGHT) + 'px';
                }
            } else {
                resizeHandle.style.display = 'none';
                resizeHandle.style.opacity = '0';
                setWrapperOneLine();
            }
        };

        const onInput = () => updateTextareaHeight();
        textarea.addEventListener('input', onInput);
        CleanupRegistry.registerEventListener(textarea, 'input', onInput);

        let isResizing = false;
        let startY = 0;
        let startHeight = 0;
        const handleMouseDown = (e) => {
            isResizing = true;
            startY = e.clientY;
            startHeight = textareaWrapper.offsetHeight;
            e.preventDefault();
            e.stopPropagation();
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = 'ns-resize';
            document.body.style.userSelect = 'none';
        };
        const handleMouseMove = (e) => {
            if (!isResizing) return;
            const deltaY = e.clientY - startY;
            const requested = startHeight + deltaY;
            const maxHeight = textarea.scrollHeight + RESIZE_HANDLE_HEIGHT;
            const newHeight = Math.max(MIN_WRAPPER_HEIGHT, Math.min(maxHeight, requested));
            textareaWrapper.style.height = newHeight + 'px';
            textarea.style.height = (newHeight - RESIZE_HANDLE_HEIGHT) + 'px';
        };
        const handleMouseUp = () => {
            if (!isResizing) return;
            isResizing = false;
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
        resizeHandle.addEventListener('mousedown', handleMouseDown);
        CleanupRegistry.registerEventListener(resizeHandle, 'mousedown', handleMouseDown);

        textareaWrapper.addEventListener('mouseenter', () => { if (resizeHandle.style.display === 'flex') resizeHandle.style.opacity = '1'; });
        textareaWrapper.addEventListener('mouseleave', () => { if (resizeHandle.style.display === 'flex') resizeHandle.style.opacity = '0.6'; });

        textareaWrapper.appendChild(textarea);
        textareaWrapper.appendChild(resizeHandle);
        container.appendChild(textareaWrapper);

        const header = document.createElement('div');
        header.className = 'flex items-center justify-between gap-2';
        const label = document.createElement('span');
        label.className = 'text-sm text-muted-foreground font-medium';
        label.textContent = 'Text Sanitizer';
        header.appendChild(label);
        container.insertBefore(header, textareaWrapper);

        const actionRow = document.createElement('div');
        actionRow.className = 'flex flex-wrap items-center gap-2';
        const copyBtn = this.createCopyButton(state, { onAfterClear: setWrapperOneLine });
        copyBtn.style.marginLeft = 'auto';

        const select = document.createElement('select');
        select.setAttribute('data-fleet-plugin', this.id);
        select.className = 'h-8 rounded-sm border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';
        const actionIds = ['dateTimeToIso', 'removeAllWhitespace', 'trimWhitespace', 'removeSpecialCharacters'];
        actionIds.forEach((id) => {
            const action = this.actions[id];
            if (!action) return;
            const opt = document.createElement('option');
            opt.value = id;
            opt.textContent = action.label;
            if (id === DEFAULT_ACTION_ID) opt.selected = true;
            select.appendChild(opt);
        });
        select.value = DEFAULT_ACTION_ID;

        const buttonClass = 'inline-flex items-center justify-center whitespace-nowrap font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background transition-colors hover:bg-accent hover:text-accent-foreground h-8 rounded-sm pl-3 pr-3 text-xs';
        const executeBtn = document.createElement('button');
        executeBtn.type = 'button';
        executeBtn.className = buttonClass;
        executeBtn.setAttribute('data-fleet-plugin', this.id);
        executeBtn.textContent = 'Execute';
        const onExecute = () => {
            const id = select.value;
            const action = this.actions[id];
            if (!action) return;
            const input = textarea.value || '';
            let ok = true;
            try {
                const output = action.run(input);
                textarea.value = output;
                updateTextareaHeight();
                Logger.log('Text Sanitizer: Executed ' + action.label);
            } catch (e) {
                Logger.error('Text Sanitizer: Execute failed', e);
                textarea.value = input;
                ok = false;
            }
            if (ok) {
                if (Context.buttonFeedback) Context.buttonFeedback.flashSuccess(executeBtn, { restoreStyles: false });
            } else if (Context.buttonFeedback) {
                Context.buttonFeedback.flashFailure(executeBtn, { restoreStyles: false });
            }
        };
        CleanupRegistry.registerEventListener(executeBtn, 'click', onExecute);

        actionRow.appendChild(select);
        actionRow.appendChild(executeBtn);
        actionRow.appendChild(copyBtn);
        container.appendChild(actionRow);

        return container;
    },

    createCopyButton(state, opts) {
        const buttonClass = 'inline-flex items-center justify-center whitespace-nowrap font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background transition-colors hover:bg-accent hover:text-accent-foreground h-8 rounded-sm pl-3 pr-3 text-xs';
        const button = document.createElement('button');
        button.type = 'button';
        button.setAttribute('data-fleet-plugin', this.id);
        button.className = buttonClass;
        button.textContent = 'Copy';
        button.title = 'Copy text';
        button.setAttribute('aria-label', 'Copy text');

        const pulseCopyFailure = () => {
            if (Context.buttonFeedback) Context.buttonFeedback.flashFailure(button, { restoreStyles: false });
        };
        const handleCopy = () => {
            const container = button.closest('[data-qa-text-sanitizer="true"]');
            const textarea = container ? container.querySelector('[data-qa-text-sanitizer-textarea="true"]') : null;
            if (!textarea) {
                pulseCopyFailure();
                return;
            }
            const text = textarea.value || '';
            if (!text) {
                Logger.debug('Text Sanitizer: No text to copy');
                pulseCopyFailure();
                return;
            }
            navigator.clipboard.writeText(text).then(() => {
                Logger.log(`Text Sanitizer: Copied ${text.length} chars and cleared`);
                if (Context.buttonFeedback) Context.buttonFeedback.flashSuccess(button, { restoreStyles: false });
                textarea.value = '';
                if (opts && opts.onAfterClear) opts.onAfterClear();
            }).catch((err) => {
                Logger.error('Text Sanitizer: Failed to copy to clipboard', err);
                pulseCopyFailure();
            });
        };

        CleanupRegistry.registerEventListener(button, 'click', handleCopy);
        return button;
    }
};

plugin.actions = {
    removeAllWhitespace: {
        id: 'removeAllWhitespace',
        label: 'Remove All Whitespace',
        run(input) {
            return (input || '').replace(/\s/g, '');
        }
    },
    trimWhitespace: {
        id: 'trimWhitespace',
        label: 'Trim Whitespace',
        run(input) {
            const s = (input || '').trim();
            return s.split(/\n/).map((line) => line.trim()).filter((line) => line.length > 0).join('\n');
        }
    },
    removeSpecialCharacters: {
        id: 'removeSpecialCharacters',
        label: 'Remove Special Characters',
        run(input) {
            const step = (input || '').replace(/[^a-zA-Z0-9\s]/g, '');
            return plugin.actions.trimWhitespace.run(step);
        }
    },
    dateTimeToIso: {
        id: 'dateTimeToIso',
        label: 'Date/Time to ISO',
        run(input) {
            return plugin.parseDateThenTimeToIso(input || '');
        }
    }
};

return plugin;
},
        "archetypes/qa-tool-use/main/tool-results-resize-handle.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {

// ============= tool-results-resize-handle.js =============
// Adds a drag-to-resize handle to the bottom of tool result boxes.

const plugin = {
    id: 'toolResultsResizeHandle',
    name: 'Tool Results Resize Handle',
    description: 'Adds a resize handle to tool result boxes so their height can be adjusted by dragging',
    _version: '2.4',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: { panelId: null, missingLogged: false },

    selectors: {
        toolCard: '[data-ui="workflow-step"]',
        toolCardFallback: 'div.rounded-lg.border.transition-colors',
        stepResult: '[data-ui="step-result"]'
    },

    onMutation(state, context) {
        const panel = this.findWorkflowPanel();
        if (!panel) {
            if (!state.missingLogged) {
                Logger.warn(`workflow panel not found`);
                state.missingLogged = true;
            }
            return;
        }

        const currentPanelId = panel.getAttribute('data-panel-id');
        if (state.panelId !== currentPanelId) {
            state.panelId = currentPanelId;
            state.missingLogged = false;
        }

        const toolsContainer = this.findToolsArea(panel);
        if (!toolsContainer) {
            if (!state.missingLogged) {
                Logger.warn(`tools container not found`);
                state.missingLogged = true;
            }
            return;
        }

        const toolCardsByDataUi = toolsContainer.querySelectorAll(this.selectors.toolCard);
        const toolCards = toolCardsByDataUi.length ? Array.from(toolCardsByDataUi) : Context.dom.queryAll(this.selectors.toolCardFallback, { root: toolsContainer, context: `${this.id}.toolCards` });

        let handlesAdded = 0;

        toolCards.forEach(card => {
            const resultDiv = this.findResultDiv(card);
            if (!resultDiv) return;

            // Check if handle already attached and still in DOM
            if (resultDiv.dataset.wfResultResizeAttached === '1') {
                const nextEl = resultDiv.nextElementSibling;
                if (nextEl && nextEl.classList.contains('wf-result-resize-handle')) {
                    this.ensureResetButton(card, resultDiv);
                    return; // Handle present, nothing to do
                }
                // Handle was removed (e.g. React re-render), reset flag
                delete resultDiv.dataset.wfResultResizeAttached;
            }

            this.attachResizeHandle(resultDiv);
            resultDiv.dataset.wfResultResizeAttached = '1';
            this.ensureResetButton(card, resultDiv);
            handlesAdded++;
        });

        if (handlesAdded > 0) {
            Logger.debug(`Added ${handlesAdded} result resize handle(s)`);
        }
    },

    findResultDiv(card) {
        const stepResult = card.querySelector(this.selectors.stepResult);
        if (stepResult) {
            const box = stepResult.querySelector('div.p-3.rounded-md.border.text-xs.font-mono.whitespace-pre-wrap.overflow-auto');
            if (box) return box;
        }
        const sections = card.querySelectorAll('div.space-y-2');
        for (const section of sections) {
            const header = section.querySelector('div.text-xs.font-medium.text-muted-foreground.uppercase');
            if (header && header.textContent.trim() === 'Result') {
                return section.querySelector(
                    'div.p-3.rounded-md.border.text-xs.font-mono.whitespace-pre-wrap.overflow-auto'
                );
            }
        }
        return null;
    },

    attachResizeHandle(resultDiv) {
        // --- Build handle element ---
        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'wf-result-resize-handle';
        Object.assign(resizeHandle.style, {
            height: '8px',
            cursor: 'ns-resize',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: '0',
            transition: 'opacity 0.15s',
            userSelect: 'none'
        });

        const handleBar = document.createElement('div');
        Object.assign(handleBar.style, {
            width: '40px',
            height: '3px',
            borderRadius: '1.5px',
            backgroundColor: 'currentColor',
            opacity: '0.3'
        });
        resizeHandle.appendChild(handleBar);

        // --- Hover behaviour: show on result-div or handle hover ---
        resultDiv.addEventListener('mouseenter', () => {
            resizeHandle.style.opacity = '1';
        });
        resultDiv.addEventListener('mouseleave', (e) => {
            if (!e.relatedTarget || !resizeHandle.contains(e.relatedTarget)) {
                resizeHandle.style.opacity = '0';
            }
        });
        resizeHandle.addEventListener('mouseenter', () => {
            resizeHandle.style.opacity = '1';
        });
        resizeHandle.addEventListener('mouseleave', (e) => {
            if (!e.relatedTarget || !resultDiv.contains(e.relatedTarget)) {
                resizeHandle.style.opacity = '0';
            }
        });

        // Insert handle right after result div
        resultDiv.insertAdjacentElement('afterend', resizeHandle);

        // --- Drag-to-resize logic ---
        let isResizing = false;
        let startY = 0;
        let startHeight = 0;
        const minHeight = 40;
        let lastClientY = 0;
        let accumulatedScrollDelta = 0;
        let animFrameId = null;
        const scrollContainer = resultDiv.closest('.overflow-y-auto');
        const edgeThreshold = 50;
        const maxScrollSpeed = 15;

        const autoScroll = () => {
            if (!isResizing || !scrollContainer) return;

            const distFromBottom = window.innerHeight - lastClientY;
            const distFromTop = lastClientY;
            let scrollAmount = 0;

            if (distFromBottom < edgeThreshold) {
                scrollAmount = Math.ceil(maxScrollSpeed * (1 - distFromBottom / edgeThreshold));
            } else if (distFromTop < edgeThreshold) {
                scrollAmount = -Math.ceil(maxScrollSpeed * (1 - distFromTop / edgeThreshold));
            }

            if (scrollAmount !== 0) {
                scrollContainer.scrollTop += scrollAmount;
                accumulatedScrollDelta += scrollAmount;

                const totalDelta = (lastClientY - startY) + accumulatedScrollDelta;
                const newHeight = Math.max(minHeight, startHeight + totalDelta);
                resultDiv.style.maxHeight = `${newHeight}px`;
            }

            animFrameId = requestAnimationFrame(autoScroll);
        };

        const handleMouseDown = (e) => {
            isResizing = true;
            startY = e.clientY;
            startHeight = resultDiv.offsetHeight;
            lastClientY = e.clientY;
            accumulatedScrollDelta = 0;

            e.preventDefault();
            e.stopPropagation();

            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);

            document.body.style.cursor = 'ns-resize';
            document.body.style.userSelect = 'none';

            animFrameId = requestAnimationFrame(autoScroll);
        };

        const handleMouseMove = (e) => {
            if (!isResizing) return;

            lastClientY = e.clientY;
            const totalDelta = (e.clientY - startY) + accumulatedScrollDelta;
            const newHeight = Math.max(minHeight, startHeight + totalDelta);
            resultDiv.style.maxHeight = `${newHeight}px`;
        };

        const handleMouseUp = () => {
            if (!isResizing) return;
            const endH = resultDiv.offsetHeight;
            if (endH !== startHeight) {
                Logger.debug(`user finished resizing result box`, { fromPx: startHeight, toPx: endH });
            }
            isResizing = false;

            if (animFrameId) {
                cancelAnimationFrame(animFrameId);
                animFrameId = null;
            }

            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);

            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };

        CleanupRegistry.registerEventListener(resizeHandle, 'mousedown', handleMouseDown);
    },

    ensureResetButton(card, resultDiv) {
        const buttonContainer = this.findResultButtonContainer(card);
        if (!buttonContainer) return;

        // Check if button already exists
        if (buttonContainer.querySelector('.wf-result-reset-btn')) return;

        const resetBtn = document.createElement('button');
        resetBtn.className = 'wf-result-reset-btn inline-flex items-center justify-center whitespace-nowrap rounded-sm text-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground size-7 h-6 w-6';
        resetBtn.title = 'Reset result box size';
        // Inward-pointing arrows icon (each arrow from the expand icon rotated 180°)
        resetBtn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="fill-current h-3 w-3 text-muted-foreground"><path fill-rule="evenodd" clip-rule="evenodd" d="M19 9C19.5523 9 20 9.44772 20 10C20 10.5523 19.5523 11 19 11H14C13.4477 11 13 10.5523 13 10V5C13 4.44772 13.4477 4 14 4C14.5523 4 15 4.44772 15 5V7.58579L19.2929 3.2929C19.6834 2.9024 20.3166 2.9024 20.7071 3.2929C21.0976 3.6834 21.0976 4.31658 20.7071 4.70711L16.4142 9H19ZM4.70711 20.7071C4.31658 21.0976 3.6834 21.0976 3.2929 20.7071C2.9024 20.3166 2.9024 19.6834 3.2929 19.2929L7.58579 15H5C4.44772 15 4 14.5523 4 14C4 13.4477 4.44772 13 5 13H10C10.5523 13 11 13.4477 11 14V19C11 19.5523 10.5523 20 10 20C9.44772 20 9 19.5523 9 19V16.4142L4.70711 20.7071Z"/></svg>';

        resetBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            resultDiv.style.maxHeight = '';
            Logger.log(`user reset result box height to default`);
        });

        // Insert after the divider in the result toolbar
        const divider = buttonContainer.querySelector('.w-px.h-4.bg-border.mx-1');
        if (divider) {
            divider.insertAdjacentElement('afterend', resetBtn);
        } else {
            buttonContainer.appendChild(resetBtn);
        }
    },

    findResultButtonContainer(card) {
        // Find the Result section's toolbar button row (contains search input, divider, action buttons)
        const sections = card.querySelectorAll('div.space-y-2');
        for (const section of sections) {
            const header = section.querySelector('div.text-xs.font-medium.text-muted-foreground.uppercase');
            if (header && header.textContent.trim() === 'Result') {
                const divider = section.querySelector('.w-px.h-4.bg-border.mx-1');
                if (divider) return divider.parentElement;
            }
        }
        return null;
    },

    findWorkflowPanel() {
        const byDataUi = document.querySelector('[data-ui="workflow-panel"]');
        if (byDataUi) return byDataUi;
        const panels = Context.dom.queryAll('[data-panel-id][data-panel]', { context: `${this.id}.panels` });
        for (const candidate of panels) {
            const toolbar = candidate.querySelector('[data-ui="workflow-toolbar"]') || candidate.querySelector('.border-b.h-9');
            if (toolbar) {
                const workflowText = Array.from(toolbar.querySelectorAll('span')).find(span => span.textContent.trim() === 'Workflow');
                if (workflowText) return candidate;
            }
        }
        return null;
    },

    findToolsArea(panel) {
        if (!panel) return null;
        const stepsContainer = panel.querySelector('[data-ui="workflow-steps-container"]');
        if (stepsContainer) return stepsContainer;
        const scrollable = panel.querySelector('.overflow-y-auto');
        if (!scrollable) return null;
        return scrollable.querySelector('.space-y-3');
    }
};

return plugin;
},
        "archetypes/qa-tool-use/main/user-story-markdown.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {
// ============= user-story-markdown.js =============
// Thin wrapper: shared Context.userStoryMarkdown library.

const plugin = {
    id: 'userStoryMarkdown',
    name: 'User Story Markdown',
    description: 'Renders the User Story as markdown',
    _version: '1.1',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        styleInjected: false,
        activationLogged: false,
        missingLogged: false,
        activeByBody: null
    },

    onMutation(state) {
        const api = Context.userStoryMarkdown;
        if (!api || typeof api.run !== 'function') return;
        api.run(state, {
            pluginId: this.id,
            logTag: this.id
        });
    }
};

return plugin;
},
        "archetypes/qa-tool-use/main/user-story-collapse.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {
// ============= user-story-collapse.js =============
// Thin wrapper: shared Context.userStoryCollapse library.

const plugin = {
    id: 'userStoryCollapse',
    name: 'User Story Collapse',
    description:
        'Adds Hide/Show on the User Story row to collapse the story body below the label',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        missingLogged: false,
        activationLogged: false
    },

    onMutation(state) {
        const api = Context.userStoryCollapse;
        if (!api || typeof api.run !== 'function') return;
        api.run(state, { pluginId: this.id, logTag: this.id });
    }
};

return plugin;
},
        "archetypes/qa-comp-use/main/accept-task-modal-improvements.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {
// ============= accept-task-modal-improvements.js =============
// Thin wrapper: shared Context.acceptTaskModalImprovements library.

const plugin = {
    id: 'acceptTaskModalImprovements',
    name: '"Accept Task" Modal Improvements',
    description: 'Add a button above the optional comments box to paste a positive blurb',
    _version: '1.8',
    enabledByDefault: true,
    phase: 'mutation',

    subOptions: [
        {
            id: 'motivate-worker-button',
            name: 'Motivate worker with positive comment',
            description: "Add a green button above the optional comments box that pastes a random positive blurb when clicked",
            enabledByDefault: true
        }
    ],

    initialState: {
        missingLogged: false,
        lastProcessedDialog: null,
        motivateButtonAdded: false
    },

    onMutation(state) {
        const api = Context.acceptTaskModalImprovements;
        if (!api || typeof api.run !== 'function') return;
        api.run(state, { pluginId: this.id, logTag: this.id });
    }
};

return plugin;
},
        "archetypes/qa-comp-use/main/action-counter.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {
// ============= action-counter.js =============
// QA placement: beside Verifier tab via Context.actionCounter library.

const plugin = {
    id: 'compUseActionCounter',
    name: 'Action Counter',
    description:
        'Persistent +/- counter beside the Verifier tab; click the number to type a value',
    _version: '2.1',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        missingLogged: false,
        activationLogged: false,
        hadAnchor: false,
        migratedLegacy: false
    },

    findVerifierTab() {
        const byUi = document.querySelector('[data-ui="qa-verifier-tab"]');
        if (byUi) return byUi;
        return document.querySelector('button[role="tab"][aria-controls*="verifier-output"]');
    },

    onMutation(state) {
        const api = Context.actionCounter;
        if (!api || typeof api.run !== 'function') return;

        const marker = api.COUNTER_MARKER || 'data-fleet-action-counter';
        const taskCard = document.querySelector('[data-ui="qa-task-card"]');
        if (!taskCard) {
            if (state.hadAnchor) {
                Logger.debug(`task card left DOM — counter inactive`);
                state.hadAnchor = false;
                state.activationLogged = false;
            }
            if (!state.missingLogged) {
                Logger.debug(`[data-ui="qa-task-card"] not found yet`);
                state.missingLogged = true;
            }
            return;
        }

        const verifierTab = this.findVerifierTab();
        if (!verifierTab) {
            if (state.hadAnchor) {
                Logger.debug(`verifier tab left DOM — counter inactive`);
                state.hadAnchor = false;
                state.activationLogged = false;
            }
            if (!state.missingLogged) {
                Logger.debug(`verifier tab not found yet`);
                state.missingLogged = true;
            }
            return;
        }

        state.missingLogged = false;
        state.hadAnchor = true;

        api.run(state, {
            pluginId: this.id,
            logTag: this.id,
            activationDetail: 'counter injected beside Verifier tab',
            alreadyMounted: () => {
                const next = verifierTab.nextElementSibling;
                return Boolean(next && next.getAttribute(marker) === 'true');
            },
            mountCounter: (counter) => {
                verifierTab.insertAdjacentElement('afterend', counter);
            }
        });
    }
};

return plugin;
},
        "archetypes/qa-comp-use/main/auto-start-recording.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {
// ============= auto-start-recording.js =============
// Automatically clicks the "Start Recording" button once when it appears.

const plugin = {
    id: 'autoStartRecording',
    name: 'Auto Start Recording',
    description: 'Starts recording automatically when the button appears',
    _version: '1.4',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        clicked: false,
        missingLogged: false
    },

    onMutation(state, context) {
        if (state.clicked) return;

        const allButtons = typeof Context !== 'undefined' && Context.dom
            ? Context.dom.queryAll('button', { context: `${this.id}.onMutation` })
            : Array.from(document.querySelectorAll('button'));
        const sig = allButtons.length + '|' + (allButtons.map((b) => b.textContent.trim()).join(','));
        if (sig === state.lastRunSig) return;
        state.lastRunSig = sig;

        const button = allButtons.find((b) => (b.textContent || '').trim() === 'Start Recording') || null;
        if (!button) {
            if (!state.missingLogged) {
                Logger.debug('Auto Start Recording: \"Start Recording\" button not found yet');
                state.missingLogged = true;
            }
            return;
        }

        try {
            button.click();
            state.clicked = true;
            Logger.log('Auto Start Recording: clicked \"Start Recording\" button');
        } catch (error) {
            Logger.error('Auto Start Recording: failed to click \"Start Recording\" button', error);
        }
    },

    findStartRecordingButton() {
        const options = { context: `${this.id}.findStartRecordingButton` };
        const buttons = typeof Context !== 'undefined' && Context.dom
            ? Context.dom.queryAll('button', options)
            : Array.from(document.querySelectorAll('button'));

        for (const btn of buttons) {
            const text = (btn.textContent || '').trim();
            if (text === 'Start Recording') {
                return btn;
            }
        }

        return null;
    }
};


return plugin;
},
        "archetypes/qa-comp-use/main/copy-result-params.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {
// ============= copy-result-params.js =============
// Adds a "Copy Result Params and Inputs" button under the Your Answer title/explanation.
// Click copies each parameter label and value (e.g. "Total Paid: 0") to the clipboard with green 1s confirmation (label unchanged).

const COPY_RESULT_PARAMS_MARKER = 'data-fleet-copy-result-params';

const plugin = {
    id: 'copyResultParams',
    name: 'Copy Result Params and Inputs',
    description: 'Add a button under Your Answer that copies all parameter labels and values to the clipboard',
    _version: '2.0',
    enabledByDefault: true,
    phase: 'mutation',

    initialState: {
        buttonAdded: false,
        missingLogged: false
    },

    onMutation(state, context) {
        const yourAnswerSection = this.findYourAnswerSection();
        if (!yourAnswerSection) {
            if (!state.missingLogged) {
                Logger.debug('Copy Result Params: Your Answer section not found');
                state.missingLogged = true;
            }
            return;
        }
        state.missingLogged = false;

        if (yourAnswerSection.querySelector(`[${COPY_RESULT_PARAMS_MARKER}="true"]`)) {
            return;
        }

        const titleBlock = yourAnswerSection.querySelector('h4')?.closest('div');
        if (!titleBlock) {
            Logger.debug('Copy Result Params: title block not found');
            return;
        }

        const button = this.createCopyButton(yourAnswerSection);
        titleBlock.appendChild(button);
        state.buttonAdded = true;
        Logger.log('Copy Result Params: Copy button added');
    },

    findYourAnswerSection() {
        const headings = document.querySelectorAll('h4');
        for (const h of headings) {
            if (h.textContent && h.textContent.trim() === 'Your Answer') {
                const blueBox = h.closest('.rounded-lg.border');
                if (blueBox && (blueBox.classList.contains('border-blue-200') || blueBox.classList.contains('dark:border-blue-800'))) {
                    return blueBox;
                }
                return h.closest('div.space-y-4') || h.closest('div[class*="border-blue"]') || h.parentElement?.parentElement;
            }
        }
        return null;
    },

    getResultParamsText(root) {
        const grid = root.querySelector('.grid.grid-cols-1.gap-4') || root.querySelector('.grid');
        if (!grid) return '';

        const lines = [];
        const rows = grid.querySelectorAll('.space-y-2');
        for (const row of rows) {
            const label = row.querySelector('label');
            const input = row.querySelector('input, textarea');
            if (!label || !input) continue;
            const labelText = label.textContent.replace(/\s+/g, ' ').trim();
            const value = (input.value != null && input.value !== undefined) ? String(input.value).trim() : '';
            lines.push(`${labelText}: ${value}`);
        }
        return lines.join('\n');
    },

    clearCopyButtonFeedback(button) {
        if (Context.buttonFeedback) Context.buttonFeedback.clear(button);
    },

    showCopySuccessFlash(button) {
        if (Context.buttonFeedback) Context.buttonFeedback.flashSuccess(button, { restoreStyles: false });
    },

    showCopyFailurePulse(button) {
        if (Context.buttonFeedback) Context.buttonFeedback.flashFailure(button, { restoreStyles: false });
    },

    createCopyButton(yourAnswerSection) {
        const wrapper = document.createElement('div');
        wrapper.setAttribute(COPY_RESULT_PARAMS_MARKER, 'true');
        wrapper.setAttribute('data-fleet-plugin', this.id);
        wrapper.className = 'mt-2';

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'inline-flex items-center justify-center whitespace-nowrap font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background transition-colors hover:bg-accent hover:text-accent-foreground h-8 rounded-sm pl-3 pr-3 text-xs';
        button.setAttribute('data-fleet-plugin', this.id);
        button.textContent = 'Copy Result Params and Inputs';
        button.title = 'Copy parameter labels and values to clipboard';

        button.addEventListener('click', () => {
            const text = this.getResultParamsText(yourAnswerSection);
            if (!text) {
                Logger.warn('Copy Result Params: No parameters to copy');
                this.showCopyFailurePulse(button);
                return;
            }
            navigator.clipboard.writeText(text).then(() => {
                Logger.log(`Copy Result Params: Copied ${text.length} chars to clipboard`);
                this.showCopySuccessFlash(button);
            }).catch((err) => {
                Logger.error('Copy Result Params: Failed to copy to clipboard', err);
                this.showCopyFailurePulse(button);
            });
        });

        wrapper.appendChild(button);
        return wrapper;
    }
};

return plugin;
},
        "archetypes/qa-comp-use/main/copy-verifier-output.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {
// ============= copy-verifier-output.js =============
// Thin wrapper: shared Context.copyVerifierOutput library.

const plugin = {
    id: 'copyVerifierOutput',
    name: 'Copy Verifier Output',
    description:
        'Copy buttons for Stdout, Score, and expanded Raw Output',
    _version: '4.2',
    enabledByDefault: true,
    phase: 'mutation',

    initialState: {
        buttonAdded: false,
        verifierTargetMissingLogged: false
    },

    onMutation(state, context) {
        const api = Context.copyVerifierOutput;
        if (!api || typeof api.run !== 'function') return;
        api.run(state, { pluginId: this.id, logTag: this.id });
    }
};

return plugin;
},
        "archetypes/qa-comp-use/main/fos-vm-clipboard.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {
// ============= fos-vm-clipboard.js =============
// QA placement: beside Action Counter / Verifier tab via Context.fosVmClipboardBar.

const plugin = {
    id: 'fosVmClipboardBar',
    name: 'VM Clipboard',
    description:
        'Extract/Overwrite VM Clipboard controls beside the Verifier tab (shown when FOS env is ready)',
    _version: '1.2',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        missingLogged: false,
        activationLogged: false,
        hadAnchor: false,
        uiHostClaimed: false,
        unsubscribe: null,
        groupEl: null,
        readyShownLogged: false,
        readyHiddenLogged: false,
        apiMissingLogged: false
    },

    init(state) {
        if (Context.fosEmbedded && typeof Context.fosEmbedded.claimUiHost === 'function') {
            Context.fosEmbedded.claimUiHost(this.id);
            state.uiHostClaimed = true;
            Logger.log(`claimed FOS UI host (floating panel suppressed)`);
        } else {
            Logger.debug(`Context.fosEmbedded missing at init — will retry on mutation`);
        }
    },

    findVerifierTab() {
        const byUi = document.querySelector('[data-ui="qa-verifier-tab"]');
        if (byUi) return byUi;
        return document.querySelector('button[role="tab"][aria-controls*="verifier-output"]');
    },

    onMutation(state) {
        if (!state.uiHostClaimed && Context.fosEmbedded && typeof Context.fosEmbedded.claimUiHost === 'function') {
            Context.fosEmbedded.claimUiHost(this.id);
            state.uiHostClaimed = true;
            Logger.log(`claimed FOS UI host (floating panel suppressed)`);
        }

        const api = Context.fosVmClipboardBar;
        if (!api || typeof api.run !== 'function') return;

        const marker = api.BAR_MARKER || 'data-fleet-fos-vm-clipboard-bar';
        const counterMarker = 'data-fleet-action-counter';
        const taskCard = document.querySelector('[data-ui="qa-task-card"]');
        if (!taskCard) {
            if (state.hadAnchor) {
                Logger.debug(`task card left DOM — clipboard bar inactive`);
                state.hadAnchor = false;
                state.activationLogged = false;
                state.readyShownLogged = false;
                state.readyHiddenLogged = false;
            }
            if (!state.missingLogged) {
                Logger.debug(`[data-ui="qa-task-card"] not found yet`);
                state.missingLogged = true;
            }
            return;
        }

        const verifierTab = this.findVerifierTab();
        if (!verifierTab) {
            if (state.hadAnchor) {
                Logger.debug(`verifier tab left DOM — clipboard bar inactive`);
                state.hadAnchor = false;
                state.activationLogged = false;
                state.readyShownLogged = false;
                state.readyHiddenLogged = false;
            }
            if (!state.missingLogged) {
                Logger.debug(`verifier tab not found yet`);
                state.missingLogged = true;
            }
            return;
        }

        state.missingLogged = false;
        state.hadAnchor = true;

        const next = verifierTab.nextElementSibling;
        const counter =
            next && next.getAttribute(counterMarker) === 'true' ? next : null;
        if (!counter) {
            return;
        }

        api.run(state, {
            pluginId: this.id,
            logTag: this.id,
            activationDetail: 'VM Clipboard injected beside Verifier tab',
            alreadyMounted: () => {
                const afterCounter = counter.nextElementSibling;
                return Boolean(afterCounter && afterCounter.getAttribute(marker) === 'true');
            },
            mountGroup: (group) => {
                counter.insertAdjacentElement('afterend', group);
            }
        });
    }
};

return plugin;
},
        "archetypes/qa-comp-use/main/fos-iframe-autoconnect.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {
// ============= fos-iframe-autoconnect.js =============
// Thin wrapper: shared Context.fosIframeAutoconnect library.

const plugin = {
    id: 'qaCompUseFosIframeAutoconnect',
    name: 'FOS Viewport Resize',
    description:
        'Resizes the embedded FOS environment to the viewport. Autoconnects the instance and open-in-new-tab URL; reconnects when the tab is focused again unless the environment pane is hidden',
    _version: '1.2',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        waitingIframeLogged: false,
        waitingFosLogged: false,
        patchedLogged: false,
        openBtnLogged: false,
        hadIframe: false,
        hadOpenBtn: false,
        patchInProgress: false,
        visibilityInstalled: false,
        wasHidden: false,
        desktopUnsub: null,
        reloadTimer: null,
        pendingFocusReconnect: false
    },

    onMutation(state) {
        const api = Context.fosIframeAutoconnect;
        if (!api || typeof api.run !== 'function') return;
        api.run(state, { pluginId: this.id });
    }
};

return plugin;
},
        "archetypes/qa-comp-use/main/request-revisions.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {
// ============= request-revisions.js =============
// Thin wrapper: shared Context.requestRevisions library.

const plugin = {
    id: 'requestRevisions',
    name: '"Request Revisions" Modal Improvements',
    description:
        'Guidelines, copy actions, task-only issue selection, and screenshot upload on Request Revisions',
    _version: '8.0',
    enabledByDefault: true,
    phase: 'mutation',

    subOptions: [
        {
            id: 'copy-prompt-button',
            name: 'Copy Prompt button',
            enabledByDefault: true
        },
        {
            id: 'copy-verifier-output-button',
            name: 'Copy Verifier Output button',
            enabledByDefault: true
        },
        {
            id: 'copy-link-general-guidelines',
            name: 'General Guidelines',
            enabledByDefault: true
        },
        {
            id: 'copy-link-tool-use-guidelines',
            name: 'Tool Use Guidelines',
            enabledByDefault: true
        },
        {
            id: 'copy-link-qa-guidelines',
            name: 'QA Guidelines',
            enabledByDefault: true
        },
        {
            id: 'copy-link-time-submission-guidelines',
            name: 'Time Submission Guidelines',
            enabledByDefault: true
        },
        {
            id: 'task-only-issues',
            name: 'Task-only issues',
            enabledByDefault: true
        },
        {
            id: 'screenshot-upload-improvement',
            name: 'Screenshot upload improvement',
            enabledByDefault: true
        }
    ],

    initialState: {
        missingLogged: false,
        warnLogged: false,
        activationLogged: false,
        taskOnlyStyleReady: false,
        screenshotStyleReady: false,
        screenshotMissingLogged: false,
        injectedLogged: false,
        pasteListenerAttached: false,
        promptText: null,
        verifierOutput: null,
        verifierObserver: null,
        verifierElement: null,
        verifierChangeObserver: null,
        verifierWatchEligibleAt: undefined,
        promptQualityRating: null,
        lastSig: 0
    },

    onMutation(state) {
        const api = Context.requestRevisions;
        if (!api || typeof api.run !== 'function') return;
        api.run(state, { pluginId: this.id, logTag: this.id });
    }
};

return plugin;
},
        "archetypes/qa-comp-use/main/show-verifier-on-run.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {
// ============= show-verifier-on-run.js =============
// When the verifier is running ("Running Verifier..." in the QA header), clicks "Show Grading"
// so verifier output stays visible while the grading panel is hidden by default.

const plugin = {
    id: 'showVerifierOnRun',
    name: 'Show Verifier On Run',
    description:
        'Shows grading when the verifier runs if the panel is hidden',
    _version: '1.4',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        verifierRunning: false,
        showClickedForRun: false,
        runStartLogged: false,
        showGradingMissingLogged: false,
        showGradingNotClickableLogged: false,
        gradingVisibleLogged: false
    },

    onMutation(state) {
        const running = this.isVerifierRunning();
        if (!running) {
            if (state.verifierRunning) {
                Logger.debug(`verifier run ended`);
            }
            state.verifierRunning = false;
            state.showClickedForRun = false;
            state.runStartLogged = false;
            state.showGradingMissingLogged = false;
            state.showGradingNotClickableLogged = false;
            state.gradingVisibleLogged = false;
            return;
        }

        if (!state.verifierRunning) {
            state.verifierRunning = true;
            state.showClickedForRun = false;
            state.showGradingMissingLogged = false;
            state.showGradingNotClickableLogged = false;
            state.gradingVisibleLogged = false;
            if (!state.runStartLogged) {
                state.runStartLogged = true;
                Logger.log(`verifier run detected — will show grading panel`);
            }
        }

        if (state.showClickedForRun) {
            return;
        }

        if (this.isGradingPanelVisible()) {
            state.showClickedForRun = true;
            if (!state.gradingVisibleLogged) {
                state.gradingVisibleLogged = true;
                Logger.debug(`grading panel already visible (Hide Grading present)`);
            }
            return;
        }

        const button = this.findShowGradingButton();
        if (!button) {
            if (!state.showGradingMissingLogged) {
                Logger.debug(`"Show Grading" button not found yet`);
                state.showGradingMissingLogged = true;
            }
            return;
        }

        if (!this.isButtonClickable(button)) {
            if (!state.showGradingNotClickableLogged) {
                Logger.debug(`"Show Grading" not clickable yet`);
                state.showGradingNotClickableLogged = true;
            }
            return;
        }

        try {
            button.click();
            state.showClickedForRun = true;
            Logger.log(`clicked "Show Grading"`);
        } catch (error) {
            Logger.error(`failed to click "Show Grading"`, error);
        }
    },

    isVerifierRunning() {
        const root =
            document.querySelector('[data-ui="qa-header"]') || document.body;
        const options = { context: `${this.id}.isVerifierRunning` };
        const nodes =
            typeof Context !== 'undefined' && Context.dom
                ? Context.dom.queryAll('button, span', { ...options, root })
                : Array.from(root.querySelectorAll('button, span'));

        for (const node of nodes) {
            const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
            if (text === 'Running Verifier...' || text.startsWith('Running Verifier')) {
                return true;
            }
        }
        return false;
    },

    findGradingToggleButton(label) {
        const options = { context: `${this.id}.findGradingToggleButton` };
        const buttons =
            typeof Context !== 'undefined' && Context.dom
                ? Context.dom.queryAll('button', options)
                : Array.from(document.querySelectorAll('button'));

        for (const btn of buttons) {
            if (btn.hasAttribute('data-fleet-pane-toggle')) {
                continue;
            }
            const text = (btn.textContent || '').replace(/\s+/g, ' ').trim();
            if (text === label) {
                return btn;
            }
        }
        return null;
    },

    isGradingPanelVisible() {
        return Boolean(this.findGradingToggleButton('Hide Grading'));
    },

    findShowGradingButton() {
        return this.findGradingToggleButton('Show Grading');
    },

    isButtonClickable(button) {
        if (button.disabled) return false;
        if (button.getAttribute('aria-disabled') === 'true') return false;
        return true;
    }
};

return plugin;
},
        "archetypes/qa-comp-use/main/toggle-main-panels.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {
// ============= toggle-main-panels.js =============
// Thin wrapper: shared Context.toggleMainPanels library.

const plugin = {
    id: 'toggleMainPanels',
    name: 'Toggle Main Panels',
    description: 'Hide or unhide either main pane (task detail or environment); the other pane expands to full width',
    _version: '1.11',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        styleInjected: false,
        missingLogged: false,
        headerMissingLogged: false,
        activationLogged: false,
        hiddenPane: null
    },

    onMutation(state) {
        const api = Context.toggleMainPanels;
        if (!api || typeof api.run !== 'function') return;
        api.run(state, { pluginId: this.id, logTag: this.id });
    }
};

return plugin;
},
        "archetypes/qa-comp-use/main/user-story-markdown.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {
// ============= user-story-markdown.js =============
// Thin wrapper: shared Context.userStoryMarkdown library.

const plugin = {
    id: 'userStoryMarkdown',
    name: 'User Story Markdown',
    description: 'Renders the User Story as markdown',
    _version: '1.1',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        styleInjected: false,
        activationLogged: false,
        missingLogged: false,
        activeByBody: null
    },

    onMutation(state) {
        const api = Context.userStoryMarkdown;
        if (!api || typeof api.run !== 'function') return;
        api.run(state, {
            pluginId: this.id,
            logTag: this.id
        });
    }
};

return plugin;
},
        "archetypes/qa-comp-use/main/user-story-collapse.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {
// ============= user-story-collapse.js =============
// Thin wrapper: shared Context.userStoryCollapse library.

const plugin = {
    id: 'userStoryCollapse',
    name: 'User Story Collapse',
    description:
        'Adds Hide/Show on the User Story row to collapse the story body below the label',
    _version: '1.0',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        missingLogged: false,
        activationLogged: false
    },

    onMutation(state) {
        const api = Context.userStoryCollapse;
        if (!api || typeof api.run !== 'function') return;
        api.run(state, { pluginId: this.id, logTag: this.id });
    }
};

return plugin;
},
        "archetypes/disputes/main/user-story-markdown.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {
// ============= user-story-markdown.js =============
// Shared Context.userStoryMarkdown library wrapper for the Task Scenario modal on the
// disputes list page, plus a copy button next to the Task Scenario title that copies
// the whole story with H1 sub-headers and --- separators (same format as task detail).

const MODAL_TITLE_TEXT = 'Task Scenario';
const SCENARIO_LABEL_TEXT = 'Scenario';
const USER_STORY_LABEL_TEXT = 'User Story';
const COPY_BTN_ATTR = 'data-fleet-dispute-user-story-copy';
const COPY_BTN_CLASS =
    'inline-flex items-center justify-center whitespace-nowrap rounded-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground h-7 text-xs pl-2 pr-2 py-1 gap-1.5';
const COPY_ICON_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-3.5 w-3.5">' +
    '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect>' +
    '<path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path>' +
    '</svg>';

const plugin = {
    id: 'userStoryMarkdown',
    name: 'User Story Markdown',
    description:
        'Renders the User Story as markdown with a full-story copy button in the Task Scenario modal',
    _version: '1.2',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        styleInjected: false,
        activationLogged: false,
        missingLogged: false,
        activeByBody: null,
        copyButtonLogged: false
    },

    onMutation(state) {
        const api = Context.userStoryMarkdown;
        if (!api || typeof api.run !== 'function') return;
        this._captureOriginalStoryWidth();
        api.run(state, {
            pluginId: this.id,
            logTag: this.id
        });
        this._applyReplicaMaxWidth();
        this._ensureModalCopyButton(state);
    },

    /**
     * Record the story blockquote's rendered width before the library hides it,
     * so the markdown replica can be capped to the same width (long markdown
     * paragraphs would otherwise stretch the dialog to its viewport max-width).
     */
    _captureOriginalStoryWidth() {
        const dialog = this._findTaskScenarioDialog();
        if (!dialog) return;
        const storyLabel = this._findSectionLabel(dialog, USER_STORY_LABEL_TEXT);
        if (!storyLabel) return;
        const body = storyLabel.nextElementSibling;
        if (!body || body.getAttribute('data-fleet-user-story-original') === 'true') return;
        if (body.dataset.fleetOriginalWidth) return;
        const width = body.getBoundingClientRect().width;
        if (width > 50) body.dataset.fleetOriginalWidth = String(Math.round(width));
    },

    _applyReplicaMaxWidth() {
        const dialog = this._findTaskScenarioDialog();
        if (!dialog) return;
        const original = dialog.querySelector('[data-fleet-user-story-original="true"][data-fleet-original-width]');
        if (!original) return;
        const replica = original.nextElementSibling;
        if (!replica || replica.getAttribute('data-fleet-user-story-replica') !== 'true') return;
        const maxWidth = original.dataset.fleetOriginalWidth + 'px';
        if (replica.style.maxWidth !== maxWidth) replica.style.maxWidth = maxWidth;
    },

    _normalizeText(text) {
        return String(text || '').replace(/\s+/g, ' ').trim();
    },

    _findTaskScenarioDialog() {
        const dialogs = document.querySelectorAll('[role="dialog"], [role="alertdialog"]');
        for (const dialog of dialogs) {
            const heading = dialog.querySelector('h2');
            if (heading && this._normalizeText(heading.textContent) === MODAL_TITLE_TEXT) {
                return dialog;
            }
        }
        return null;
    },

    _findSectionLabel(dialog, labelText) {
        const labels = dialog.querySelectorAll(
            'div.text-sm.text-muted-foreground.font-medium, div.font-medium.text-sm.text-muted-foreground'
        );
        for (const label of labels) {
            if (this._normalizeText(label.textContent) === labelText) return label;
        }
        return null;
    },

    _sectionBodyText(label) {
        if (!label) return '';
        let sibling = label.nextElementSibling;
        while (sibling) {
            if (sibling.getAttribute && sibling.getAttribute('data-fleet-user-story-replica') === 'true') {
                sibling = sibling.nextElementSibling;
                continue;
            }
            return (sibling.textContent || '').trim();
        }
        return '';
    },

    _buildCopyText(dialog) {
        const blocks = [];
        const scenarioLabel = this._findSectionLabel(dialog, SCENARIO_LABEL_TEXT);
        const storyLabel = this._findSectionLabel(dialog, USER_STORY_LABEL_TEXT);
        const scenario = this._sectionBodyText(scenarioLabel);
        const story = this._sectionBodyText(storyLabel);
        if (scenario) blocks.push('# ' + SCENARIO_LABEL_TEXT + '\n' + scenario);
        if (story) blocks.push('# ' + USER_STORY_LABEL_TEXT + '\n' + story);
        return blocks.join('\n\n---\n\n');
    },

    async _copyTextToClipboard(text) {
        if (!text) return false;
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(text);
                return true;
            }
        } catch (_e) { /* fall through */ }
        try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.setAttribute('readonly', '');
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            document.body.appendChild(ta);
            ta.select();
            const ok = document.execCommand('copy');
            document.body.removeChild(ta);
            return ok;
        } catch (_e2) {
            return false;
        }
    },

    _ensureModalCopyButton(state) {
        const dialog = this._findTaskScenarioDialog();
        if (!dialog) {
            state.copyButtonLogged = false;
            return;
        }
        if (dialog.querySelector('[' + COPY_BTN_ATTR + '="1"]')) return;

        const heading = dialog.querySelector('h2');
        if (!heading) return;

        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = COPY_BTN_CLASS;
        copyBtn.setAttribute(COPY_BTN_ATTR, '1');
        copyBtn.setAttribute('data-fleet-plugin', this.id);
        copyBtn.title = 'Copy scenario and user story';
        copyBtn.setAttribute('aria-label', 'Copy scenario and user story');
        copyBtn.innerHTML = COPY_ICON_SVG;

        copyBtn.addEventListener('click', async () => {
            const text = this._buildCopyText(dialog);
            const ok = await this._copyTextToClipboard(text);
            if (ok) {
                if (Context.buttonFeedback) {
                    Context.buttonFeedback.flashSuccess(copyBtn, { restoreStyles: false });
                }
                Logger.log('copied scenario story (' + text.length + ' chars)');
            } else {
                if (Context.buttonFeedback) {
                    Context.buttonFeedback.flashFailure(copyBtn, { restoreStyles: false });
                }
                Logger.warn('scenario story copy failed');
            }
        });

        // h2 title row already uses flex items-center gap-2
        heading.appendChild(copyBtn);

        if (!state.copyButtonLogged) {
            Logger.log('copy button injected in Task Scenario modal');
            state.copyButtonLogged = true;
        }
    }
};

return plugin;
},
        "archetypes/dispute-detail/main/copy-verifier-output.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {
// ============= copy-verifier-output.js =============
// Thin wrapper: shared Context.copyVerifierOutput library.

const plugin = {
    id: 'copyVerifierOutput',
    name: 'Copy Verifier Output',
    description:
        'Copy buttons for Stdout, Score, and expanded Raw Output',
    _version: '4.2',
    enabledByDefault: true,
    phase: 'mutation',

    initialState: {
        buttonAdded: false,
        verifierTargetMissingLogged: false
    },

    onMutation(state, context) {
        const api = Context.copyVerifierOutput;
        if (!api || typeof api.run !== 'function') return;
        api.run(state, { pluginId: this.id, logTag: this.id });
    }
};

return plugin;
},
        "archetypes/dispute-detail/main/fos-vm-clipboard.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {
// ============= fos-vm-clipboard.js =============
// Dispute detail placement: after Computer Use badge in instance status bar.

const plugin = {
    id: 'fosVmClipboardBar',
    name: 'VM Clipboard',
    description:
        'Extract/Overwrite VM Clipboard controls after the Computer Use badge (shown when FOS env is ready)',
    _version: '1.2',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        missingLogged: false,
        activationLogged: false,
        hadAnchor: false,
        uiHostClaimed: false,
        unsubscribe: null,
        groupEl: null,
        readyShownLogged: false,
        readyHiddenLogged: false,
        apiMissingLogged: false
    },

    init(state) {
        if (Context.fosEmbedded && typeof Context.fosEmbedded.claimUiHost === 'function') {
            Context.fosEmbedded.claimUiHost(this.id);
            state.uiHostClaimed = true;
            Logger.log(`claimed FOS UI host (floating panel suppressed)`);
        } else {
            Logger.debug(`Context.fosEmbedded missing at init — will retry on mutation`);
        }
    },

    normalizeLabel(el) {
        return String((el && el.textContent) || '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    },

    findInstanceStatusRow() {
        const rows = document.querySelectorAll('div.flex.items-center.justify-between');
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const text = this.normalizeLabel(row);
            if (text.includes('instance running') || text.includes('computer use')) {
                return row;
            }
        }
        return null;
    },

    findComputerUseBadge() {
        const row = this.findInstanceStatusRow();
        if (!row) return null;
        const candidates = row.querySelectorAll('span, div');
        let found = null;
        for (let i = 0; i < candidates.length; i++) {
            const el = candidates[i];
            if (this.normalizeLabel(el) !== 'computer use') continue;
            // Prefer the leaf badge (no nested element with the same label).
            let hasLabeledChild = false;
            const kids = el.querySelectorAll('span, div');
            for (let j = 0; j < kids.length; j++) {
                if (this.normalizeLabel(kids[j]) === 'computer use') {
                    hasLabeledChild = true;
                    break;
                }
            }
            if (!hasLabeledChild) {
                found = el;
            }
        }
        return found;
    },

    onMutation(state) {
        if (!state.uiHostClaimed && Context.fosEmbedded && typeof Context.fosEmbedded.claimUiHost === 'function') {
            Context.fosEmbedded.claimUiHost(this.id);
            state.uiHostClaimed = true;
            Logger.log(`claimed FOS UI host (floating panel suppressed)`);
        }

        const api = Context.fosVmClipboardBar;
        if (!api || typeof api.run !== 'function') return;

        const marker = api.BAR_MARKER || 'data-fleet-fos-vm-clipboard-bar';
        const badge = this.findComputerUseBadge();
        if (!badge) {
            if (state.hadAnchor) {
                Logger.debug(`Computer Use badge left DOM — clipboard bar inactive`);
                state.hadAnchor = false;
                state.activationLogged = false;
                state.readyShownLogged = false;
                state.readyHiddenLogged = false;
            }
            if (!state.missingLogged) {
                Logger.debug(`Computer Use badge not found yet`);
                state.missingLogged = true;
            }
            return;
        }

        state.missingLogged = false;
        state.hadAnchor = true;

        api.run(state, {
            pluginId: this.id,
            logTag: this.id,
            activationDetail: 'VM Clipboard injected after Computer Use badge',
            alreadyMounted: () => {
                const next = badge.nextElementSibling;
                return Boolean(next && next.getAttribute(marker) === 'true');
            },
            mountGroup: (group) => {
                badge.insertAdjacentElement('afterend', group);
            }
        });
    }
};

return plugin;
},
        "archetypes/dispute-detail/main/fos-iframe-autoconnect.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {
// ============= fos-iframe-autoconnect.js =============
// Thin wrapper: shared Context.fosIframeAutoconnect library.

const plugin = {
    id: 'disputeDetailFosIframeAutoconnect',
    name: 'FOS Viewport Resize',
    description:
        'Resizes the embedded FOS environment to the viewport. Autoconnects the instance and open-in-new-tab URL; reconnects when the tab is focused again unless the environment pane is hidden',
    _version: '1.2',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        waitingIframeLogged: false,
        waitingFosLogged: false,
        patchedLogged: false,
        openBtnLogged: false,
        hadIframe: false,
        hadOpenBtn: false,
        patchInProgress: false,
        visibilityInstalled: false,
        wasHidden: false,
        desktopUnsub: null,
        reloadTimer: null,
        pendingFocusReconnect: false
    },

    onMutation(state) {
        const api = Context.fosIframeAutoconnect;
        if (!api || typeof api.run !== 'function') return;
        api.run(state, { pluginId: this.id });
    }
};

return plugin;
},
        "archetypes/dispute-detail/main/tool-results-resize-handle.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {
// ============= tool-results-resize-handle.js =============
// Adds a drag-to-resize handle to the bottom of tool result boxes.

const plugin = {
    id: 'disputeDetailToolResultsResizeHandle',
    name: 'Tool Results Resize Handle',
    description: 'Adds a resize handle to tool result boxes so their height can be adjusted by dragging',
    _version: '1.3',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: { panelId: null, missingLogged: false, envWaitingLogged: false },

    selectors: {
        toolCard: '[data-ui="workflow-step"]',
        toolCardFallback: 'div.rounded-lg.border.transition-colors',
        stepResult: '[data-ui="step-result"]'
    },

    onMutation(state) {
        if (!this.isToolEnvReady()) {
            if (!state.envWaitingLogged) {
                Logger.debug(`waiting for tool environment gate`);
                state.envWaitingLogged = true;
            }
            return;
        }
        state.envWaitingLogged = false;

        const panel = this.findWorkflowPanel();
        if (!panel) return;

        const currentPanelId = panel.getAttribute('data-panel-id');
        if (state.panelId !== currentPanelId) {
            state.panelId = currentPanelId;
            state.missingLogged = false;
        }

        const toolsContainer = this.findToolsArea(panel);
        if (!toolsContainer) return;

        const toolCardsByDataUi = toolsContainer.querySelectorAll(this.selectors.toolCard);
        const toolCards = toolCardsByDataUi.length ? Array.from(toolCardsByDataUi) : Context.dom.queryAll(this.selectors.toolCardFallback, { root: toolsContainer, context: `${this.id}.toolCards` });

        toolCards.forEach(card => {
            const resultDiv = this.findResultDiv(card);
            if (!resultDiv) return;
            if (resultDiv.dataset.wfResultResizeAttached === '1') {
                const nextEl = resultDiv.nextElementSibling;
                if (nextEl && nextEl.classList.contains('wf-result-resize-handle')) {
                    this.ensureResetButton(card, resultDiv);
                    return;
                }
                delete resultDiv.dataset.wfResultResizeAttached;
            }
            this.attachResizeHandle(resultDiv);
            resultDiv.dataset.wfResultResizeAttached = '1';
            this.ensureResetButton(card, resultDiv);
        });
    },

    findResultDiv(card) {
        const stepResult = card.querySelector(this.selectors.stepResult);
        if (stepResult) {
            const box = stepResult.querySelector('div.p-3.rounded-md.border.text-xs.font-mono.whitespace-pre-wrap.overflow-auto');
            if (box) return box;
        }
        return null;
    },

    attachResizeHandle(resultDiv) {
        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'wf-result-resize-handle';
        Object.assign(resizeHandle.style, {
            height: '8px',
            cursor: 'ns-resize',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: '0',
            transition: 'opacity 0.15s',
            userSelect: 'none'
        });

        const handleBar = document.createElement('div');
        Object.assign(handleBar.style, {
            width: '40px',
            height: '3px',
            borderRadius: '1.5px',
            backgroundColor: 'currentColor',
            opacity: '0.3'
        });
        resizeHandle.appendChild(handleBar);

        resultDiv.addEventListener('mouseenter', () => { resizeHandle.style.opacity = '1'; });
        resultDiv.addEventListener('mouseleave', (e) => {
            if (!e.relatedTarget || !resizeHandle.contains(e.relatedTarget)) resizeHandle.style.opacity = '0';
        });
        resizeHandle.addEventListener('mouseenter', () => { resizeHandle.style.opacity = '1'; });
        resizeHandle.addEventListener('mouseleave', (e) => {
            if (!e.relatedTarget || !resultDiv.contains(e.relatedTarget)) resizeHandle.style.opacity = '0';
        });

        resultDiv.insertAdjacentElement('afterend', resizeHandle);

        let isResizing = false;
        let startY = 0;
        let startHeight = 0;
        const minHeight = 40;
        const handleMouseDown = (e) => {
            isResizing = true;
            startY = e.clientY;
            startHeight = resultDiv.offsetHeight;
            e.preventDefault();
            e.stopPropagation();
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = 'ns-resize';
            document.body.style.userSelect = 'none';
        };
        const handleMouseMove = (e) => {
            if (!isResizing) return;
            const delta = e.clientY - startY;
            const newHeight = Math.max(minHeight, startHeight + delta);
            resultDiv.style.maxHeight = `${newHeight}px`;
        };
        const handleMouseUp = () => {
            if (!isResizing) return;
            const endH = resultDiv.offsetHeight;
            if (endH !== startHeight) {
                Logger.debug(`user finished resizing result box`, { fromPx: startHeight, toPx: endH });
            }
            isResizing = false;
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };

        CleanupRegistry.registerEventListener(resizeHandle, 'mousedown', handleMouseDown);
    },

    ensureResetButton(card, resultDiv) {
        const buttonContainer = this.findResultButtonContainer(card);
        if (!buttonContainer) return;
        if (buttonContainer.querySelector('.wf-result-reset-btn')) return;

        const resetBtn = document.createElement('button');
        resetBtn.className = 'wf-result-reset-btn inline-flex items-center justify-center whitespace-nowrap rounded-sm text-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground size-7 h-6 w-6';
        resetBtn.title = 'Reset result box size';
        resetBtn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="fill-current h-3 w-3 text-muted-foreground"><path fill-rule="evenodd" clip-rule="evenodd" d="M19 9C19.5523 9 20 9.44772 20 10C20 10.5523 19.5523 11 19 11H14C13.4477 11 13 10.5523 13 10V5C13 4.44772 13.4477 4 14 4C14.5523 4 15 4.44772 15 5V7.58579L19.2929 3.2929C19.6834 2.9024 20.3166 2.9024 20.7071 3.2929C21.0976 3.6834 21.0976 4.31658 20.7071 4.70711L16.4142 9H19ZM4.70711 20.7071C4.31658 21.0976 3.6834 21.0976 3.2929 20.7071C2.9024 20.3166 2.9024 19.6834 3.2929 19.2929L7.58579 15H5C4.44772 15 4 14.5523 4 14C4 13.4477 4.44772 13 5 13H10C10.5523 13 11 13.4477 11 14V19C11 19.5523 10.5523 20 10 20C9.44772 20 9 19.5523 9 19V16.4142L4.70711 20.7071Z"/></svg>';
        resetBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            resultDiv.style.maxHeight = '';
            Logger.log(`user reset result box height to default`);
        });
        buttonContainer.appendChild(resetBtn);
    },

    findResultButtonContainer(card) {
        const stepResult = card.querySelector(this.selectors.stepResult);
        if (!stepResult) return null;
        return stepResult.querySelector('.flex.items-center.justify-between.gap-2');
    },

    findWorkflowPanel() {
        return document.querySelector('[data-ui="workflow-panel"]');
    },

    findToolsArea(panel) {
        if (!panel) return null;
        return panel.querySelector('[data-ui="workflow-steps-container"]');
    },

    isToolEnvReady() {
        return document.documentElement.getAttribute('data-fleet-dispute-tool-env-ready') === '1';
    }
};

return plugin;
},
        "archetypes/dispute-detail/main/user-story-markdown.js": function (PluginManager, Storage, Logger, Context, CleanupRegistry, GM_xmlhttpRequest) {
// ============= user-story-markdown.js =============
// Shared Context.userStoryMarkdown library wrapper for the Scenario / User Story
// collapsible on the dispute detail page, plus a copy control next to the section
// header that copies the whole story with H1 sub-headers and --- separators.

const SECTION_HEADER_TEXT = 'Scenario / User Story';
const SCENARIO_LABEL_TEXT = 'Scenario';
const USER_STORY_LABEL_TEXT = 'User Story';
const ANNOTATOR_LABEL_TEXT = 'Annotator Instructions';
const COPY_BTN_ATTR = 'data-fleet-dispute-detail-user-story-copy';
const COPY_BTN_CLASS =
    'inline-flex items-center justify-center whitespace-nowrap rounded-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground h-7 text-xs pl-2 pr-2 py-1 gap-1.5';
const COPY_ICON_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-3.5 w-3.5">' +
    '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect>' +
    '<path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path>' +
    '</svg>';

const plugin = {
    id: 'userStoryMarkdown',
    name: 'User Story Markdown',
    description:
        'Renders Scenario / User Story as markdown with a full-story copy control on dispute detail',
    _version: '1.2',
    enabledByDefault: true,
    phase: 'mutation',
    initialState: {
        styleInjected: false,
        activationLogged: false,
        missingLogged: false,
        activeByBody: null,
        copyButtonLogged: false
    },

    onMutation(state) {
        const api = Context.userStoryMarkdown;
        if (!api || typeof api.run !== 'function') return;
        this._captureOriginalStoryWidth();
        api.run(state, {
            pluginId: this.id,
            logTag: this.id
        });
        this._applyReplicaMaxWidth();
        this._ensureCopyControl(state);
    },

    _normalizeText(text) {
        return String(text || '').replace(/\s+/g, ' ').trim();
    },

    _findCollapsibleRoot() {
        const buttons = document.querySelectorAll('button[data-slot="button"]');
        for (const btn of buttons) {
            const span = btn.querySelector('span.text-sm.font-medium');
            if (!span) continue;
            if (this._normalizeText(span.textContent) !== SECTION_HEADER_TEXT) continue;
            const controlsId = btn.getAttribute('aria-controls');
            if (!controlsId) continue;
            const panel = document.getElementById(controlsId);
            if (!panel) continue;
            return { toggleBtn: btn, headerSpan: span, panel };
        }
        return null;
    },

    _findSectionLabel(root, labelText) {
        if (!root) return null;
        const labels = root.querySelectorAll(
            'div.text-sm.text-muted-foreground.font-medium, div.font-medium.text-sm.text-muted-foreground'
        );
        for (const label of labels) {
            if (this._normalizeText(label.textContent) === labelText) return label;
        }
        return null;
    },

    /**
     * Record the story blockquote's rendered width before the library hides it,
     * so the markdown replica can be capped to the same width.
     */
    _captureBodyWidth(label) {
        if (!label) return;
        const body = label.nextElementSibling;
        if (!body || body.getAttribute('data-fleet-user-story-original') === 'true') return;
        if (body.dataset.fleetOriginalWidth) return;
        const width = body.getBoundingClientRect().width;
        if (width > 50) body.dataset.fleetOriginalWidth = String(Math.round(width));
    },

    _captureOriginalStoryWidth() {
        const root = this._findCollapsibleRoot();
        if (!root) return;
        this._captureBodyWidth(this._findSectionLabel(root.panel, USER_STORY_LABEL_TEXT));
        this._captureBodyWidth(this._findSectionLabel(root.panel, ANNOTATOR_LABEL_TEXT));
    },

    _applyReplicaMaxWidth() {
        const root = this._findCollapsibleRoot();
        if (!root) return;
        const originals = root.panel.querySelectorAll(
            '[data-fleet-user-story-original="true"][data-fleet-original-width]'
        );
        for (const original of originals) {
            const replica = original.nextElementSibling;
            if (!replica || replica.getAttribute('data-fleet-user-story-replica') !== 'true') continue;
            const maxWidth = original.dataset.fleetOriginalWidth + 'px';
            if (replica.style.maxWidth !== maxWidth) replica.style.maxWidth = maxWidth;
        }
    },

    _sectionBodyText(label) {
        if (!label) return '';
        let sibling = label.nextElementSibling;
        while (sibling) {
            if (sibling.getAttribute && sibling.getAttribute('data-fleet-user-story-replica') === 'true') {
                sibling = sibling.nextElementSibling;
                continue;
            }
            return (sibling.textContent || '').trim();
        }
        return '';
    },

    _buildCopyText(panel) {
        const blocks = [];
        const fieldDefs = [
            { label: SCENARIO_LABEL_TEXT },
            { label: USER_STORY_LABEL_TEXT },
            { label: ANNOTATOR_LABEL_TEXT }
        ];
        for (const { label } of fieldDefs) {
            const el = this._findSectionLabel(panel, label);
            const value = this._sectionBodyText(el);
            if (value) blocks.push('# ' + label + '\n' + value);
        }
        return blocks.join('\n\n---\n\n');
    },

    async _copyTextToClipboard(text) {
        if (!text) return false;
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(text);
                return true;
            }
        } catch (_e) { /* fall through */ }
        try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.setAttribute('readonly', '');
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            document.body.appendChild(ta);
            ta.select();
            const ok = document.execCommand('copy');
            document.body.removeChild(ta);
            return ok;
        } catch (_e2) {
            return false;
        }
    },

    _ensureCopyControl(state) {
        const root = this._findCollapsibleRoot();
        if (!root) {
            state.copyButtonLogged = false;
            return;
        }
        if (root.toggleBtn.querySelector('[' + COPY_BTN_ATTR + '="1"]')) return;

        // Nested <button> inside the collapsible toggle is invalid HTML and would
        // also toggle the panel — use a span[role="button"] with stopPropagation.
        const copyBtn = document.createElement('span');
        copyBtn.setAttribute('role', 'button');
        copyBtn.tabIndex = 0;
        copyBtn.className = COPY_BTN_CLASS;
        copyBtn.setAttribute(COPY_BTN_ATTR, '1');
        copyBtn.setAttribute('data-fleet-plugin', this.id);
        copyBtn.title = 'Copy scenario, user story, and annotator instructions';
        copyBtn.setAttribute('aria-label', 'Copy scenario, user story, and annotator instructions');
        copyBtn.innerHTML = COPY_ICON_SVG;

        const doCopy = async (event) => {
            event.preventDefault();
            event.stopPropagation();
            const text = this._buildCopyText(root.panel);
            const ok = await this._copyTextToClipboard(text);
            if (ok) {
                if (Context.buttonFeedback) {
                    Context.buttonFeedback.flashSuccess(copyBtn, { restoreStyles: false });
                }
                Logger.log('copied scenario story (' + text.length + ' chars)');
            } else {
                if (Context.buttonFeedback) {
                    Context.buttonFeedback.flashFailure(copyBtn, { restoreStyles: false });
                }
                Logger.warn('scenario story copy failed');
            }
        };

        copyBtn.addEventListener('click', (event) => {
            void doCopy(event);
        });
        copyBtn.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            void doCopy(event);
        });

        // Nest inside the title span so the control hugs the text; the toggle's
        // justify-between would otherwise center a third flex child in the row.
        root.headerSpan.classList.add('inline-flex', 'items-center', 'gap-1.5');
        root.headerSpan.appendChild(copyBtn);

        if (!state.copyButtonLogged) {
            Logger.log('copy control injected in Scenario / User Story header');
            state.copyButtonLogged = true;
        }
    }
};

return plugin;
}
    };
    // @@SAFE_UX_BUNDLE_END
    const SHARED_STORAGE_KEYS = {
        favoriteTools: 'favorite-tools'
    };
    const SCRIPT_DATA_KEY_REGISTRY = [
        'fleet-ux:ops-team-search-next-action',
        'fleet-ux:ops-team-search-router-state',
        'fleet-ux:ops-team-add-member-next-action',
        'fleet-ux:ops-team-add-member-router-state',
        'fleet-ux:ops-task-data-next-action',
        'fleet-ux:ops-task-data-router-state',
        'fleet-ux:ops-expert-stats-next-action',
        'fleet-ux:ops-expert-stats-router-state',
        'fleet-ux:ops-current-user-id',
        'fleet-ux:ops-team-cred-refresh-done',
        'fleet-ux:dashboard-bootstrap',
        'fleet-ux:dashboard-search-depth',
        'fleet-ux:dashboard-results-mode',
        'fleet-ux:dashboard-results-page-size',
        'fleet-ux:dashboard-default-tab',
        'fleet-ux:dashboard-default-stats-tab',
        'fleet-ux:dashboard-tab-order',
        'fleet-ux:dashboard-chats-sidebar-width',
        'fleet-ux:dashboard-side-panel-width',
        'fleet-ux:dashboard-results-panel-max-width',
        'fleet-ux:diff-viewer-side-panel-width',
        'fleet-ux:team-members-page-size',
        'fleet-ux:verifier-fetcher-scratchpad-width',
        'fleet-ux:verifier-fetcher-scratchpad-open',
        'fleet-ux:verifier-fetcher-scratchpad-text',
        'fleet-ux:verifier-fetcher-chat-open',
        'fleet-ux:ai-openrouter-key',
        'fleet-ux:ai-chats-index',
        'fleet-ux:diff-viewer-stash',
        'fleet-ux:diff-viewer-granularity',
        'fleet-ux:diff-viewer-comp-mode',
        'fleet-ux:diff-viewer-highlight-modality',
        'fleet-ux:supabase-rest-base-url',
        'fleet-ux:supabase-anon-key',
        'fleet-ux:supabase-project-ref',
        'fleet-ux:supabase-access-token'
    ];
    const DEV_HANDSHAKE_PAGE_LS_ALLOWLIST = new Set([
        'fleet-dev-branch-id',
        'fleet-dev-active-branch',
        'fleet-main-active-branch',
        'fleet-dev-orphan-branch'
    ]);
    const LOG_PREFIX = '[Fleet UX Enhancer]';
    
    const BASE_URL = 'https://www.fleetai.com/';

    const NOVNC_SYNTHETIC_PATH = '_novnc';
    
    const GITHUB_CONFIG = {
        owner: 'Fleet-AI-Operations',
        repo: 'fleet-ux-improvements',
        branch: 'main',
        pluginsPath: 'plugins',
        corePath: 'core',
        devPath: 'dev',
        archetypesPath: 'archetypes.json'
    };
    const MAIN_LIKE_BRANCHES = ['main', 'test-update'];
    const DEV_SCRIPTS_ENABLED = !MAIN_LIKE_BRANCHES.includes(GITHUB_CONFIG.branch);
    const DEFAULT_STORAGE_LOG_VERBOSE = DEV_SCRIPTS_ENABLED ? true : false;
    const DEFAULT_STORAGE_SUBMODULE_LOGGING = DEV_SCRIPTS_ENABLED;
    const DEFAULT_PAGE_REFRESH_CONFIRMATION = false;
    const DEFAULT_EXTENSION_REFRESH_CONFIRMATION = false;

    // ============= SHARED CONTEXT =============
    const Context = {
        version: VERSION,
        safeUxBuild: SAFE_UX_BUILD,
        safeUxBuildName: SAFE_UX_BUILD_NAME,
        archetypesVersion: null,
        source: null,
        initialized: false,
        currentArchetype: null,
        currentPath: null,
        outdatedPlugins: [],
        isOutdated: false,
        latestVersion: null,
        coreOnlyMode: false,
        isDevBranch: DEV_SCRIPTS_ENABLED,
        defaultPageRefreshConfirmation: DEFAULT_PAGE_REFRESH_CONFIRMATION,
        defaultExtensionRefreshConfirmation: DEFAULT_EXTENSION_REFRESH_CONFIRMATION,
        githubBranch: GITHUB_CONFIG.branch,
        githubOwner: GITHUB_CONFIG.owner,
        githubRepo: GITHUB_CONFIG.repo,
        logPrefix: LOG_PREFIX,
        getPageWindow: () => typeof unsafeWindow !== 'undefined' ? unsafeWindow : window,
        openInTab: (url, options) => GM_openInTab(url, options),
        storageKeys: SHARED_STORAGE_KEYS,
        settingsModalDocs: {},
        remoteLogging: { debug: false, verbose: false, submodule: false },
        remoteModuleLogByFile: {},
        opsAccess: null,
        opsSecrets: null,
        opsDashboardPluginsLoaded: false,
        isExternalInstanceHost: NOVNC_HOST_PATTERN.test(window.location.hostname),
    };

    const RefreshGuard = {
        _pendingReloadSource: null,
        _pendingReloadReason: null,
        _pendingReloadAt: 0,
        _beforeUnloadBound: false,
        _reloadPatched: false,
        _skipNextBeforeUnloadPrompt: false,

        _getStorage() {
            return Context.storage || null;
        },

        _getLogger() {
            return Context.logger || null;
        },

        _log(level, message, ...args) {
            const logger = this._getLogger();
            if (logger && typeof logger[level] === 'function') {
                logger[level](message, ...args);
                return;
            }
            const fn = typeof console[level] === 'function' ? console[level] : console.log;
            fn(`${LOG_PREFIX} ${message}`, ...args);
        },

        isPageRefreshConfirmationEnabled() {
            const storage = this._getStorage();
            return storage ? storage.get('page-refresh-confirmation-enabled', DEFAULT_PAGE_REFRESH_CONFIRMATION) : false;
        },

        isExtensionRefreshConfirmationEnabled() {
            const storage = this._getStorage();
            return storage
                ? storage.get('extension-refresh-confirmation-enabled', DEFAULT_EXTENSION_REFRESH_CONFIRMATION)
                : false;
        },

        markPendingReload(source = 'page', reason = '') {
            this._pendingReloadSource = source;
            this._pendingReloadReason = reason || '';
            this._pendingReloadAt = Date.now();
            this._log('info', `Refresh pending (${source})${reason ? `: ${reason}` : ''}`);
        },

        _consumePendingReloadSource() {
            const now = Date.now();
            // Keep source marks only briefly so stale values don't leak into unrelated unloads.
            if (!this._pendingReloadSource || (now - this._pendingReloadAt) > 3000) {
                this._pendingReloadSource = null;
                this._pendingReloadReason = null;
                this._pendingReloadAt = 0;
                return 'page';
            }
            const source = this._pendingReloadSource;
            this._pendingReloadSource = null;
            this._pendingReloadReason = null;
            this._pendingReloadAt = 0;
            return source;
        },

        _inferSourceFromStack(stack) {
            if (!stack) return 'page';
            if (/fleet\.user\.js|plugins\/core\/|plugins\/archetypes\//i.test(stack)) {
                return 'extension';
            }
            return 'page';
        },

        _beforeUnloadHandler(event) {
            const source = this._consumePendingReloadSource();
            if (this._skipNextBeforeUnloadPrompt) {
                this._skipNextBeforeUnloadPrompt = false;
                this._log('debug', `Skipping beforeunload prompt once (${source})`);
                return undefined;
            }
            const pageEnabled = this.isPageRefreshConfirmationEnabled();
            const extensionEnabled = this.isExtensionRefreshConfirmationEnabled();
            const shouldPrompt = source === 'extension' ? extensionEnabled : pageEnabled;
            if (!shouldPrompt) {
                this._log('debug', `Refresh confirmation skipped (${source})`);
                return undefined;
            }
            const bracketLabel = source === 'extension'
                ? '[Extension Initiated Refresh]'
                : '[Fleet Initiated Refresh]';
            const message = `${bracketLabel} Are you sure you want to refresh this page?`;
            this._log('warn', `Showing refresh confirmation dialog (${source})`);
            event.preventDefault();
            // Browsers may ignore custom beforeunload text, but setting it is still best-effort.
            event.returnValue = message;
            return message;
        },

        _patchReloadMethod(locationObject, label) {
            if (!locationObject || typeof locationObject.reload !== 'function') {
                return false;
            }
            const original = locationObject.reload.bind(locationObject);
            try {
                locationObject.reload = (...args) => {
                    const source = this._inferSourceFromStack(new Error().stack || '');
                    this.markPendingReload(source, `${label}.reload()`);
                    return original(...args);
                };
                this._log('log', `Patched ${label}.reload for refresh confirmation tracking`);
                return true;
            } catch (e) {
                this._log('warn', `Could not patch ${label}.reload directly:`, e);
                return false;
            }
        },

        init() {
            if (!this._beforeUnloadBound) {
                window.addEventListener('beforeunload', (event) => this._beforeUnloadHandler(event));
                this._beforeUnloadBound = true;
                this._log('log', 'Refresh confirmation guard initialized');
            }
            if (this._reloadPatched) return;
            try {
                const pageWindow = Context.getPageWindow();
                const patchedCurrentWindow = this._patchReloadMethod(window.location, 'window.location');
                const patchedPageWindow = pageWindow && pageWindow !== window
                    ? this._patchReloadMethod(pageWindow.location, 'unsafeWindow.location')
                    : false;
                this._reloadPatched = patchedCurrentWindow || patchedPageWindow;
            } catch (e) {
                this._log('warn', 'Refresh guard init continued without reload patching', e);
            }
        },

        requestExtensionReload(reason = 'extension action') {
            if (this.isExtensionRefreshConfirmationEnabled()) {
                const confirmed = window.confirm(
                    '[Extension Initiated Refresh] Are you sure you want to refresh this page?'
                );
                if (!confirmed) {
                    this._log('info', `Extension refresh cancelled by user${reason ? `: ${reason}` : ''}`);
                    return;
                }
                // Prevent a second native beforeunload prompt for the same extension reload.
                this._skipNextBeforeUnloadPrompt = true;
            }
            this.markPendingReload('extension', reason);
            location.reload();
        }
    };

    // ============= DEV-ONLY REDIRECT (DEV ID) =============
    const MAIN_SCRIPT_RAW_URL = 'https://raw.githubusercontent.com/' + GITHUB_CONFIG.owner + '/' + GITHUB_CONFIG.repo + '/main/fleet.user.js';
    const DEV_ID_STORAGE_KEY = 'fleet-dev-branch-id';
    const DEV_ACTIVE_STORAGE_KEY = 'fleet-dev-active-branch';
    const MAIN_ACTIVE_STORAGE_KEY = 'fleet-main-active-branch';
    const ORPHAN_BRANCH_STORAGE_KEY = 'fleet-dev-orphan-branch';
    const ORPHAN_RELOAD_SESSION_KEY = 'fleet-dev-orphan-reload';
    const ORPHAN_PROBE_WINDOW_KEY = '__fleetOrphanProbe';
    const SCRIPT_HANDSHAKE_DELAY_MS = 100;
    const ORPHAN_PROBE_WAIT_MS = 2000;

    function getPageWindow() {
        try {
            return typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
        } catch (e) {
            return window;
        }
    }

    function getPageLocalStorage() {
        try {
            const pageWindow = getPageWindow();
            return pageWindow && pageWindow.localStorage ? pageWindow.localStorage : null;
        } catch (e) {
            return null;
        }
    }

    function getOrphanBranchMarker() {
        const storage = getPageLocalStorage();
        if (!storage) return null;
        try {
            return storage.getItem(ORPHAN_BRANCH_STORAGE_KEY);
        } catch (e) {
            return null;
        }
    }

    function isCurrentBranchOrphaned() {
        return getOrphanBranchMarker() === GITHUB_CONFIG.branch;
    }

    function markCurrentBranchOrphaned() {
        const storage = getPageLocalStorage();
        if (!storage) return;
        try {
            storage.setItem(ORPHAN_BRANCH_STORAGE_KEY, GITHUB_CONFIG.branch);
        } catch (e) {
            // ignore
        }
    }

    function clearOrphanMarkerForCurrentBranch() {
        const storage = getPageLocalStorage();
        if (!storage) return;
        try {
            if (storage.getItem(ORPHAN_BRANCH_STORAGE_KEY) === GITHUB_CONFIG.branch) {
                storage.removeItem(ORPHAN_BRANCH_STORAGE_KEY);
            }
        } catch (e) {
            // ignore
        }
    }

    function clearDevActiveBranchMarker() {
        const storage = getPageLocalStorage();
        if (!storage) return;
        try {
            storage.removeItem(DEV_ACTIVE_STORAGE_KEY);
        } catch (e) {
            // ignore
        }
    }

    function clearMatchingDevIdMarker() {
        const storage = getPageLocalStorage();
        if (!storage) return;
        try {
            if (storage.getItem(DEV_ID_STORAGE_KEY) === GITHUB_CONFIG.branch) {
                storage.removeItem(DEV_ID_STORAGE_KEY);
            }
        } catch (e) {
            // ignore
        }
    }

    function clearFeatureClaimsForCurrentBranch() {
        clearDevActiveBranchMarker();
        clearMatchingDevIdMarker();
    }

    function getMainActiveBranchMarker() {
        const storage = getPageLocalStorage();
        if (!storage) return null;
        try {
            return storage.getItem(MAIN_ACTIVE_STORAGE_KEY);
        } catch (e) {
            return null;
        }
    }

    function isArchetypesHttp404Error(error) {
        if (!error) return false;
        const msg = error && error.message ? error.message : String(error);
        return /HTTP\s*404/.test(msg);
    }

    function yieldToMainForOrphanedBranch(reason) {
        const detail = reason || 'archetypes.json missing';
        console.warn(
            `${LOG_PREFIX} Branch "${GITHUB_CONFIG.branch}" appears deleted (${detail}); yielding to main userscript`
        );
        markCurrentBranchOrphaned();
        clearFeatureClaimsForCurrentBranch();
        try {
            const pageWindow = getPageWindow();
            const sessionStore = pageWindow && pageWindow.sessionStorage ? pageWindow.sessionStorage : null;
            if (sessionStore) {
                if (sessionStore.getItem(ORPHAN_RELOAD_SESSION_KEY) === GITHUB_CONFIG.branch) {
                    console.warn(`${LOG_PREFIX} Orphan reload already attempted this session; not reloading again`);
                    return false;
                }
                sessionStore.setItem(ORPHAN_RELOAD_SESSION_KEY, GITHUB_CONFIG.branch);
            }
        } catch (e) {
            // ignore
        }
        try {
            location.reload();
            return true;
        } catch (e) {
            console.error(`${LOG_PREFIX} Failed to reload after orphaning branch`, e);
            return false;
        }
    }

    function probeBranchArchetypesStatus() {
        return Promise.resolve({ status: 0, skipped: true });
    }

    function stashOrphanProbeOnPageWindow(promise) {
        try {
            const pageWindow = getPageWindow();
            if (!pageWindow) return;
            pageWindow[ORPHAN_PROBE_WINDOW_KEY] = {
                branch: GITHUB_CONFIG.branch,
                promise: promise
            };
        } catch (e) {
            // ignore
        }
    }

    function getStashedOrphanProbe() {
        try {
            const pageWindow = getPageWindow();
            if (!pageWindow) return null;
            const entry = pageWindow[ORPHAN_PROBE_WINDOW_KEY];
            if (!entry || typeof entry !== 'object') return null;
            return entry;
        } catch (e) {
            return null;
        }
    }

    function startOrphanProbeIfNeeded() {
        if (!DEV_SCRIPTS_ENABLED || !isCurrentBranchOrphaned()) {
            const existing = getStashedOrphanProbe();
            if (existing && existing.branch === GITHUB_CONFIG.branch && existing.promise) {
                return existing.promise;
            }
            return null;
        }
        const existing = getStashedOrphanProbe();
        if (existing && existing.branch === GITHUB_CONFIG.branch && existing.promise) {
            return existing.promise;
        }
        console.log(
            `${LOG_PREFIX} - Branch "${GITHUB_CONFIG.branch}" has orphan marker; probing archetypes.json`
        );
        const promise = probeBranchArchetypesStatus().then((status) => {
            if (status === 200) {
                clearOrphanMarkerForCurrentBranch();
                writeDevActiveBranchMarker();
            } else {
                clearDevActiveBranchMarker();
            }
            return status;
        });
        stashOrphanProbeOnPageWindow(promise);
        return promise;
    }

    function waitForOrphanProbe(orphanBranch) {
        const entry = getStashedOrphanProbe();
        const promise = entry && entry.branch === orphanBranch && entry.promise
            ? entry.promise
            : null;
        if (!promise || typeof promise.then !== 'function') {
            return Promise.resolve(null);
        }
        return Promise.race([
            promise.then((status) => status).catch(() => null),
            new Promise((resolve) => {
                setTimeout(() => resolve(null), ORPHAN_PROBE_WAIT_MS);
            })
        ]);
    }

    function writeDevActiveBranchMarker() {
        if (!DEV_SCRIPTS_ENABLED) return;
        const storage = getPageLocalStorage();
        if (!storage) return;
        try {
            storage.setItem(DEV_ACTIVE_STORAGE_KEY, GITHUB_CONFIG.branch);
        } catch (e) {
            // ignore
        }
    }

    function writeMainActiveBranchMarker() {
        const storage = getPageLocalStorage();
        if (!storage) return;
        try {
            storage.setItem(MAIN_ACTIVE_STORAGE_KEY, GITHUB_CONFIG.branch);
        } catch (e) {
            // ignore
        }
    }

    if (DEV_SCRIPTS_ENABLED) {
        if (isCurrentBranchOrphaned()) {
            startOrphanProbeIfNeeded();
        } else {
            writeDevActiveBranchMarker();
        }
    }

    /**
     * Minimal bootstrap for FOS env iframes embedded on www.fleetai.com.
     * Parent fos-embedded-watcher owns the VM Clipboard UI and system clipboard I/O;
     * this child only pushes/pulls the noVNC buffer over postMessage.
     */
    function initFosEmbeddedMode() {
        const EMBED_LOG = '[Fleet UX Enhancer] fos-embedded';
        const NOVNC_CLIPBOARD_ID = 'noVNC_clipboard_text';
        const FLEET_PARENT_HOSTS = new Set(['www.fleetai.com', 'fleetai.com']);
        const MSG_PUSH = 'fleet-fos-push-clipboard';
        const MSG_PUSH_RESULT = 'fleet-fos-push-result';
        const MSG_EXTRACT_REQ = 'fleet-fos-extract-request';
        const MSG_EXTRACT_RESULT = 'fleet-fos-extract-result';
        const MSG_EMBEDDED_READY = 'fleet-fos-embedded-ready';
        const MSG_EMBEDDED_ACK = 'fleet-fos-embedded-ack';
        const ALLOWED_MSG_TYPES = new Set([
            MSG_PUSH,
            MSG_PUSH_RESULT,
            MSG_EXTRACT_REQ,
            MSG_EXTRACT_RESULT,
            MSG_EMBEDDED_READY,
            MSG_EMBEDDED_ACK
        ]);

        let fosAuthorized = false;
        let bridgeReady = false;
        let waitObserver = null;
        let clipQueue = Promise.resolve();
        let sessionNonce = null;
        let sessionInstanceId = '';

        function isExactFleetParentOrigin(origin) {
            return FLEET_PARENT_ORIGINS.has(origin);
        }

        function getFleetParentTargetOrigin() {
            try {
                if (document.referrer) {
                    const origin = new URL(document.referrer).origin;
                    if (isExactFleetParentOrigin(origin)) return origin;
                }
            } catch (_e) { /* ignore */ }
            try {
                if (window.location.ancestorOrigins && window.location.ancestorOrigins.length) {
                    const origin = window.location.ancestorOrigins[0];
                    if (isExactFleetParentOrigin(origin)) return origin;
                }
            } catch (_e) { /* ignore */ }
            return 'https://www.fleetai.com';
        }

        function isAllowedClipboardText(text) {
            return typeof text === 'string' && text.length <= FOS_CLIPBOARD_MAX_CHARS;
        }

        function isAllowedNonce(nonce) {
            return typeof nonce === 'string' && nonce.length >= 16 && nonce.length <= 128;
        }

        function clipEl() {
            return document.getElementById(NOVNC_CLIPBOARD_ID);
        }

        function getRfb() {
            return (
                window.rfb ||
                window._rfb ||
                (window.UI && window.UI.rfb) ||
                (window.APP && window.APP.rfb) ||
                (window.noVNC && window.noVNC.rfb) ||
                null
            );
        }

        function sleep(ms) {
            return new Promise((resolve) => {
                setTimeout(resolve, ms);
            });
        }

        function reply(event, payload) {
            try {
                if (event.source !== window.parent) return;
                if (!isExactFleetParentOrigin(event.origin)) return;
                if (event.source && typeof event.source.postMessage === 'function') {
                    const out = Object.assign({ nonce: sessionNonce, instanceId: sessionInstanceId }, payload);
                    event.source.postMessage(out, event.origin);
                }
            } catch (e) {
                console.warn(EMBED_LOG + ': reply postMessage failed', e);
            }
        }

        async function pushOsTextToVmClipboard(text) {
            const el = clipEl();
            if (!el) {
                console.warn(EMBED_LOG + ': push failed — noVNC clipboard field missing');
                return false;
            }
            const merged = typeof text === 'string' ? text : '';
            const rfb = getRfb();
            el.value = merged;
            if (rfb && typeof rfb.clipboardPasteFrom === 'function') {
                rfb.clipboardPasteFrom('');
                await sleep(12);
                rfb.clipboardPasteFrom(merged);
            } else {
                el.value = '';
                el.dispatchEvent(new Event('change', { bubbles: true }));
                el.dispatchEvent(new Event('input', { bubbles: true }));
                await sleep(12);
                el.value = merged;
                el.dispatchEvent(new Event('change', { bubbles: true }));
                el.dispatchEvent(new Event('input', { bubbles: true }));
            }
            return true;
        }

        function readVmClipboardText() {
            const el = clipEl();
            if (!el) {
                console.warn(EMBED_LOG + ': extract failed — noVNC clipboard field missing');
                return null;
            }
            const v = el.value || '';
            if (!v) {
                console.warn(EMBED_LOG + ': extract skipped — VM clipboard empty');
                return '';
            }
            return v;
        }

        function markBridgeReady() {
            if (bridgeReady) {
                return;
            }
            if (waitObserver) {
                try {
                    waitObserver.disconnect();
                } catch (_e) { /* ignore */ }
                waitObserver = null;
            }
            bridgeReady = true;
            console.log(EMBED_LOG + ': noVNC clipboard ready (parent hosts UI)');
        }

        function installWaitObserver() {
            if (bridgeReady || waitObserver) {
                return;
            }
            const check = () => {
                if (!fosAuthorized || bridgeReady) {
                    return;
                }
                if (document.getElementById(NOVNC_CLIPBOARD_ID)) {
                    markBridgeReady();
                }
            };
            check();
            if (bridgeReady) {
                return;
            }
            waitObserver = new MutationObserver(check);
            const root = document.documentElement || document.body;
            if (root) {
                waitObserver.observe(root, { childList: true, subtree: true });
            }
        }

        window.addEventListener('message', (event) => {
            if (event.source !== window.parent) {
                return;
            }
            if (!event.data || typeof event.data !== 'object' || typeof event.data.type !== 'string') {
                return;
            }
            if (!ALLOWED_MSG_TYPES.has(event.data.type)) {
                return;
            }
            if (!isExactFleetParentOrigin(event.origin)) {
                return;
            }

            if (event.data.type === MSG_EMBEDDED_READY) {
                if (!isAllowedNonce(event.data.nonce)) {
                    console.warn(EMBED_LOG + ': embedded-ready ignored — invalid nonce');
                    return;
                }
                const envKey = String(event.data.envKey || '');
                sessionNonce = event.data.nonce;
                sessionInstanceId = String(event.data.instanceId || '');
                const wasAuthorized = fosAuthorized;
                fosAuthorized = true;
                if (!wasAuthorized) {
                    console.log(EMBED_LOG + ': authorized for env ' + (envKey || '(none)'));
                    installWaitObserver();
                } else {
                    console.log(EMBED_LOG + ': re-ack for env ' + (envKey || '(none)'));
                }
                reply(event, { type: MSG_EMBEDDED_ACK, envKey, ok: true });
                return;
            }

            if (!fosAuthorized || !sessionNonce || event.data.nonce !== sessionNonce) {
                console.warn(EMBED_LOG + ': message ignored — not authorized or nonce mismatch');
                return;
            }

            if (event.data.type === MSG_PUSH) {
                const requestId = event.data.requestId;
                if (!isAllowedClipboardText(event.data.text)) {
                    reply(event, {
                        type: MSG_PUSH_RESULT,
                        requestId,
                        ok: false,
                        reason: 'invalid-text'
                    });
                    return;
                }
                clipQueue = clipQueue
                    .then(async () => {
                        const ok = await pushOsTextToVmClipboard(event.data.text);
                        if (ok) {
                            reply(event, { type: MSG_PUSH_RESULT, requestId, ok: true });
                            console.log(EMBED_LOG + ': push ok');
                        } else {
                            reply(event, {
                                type: MSG_PUSH_RESULT,
                                requestId,
                                ok: false,
                                reason: 'missing-clipboard-field'
                            });
                        }
                    })
                    .catch((e) => {
                        const error = String((e && e.message) || e);
                        console.warn(EMBED_LOG + ': push failed', e);
                        reply(event, {
                            type: MSG_PUSH_RESULT,
                            requestId,
                            ok: false,
                            reason: 'exception',
                            error
                        });
                    });
                return;
            }

            if (event.data.type === MSG_EXTRACT_REQ) {
                const requestId = event.data.requestId;
                clipQueue = clipQueue
                    .then(async () => {
                        const text = readVmClipboardText();
                        if (text == null) {
                            reply(event, {
                                type: MSG_EXTRACT_RESULT,
                                requestId,
                                ok: false,
                                reason: 'missing-clipboard-field'
                            });
                            return;
                        }
                        if (!text) {
                            reply(event, {
                                type: MSG_EXTRACT_RESULT,
                                requestId,
                                ok: false,
                                text: '',
                                reason: 'empty'
                            });
                            return;
                        }
                        if (!isAllowedClipboardText(text)) {
                            reply(event, {
                                type: MSG_EXTRACT_RESULT,
                                requestId,
                                ok: false,
                                reason: 'text-too-large'
                            });
                            return;
                        }
                        reply(event, { type: MSG_EXTRACT_RESULT, requestId, ok: true, text });
                        console.log(EMBED_LOG + ': extract ok');
                    })
                    .catch((e) => {
                        const error = String((e && e.message) || e);
                        console.warn(EMBED_LOG + ': extract failed', e);
                        reply(event, {
                            type: MSG_EXTRACT_RESULT,
                            requestId,
                            ok: false,
                            reason: 'exception',
                            error
                        });
                    });
            }
        });

        try {
            const parentOrigin = getFleetParentTargetOrigin();
            window.parent.postMessage(
                { type: 'fleet-fos-child-ready', hostname: window.location.hostname },
                parentOrigin
            );
            console.log(EMBED_LOG + ': child-ready sent');
        } catch (e) {
            console.warn(EMBED_LOG + ': child-ready postMessage failed', e);
        }
    }


    function showNonDevRedirectModal() {
        const root = document.body || document.documentElement;
        if (!root) return;
        const overlay = document.createElement('div');
        overlay.setAttribute('style',
            'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;');
        const box = document.createElement('div');
        box.setAttribute('style',
            'background:var(--card, var(--background, #fff));color:var(--foreground, #1f2937);max-width:576px;padding:24px;border-radius:8px;border:1px solid var(--border, #e2e8f0);box-shadow:0 25px 50px -12px color-mix(in srgb, var(--foreground, #0f172a) 25%, transparent);font-family:system-ui,-apple-system,sans-serif;font-size:15px;line-height:1.6;position:relative;');
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.textContent = 'Close';
        closeBtn.setAttribute('style',
            'position:absolute;top:12px;right:12px;padding:6px 12px;border:1px solid var(--border, #d1d5db);border-radius:6px;background:var(--background, #fff);cursor:pointer;font-size:13px;color:var(--foreground, #374151);');
        closeBtn.addEventListener('click', function closeModal() {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        });
        overlay.addEventListener('click', function onOverlayClick(e) {
            if (e.target === overlay) {
                if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            }
        });
        const p1 = document.createElement('p');
        p1.setAttribute('style', 'margin:0 0 12px 0;padding-right:60px;');
        p1.textContent = 'Attention, it appears you are on a dev build of the Fleet Enhancement Userscript, and you are not a dev. Please reinstall the ';
        const link = document.createElement('a');
        link.href = MAIN_SCRIPT_RAW_URL;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = 'main version';
        link.setAttribute('style', 'color:var(--brand, #2563eb);text-decoration:underline;font-weight:600;');
        p1.appendChild(link);
        p1.appendChild(document.createTextNode(' of this userscript and reload the page.'));
        const expandTrigger = document.createElement('button');
        expandTrigger.type = 'button';
        expandTrigger.textContent = 'Still seeing this message after reinstalling?';
        expandTrigger.setAttribute('style', 'margin:12px 0 0 0;padding:0;border:none;background:none;cursor:pointer;font-size:14px;color:var(--brand, #2563eb);text-decoration:underline;text-align:left;display:block;');
        const expandBlock = document.createElement('div');
        expandBlock.setAttribute('style', 'display:none;margin-top:12px;padding:12px;background:var(--muted, #f3f4f6);border-radius:6px;font-size:14px;line-height:1.6;color:var(--foreground, #1f2937);');
        expandBlock.innerHTML = '<style>.fleet-redirect-modal-ol{margin:8px 0 0 0;padding-left:24px;list-style-type:decimal !important;list-style-position:outside !important;}.fleet-redirect-modal-ol li{list-style-type:decimal !important;list-style-position:outside !important;}</style>You may need to uninstall the dev version.<ol class="fleet-redirect-modal-ol">' +
            '<li>Go to your userscript extension dashboard</li>' +
            '<li>Look for any userscript that has a title like <code>[dev] Fleet..</code> or <code>[v1] Fleet...</code></li>' +
            '<li>Delete any scripts that match this description</li>' +
            '<li>You should only have one <code>Fleet UX Enhancer</code> extension, and that is exactly the title it should have.</li>' +
            '</ol>';
        expandTrigger.addEventListener('click', function() {
            const isHidden = expandBlock.style.display === 'none';
            expandBlock.style.display = isHidden ? 'block' : 'none';
        });
        const p2 = document.createElement('p');
        p2.setAttribute('style', 'margin:12px 0 0 0;font-size:13px;color:var(--muted-foreground, #6b7280);text-align:center;');
        p2.appendChild(document.createTextNode('(If you are getting this message in error, please contact '));
        const contactLink = document.createElement('a');
        contactLink.href = 'https://fleet-ai.slack.com/team/U0A7ZG905R6';
        contactLink.target = '_blank';
        contactLink.rel = 'noopener noreferrer';
        contactLink.textContent = 'Nicholas Doherty';
        contactLink.setAttribute('style', 'color:var(--brand, #2563eb);text-decoration:underline;');
        p2.appendChild(contactLink);
        p2.appendChild(document.createTextNode(' to resolve this.)'));
        box.appendChild(closeBtn);
        box.appendChild(p1);
        box.appendChild(expandTrigger);
        box.appendChild(expandBlock);
        box.appendChild(p2);
        overlay.appendChild(box);
        root.appendChild(overlay);
    }


    // ============= STORAGE MANAGER =============
    const Storage = {
        get(key, defaultValue) {
            return GM_getValue(STORAGE_PREFIX + key, defaultValue);
        },
        set(key, value) {
            GM_setValue(STORAGE_PREFIX + key, value);
        },
        getPluginEnabled(pluginId) {
            const pm = Context.pluginManager;
            const plugin = pm ? pm.get(pluginId) : null;
            const defaultValue = plugin ? (plugin.enabledByDefault !== false) : true;
            return this.get(`plugin-${pluginId}-enabled`, defaultValue);
        },
        setPluginEnabled(pluginId, enabled) {
            this.set(`plugin-${pluginId}-enabled`, enabled);
        },
        // Plugin versioning storage
        getCachedPlugin(pluginKey) {
            const cached = this.get(`plugin-cache-${pluginKey}`, null);
            if (cached) {
                try {
                    return JSON.parse(cached);
                } catch (e) {
                    Logger.error(`Failed to parse cached plugin ${pluginKey}:`, e);
                    return null;
                }
            }
            return null;
        },
        setCachedPlugin(pluginKey, code, version) {
            const cacheData = {
                code: code,
                version: version,
                cachedAt: Date.now()
            };
            this.set(`plugin-cache-${pluginKey}`, JSON.stringify(cacheData));
        },
        clearCachedPlugin(pluginKey) {
            if (!pluginKey) return;
            this.delete(`plugin-cache-${pluginKey}`);
        },
        getPluginKey(filename, sourcePath) {
            // Create a unique key for the plugin based on its path
            return sourcePath || filename;
        },
        /**
         * Resolve GM plugin-cache sourcePath for a registered plugin.
         * Prefers plugin._sourcePath; otherwise reconstructs from flags + current archetype.
         */
        resolvePluginSourcePath(plugin) {
            if (!plugin || typeof plugin !== 'object') return null;
            if (typeof plugin._sourcePath === 'string' && plugin._sourcePath) {
                return plugin._sourcePath;
            }
            const filename = plugin._sourceFile || null;
            if (!filename || typeof filename !== 'string') return null;
            if (plugin._isLib) return `libs/${filename}`;
            if (plugin._isCore && plugin._isDev) return `core/dev/${filename}`;
            if (plugin._isCore) return `core/main/${filename}`;
            const am = Context.archetypeManager;
            if (plugin._isDev) {
                const devId = (am && am.currentDevArchetype && am.currentDevArchetype.id)
                    || (Context.currentDevArchetype && Context.currentDevArchetype.id)
                    || null;
                if (devId) return `archetypes/${devId}/dev/${filename}`;
                return null;
            }
            const archId = (am && am.currentArchetype && am.currentArchetype.id)
                || (Context.currentArchetype && Context.currentArchetype.id)
                || null;
            if (archId) return `archetypes/${archId}/main/${filename}`;
            return null;
        },
        /**
         * Clear GM code cache and module-associated settings for a plugin.
         * Keeps plugin-{id}-enabled. Does not unregister from PluginManager.
         * @returns {{ clearedKeys: number, sourcePath: string|null }}
         */
        clearModuleLocalData(plugin) {
            if (!plugin || !plugin.id) {
                return { clearedKeys: 0, sourcePath: null };
            }
            let clearedKeys = 0;
            const sourcePath = this.resolvePluginSourcePath(plugin);
            const filename = plugin._sourceFile || (sourcePath ? sourcePath.split('/').pop() : null);

            if (sourcePath) {
                const pluginKey = this.getPluginKey(filename || sourcePath, sourcePath);
                this.clearCachedPlugin(pluginKey);
                clearedKeys++;
                if (sourcePath.startsWith('archetypes/')) {
                    const parts = sourcePath.split('/');
                    if (parts.length >= 3 && parts[1] && filename) {
                        this.unregisterCachedPlugin(parts[1], filename);
                    }
                }
            }

            this.delete(`module-logging-${plugin.id}`);
            clearedKeys++;
            if (Context.logger && Context.logger._moduleLogEnabled
                && Object.prototype.hasOwnProperty.call(Context.logger._moduleLogEnabled, plugin.id)) {
                delete Context.logger._moduleLogEnabled[plugin.id];
            }

            if (plugin.subOptions && Array.isArray(plugin.subOptions)) {
                plugin.subOptions.forEach((subOption) => {
                    if (!subOption || !subOption.id) return;
                    this.delete(`suboption-${plugin.id}-${subOption.id}`);
                    clearedKeys++;
                });
            }

            this.delete(`${plugin.id}-ignored`);
            clearedKeys++;

            if (plugin.storageKeys && typeof plugin.storageKeys === 'object' && !Array.isArray(plugin.storageKeys)) {
                Object.keys(plugin.storageKeys).forEach((k) => {
                    const key = plugin.storageKeys[k];
                    if (typeof key === 'string' && key) {
                        this.delete(key);
                        clearedKeys++;
                    }
                });
            }

            return { clearedKeys, sourcePath };
        },
        // Settings modal doc cache (versioned, same pattern as plugin cache)
        getCachedSettingsDoc(name) {
            const cached = this.get(`settings-doc-cache-${name}`, null);
            if (cached) {
                try {
                    const parsed = JSON.parse(cached);
                    return { raw: parsed.raw, version: parsed.version };
                } catch (e) {
                    Logger.error(`Failed to parse cached settings doc ${name}:`, e);
                    return null;
                }
            }
            return null;
        },
        setCachedSettingsDoc(name, raw, version) {
            const cacheData = { raw, version, cachedAt: Date.now() };
            this.set(`settings-doc-cache-${name}`, JSON.stringify(cacheData));
        },
        // Last-known-good archetypes.json (branch-scoped fallback when GitHub fetch fails)
        getCachedArchetypesJson(branch) {
            const cached = this.get('archetypes-json-cache', null);
            if (!cached) return null;
            try {
                const parsed = typeof cached === 'string' ? JSON.parse(cached) : cached;
                if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
                if (!parsed.raw || typeof parsed.raw !== 'string') return null;
                if (branch && parsed.branch !== branch) return null;
                return {
                    raw: parsed.raw,
                    branch: parsed.branch || null,
                    archetypesVersion: parsed.archetypesVersion != null ? parsed.archetypesVersion : null,
                    cachedAt: typeof parsed.cachedAt === 'number' ? parsed.cachedAt : null
                };
            } catch (e) {
                Logger.error('Failed to parse cached archetypes.json:', e);
                return null;
            }
        },
        setCachedArchetypesJson(raw, branch, archetypesVersion) {
            if (!raw || typeof raw !== 'string' || !branch) return;
            const cacheData = {
                raw,
                branch,
                archetypesVersion: archetypesVersion != null ? archetypesVersion : null,
                cachedAt: Date.now()
            };
            this.set('archetypes-json-cache', JSON.stringify(cacheData));
        },
        clearCachedArchetypesJson() {
            this.delete('archetypes-json-cache');
        },
        getSubmoduleLoggingEnabled() {
            return this.get('submodule-logging', DEFAULT_STORAGE_SUBMODULE_LOGGING);
        },
        setSubmoduleLoggingEnabled(enabled) {
            this.set('submodule-logging', enabled);
        },
        getModuleLoggingEnabled(moduleId) {
            return this.get(`module-logging-${moduleId}`, false);
        },
        setModuleLoggingEnabled(moduleId, enabled) {
            this.set(`module-logging-${moduleId}`, enabled);
        },
        // Sub-option storage
        getSubOptionEnabled(pluginId, subOptionId, defaultValue = true) {
            return this.get(`suboption-${pluginId}-${subOptionId}`, defaultValue);
        },
        setSubOptionEnabled(pluginId, subOptionId, enabled) {
            this.set(`suboption-${pluginId}-${subOptionId}`, enabled);
        },
        _dataGmKey(logicalKey) {
            return `data:${logicalKey}`;
        },
        getData(logicalKey, defaultValue) {
            return this.get(this._dataGmKey(logicalKey), defaultValue);
        },
        setData(logicalKey, value) {
            this.set(this._dataGmKey(logicalKey), value);
        },
        deleteData(logicalKey) {
            this.delete(this._dataGmKey(logicalKey));
        },
        purgeLegacyPageLocalStorage() {
            const pageStorage = getPageLocalStorage();
            if (!pageStorage) {
                return 0;
            }
            let purged = 0;
            SCRIPT_DATA_KEY_REGISTRY.forEach((key) => {
                if (DEV_HANDSHAKE_PAGE_LS_ALLOWLIST.has(key)) {
                    return;
                }
                try {
                    if (pageStorage.getItem(key) != null) {
                        pageStorage.removeItem(key);
                        purged++;
                    }
                } catch (_e) { /* ignore */ }
            });
            return purged;
        },
        migratePageLocalStorageOnce() {
            const pageStorage = getPageLocalStorage();
            if (!pageStorage) {
                return 0;
            }
            let migrated = 0;
            SCRIPT_DATA_KEY_REGISTRY.forEach((key) => {
                if (DEV_HANDSHAKE_PAGE_LS_ALLOWLIST.has(key)) {
                    return;
                }
                try {
                    const existing = this.getData(key, null);
                    if (existing != null && existing !== '') {
                        return;
                    }
                    const legacy = pageStorage.getItem(key);
                    if (legacy == null || legacy === '') {
                        return;
                    }
                    this.setData(key, legacy);
                    pageStorage.removeItem(key);
                    migrated++;
                } catch (e) {
                    Logger.debug('Storage: page localStorage migration failed for ' + key, e);
                }
            });
            if (migrated > 0) {
                Logger.info('Storage: migrated ' + migrated + ' key(s) from page localStorage to script storage');
            }
            return migrated;
        },
        _collectArchetypeIdsForClear() {
            const ids = new Set(['global', 'dev']);
            const am = Context.archetypeManager;
            if (am) {
                if (Array.isArray(am.archetypes)) {
                    am.archetypes.forEach((a) => { if (a && a.id) ids.add(a.id); });
                }
                if (Array.isArray(am.devArchetypes)) {
                    am.devArchetypes.forEach((a) => { if (a && a.id) ids.add(a.id); });
                }
            }
            return [...ids];
        },
        _clearAllFallback(plugins) {
            let clearedCount = 0;
            const allPlugins = plugins || (Context.pluginManager ? Context.pluginManager.getAll() : []);
            allPlugins.forEach(plugin => {
                this.delete(`plugin-${plugin.id}-enabled`);
                clearedCount++;
                this.delete(`module-logging-${plugin.id}`);
                clearedCount++;
                if (plugin.subOptions && Array.isArray(plugin.subOptions)) {
                    plugin.subOptions.forEach(subOption => {
                        this.delete(`suboption-${plugin.id}-${subOption.id}`);
                        clearedCount++;
                    });
                }
                const pluginKey = this.getPluginKey(plugin.id, null);
                if (pluginKey) {
                    this.delete(`plugin-cache-${pluginKey}`);
                    clearedCount++;
                }
                this.delete(`${plugin.id}-ignored`);
                clearedCount++;
            });
            const globalKeys = [
                'global-plugins-enabled',
                'global-plugins-previous',
                'page-refresh-confirmation-enabled',
                'extension-refresh-confirmation-enabled',
                'pulse-override-enabled',
                'ops-tab-enabled',
                'ops-tab-stored-password',
                'ops-tab-password-hash-seen',
                'ops-dashboard-open-on-settings',
                'dev-global-plugins-enabled',
                'dev-global-plugins-previous',
                'debug',
                'verbose',
                'submodule-logging',
                'disputes-cache',
                'archetypes-json-cache'
            ];
            globalKeys.forEach(key => {
                this.delete(key);
                clearedCount++;
            });
            Object.values(SHARED_STORAGE_KEYS).forEach(key => {
                this.delete(key);
                clearedCount++;
            });
            SCRIPT_DATA_KEY_REGISTRY.forEach((key) => {
                this.deleteData(key);
                clearedCount++;
            });
            this._collectArchetypeIdsForClear().forEach(archetypeId => {
                this.delete(`plugin-order-${archetypeId}`);
                clearedCount++;
                this.delete(`dev-plugin-order-${archetypeId}`);
                clearedCount++;
                this.delete(`plugin-cache-registry-${archetypeId}`);
                clearedCount++;
            });
            this.delete('plugin-cache-registry-global');
            clearedCount++;
            this.delete('plugin-cache-registry-dev');
            clearedCount++;
            const devLoggerKeys = [
                'dev-logger-position-left',
                'dev-logger-position-top',
                'dev-logger-width',
                'dev-logger-height',
                'dev-logger-is-visible'
            ];
            devLoggerKeys.forEach(key => {
                this.delete(key);
                clearedCount++;
            });
            return clearedCount;
        },
        // Delete a key
        delete(key) {
            try {
                GM_deleteValue(STORAGE_PREFIX + key);
            } catch (e) {
                Logger.error(`Failed to delete storage key ${key}:`, e);
            }
        },
        // Clear all storage
        clearAll(plugins = null) {
            Logger.log('Clearing all storage and cache...');
            let clearedCount = 0;

            try {
                if (typeof GM_listValues === 'function') {
                    GM_listValues().forEach((fullKey) => {
                        if (fullKey.startsWith(STORAGE_PREFIX)) {
                            try {
                                GM_deleteValue(fullKey);
                                clearedCount++;
                            } catch (e) {
                                Logger.warn('Storage.clearAll: failed to delete ' + fullKey, e);
                            }
                        }
                    });
                } else {
                    Logger.warn('Storage.clearAll: GM_listValues unavailable; using registry fallback');
                    clearedCount += this._clearAllFallback(plugins);
                }
            } catch (e) {
                Logger.warn('Storage.clearAll: GM_listValues wipe failed; using registry fallback', e);
                clearedCount += this._clearAllFallback(plugins);
            }

            const legacyPurged = this.purgeLegacyPageLocalStorage();
            if (legacyPurged > 0) {
                Logger.log('Storage.clearAll: purged ' + legacyPurged + ' legacy page localStorage key(s)');
                clearedCount += legacyPurged;
            }

            Logger.log(`Cleared ${clearedCount} storage keys`);
            return clearedCount;
        },
        // Cache registry tracking methods
        getCachedPluginsForArchetype(archetypeId) {
            if (!archetypeId) return [];
            const registryKey = `plugin-cache-registry-${archetypeId}`;
            const registry = this.get(registryKey, null);
            if (registry) {
                try {
                    return JSON.parse(registry);
                } catch (e) {
                    Logger.error(`Failed to parse cache registry for ${archetypeId}:`, e);
                    return [];
                }
            }
            return [];
        },
        registerCachedPlugin(archetypeId, filename) {
            if (!archetypeId || !filename) return;
            const registryKey = `plugin-cache-registry-${archetypeId}`;
            const plugins = this.getCachedPluginsForArchetype(archetypeId);
            if (!plugins.includes(filename)) {
                plugins.push(filename);
                this.set(registryKey, JSON.stringify(plugins));
                Logger.debug(`Registered cached plugin: ${filename} (archetype: ${archetypeId})`);
            }
        },
        unregisterCachedPlugin(archetypeId, filename) {
            if (!archetypeId || !filename) return;
            const registryKey = `plugin-cache-registry-${archetypeId}`;
            const plugins = this.getCachedPluginsForArchetype(archetypeId);
            const index = plugins.indexOf(filename);
            if (index !== -1) {
                plugins.splice(index, 1);
                this.set(registryKey, JSON.stringify(plugins));
                Logger.debug(`Unregistered cached plugin: ${filename} (archetype: ${archetypeId})`);
            }
        },
        clearCachedPluginsForArchetype(archetypeId) {
            if (!archetypeId) return;
            const registryKey = `plugin-cache-registry-${archetypeId}`;
            this.delete(registryKey);
            Logger.debug(`Cleared cache registry for archetype: ${archetypeId}`);
        }
    };

    Context.storage = Storage;

    // ============= LOGGING =============
    // Host Logger: log/info/warn/error always visible; debug gated by Enable Debug Logging.
    // Module loggers (all plugins): log/info/warn/error always visible with [id] prefix;
    // only debug is gated by Submodule Logging + per-module toggle.
    const Logger = {
        _debugEnabled: null,
        _submoduleEnabled: null,
        _moduleLogEnabled: {},
        _listeners: new Set(),
        
        isDebugEnabled() {
            if (this._debugEnabled === null) {
                const storageDebug = Storage.get('debug', false);
                const storageVerbose = Storage.get('verbose', DEFAULT_STORAGE_LOG_VERBOSE);
                const rl = Context.remoteLogging;
                const remoteOn = rl && rl.submodule && (rl.debug || rl.verbose);
                this._debugEnabled = storageDebug || storageVerbose || !!remoteOn;
            }
            return this._debugEnabled;
        },

        /** Alias of isDebugEnabled — verbose toggle collapsed into unified debug. */
        isVerboseEnabled() {
            return this.isDebugEnabled();
        },

        isSubmoduleLoggingEnabled() {
            if (this._submoduleEnabled === null) {
                const storageOn = Storage.getSubmoduleLoggingEnabled();
                const rl = Context.remoteLogging;
                this._submoduleEnabled = storageOn || !!(rl && rl.submodule);
            }
            return this._submoduleEnabled;
        },

        isModuleLoggingEnabled(moduleId) {
            if (!moduleId) return false;
            if (typeof this._moduleLogEnabled[moduleId] === 'undefined') {
                const storageOn = Storage.getModuleLoggingEnabled(moduleId);
                let remoteOn = false;
                const reg = Context.pluginManager ? Context.pluginManager.get(moduleId) : null;
                const file = reg && reg._sourceFile;
                if (file && Context.remoteModuleLogByFile && Context.remoteModuleLogByFile[file]) {
                    remoteOn = true;
                }
                this._moduleLogEnabled[moduleId] = storageOn || remoteOn;
            }
            return this._moduleLogEnabled[moduleId];
        },
        
        setDebugEnabled(enabled) {
            this._debugEnabled = enabled;
            Storage.set('debug', enabled);
            // Keep legacy verbose key in sync so older storage / remote configs stay coherent.
            Storage.set('verbose', enabled);
        },
        
        setVerboseEnabled(enabled) {
            this.setDebugEnabled(enabled);
        },

        setSubmoduleLoggingEnabled(enabled) {
            this._submoduleEnabled = enabled;
            Storage.setSubmoduleLoggingEnabled(enabled);
        },

        setModuleLoggingEnabled(moduleId, enabled) {
            if (!moduleId) return;
            this._moduleLogEnabled[moduleId] = enabled;
            Storage.setModuleLoggingEnabled(moduleId, enabled);
        },

        onLog(listener) {
            this._listeners.add(listener);
            return () => this._listeners.delete(listener);
        },

        _emit(level, args) {
            if (!this._listeners.size) return;
            this._listeners.forEach((listener) => {
                try {
                    listener(level, args);
                } catch (e) {
                    // Ignore listener errors to keep logging stable
                }
            });
        },

        _LEVEL_EMOJI: {
            debug: '🔍',
            info: 'ℹ️',
            warn: '⚠️',
            error: '❌'
        },

        /**
         * Strip call-site framing that Logger already owns (leading level emojis / ✓,
         * and a leading module identity prefix when moduleId is set).
         */
        _normalizeMessage(msg, moduleId) {
            let text = msg == null ? '' : String(msg);
            const stripLeadingDecor = () => {
                while (/^(?:🔍|ℹ️|⚠️|⚠|❌|✓)\s+/u.test(text)) {
                    text = text.replace(/^(?:🔍|ℹ️|⚠️|⚠|❌|✓)\s+/u, '');
                }
            };
            stripLeadingDecor();
            if (moduleId) {
                const escaped = String(moduleId).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                text = text.replace(new RegExp('^\\[' + escaped + '\\]\\s*', ''), '');
                text = text.replace(new RegExp('^' + escaped + '\\s*(?::|—|-)\\s*', ''), '');
                // Lib modules often used a shorter prose tag (FooLib → Foo).
                if (/Lib$/.test(moduleId)) {
                    const shortId = String(moduleId).slice(0, -3);
                    if (shortId) {
                        const shortEsc = shortId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        text = text.replace(new RegExp('^\\[' + shortEsc + '\\]\\s*', ''), '');
                        text = text.replace(new RegExp('^' + shortEsc + '\\s*(?::|—|-)\\s*', ''), '');
                    }
                }
                stripLeadingDecor();
            }
            return text;
        },

        /**
         * Build console/_emit payload: LOG_PREFIX, optional [moduleId], level emoji, message.
         */
        _formatPayload(level, msg, moduleId, args) {
            const normalized = this._normalizeMessage(msg, moduleId);
            const emoji = this._LEVEL_EMOJI[level] || '';
            let prefix = LOG_PREFIX;
            if (moduleId) prefix += ` [${moduleId}]`;
            if (emoji) prefix += ` ${emoji}`;
            return [`${prefix} ${normalized}`, ...(args || [])];
        },

        _shouldLogModule(moduleId) {
            return this.isSubmoduleLoggingEnabled() && this.isModuleLoggingEnabled(moduleId);
        },

        _logModule(level, msg, moduleId, ...args) {
            // Only debug is gated; heartbeat levels always emit with the module prefix.
            if (level === 'debug' && !this._shouldLogModule(moduleId)) return;
            const payload = this._formatPayload(level, msg, moduleId || 'unknown', args);
            console[level](...payload);
            this._emit(level, payload);
        },

        createModuleLogger(moduleIdSource) {
            const resolveModuleId = typeof moduleIdSource === 'function'
                ? moduleIdSource
                : () => moduleIdSource;
            const host = this;
            // Level methods are module-scoped; all other Logger APIs (settings toggles,
            // onLog, etc.) must still reach the host — plugins like settings-ui depend on them.
            const moduleApi = {
                log: (msg, ...args) => host._logModule('log', msg, resolveModuleId(), ...args),
                debug: (msg, ...args) => host._logModule('debug', msg, resolveModuleId(), ...args),
                info: (msg, ...args) => host._logModule('info', msg, resolveModuleId(), ...args),
                warn: (msg, ...args) => host._logModule('warn', msg, resolveModuleId(), ...args),
                error: (msg, ...args) => host._logModule('error', msg, resolveModuleId(), ...args)
            };
            return new Proxy(moduleApi, {
                get(target, prop, receiver) {
                    if (prop in target) return Reflect.get(target, prop, receiver);
                    const hostVal = host[prop];
                    if (typeof hostVal === 'function') return hostVal.bind(host);
                    return hostVal;
                },
                has(target, prop) {
                    return prop in target || prop in host;
                }
            });
        },
        
        log(msg, ...args) {
            const payload = this._formatPayload('log', msg, null, args);
            console.log(...payload);
            this._emit('log', payload);
        },
        
        debug(msg, ...args) {
            if (this.isDebugEnabled()) {
                const payload = this._formatPayload('debug', msg, null, args);
                console.debug(...payload);
                this._emit('debug', payload);
            }
        },

        info(msg, ...args) {
            const payload = this._formatPayload('info', msg, null, args);
            if (typeof console.info === 'function') {
                console.info(...payload);
            } else {
                console.log(...payload);
            }
            this._emit('info', payload);
        },
        
        warn(msg, ...args) {
            const payload = this._formatPayload('warn', msg, null, args);
            console.warn(...payload);
            this._emit('warn', payload);
        },
        
        error(msg, ...args) {
            const payload = this._formatPayload('error', msg, null, args);
            console.error(...payload);
            this._emit('error', payload);
        }
    };

    Context.logger = Logger;

    // ============= REPO CDN (session failover) =============
    // Probe GitHub then jsDelivr for archetypes.json once; lock that host for all
    // further repo fetches. If both miss → cache-only (GM storage only, no CDN).
    const RepoCdn = {
        /** @type {null|'github'|'jsdelivr'|'cache-only'} */
        mode: null,
        /** HTTP status from the GitHub archetypes probe (0 if network/other). */
        lastGithubStatus: 0,

        isCacheOnly() {
            return this.mode === 'cache-only';
        },

        isNetworkLocked() {
            return this.mode === 'github' || this.mode === 'jsdelivr';
        },

        setMode(mode) {
            if (this.mode === mode) return;
            this.mode = mode;
            Logger.log(`Repo CDN: ${mode}`);
        },

        /**
         * @param {string} repoPath - Path relative to repo root (e.g. archetypes.json, plugins/core/main/x.js)
         * @param {'github'|'jsdelivr'} [modeOverride]
         */
        buildUrl(repoPath, modeOverride) {
            const mode = modeOverride || this.mode;
            const path = String(repoPath || '').replace(/^\//, '');
            if (mode === 'jsdelivr') {
                return `https://cdn.jsdelivr.net/gh/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}@${GITHUB_CONFIG.branch}/${path}`;
            }
            return `https://raw.githubusercontent.com/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/${GITHUB_CONFIG.branch}/${path}`;
        },

        _gmGet(url) {
            return Promise.reject(new Error('Safe UX Build: remote fetch is disabled'));
        },

        parseArchetypesRaw(raw) {
            if (!raw || !String(raw).trim()) {
                throw new Error('empty archetypes.json body');
            }
            let config;
            try {
                config = JSON.parse(raw);
            } catch (e) {
                const err = new Error('Failed to parse archetypes config');
                err.cause = e;
                throw err;
            }
            if (!config || typeof config !== 'object' || Array.isArray(config)) {
                throw new Error('archetypes.json is not a JSON object');
            }
            return config;
        },

        /**
         * Fetch from the locked CDN only. Rejects if cache-only or unset.
         * @param {string} repoPath
         * @param {{ cacheBust?: boolean }} [options]
         * @returns {Promise<{ status: number, text: string }>}
         */
        fetchText(repoPath, options) {
            const opts = options || {};
            if (!this.isNetworkLocked()) {
                return Promise.reject(new Error('Repo CDN: no network fetch (cache-only or unset)'));
            }
            let url = this.buildUrl(repoPath);
            if (opts.cacheBust) {
                url += (url.indexOf('?') >= 0 ? '&' : '?') + 't=' + Date.now();
            }
            return this._gmGet(url);
        },

        /**
         * First archetypes probe: GitHub → jsDelivr. Locks mode. Returns hit or null.
         * @returns {Promise<{ raw: string, config: object, source: string }|null>}
         */
        async probeAndLockFromArchetypes() {
            const path = GITHUB_CONFIG.archetypesPath;
            this.lastGithubStatus = 0;

            try {
                const url = this.buildUrl(path, 'github') + '?t=' + Date.now();
                Logger.debug(`Fetching archetypes from github (${url})`);
                const res = await this._gmGet(url);
                const config = this.parseArchetypesRaw(res.text);
                this.setMode('github');
                return { raw: res.text, config: config, source: 'github' };
            } catch (e) {
                this.lastGithubStatus = e && typeof e.status === 'number' ? e.status : 0;
                Logger.error('Failed to load archetypes from github:', e);
            }

            try {
                const url = this.buildUrl(path, 'jsdelivr') + '?t=' + Date.now();
                Logger.debug(`Fetching archetypes from jsdelivr (${url})`);
                const res = await this._gmGet(url);
                const config = this.parseArchetypesRaw(res.text);
                this.setMode('jsdelivr');
                return { raw: res.text, config: config, source: 'jsdelivr' };
            } catch (e) {
                Logger.error('Failed to load archetypes from jsdelivr:', e);
            }

            this.setMode('cache-only');
            return null;
        },

        /**
         * Re-fetch archetypes from the already-locked CDN.
         * @returns {Promise<{ raw: string, config: object, source: string }>}
         */
        async fetchArchetypesLocked() {
            const res = await this.fetchText(GITHUB_CONFIG.archetypesPath, { cacheBust: true });
            const config = this.parseArchetypesRaw(res.text);
            return { raw: res.text, config: config, source: this.mode };
        }
    };

    Context.repoCdn = RepoCdn;

    // ============= NETWORK OBSERVER (FOS-ONLY) =============
    /**
     * Narrow fetch observer for FOS autoconnect. It never captures headers,
     * cookies, JWTs, API keys, request bodies, or credentials.
     */
    function fosIsPermittedObserveUrl(urlObj, method) {
        if (!urlObj) return false;
        const href = urlObj.href || '';
        const host = urlObj.hostname || '';
        const path = urlObj.pathname || '';
        if (method === 'POST' && href.startsWith(FOS_ORCHESTRATOR_INSTANCES_URL)) {
            return true;
        }
        if (!NOVNC_HOST_PATTERN.test(host)) return false;
        if (method === 'GET' && path.includes('timestamp')) return true;
        if (path === '/websockify' || path.endsWith('/websockify')) return true;
        if (path === '/core/rfb.js' || path.endsWith('/core/rfb.js')) return true;
        if (path === '/app/ui.js' || path.endsWith('/app/ui.js')) return true;
        return false;
    }

    const NetworkObserver = {
        _installed: false,
        _subscribers: new Map(),

        init() {
            if (this._installed) return;
            const pageWindow = Context.getPageWindow();
            if (!pageWindow || typeof pageWindow.fetch !== 'function') {
                Logger.warn('NetworkObserver: page fetch unavailable; observer disabled');
                return;
            }
            this._installFetchHook(pageWindow);
            this._installed = true;
            Logger.log('FOS network observer installed');
        },

        _installFetchHook(pageWindow) {
            const observer = this;
            const originalFetch = pageWindow.fetch.bind(pageWindow);
            pageWindow.fetch = function patchedFleetFetch(...args) {
                const [resource, config] = args;
                const meta = observer._buildRequestMeta(resource, config, pageWindow);
                if (!fosIsPermittedObserveUrl(meta.urlObj, meta.method)) {
                    return originalFetch.apply(this, args);
                }
                const matched = observer._matchSubscribers(meta);
                matched.forEach((sub) => {
                    if (typeof sub.onRequest === 'function') {
                        try { sub.onRequest(meta); } catch (e) {
                            Logger.debug(`NetworkObserver: subscriber ${sub.id} onRequest threw`, e);
                        }
                    }
                });
                const promise = originalFetch.apply(this, args);
                const wantsResponse = matched.some(s => typeof s.onResponse === 'function');
                if (!wantsResponse) return promise;
                return promise.then((response) => {
                    matched
                        .filter(s => typeof s.onResponse === 'function')
                        .forEach((sub) => {
                            try {
                                sub.onResponse(meta, response.clone());
                            } catch (e) {
                                Logger.debug(`NetworkObserver: subscriber ${sub.id} onResponse threw`, e);
                            }
                        });
                    return response;
                });
            };
        },

        _buildRequestMeta(resource, config, pageWindow) {
            let url = '';
            let urlObj = null;
            try {
                if (typeof resource === 'string') {
                    urlObj = new URL(resource, pageWindow.location.href);
                } else if (resource && typeof resource === 'object' && typeof resource.url === 'string') {
                    urlObj = new URL(resource.url, pageWindow.location.href);
                }
                if (urlObj) url = urlObj.toString();
            } catch (_e) { /* ignore */ }
            const method = (config && config.method) || (resource && resource.method) || 'GET';
            return {
                url,
                urlObj,
                method: String(method).toUpperCase(),
                pageWindow
            };
        },

        _matchSubscribers(meta) {
            const out = [];
            for (const sub of this._subscribers.values()) {
                try {
                    if (typeof sub.matches !== 'function' || sub.matches(meta)) {
                        out.push(sub);
                    }
                } catch (e) {
                    Logger.debug(`NetworkObserver: subscriber ${sub.id} matches threw`, e);
                }
            }
            return out;
        },

        subscribe(opts) {
            if (!opts || typeof opts !== 'object') return () => {};
            const id = opts.id || `subscriber-${Math.random().toString(36).slice(2, 10)}`;
            this._subscribers.set(id, {
                id,
                matches: opts.matches,
                onRequest: opts.onRequest,
                onResponse: opts.onResponse
            });
            Logger.debug(`NetworkObserver: subscriber ${id} registered`);
            return () => this.unsubscribe(id);
        },

        unsubscribe(id) {
            if (this._subscribers.delete(id)) {
                Logger.debug(`NetworkObserver: subscriber ${id} removed`);
            }
        },

        getRuntimeAccess() {
            return {
                supabaseRestBaseUrl: null,
                supabaseAnonKey: null,
                supabaseProjectRef: null,
                supabaseAccessToken: null
            };
        },

        refreshFromPage() {},

        getFleetUserJwt() {
            return '';
        }
    };

    Context.networkObserver = {
        subscribe: (opts) => NetworkObserver.subscribe(opts),
        unsubscribe: (id) => NetworkObserver.unsubscribe(id),
        getRuntimeAccess: () => NetworkObserver.getRuntimeAccess(),
        getFleetUserJwt: () => '',
        refreshFromPage: () => {},
        decodeJwtPayload: () => null
    };

    function runFleet() {
    // ============= VERSION HELPERS =============
    /**
     * Compare two version strings (e.g., "3.4.0" vs "3.4.1")
     * Returns: -1 if v1 < v2, 0 if v1 === v2, 1 if v1 > v2
     */
    function compareVersions(v1, v2) {
        const parts1 = String(v1 || '').split('.').map(Number);
        const parts2 = String(v2 || '').split('.').map(Number);
        const maxLength = Math.max(parts1.length, parts2.length);
        for (let i = 0; i < maxLength; i++) {
            const part1 = parts1[i] || 0;
            const part2 = parts2[i] || 0;
            if (part1 < part2) return -1;
            if (part1 > part2) return 1;
        }
        return 0;
    }

    // ============= CLEANUP REGISTRY =============
    const CleanupRegistry = {
        _items: {
            intervals: [],
            timeouts: [],
            observers: [],
            eventListeners: [],
            elements: [],
        },
        
        registerInterval(id) {
            this._items.intervals.push(id);
            return id;
        },
        
        registerTimeout(id) {
            this._items.timeouts.push(id);
            return id;
        },
        
        registerObserver(observer) {
            this._items.observers.push(observer);
            return observer;
        },
        
        registerEventListener(target, event, handler, options) {
            this._items.eventListeners.push({ target, event, handler, options });
            target.addEventListener(event, handler, options);
        },
        
        registerElement(element) {
            this._items.elements.push(element);
            return element;
        },
        
        cleanup() {
            Logger.debug('Running cleanup...');
            
            this._items.intervals.forEach(id => clearInterval(id));
            this._items.intervals = [];
            
            this._items.timeouts.forEach(id => clearTimeout(id));
            this._items.timeouts = [];
            
            this._items.observers.forEach(obs => obs.disconnect());
            this._items.observers = [];
            
            this._items.eventListeners.forEach(({ target, event, handler, options }) => {
                target.removeEventListener(event, handler, options);
            });
            this._items.eventListeners = [];
            
            this._items.elements.forEach(el => {
                if (el && el.parentNode) {
                    el.parentNode.removeChild(el);
                }
            });
            this._items.elements = [];
            
            Logger.debug('Cleanup complete');
        }
    };

    // ============= URL PATTERN MATCHER =============
    const UrlMatcher = {
        /**
         * Normalize URL by removing www subdomain for consistent matching
         * @param {string} url - The URL to normalize
         * @returns {string} - Normalized URL without www
         */
        _normalizeUrl(url) {
            return url.replace(/^https:\/\/www\./, 'https://');
        },
        
        /**
         * Extract the path portion after the base URL
         * Works with both www and non-www URLs
         * @param {string} fullUrl - The complete URL
         * @returns {string} - The path after BASE_URL
         */
        getPathFromUrl(fullUrl) {
            // Normalize both URLs to handle www/non-www variations
            const normalizedBase = this._normalizeUrl(BASE_URL);
            const normalizedUrl = this._normalizeUrl(fullUrl);
            
            if (normalizedUrl.startsWith(normalizedBase)) {
                // Remove base URL and any query string/hash
                let path = normalizedUrl.slice(normalizedBase.length);
                path = path.split('?')[0].split('#')[0];
                // Remove trailing slash for consistent matching
                if (path.endsWith('/') && path.length > 1) {
                    path = path.slice(0, -1);
                }
                return path;
            }

            // noVNC instances live on a separate subdomain origin — return a synthetic
            // path constant so detectArchetype() can still match the no-vnc archetype.
            try {
                const hostname = new URL(fullUrl).hostname;
                if (NOVNC_HOST_PATTERN.test(hostname)) {
                    return NOVNC_SYNTHETIC_PATH;
                }
            } catch (e) {}

            return '';
        },
        
        /**
         * Convert a URL pattern to a regex
         * Supports:
         *   - Exact match: "dashboard" matches only "dashboard"
         *   - Wildcard segment: "tasks/*" matches "tasks/123" but not "tasks/123/edit"
         *   - Wildcard suffix: "tasks*" matches "tasks", "tasks123", "tasks/anything"
         *   - Combined: "tasks/*\/review" matches "tasks/123/review"
         * 
         * @param {string} pattern - The URL pattern
         * @returns {RegExp} - Compiled regex
         */
        patternToRegex(pattern) {
            // Escape special regex characters (including '*', which we re-expand below)
            let regexStr = pattern
                .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            
            // Handle wildcards:
            // /* at segment boundaries = match one segment (no slashes)
            // * at end or mid-word = match anything including slashes
            
            // First, handle /*/  (wildcard segment in middle)
            regexStr = regexStr.replace(/\/\\\*\//g, '/[^/]+/');
            
            // Handle /* at end (wildcard segment at end, must have content)
            regexStr = regexStr.replace(/\/\\\*$/g, '/[^/]+');
            
            // Handle trailing * (match anything including empty)
            regexStr = regexStr.replace(/\\\*$/g, '.*');
            
            // Handle remaining * (mid-pattern wildcards)
            regexStr = regexStr.replace(/\\\*/g, '.*');
            
            // Anchor the pattern
            return new RegExp(`^${regexStr}$`);
        },
        
        /**
         * Test if a path matches a pattern
         * @param {string} path - The current path
         * @param {string} pattern - The URL pattern to test
         * @returns {boolean}
         */
        matches(path, pattern) {
            const regex = this.patternToRegex(pattern);
            const result = regex.test(path);
            Logger.debug(`URL match test: "${path}" vs "${pattern}" (${regex}) = ${result}`);
            return result;
        },
        
        /**
         * Calculate specificity score for a pattern (more specific = higher score)
         * Used to determine which archetype takes precedence
         * @param {string} pattern - The URL pattern
         * @returns {number}
         */
        getSpecificity(pattern) {
            let score = 0;
            
            // More segments = more specific
            const segments = pattern.split('/').filter(s => s.length > 0);
            score += segments.length * 10;
            
            // Literal segments are more specific than wildcards
            segments.forEach(seg => {
                if (seg === '*') {
                    score += 1; // Wildcard segment
                } else if (seg.includes('*')) {
                    score += 3; // Partial wildcard
                } else {
                    score += 5; // Literal segment
                }
            });
            
            // Patterns ending in * are less specific
            if (pattern.endsWith('*')) {
                score -= 2;
            }
            
            return score;
        }
    };

    // ============= NAVIGATION MANAGER =============
    const NavigationManager = {
        _lastUrl: window.location.href,
        _initialized: false,
        _onNavigateCallbacks: [],
        
        init() {
            if (this._initialized) return;
            this._initialized = true;
            
            const originalPushState = history.pushState;
            const originalReplaceState = history.replaceState;
            const self = this;
            
            history.pushState = function(state, title, url) {
                originalPushState.apply(this, arguments);
                self._handleNavigation('pushState', url);
            };
            
            history.replaceState = function(state, title, url) {
                originalReplaceState.apply(this, arguments);
                self._handleNavigation('replaceState', url);
            };
            
            window.addEventListener('popstate', () => {
                this._handleNavigation('popstate');
            });
            
            Logger.debug('Navigation monitoring initialized');
        },
        
        _handleNavigation(method, url) {
            const newUrl = window.location.href;
            
            if (newUrl === this._lastUrl) {
                Logger.debug(`Navigation method called (${method}) but URL unchanged`);
                return;
            }
            
            const previousUrl = this._lastUrl;
            const previousPath = UrlMatcher.getPathFromUrl(previousUrl);
            const nextPath = UrlMatcher.getPathFromUrl(newUrl);

            this._lastUrl = newUrl;

            if (previousPath === nextPath) {
                Logger.debug('Query-only or hash-only URL change; skipping plugin navigation');
                return;
            }

            Logger.log(`Navigation detected [${method}]: ${previousUrl} → ${newUrl}`);

            this._onNavigateCallbacks.forEach(callback => {
                try {
                    callback(newUrl, previousUrl);
                } catch (e) {
                    Logger.error('Error in navigation callback:', e);
                }
            });
        },
        
        onNavigate(callback) {
            this._onNavigateCallbacks.push(callback);
        },
        
        getCurrentUrl() {
            return this._lastUrl;
        }
    };


    Context.requestExtensionReload = (reason) => RefreshGuard.requestExtensionReload(reason);
    RefreshGuard.init();

    /**
     * Read `logs` / per-plugin `log` from archetypes.json and merge into Context.
     * Remote debug/verbose only apply when remote submodule is true. Per-file `log` follows
     * the same submodule master gate as storage (via _shouldLogModule).
     */
    function applyArchetypeRemoteLoggingConfig(config) {
        const logs = (config && config.logs) || {};
        Context.remoteLogging = {
            debug: logs.debug === true,
            verbose: logs.verbose === true,
            submodule: logs.submodule === true
        };
        const byFile = Object.create(null);
        const ingestPluginList = (list) => {
            if (!list || !Array.isArray(list)) return;
            for (const def of list) {
                if (def && typeof def === 'object' && def.name && def.log === true) {
                    byFile[def.name] = true;
                }
            }
        };
        ingestPluginList(config.corePlugins);
        ingestPluginList(config.libraries);
        ingestPluginList(config.devPlugins);
        (config.archetypes || []).forEach((a) => ingestPluginList(a.plugins));
        (config.devArchetypes || []).forEach((a) => ingestPluginList(a.plugins));
        Context.remoteModuleLogByFile = byFile;
        Logger._debugEnabled = null;
        Logger._submoduleEnabled = null;
        Logger._moduleLogEnabled = {};
    }

    // ============= DOM SELECTORS (SAFE) =============
    const DomUtils = {
        _invalidSelectorLog: new Set(),
        
        _resolveRoot(options) {
            return (options && options.root) ? options.root : document;
        },
        
        _logInvalidSelector(selector, error, contextLabel) {
            const key = `${contextLabel || 'unknown'}::${selector}`;
            if (this._invalidSelectorLog.has(key)) return;
            this._invalidSelectorLog.add(key);
            const contextSuffix = contextLabel ? ` (${contextLabel})` : '';
            Logger.error(`Invalid selector${contextSuffix}: "${selector}"`, error);
        },
        
        query(selector, options = {}) {
            if (!selector) return null;
            const root = this._resolveRoot(options);
            if (!root || !root.querySelector) return null;
            try {
                return root.querySelector(selector);
            } catch (error) {
                this._logInvalidSelector(selector, error, options.context);
                return null;
            }
        },
        
        queryAll(selector, options = {}) {
            if (!selector) return [];
            const root = this._resolveRoot(options);
            if (!root || !root.querySelectorAll) return [];
            try {
                return Array.from(root.querySelectorAll(selector));
            } catch (error) {
                this._logInvalidSelector(selector, error, options.context);
                return [];
            }
        },
        
        closest(element, selector, options = {}) {
            if (!element || !selector || !element.closest) return null;
            try {
                return element.closest(selector);
            } catch (error) {
                this._logInvalidSelector(selector, error, options.context);
                return null;
            }
        }
    };
    
    Context.dom = DomUtils;

    // ============= ARCHETYPE MANAGER =============
    const ArchetypeManager = {
        archetypes: [],
        devArchetypes: [],
        corePlugins: [],
        libraries: [],
        opsDashboardPlugins: [],
        opsDashboardLibraries: [],
        devPlugins: [],
        currentArchetype: null,
        currentDevArchetype: null,
        _fetchedAt: 0,
        _fetchPromise: null,
        
        async loadArchetypes() {
            // Coalesce concurrent callers into one in-flight request; re-fetch after 5 min.
            const CACHE_TTL_MS = 5 * 60 * 1000;
            if (this._fetchPromise) return this._fetchPromise;
            if (this._fetchedAt && (Date.now() - this._fetchedAt) < CACHE_TTL_MS && this.archetypes.length > 0) {
                Logger.debug('loadArchetypes: returning cached config (age=' + (Date.now() - this._fetchedAt) + 'ms)');
                return;
            }
            this._fetchPromise = this._doFetchArchetypes().finally(() => {
                this._fetchedAt = Date.now();
                this._fetchPromise = null;
            });
            return this._fetchPromise;
        },

        async _doFetchArchetypes() {
            if (!BUNDLED_ARCHETYPES || typeof BUNDLED_ARCHETYPES !== 'object') {
                throw new Error('Safe UX Build: bundled archetypes are missing. Run node dev/utils/build-safe-ux.mjs');
            }
            this._applyArchetypesConfig(BUNDLED_ARCHETYPES);
            Logger.log('Safe UX Build: using compile-time bundled archetypes');
            return BUNDLED_ARCHETYPES;
        },

        _applyArchetypesConfig(config) {
            this.archetypes = (config.archetypes || []).map((archetype) => ({
                ...archetype,
                libraries: (archetype.libraries || []).filter((name) => SAFE_UX_ALLOWLIST.has(name)),
                plugins: (archetype.plugins || []).filter((def) => SAFE_UX_ALLOWLIST.has(def && def.name))
            }));
            this.devArchetypes = [];
            this.corePlugins = (config.corePlugins || []).filter((d) => SAFE_UX_ALLOWLIST.has(d && d.name));
            this.libraries = (config.libraries || []).filter((d) => SAFE_UX_ALLOWLIST.has(d && d.name));
            this.opsDashboardPlugins = [];
            this.opsDashboardLibraries = [];
            this.devPlugins = [];
            this.settingsModalDocs = config.settingsModalDocs || [];

            // Check if script version is outdated
            if (config.version) {
                const latestVersion = config.version;
                Context.latestVersion = latestVersion;
                // Simple version comparison: if versions don't match, consider outdated
                // This handles semantic versioning (e.g., "3.4.0" vs "3.4.1")
                Context.isOutdated = compareVersions(VERSION, latestVersion) < 0;
                if (Context.isOutdated) {
                    Logger.warn(`Script version ${VERSION} is outdated. Latest version is ${latestVersion}`);
                }
            } else {
                // No version in config, assume up to date
                Context.isOutdated = false;
                Context.latestVersion = VERSION;
            }
            if (Context.settingsUi && typeof Context.settingsUi.refreshUpdateIndicator === 'function') {
                try {
                    Context.settingsUi.refreshUpdateIndicator();
                } catch (refreshErr) {
                    Logger.debug('Settings UI update indicator refresh failed', refreshErr);
                }
            }

            // Always log archetypes version (cannot be disabled)
            Context.archetypesVersion = config.archetypesVersion || null;
            Context.coreOnlyMode = config.coreOnlyMode === true;
            Context.opsAccess = null;
            Context.opsSecrets = null;
            applyArchetypeRemoteLoggingConfig(config);
            console.log(`${LOG_PREFIX} archetypes v${config.archetypesVersion || 'unknown'}`);
            if (Context.coreOnlyMode) {
                Logger.log('coreOnlyMode is enabled: archetype UX plugins and SPA auto-reload are off; core plugins remain active.');
            }

            Logger.log(`Loaded ${this.archetypes.length} archetypes from branch: ${GITHUB_CONFIG.branch}`);
            if (DEV_SCRIPTS_ENABLED) {
                clearOrphanMarkerForCurrentBranch();
            }
        },

        getCorePlugins() {
            return this.corePlugins || [];
        },

        getLibraries() {
            return this.libraries || [];
        },

        getOpsDashboardPlugins() {
            return this.opsDashboardPlugins || [];
        },

        getOpsDashboardLibraries() {
            return this.opsDashboardLibraries || [];
        },

        /**
         * Resolve library filenames to registry entries from the top-level `libraries` list.
         * Unknown names are skipped with a warning.
         * @param {string[]|undefined|null} names
         * @returns {Array<{name: string, version: string, hash?: string, log?: boolean}>}
         */
        resolveLibraryEntries(names) {
            if (!names || !Array.isArray(names) || names.length === 0) return [];
            const registry = this.getLibraries();
            const byName = Object.create(null);
            for (const entry of registry) {
                if (entry && entry.name) byName[entry.name] = entry;
            }
            const resolved = [];
            for (const name of names) {
                if (typeof name !== 'string' || !name) continue;
                const entry = byName[name];
                if (!entry) {
                    Logger.warn(`Unknown library "${name}" (not in archetypes.json libraries registry)`);
                    continue;
                }
                resolved.push(entry);
            }
            return resolved;
        },

        getDevPlugins() {
            return this.devPlugins || [];
        },

        getSettingsModalDocs() {
            return this.settingsModalDocs || [];
        },
        
        /**
         * Compare two version strings (e.g., "3.4.0" vs "3.4.1")
         * Returns: -1 if v1 < v2, 0 if v1 === v2, 1 if v1 > v2
         */
        _compareVersions(v1, v2) {
            return compareVersions(v1, v2);
        },
        
        /**
         * Detect archetype based on URL pattern, with optional selector disambiguation
         */
        detectArchetype() {
            return new Promise((resolve) => {
                const currentUrl = window.location.href;
                const currentPath = UrlMatcher.getPathFromUrl(currentUrl);
                Context.currentPath = currentPath;
                
                Logger.debug(`Detecting archetype for path: "${currentPath}"`);
                
                // Step 1: Find all archetypes whose URL pattern matches
                const urlMatches = this.archetypes.filter(archetype => {
                    if (!archetype.urlPattern) {
                        Logger.debug(`Archetype ${archetype.id} has no urlPattern, skipping`);
                        return false;
                    }
                    return UrlMatcher.matches(currentPath, archetype.urlPattern);
                });
                
                Logger.debug(`URL pattern matches: ${urlMatches.map(a => a.id).join(', ') || 'none'}`);
                
                if (urlMatches.length === 0) {
                    Logger.warn('No archetype matched the current URL');
                    this.currentArchetype = null;
                    Context.currentArchetype = null;
                    resolve(null);
                    return;
                }
                
                // Step 2: If only one match, use it (no disambiguation needed)
                if (urlMatches.length === 1) {
                    const archetype = urlMatches[0];
                    Logger.debug(`Single URL match: ${archetype.id} - ${archetype.name}`);
                    this.currentArchetype = archetype;
                    Context.currentArchetype = archetype;
                    resolve(archetype);
                    return;
                }
                
                // Step 3: Multiple matches - sort by specificity first
                urlMatches.sort((a, b) => {
                    const specA = UrlMatcher.getSpecificity(a.urlPattern);
                    const specB = UrlMatcher.getSpecificity(b.urlPattern);
                    return specB - specA; // Higher specificity first
                });
                
                Logger.debug(`Sorted by specificity: ${urlMatches.map(a => `${a.id}(${UrlMatcher.getSpecificity(a.urlPattern)})`).join(', ')}`);
                
                // Step 4: Check if disambiguation is needed
                // If highest specificity archetype has no disambiguation selectors, use it
                // Otherwise, try to disambiguate using selectors
                const needsDisambiguation = urlMatches.some(a => 
                    a.disambiguationSelectors && a.disambiguationSelectors.length > 0
                );
                
                if (!needsDisambiguation) {
                    // Use the most specific URL match
                    const archetype = urlMatches[0];
                    Logger.debug(`Most specific URL match: ${archetype.id} - ${archetype.name}`);
                    this.currentArchetype = archetype;
                    Context.currentArchetype = archetype;
                    resolve(archetype);
                    return;
                }
                
                // Step 5: Disambiguation needed - wait for DOM and check selectors
                Logger.debug('Multiple URL matches with disambiguation selectors, waiting for DOM...');
                this._disambiguateWithSelectors(urlMatches, resolve);
            });
        },
        
        /**
         * Disambiguate between archetypes using DOM selectors
         */
        _disambiguateWithSelectors(candidates, resolve) {
            let attempts = 0;
            const maxAttempts = 20;
            
            const checkSelectors = () => {
                attempts++;
                
                // Check each candidate's disambiguation selectors
                for (const archetype of candidates) {
                    const selectors = archetype.disambiguationSelectors || [];
                    
                    // If no selectors, this archetype can't be confirmed via DOM
                    if (selectors.length === 0) {
                        continue;
                    }
                    
                    // Check if ALL disambiguation selectors are present
                    const selectorMatches = (selector) => {
                        if (selector.startsWith('text:')) {
                            const searchText = selector.slice(5);
                            const textCandidateSelectors = 'h1, h2, h3, h4, h5, h6, span, p, label, li, td, th, button, a, [aria-label]';
                            const elements = document.querySelectorAll(textCandidateSelectors);
                            for (const el of elements) {
                                if (el.children.length === 0 && el.textContent.trim() === searchText) return true;
                            }
                            return false;
                        }
                        return Context.dom.query(selector, {
                            context: `archetype:${archetype.id}`
                        }) !== null;
                    };
                    const allPresent = selectors.every(selector => {
                        const exists = selectorMatches(selector);
                        Logger.debug(`  [${archetype.id}] Selector "${selector}": ${exists ? '✓' : '✗'}`);
                        return exists;
                    });
                    
                    if (allPresent) {
                        Logger.debug(`Disambiguated to: ${archetype.id} - ${archetype.name}`);
                        this.currentArchetype = archetype;
                        Context.currentArchetype = archetype;
                        observer && observer.disconnect();
                        resolve(archetype);
                        return;
                    }
                }
                
                // No disambiguation match yet
                if (attempts < maxAttempts) {
                    Logger.debug(`Disambiguation attempt ${attempts}/${maxAttempts}, retrying...`);
                } else {
                    // Fallback to most specific URL match
                    const fallback = candidates[0];
                    Logger.warn(`Disambiguation failed after ${maxAttempts} attempts, falling back to: ${fallback.id}`);
                    this.currentArchetype = fallback;
                    Context.currentArchetype = fallback;
                    observer && observer.disconnect();
                    resolve(fallback);
                }
            };

            // Use MutationObserver instead of polling — fire a check on each DOM change
            // up to maxAttempts times, then fall back.
            let observer = null;
            if (typeof MutationObserver !== 'undefined') {
                observer = new MutationObserver(() => {
                    if (attempts >= maxAttempts) { observer.disconnect(); return; }
                    checkSelectors();
                });
                observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
            }
            checkSelectors(); // Run immediately in case selectors already match
        },
        
        getPluginsForCurrentArchetype() {
            if (!this.currentArchetype) {
                return [];
            }
            return this.currentArchetype.plugins || [];
        },
        
        /**
         * Detect dev archetype based on URL pattern, with optional selector disambiguation
         * Same logic as detectArchetype() but uses devArchetypes array
         */
        detectDevArchetype() {
            return new Promise((resolve) => {
                const currentUrl = window.location.href;
                const currentPath = UrlMatcher.getPathFromUrl(currentUrl);
                
                Logger.debug(`Detecting dev archetype for path: "${currentPath}"`);
                
                // Step 1: Find all dev archetypes whose URL pattern matches
                const urlMatches = this.devArchetypes.filter(archetype => {
                    if (!archetype.urlPattern) {
                        Logger.debug(`Dev archetype ${archetype.id} has no urlPattern, skipping`);
                        return false;
                    }
                    return UrlMatcher.matches(currentPath, archetype.urlPattern);
                });
                
                Logger.debug(`Dev archetype URL pattern matches: ${urlMatches.map(a => a.id).join(', ') || 'none'}`);
                
                if (urlMatches.length === 0) {
                    Logger.debug('No dev archetype matched the current URL');
                    this.currentDevArchetype = null;
                    resolve(null);
                    return;
                }
                
                // Step 2: If only one match, use it (no disambiguation needed)
                if (urlMatches.length === 1) {
                    const archetype = urlMatches[0];
                    Logger.debug(`Single dev archetype URL match: ${archetype.id} - ${archetype.name}`);
                    this.currentDevArchetype = archetype;
                    resolve(archetype);
                    return;
                }
                
                // Step 3: Multiple matches - sort by specificity first
                urlMatches.sort((a, b) => {
                    const specA = UrlMatcher.getSpecificity(a.urlPattern);
                    const specB = UrlMatcher.getSpecificity(b.urlPattern);
                    return specB - specA; // Higher specificity first
                });
                
                Logger.debug(`Sorted dev archetypes by specificity: ${urlMatches.map(a => `${a.id}(${UrlMatcher.getSpecificity(a.urlPattern)})`).join(', ')}`);
                
                // Step 4: Check if disambiguation is needed
                const needsDisambiguation = urlMatches.some(a => 
                    a.disambiguationSelectors && a.disambiguationSelectors.length > 0
                );
                
                if (!needsDisambiguation) {
                    // Use the most specific URL match
                    const archetype = urlMatches[0];
                    Logger.debug(`Most specific dev archetype URL match: ${archetype.id} - ${archetype.name}`);
                    this.currentDevArchetype = archetype;
                    resolve(archetype);
                    return;
                }
                
                // Step 5: Disambiguation needed - wait for DOM and check selectors
                Logger.debug('Multiple dev archetype URL matches with disambiguation selectors, waiting for DOM...');
                this._disambiguateDevArchetypeWithSelectors(urlMatches, resolve);
            });
        },
        
        /**
         * Disambiguate between dev archetypes using DOM selectors
         */
        _disambiguateDevArchetypeWithSelectors(candidates, resolve) {
            let attempts = 0;
            const maxAttempts = 20;
            
            const checkSelectors = () => {
                attempts++;
                
                // Check each candidate's disambiguation selectors
                for (const archetype of candidates) {
                    const selectors = archetype.disambiguationSelectors || [];
                    
                    // If no selectors, this archetype can't be confirmed via DOM
                    if (selectors.length === 0) {
                        continue;
                    }
                    
                    // Check if ALL disambiguation selectors are present (same rules as main
                    // archetype disambiguation, including text: leaf-node matching)
                    const selectorMatches = (selector) => {
                        if (selector.startsWith('text:')) {
                            const searchText = selector.slice(5);
                            const textCandidateSelectors = 'h1, h2, h3, h4, h5, h6, span, p, label, li, td, th, button, a, [aria-label]';
                            const elements = document.querySelectorAll(textCandidateSelectors);
                            for (const el of elements) {
                                if (el.children.length === 0 && el.textContent.trim() === searchText) return true;
                            }
                            return false;
                        }
                        return Context.dom.query(selector, {
                            context: `devArchetype:${archetype.id}`
                        }) !== null;
                    };
                    const allPresent = selectors.every(selector => {
                        const exists = selectorMatches(selector);
                        Logger.debug(`  [dev:${archetype.id}] Selector "${selector}": ${exists ? '✓' : '✗'}`);
                        return exists;
                    });
                    
                    if (allPresent) {
                        Logger.debug(`Disambiguated to dev archetype: ${archetype.id} - ${archetype.name}`);
                        this.currentDevArchetype = archetype;
                        observer && observer.disconnect();
                        resolve(archetype);
                        return;
                    }
                }
                
                // No disambiguation match yet
                if (attempts < maxAttempts) {
                    Logger.debug(`Dev archetype disambiguation attempt ${attempts}/${maxAttempts}, retrying...`);
                } else {
                    // Fallback to most specific URL match
                    const fallback = candidates[0];
                    Logger.warn(`Dev archetype disambiguation failed after ${maxAttempts} attempts, falling back to: ${fallback.id}`);
                    this.currentDevArchetype = fallback;
                    observer && observer.disconnect();
                    resolve(fallback);
                }
            };

            // Use MutationObserver instead of polling — same pattern as main archetype path.
            let observer = null;
            if (typeof MutationObserver !== 'undefined') {
                observer = new MutationObserver(() => {
                    if (attempts >= maxAttempts) { observer.disconnect(); return; }
                    checkSelectors();
                });
                observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
            }
            checkSelectors(); // Run immediately in case selectors already match
        },
        
        getPluginsForCurrentDevArchetype() {
            if (!this.currentDevArchetype) {
                return [];
            }
            return this.currentDevArchetype.plugins || [];
        }
    };

    function blockedGmXmlhttpRequest() {
        const err = new Error('Safe UX Build: remote requests are disabled');
        Logger.warn(err.message);
        throw err;
    }

    function purgePrivilegedScriptStorage() {
        for (const key of PRIVILEGED_STORAGE_KEYS_TO_PURGE) {
            try {
                Storage.deleteData(key);
            } catch (_e) { /* ignore */ }
        }
        Logger.log('Safe UX Build: purged stored Ops/token/AI credentials from script storage');
    }

    // ============= PLUGIN LOADER =============
    const PluginLoader = {
        _loadedPluginFiles: new Set(),
        
        /**
         * Load plugin code from URL (but don't cache yet - version verification happens first)
         * @param {string} url - URL to fetch plugin from
         * @param {string} filename - Plugin filename
         * @param {string} sourcePath - Full path for caching (e.g., "qa-tool-use/plugin.js")
         * @param {string} version - Expected version (for logging only - actual verification happens later)
         * @returns {Promise<{code: string, version: string}>}
         */
        async loadPluginFromUrl(url, filename) {
            throw new Error(`Safe UX Build: remote plugin fetch is disabled (${filename})`);
        },
        
        /**
         * Cache plugin code with version (called after version verification)
         * @param {string} filename - Plugin filename
         * @param {string} sourcePath - Full path for caching
         * @param {string} code - Plugin code
         * @param {string} version - Version to cache with
         */
        cachePluginCode(filename, sourcePath, code, version) {
            Logger.debug(`Safe UX Build: skipping plugin cache for ${filename}`);
        },

        async loadPluginCode(filename) {
            throw new Error(`Safe UX Build: remote plugin fetch is disabled (${filename})`);
        },

        /**
         * Parse and execute plugin code
         * @param {string} code - Plugin code
         * @param {string} filename - Plugin filename
         * @returns {Object} - Plugin object
         */
        instantiateBundledPlugin(sourcePath, filename, options = {}) {
            if (!SAFE_UX_ALLOWLIST.has(filename)) {
                throw new Error(`Plugin ${filename} blocked: not on the Safe UX allowlist`);
            }
            const factory = BUNDLED_PLUGIN_FACTORIES && BUNDLED_PLUGIN_FACTORIES[sourcePath];
            if (typeof factory !== 'function') {
                throw new Error(`Plugin ${filename} blocked: not in the local Safe UX bundle (${sourcePath})`);
            }
            try {
                const useModuleLogger = options.useModuleLogger === true;
                const moduleIdHint = options.moduleIdHint || filename;
                let resolvedModuleId = moduleIdHint;
                const moduleLogger = useModuleLogger
                    ? Logger.createModuleLogger(() => resolvedModuleId)
                    : Logger;
                const plugin = factory(
                    PluginManager,
                    Storage,
                    moduleLogger,
                    Context,
                    CleanupRegistry,
                    blockedGmXmlhttpRequest
                );
                if (useModuleLogger && plugin && plugin.id) {
                    resolvedModuleId = plugin.id;
                }
                return plugin;
            } catch (e) {
                Logger.error(`Failed to instantiate bundled plugin ${filename}:`, e);
                throw e;
            }
        },

        parsePluginCode(_code, filename) {
            throw new Error(`Safe UX Build: remote plugin parsing is disabled (${filename})`);
        },
        
        /**
         * Load a core plugin with versioning and hash verification
         * @param {string} filename - Plugin filename
         * @param {string} version - Required version
         * @param {string} [hash] - Expected integrity hash
         * @returns {Promise<Object>} - Plugin object
         */
        async loadCorePlugin(filename, version, hash) {
            const sourcePath = `core/main/${filename}`;
            const plugin = this.instantiateBundledPlugin(sourcePath, filename, { useModuleLogger: true });
            plugin._sourcePath = sourcePath;
            this._loadedPluginFiles.add(sourcePath);
            Logger.debug(`Loaded bundled core plugin ${filename} v${version}`);
            return plugin;
        },

        /**
         * Load a shared library module with versioning and hash verification.
         * Libraries live under plugins/libs/ and are loaded only when an archetype
         * (or ops dashboard) declares them.
         * @param {string} filename - Library filename
         * @param {string} version - Required version
         * @param {string} [hash] - Expected integrity hash
         * @returns {Promise<Object>} - Plugin object
         */
        async loadLibrary(filename, version, hash) {
            if (filename.includes('/')) {
                throw new Error(
                    `Invalid library name "${filename}". Library names must be filenames only (no folder paths).`
                );
            }
            const sourcePath = `libs/${filename}`;
            const plugin = this.instantiateBundledPlugin(sourcePath, filename, { useModuleLogger: true });
            plugin._sourcePath = sourcePath;
            this._loadedPluginFiles.add(sourcePath);
            Logger.debug(`Loaded library ${filename} v${version}`);
            return plugin;
        },

        /**
         * Load a dev plugin with versioning and hash verification
         * @param {string} filename - Plugin filename
         * @param {string} version - Required version
         * @param {string} [hash] - Expected integrity hash
         * @returns {Promise<Object>} - Plugin object
         */
        async loadDevPlugin(filename, version, hash) {
            throw new Error(`Safe UX Build: dev plugin loading is disabled (${filename})`);
            const sourcePath = `core/dev/${filename}`;
            const plugin = this.instantiateBundledPlugin(sourcePath, filename, { useModuleLogger: true });
            plugin._sourcePath = sourcePath;
            this._loadedPluginFiles.add(sourcePath);
            Logger.debug(`Loaded dev plugin ${filename} v${version}`);
            return plugin;
        },
        
        /**
         * Load an archetype plugin with versioning and hash verification
         * @param {string} filename - The plugin filename (e.g., "source-data-explorer.js")
         * @param {string} version - Required version (e.g., "1.0")
         * @param {string} archetypeId - The archetype ID (e.g., "k-taskCreation")
         * @param {string} [hash] - Expected integrity hash
         * @returns {Promise} - Resolves with the plugin object
         */
        async loadArchetypePlugin(filename, version, archetypeId, hash) {
            if (filename.includes('/')) {
                throw new Error(
                    `Invalid archetype plugin name "${filename}". Plugin names must be filenames only (no folder paths).`
                );
            }

            const sourcePath = `archetypes/${archetypeId}/main/${filename}`;
            const plugin = this.instantiateBundledPlugin(sourcePath, filename, { useModuleLogger: true });
            plugin._sourcePath = sourcePath;
            this._loadedPluginFiles.add(sourcePath);
            Logger.debug(`Loaded ${filename} v${version} from ${sourcePath}`);
            return plugin;
        },
        
        /**
         * Load a dev archetype plugin with versioning and hash verification
         * Dev archetype plugins live under: plugins/archetypes/<archetypeId>/dev/<filename>
         * @param {string} filename - The plugin filename (e.g., "source-data-explorer.js")
         * @param {string} version - Required version (e.g., "1.0")
         * @param {string} archetypeId - The archetype ID (e.g., "qa-tool-use")
         * @param {string} [hash] - Expected integrity hash
         * @returns {Promise} - Resolves with the plugin object
         */
        async loadDevArchetypePlugin(filename, version, archetypeId, hash) {
            if (filename.includes('/')) {
                throw new Error(
                    `Invalid dev archetype plugin name "${filename}". Plugin names must be filenames only (no folder paths).`
                );
            }

            throw new Error(`Safe UX Build: dev archetype plugin loading is disabled (${filename})`);
            const sourcePath = `archetypes/${archetypeId}/dev/${filename}`;
            const plugin = this.instantiateBundledPlugin(sourcePath, filename, { useModuleLogger: true });
            plugin._sourcePath = sourcePath;
            this._loadedPluginFiles.add(sourcePath);
            Logger.debug(`Loaded dev archetype plugin ${filename} v${version} from ${sourcePath}`);
            return plugin;
        },

        /**
         * Load a single settings modal doc (markdown) from cache or URL
         * @param {string} filename - Doc filename (e.g. "information-tab.md")
         * @param {string} version - Required version from archetypes.json
         * @returns {Promise<void>}
         */
        async loadSettingsModalDoc(filename, version) {
            Context.settingsModalDocs = Context.settingsModalDocs || {};
            const raw = BUNDLED_SETTINGS_DOCS && BUNDLED_SETTINGS_DOCS[filename];
            if (typeof raw !== 'string') {
                Logger.warn(`Settings doc ${filename} unavailable in Safe UX bundle`);
                return;
            }
            Context.settingsModalDocs[filename] = { raw, version };
            Logger.debug(`Loaded bundled settings doc ${filename} v${version}`);
        },

        async loadSettingsModalDocs(docsList) {
            if (!docsList || docsList.length === 0) return;
            Context.settingsModalDocs = Context.settingsModalDocs || {};
            for (const doc of docsList) {
                const name = doc.name;
                const version = doc.version;
                if (!name || !version) continue;
                await this.loadSettingsModalDoc(name, version);
            }
        },
        
        async loadPluginsFromConfig(pluginList, type) {
            if (!pluginList || pluginList.length === 0) {
                Logger.debug(`No ${type} plugins configured`);
                return;
            }

            const normalizedType = type === 'dev' ? 'dev' : 'core';
            Logger.debug(`Loading ${pluginList.length} ${normalizedType} plugin(s)...`);
            let loadedCount = 0;

            const loader = normalizedType === 'dev'
                ? this.loadDevPlugin.bind(this)
                : this.loadCorePlugin.bind(this);

            for (const pluginDef of pluginList) {
                let filename, version, hash;
                // Backward compat: older archetypes.json entries may be plain strings
                if (typeof pluginDef === 'string') {
                    filename = pluginDef;
                    version = '1.0';
                } else if (pluginDef && pluginDef.name && pluginDef.version) {
                    filename = pluginDef.name;
                    version = pluginDef.version;
                    hash = pluginDef.hash || undefined;
                } else {
                    Logger.error(`Invalid ${normalizedType} plugin definition:`, pluginDef);
                    continue;
                }
                
                Logger.debug(`archetypes.json requests ${normalizedType} plugin ${filename} v${version}${hash ? ' (hash present)' : ''}`);
                if (!SAFE_UX_ALLOWLIST.has(filename)) {
                    Logger.warn(`Skipping ${filename}: not on the Safe UX allowlist`);
                    continue;
                }
                
                try {
                    const plugin = await loader(filename, version, hash);
                    const loadedVersion = plugin._version || plugin.version || version;
                    plugin._sourceFile = filename;
                    plugin._version = loadedVersion;
                    plugin._isCore = true;
                    if (normalizedType === 'dev') {
                        plugin._isDev = true;
                    }
                    PluginManager.register(plugin);
                    loadedCount++;
                    Logger.debug(`Loaded ${normalizedType} plugin: ${filename} v${loadedVersion}`);
                } catch (err) {
                    Logger.error(`✗ Failed to load ${normalizedType} plugin: ${filename} v${version}`, err);
                }
            }
            if (loadedCount > 0) {
                Logger.log(`Loaded ${loadedCount} ${normalizedType} plugin(s)`);
            }
        },
        
        async loadPluginsForArchetype(pluginList, archetypeId) {
            if (!pluginList || pluginList.length === 0) {
                Logger.debug('No plugins to load for this archetype');
                return;
            }
            
            if (!archetypeId) {
                Logger.error('Archetype ID required to load plugins');
                return;
            }
            
            Logger.debug(`Loading ${pluginList.length} archetype plugin(s) for ${archetypeId}...`);
            const loadPromises = [];
            let loadedCount = 0;
            
            for (const pluginDef of pluginList) {
                let filename, version, hash;
                // Backward compat: older archetypes.json entries may be plain strings
                if (typeof pluginDef === 'string') {
                    filename = pluginDef;
                    version = '1.0';
                } else if (pluginDef && pluginDef.name && pluginDef.version) {
                    filename = pluginDef.name;
                    version = pluginDef.version;
                    hash = pluginDef.hash || undefined;
                } else {
                    Logger.error('Invalid plugin definition:', pluginDef);
                    continue;
                }

                Logger.debug(`archetypes.json requests archetype plugin ${filename} v${version} for ${archetypeId}${hash ? ' (hash present)' : ''}`);
                if (!SAFE_UX_ALLOWLIST.has(filename)) {
                    Logger.warn(`Skipping ${filename}: not on the Safe UX allowlist`);
                    continue;
                }

                if (filename.includes('/')) {
                    Logger.error(
                        `Invalid archetype plugin name "${filename}". Plugin names must be filenames only (no folder paths).`
                    );
                    continue;
                }
                
                const existingPlugins = PluginManager.getAll();
                // Libraries share filenames with thin archetype wrappers; ignore _isLib entries
                const alreadyLoadedByFile = existingPlugins.some(
                    (p) => p._sourceFile === filename && p._isLib !== true
                );
                
                const sourcePath = `archetypes/${archetypeId}/main/${filename}`;
                const alreadyLoadedByPath = this._loadedPluginFiles.has(sourcePath);
                
                if (alreadyLoadedByFile || alreadyLoadedByPath) {
                    Logger.debug(`Plugin ${filename} already loaded, skipping fetch`);
                    continue;
                }
                
                loadPromises.push(
                    this.loadArchetypePlugin(filename, version, archetypeId, hash)
                        .then(plugin => {
                            const loadedVersion = plugin._version || plugin.version || version;
                            plugin._sourceFile = filename;
                            plugin._version = loadedVersion;
                            plugin._isCore = false;
                            PluginManager.register(plugin);
                            loadedCount++;
                            Logger.debug(`Loaded plugin: ${filename} v${loadedVersion}`);
                        })
                        .catch(err => {
                            Logger.error(`✗ Failed to load plugin: ${filename} v${version}`, err);
                        })
                );
            }
            
            await Promise.allSettled(loadPromises);
            
            // Log warnings about outdated plugins
            if (Context.outdatedPlugins.length > 0) {
                Logger.warn(`${Context.outdatedPlugins.length} plugin(s) are using outdated cached versions:`);
                Context.outdatedPlugins.forEach(p => {
                    Logger.warn(`  - ${p.filename}: cached v${p.cachedVersion}, required v${p.requiredVersion}`);
                });
            }
            
            // Clean up deprecated cached plugins for this archetype
            this.cleanupDeprecatedCache(pluginList, archetypeId, 'main');
            
            if (loadedCount > 0) {
                Logger.log(`Loaded ${loadedCount} archetype plugin(s) for ${archetypeId}`);
            } else {
                Logger.debug('Archetype plugin loading complete (none newly loaded)');
            }
        },
        
        /**
         * Load dev archetype plugins (similar to loadPluginsForArchetype but uses dev path)
         * @param {Array} pluginList - List of dev archetype plugins
         * @param {string} archetypeId - The dev archetype ID
         */
        async loadPluginsForDevArchetype(pluginList, archetypeId) {
            Logger.log('Safe UX Build: skipping dev archetype plugins');
            return;
        },
        /**
         * Clean up deprecated cached plugins for an archetype
         * Compares cached plugins against expected plugins from archetypes.json
         * and deletes any cached entries that are no longer listed.
         * Only touches cache keys for the given format (main vs dev) so main-only
         * plugins are not deleted when cleaning after dev load, and vice versa.
         * @param {Array} pluginList - List of expected plugins from archetypes.json
         * @param {string} archetypeId - The archetype ID
         * @param {string} format - 'main' or 'dev'; which load path we're cleaning for
         */
        cleanupDeprecatedCache(pluginList, archetypeId, format) {
            if (!archetypeId) {
                Logger.debug('Skipping deprecated cache cleanup: no archetype ID');
                return;
            }
            
            if (!pluginList || !Array.isArray(pluginList)) {
                Logger.debug('Skipping deprecated cache cleanup: invalid plugin list');
                return;
            }
            
            const effectiveFormat = format === 'dev' ? 'dev' : 'main';
            
            // Extract expected plugin filenames from pluginList
            const expectedFilenames = new Set();
            pluginList.forEach(pluginDef => {
                let filename;
                // Backward compat: older archetypes.json entries may be plain strings
                if (typeof pluginDef === 'string') {
                    filename = pluginDef;
                } else if (pluginDef && pluginDef.name) {
                    filename = pluginDef.name;
                }
                if (filename) {
                    expectedFilenames.add(filename);
                }
            });
            
            // Get cached plugins for this archetype
            const cachedPlugins = Storage.getCachedPluginsForArchetype(archetypeId);
            
            if (cachedPlugins.length === 0) {
                Logger.debug(`No cached plugins found for archetype: ${archetypeId}`);
                return;
            }
            
            // Find deprecated plugins (cached but not in expected list)
            const deprecatedPlugins = cachedPlugins.filter(filename => !expectedFilenames.has(filename));
            
            if (deprecatedPlugins.length === 0) {
                Logger.debug(`No deprecated cached plugins found for archetype: ${archetypeId}`);
                return;
            }
            
            let deletedCount = 0;
            deprecatedPlugins.forEach(filename => {
                const oldCacheKey = `plugin-cache-${archetypeId}/${filename}`;
                const newMainCacheKey = `plugin-cache-archetypes/${archetypeId}/main/${filename}`;
                const newDevCacheKey = `plugin-cache-archetypes/${archetypeId}/dev/${filename}`;
                
                const cacheKeys = effectiveFormat === 'main'
                    ? [
                        { key: oldCacheKey, format: 'old' },
                        { key: newMainCacheKey, format: 'new-main' }
                    ]
                    : [{ key: newDevCacheKey, format: 'new-dev' }];
                
                let deleted = false;
                for (const { key, format: keyFormat } of cacheKeys) {
                    const cacheExists = Storage.get(key, null) !== null;
                    if (cacheExists) {
                        try {
                            Storage.delete(key);
                            deleted = true;
                            Logger.debug(`Deleted deprecated cached plugin: ${filename} (archetype: ${archetypeId}, format: ${keyFormat})`);
                            break; // Only delete once per plugin
                        } catch (e) {
                            Logger.error(`Failed to delete deprecated cache entry for ${filename} (archetype: ${archetypeId}, format: ${keyFormat}):`, e);
                        }
                    }
                }
                
                if (deleted) {
                    deletedCount++;
                    try {
                        Storage.unregisterCachedPlugin(archetypeId, filename);
                    } catch (e) {
                        Logger.error(`Failed to unregister cache entry for ${filename} (archetype: ${archetypeId}):`, e);
                    }
                }
            });
            
            if (deletedCount > 0) {
                Logger.log(`Cleaned up ${deletedCount} deprecated cached plugin(s) for archetype: ${archetypeId}`);
            }
        }
    };

    Context.archetypeManager = ArchetypeManager;

    // ============= PLUGIN MANAGER =============
    const PluginManager = {
        plugins: {},
        _enabledCache: new Map(),
        
        register(plugin) {
            if (!plugin.id) {
                Logger.error('Plugin must have an id');
                return;
            }
            this.plugins[plugin.id] = {
                ...plugin,
                state: plugin.initialState ? { ...plugin.initialState } : {},
            };
            Logger.debug(`Registered plugin: ${plugin.id}`);
        },
        
        get(id) {
            return this.plugins[id];
        },
        
        getAll() {
            return Object.values(this.plugins);
        },
        
        getCorePlugins() {
            return this.getAll().filter(p => p._isCore === true);
        },
        
        getArchetypePlugins() {
            return this.getAll().filter(p => p._isCore !== true);
        },
        
        getDevPlugins() {
            return this.getAll().filter(p => p._isDev === true);
        },

        getOpsDashboardPlugins() {
            return this.getAll().filter(p => p._isOps === true);
        },

        getLibraryPlugins() {
            return this.getAll().filter(p => p._isLib === true);
        },
        
        isEnabled(id) {
            if (this._enabledCache.has(id)) return this._enabledCache.get(id);
            const result = Storage.getPluginEnabled(id);
            this._enabledCache.set(id, result);
            return result;
        },

        /**
         * Per-document session: archetype plugins run only when both storage says enabled
         * and runtime was active for this load. Enabling a plugin in Settings updates
         * storage only; runtime turns on after page refresh (or first-seen plugin ids on SPA nav).
         */
        _archetypeRuntimeActive: {},

        initArchetypeRuntimeEnableState() {
            this.getArchetypePlugins().forEach((p) => {
                if (this._archetypeRuntimeActive[p.id] === undefined) {
                    this._archetypeRuntimeActive[p.id] = Storage.getPluginEnabled(p.id);
                }
            });
        },

        setArchetypeRuntimeActive(id, active) {
            this._archetypeRuntimeActive[id] = active;
        },

        /** Whether an archetype plugin should execute (early/init/mutation), not just appear enabled in Settings. */
        isArchetypePluginActiveForRun(id) {
            if (!this.isEnabled(id)) return false;
            return this._archetypeRuntimeActive[id] === true;
        },
        
        setEnabled(id, enabled) {
            Storage.setPluginEnabled(id, enabled);
            this._enabledCache.set(id, enabled);
        },
        
        cleanupArchetypePlugins() {
            this.getArchetypePlugins().forEach(plugin => {
                try {
                    if (plugin.destroy) {
                        plugin.destroy(plugin.state, Context);
                        Logger.debug(`Destroyed plugin: ${plugin.id}`);
                    }
                    plugin.state = plugin.initialState ? { ...plugin.initialState } : {};
                } catch (e) {
                    Logger.error(`Error destroying plugin ${plugin.id}:`, e);
                }
            });
        },
        
        clearArchetypePlugins() {
            this.cleanupArchetypePlugins();
            const archetypePluginIds = this.getArchetypePlugins().map(p => p.id);
            archetypePluginIds.forEach(id => {
                delete this.plugins[id];
            });
        },
        
        runCorePlugins() {
            const plugins = this.getCorePlugins()
                .filter(p => p._isOps !== true && p._isLib !== true && this.isEnabled(p.id));
            // ui-lib must init first: other core/dev plugins (e.g. logger) depend on Context.uiLib.
            // Dev plugins are registered before core, so registration order alone is wrong.
            plugins.sort((a, b) => {
                if (a.id === 'ui-lib') return -1;
                if (b.id === 'ui-lib') return 1;
                return 0;
            });
            plugins.forEach(plugin => {
                try {
                    if (plugin.init) plugin.init(plugin.state, Context);
                    Logger.debug(`Core plugin initialized: ${plugin.id}`);
                } catch (e) {
                    Logger.error(`Error in core plugin ${plugin.id}:`, e);
                }
            });
        },

        runLibraryPluginInit(plugin) {
            // Prefer the registered entry (has state); callers may pass the pre-register object
            const registered = (plugin && plugin.id && this.get(plugin.id)) || plugin;
            if (!registered) return;
            if (registered.state && registered.state.libInitialized) {
                return;
            }
            try {
                if (registered.init) registered.init(registered.state, Context);
            } catch (e) {
                Logger.error(`Error in library plugin ${registered.id}:`, e);
                return;
            }
            if (registered.state) registered.state.libInitialized = true;
            Logger.debug(`Library plugin initialized: ${registered.id}`);
        },

        runOpsDashboardPluginInit(plugin) {
            if (plugin.state && plugin.state.opsInitialized) {
                return;
            }
            try {
                if (plugin.init) plugin.init(plugin.state, Context);
            } catch (e) {
                Logger.error(`Error in ops dashboard plugin ${plugin.id}:`, e);
                return;
            }
            if (plugin.state) plugin.state.opsInitialized = true;
            Logger.debug(`Ops dashboard plugin initialized: ${plugin.id}`);
        },

        runOpsDashboardPlugins() {
            this.getOpsDashboardPlugins()
                .filter(p => this.isEnabled(p.id))
                .forEach(plugin => this.runOpsDashboardPluginInit(plugin));
        },
        
        runEarlyPlugins() {
            this.getArchetypePlugins()
                .filter(p => p.phase === 'early' && this.isArchetypePluginActiveForRun(p.id))
                .forEach(plugin => {
                    try {
                        if (plugin.init) plugin.init(plugin.state, Context);
                        Logger.debug(`Early plugin initialized: ${plugin.id}`);
                    } catch (e) {
                        Logger.error(`Error in early plugin ${plugin.id}:`, e);
                    }
                });
        },
        
        runInitPlugins() {
            this.getArchetypePlugins()
                .filter(p => p.phase === 'init' && this.isArchetypePluginActiveForRun(p.id))
                .forEach(plugin => {
                    try {
                        if (plugin.init) plugin.init(plugin.state, Context);
                        Logger.debug(`Init plugin initialized: ${plugin.id}`);
                    } catch (e) {
                        Logger.error(`Error in init plugin ${plugin.id}:`, e);
                    }
                });
        },
        
        runMutationPlugins() {
            this.getArchetypePlugins()
                .filter(p => p.phase === 'mutation' && this.isArchetypePluginActiveForRun(p.id))
                .forEach(plugin => {
                    try {
                        if (plugin.onMutation) plugin.onMutation(plugin.state, Context);
                    } catch (e) {
                        Logger.error(`Error in mutation plugin ${plugin.id}:`, e);
                    }
                });
        }
    };

    Context.pluginManager = PluginManager;

    // ============= MAIN INITIALIZATION =============
    let mainObserver = null;
    let mutationRafId = null;
    let corePluginsLoaded = false;
    let navigationHandlerActive = false;
    let navigationPendingUrl = null;

    let opsDashboardLoadPromise = null;
    let librariesLoadPromise = null;
    const loadedLibraryNames = new Set();

    async function loadMissingOpsDashboardPluginsFromConfig(configList) {
        if (!configList || configList.length === 0) return;
        const toLoad = [];
        for (const def of configList) {
            const filename = def && def.name ? def.name : (typeof def === 'string' ? def : '');
            if (!filename) continue;
            const exists = PluginManager.getAll().some((p) => p._sourceFile === filename);
            if (!exists) toLoad.push(def);
        }
        if (toLoad.length === 0) return;
        const beforeIds = new Set(PluginManager.getAll().map((p) => p.id));
        await PluginLoader.loadPluginsFromConfig(toLoad, 'core');
        PluginManager.getAll()
            .filter((p) => !beforeIds.has(p.id))
            .forEach((p) => { p._isOps = true; });
        Logger.log('ops dashboard: loaded ' + toLoad.length + ' missing plugin(s)');
    }

    /**
     * Idempotently load shared library modules by filename.
     * Libraries stay registered across SPA navigations once loaded.
     * @param {string[]|undefined|null} names
     * @returns {Promise<boolean>}
     */
    async function ensureLibrariesLoaded(names) {
        if (!names || !Array.isArray(names) || names.length === 0) {
            return true;
        }
        const pendingNames = names.filter((n) => typeof n === 'string' && n && !loadedLibraryNames.has(n));
        if (pendingNames.length === 0) {
            return true;
        }

        const runLoad = async () => {
            await ArchetypeManager.loadArchetypes();
            const entries = ArchetypeManager.resolveLibraryEntries(pendingNames);
            if (entries.length === 0) {
                return true;
            }
            Logger.debug(`Loading ${entries.length} library module(s)...`);
            let loadedCount = 0;
            for (const pluginDef of entries) {
                const filename = pluginDef.name;
                const version = pluginDef.version;
                const hash = pluginDef.hash || undefined;
                if (loadedLibraryNames.has(filename)) continue;
                const already = PluginManager.getAll().some((p) => p._isLib && p._sourceFile === filename);
                if (already) {
                    loadedLibraryNames.add(filename);
                    continue;
                }
                try {
                    const plugin = await PluginLoader.loadLibrary(filename, version, hash);
                    const loadedVersion = plugin._version || plugin.version || version;
                    plugin._sourceFile = filename;
                    plugin._version = loadedVersion;
                    plugin._isCore = true;
                    plugin._isLib = true;
                    PluginManager.register(plugin);
                    // register() stores a copy with initialized state; init must use that entry
                    PluginManager.runLibraryPluginInit(PluginManager.get(plugin.id));
                    loadedLibraryNames.add(filename);
                    loadedCount++;
                    Logger.debug(`Loaded library: ${filename} v${loadedVersion}`);
                } catch (err) {
                    Logger.error(`Failed to load library: ${filename} v${version}`, err);
                }
            }
            if (loadedCount > 0) {
                Logger.log(`Loaded ${loadedCount} library module(s)`);
            }
            return true;
        };

        if (librariesLoadPromise) {
            await librariesLoadPromise;
            // After the prior load finishes, retry for any names still missing
            // (another caller may have loaded a different subset concurrently).
            return ensureLibrariesLoaded(names);
        }

        librariesLoadPromise = runLoad();
        try {
            return await librariesLoadPromise;
        } finally {
            librariesLoadPromise = null;
        }
    }

    Context.ensureLibrariesLoaded = ensureLibrariesLoaded;

    async function ensureOpsDashboardPluginsLoaded() {
        if (!Context.opsTab || !Context.opsTab.isEnabled()) {
            return false;
        }
        if (opsDashboardLoadPromise) {
            return opsDashboardLoadPromise;
        }
        opsDashboardLoadPromise = (async () => {
            await ArchetypeManager.loadArchetypes();
            await ensureLibrariesLoaded(ArchetypeManager.getOpsDashboardLibraries());
            const configList = ArchetypeManager.getOpsDashboardPlugins();
            if (!configList.length) {
                Context.opsDashboardPluginsLoaded = true;
                return true;
            }
            if (!Context.opsDashboardPluginsLoaded) {
                Logger.log('ops tab enabled: loading ops dashboard plugins...');
            }
            await loadMissingOpsDashboardPluginsFromConfig(configList);
            PluginManager.getOpsDashboardPlugins()
                .filter((p) => PluginManager.isEnabled(p.id))
                .forEach((p) => PluginManager.runOpsDashboardPluginInit(p));
            Context.opsDashboardPluginsLoaded = true;
            return true;
        })();
        try {
            return await opsDashboardLoadPromise;
        } finally {
            opsDashboardLoadPromise = null;
        }
    }

    Context.ensureOpsDashboardPluginsLoaded = ensureOpsDashboardPluginsLoaded;

    /**
     * Delete GM-cached source for ops dashboard plugins and opsDashboardLibraries,
     * and mark ops plugins as not loaded. Does not unload already-evaluated JS.
     * @returns {{ plugins: number, libraries: number }}
     */
    function clearOpsDashboardCaches() {
        let pluginsCleared = 0;
        let librariesCleared = 0;
        const am = Context.archetypeManager || ArchetypeManager;
        const pluginEntries = (am && typeof am.getOpsDashboardPlugins === 'function')
            ? am.getOpsDashboardPlugins()
            : [];
        const libNames = (am && typeof am.getOpsDashboardLibraries === 'function')
            ? am.getOpsDashboardLibraries()
            : [];

        for (const entry of pluginEntries) {
            const name = entry && entry.name;
            if (typeof name !== 'string' || !name) continue;
            const pluginKey = Storage.getPluginKey(name, `core/main/${name}`);
            Storage.clearCachedPlugin(pluginKey);
            pluginsCleared++;
        }
        for (const name of libNames) {
            if (typeof name !== 'string' || !name) continue;
            const pluginKey = Storage.getPluginKey(name, `libs/${name}`);
            Storage.clearCachedPlugin(pluginKey);
            librariesCleared++;
        }

        Context.opsDashboardPluginsLoaded = false;
        Logger.log(
            'ops dashboard caches cleared (' +
            pluginsCleared + ' plugin(s), ' +
            librariesCleared + ' librar' + (librariesCleared === 1 ? 'y' : 'ies') + ')'
        );
        return { plugins: pluginsCleared, libraries: librariesCleared };
    }

    Context.clearOpsDashboardCaches = clearOpsDashboardCaches;
    
    async function initializeCorePlugins() {
        if (corePluginsLoaded) {
            Logger.debug('Core plugins already loaded');
            return;
        }

        await ArchetypeManager.loadArchetypes();
        const settingsDocs = ArchetypeManager.getSettingsModalDocs();
        if (settingsDocs.length > 0) {
            await PluginLoader.loadSettingsModalDocs(settingsDocs);
        }
        const corePlugins = ArchetypeManager.getCorePlugins();
        await PluginLoader.loadPluginsFromConfig(corePlugins, 'core');
        corePluginsLoaded = true;

        await waitForBody();
        PluginManager.runCorePlugins();
        Logger.log('Safe UX Build: Ops dashboard and dev plugins are not loaded');
    }
    
    /**
     * Env/VNC Helper only prefills Prompt when the last Fleet page was QA.
     * QA archetypes set context to 'qa'; create / task-creation pages set 'non-qa'.
     * Other pages (incl. no-vnc env tabs) leave the last value unchanged.
     */
    const HELPER_PROMPT_CONTEXT_KEY = 'vnc-helper-prompt-context';

    function syncHelperPromptContextFromArchetype(archetype) {
        if (!archetype || !archetype.id) {
            return;
        }
        const id = String(archetype.id);
        let next = null;
        if (id.startsWith('qa-')) {
            next = 'qa';
        } else if (
            id.includes('task-creation') ||
            id.startsWith('create-') ||
            id === 'dashboard-create-instance'
        ) {
            next = 'non-qa';
        }
        if (!next) {
            return;
        }
        try {
            const prev = Storage.get(HELPER_PROMPT_CONTEXT_KEY, '');
            if (prev === next) {
                return;
            }
            Storage.set(HELPER_PROMPT_CONTEXT_KEY, next);
            Logger.log(`Helper prompt context → ${next} (archetype ${id})`);
        } catch (e) {
            Logger.warn('Failed to sync helper prompt context', e);
        }
    }

    async function initializeForPage() {
        Logger.debug('Initializing for current page...');

        try {
            Context.networkObserver.refreshFromPage(Context.getPageWindow());
        } catch (e) {
            Logger.debug('FleetSessionAuth: refreshFromPage on init failed', e);
        }

        try {
            // Load archetype definitions (cached after first load)
            await ArchetypeManager.loadArchetypes();
            
            // Wait for DOM
            await waitForBody();
            
            // When an update is available, do not load archetype plugins (stopgap for future secure loader behavior)
            if (Context.isOutdated) {
                Logger.warn('Script is outdated. Archetype plugins are disabled. Please update the script to continue using page-specific features. Open Settings to see the update banner.');
                return;
            }

            if (Context.coreOnlyMode) {
                Logger.log('coreOnlyMode: archetype UX plugins are not loaded (settings and update checks remain active).');
                return;
            }
            
            // Detect archetype using URL + optional disambiguation
            const archetype = await ArchetypeManager.detectArchetype();
            
            if (!archetype) {
                Logger.warn('No matching archetype found. No archetype plugins will load.');
                return;
            }

            syncHelperPromptContextFromArchetype(archetype);

            // Load shared libraries declared by this archetype before page plugins
            await ensureLibrariesLoaded(archetype.libraries);
            
            // Load archetype-specific plugins
            const pluginsToLoad = ArchetypeManager.getPluginsForCurrentArchetype();
            await PluginLoader.loadPluginsForArchetype(pluginsToLoad, archetype.id);
            
            PluginManager.initArchetypeRuntimeEnableState();

            // Run early plugins
            PluginManager.runEarlyPlugins();
            
            // Set up DOM observer with rAF coalescing so rapid mutations (e.g. partial load)
            // trigger one plugin run per frame instead of one per batch
            mainObserver = new MutationObserver(() => {
                if (!Context.initialized) return;
                if (mutationRafId !== null) return;
                mutationRafId = requestAnimationFrame(() => {
                    mutationRafId = null;
                    PluginManager.runMutationPlugins();
                });
            });
            CleanupRegistry.registerObserver(mainObserver);
            
            // Run init plugins and start observing
            Context.initialized = true;
            PluginManager.runInitPlugins();
            
            mainObserver.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['style', 'class']
            });
            
            // Run mutation plugins once for initial state
            PluginManager.runMutationPlugins();
            
            Logger.log(`Initialized for archetype: ${archetype.name} (path: "${Context.currentPath}")`);
        } catch (error) {
            Logger.error('Failed to initialize:', error);
        }
    }
    
    /**
     * Whether SPA navigation to this path should trigger a full reload (archetype plugins
     * are listed in archetypes.json for the main archetype and/or devArchetypes when dev is on).
     */
    function navigationTargetHasConfiguredPlugins(newPath) {
        const mainHasPlugins = ArchetypeManager.archetypes.some((archetype) => {
            if (!archetype.urlPattern) {
                return false;
            }
            if (!UrlMatcher.matches(newPath, archetype.urlPattern)) {
                return false;
            }
            return (archetype.plugins || []).length > 0;
        });
        if (mainHasPlugins) {
            return true;
        }
        if (DEV_SCRIPTS_ENABLED) {
            return ArchetypeManager.devArchetypes.some((devArchetype) => {
                if (!devArchetype.urlPattern) {
                    return false;
                }
                if (!UrlMatcher.matches(newPath, devArchetype.urlPattern)) {
                    return false;
                }
                return (devArchetype.plugins || []).length > 0;
            });
        }
        return false;
    }
    
    async function handleNavigation(newUrl, previousUrl) {
        Logger.debug('Handling navigation, checking URL diff...');

        if (newUrl === previousUrl) {
            Logger.debug('URL is the same, skipping...');
            return;
        }

        // Prevent concurrent invocations from racing each other. A prior call is still
        // awaiting the GitHub fetch, so queue this URL and let the in-flight handler
        // pick it up after it finishes.
        if (navigationHandlerActive) {
            navigationPendingUrl = newUrl;
            Logger.debug('Navigation handler already active — queued pending URL: ' + newUrl);
            return;
        }
        navigationHandlerActive = true;

        Logger.debug('Handling navigation, checking archetype match...');

        try {
            ArchetypeManager._fetchedAt = 0; // Invalidate cache so we get fresh config for this navigation
            await ArchetypeManager.loadArchetypes();

            // If further navigation occurred while we were fetching, the URL we were
            // called with is now stale. Reloading here would fire on the wrong page.
            if (window.location.href !== newUrl) {
                Logger.debug('URL changed during archetype fetch, skipping reload...');
                return;
            }

            const newPath = UrlMatcher.getPathFromUrl(newUrl);
            const matchesMainArchetypePath = ArchetypeManager.archetypes.some((archetype) => {
                if (!archetype.urlPattern) {
                    return false;
                }
                return UrlMatcher.matches(newPath, archetype.urlPattern);
            });
            const warrantsFullReload = navigationTargetHasConfiguredPlugins(newPath);

            if (matchesMainArchetypePath && !warrantsFullReload) {
                Logger.debug(
                    'Navigation matches an archetype URL pattern but no configured main/dev plugins warrant a full reload; skipping reload...'
                );
            }

            if (warrantsFullReload && !Context.coreOnlyMode) {
                Logger.log('Navigation target has configured archetype plugins; refreshing page...');
                Context.requestExtensionReload('SPA navigation with configured archetype plugins');
                return;
            }
            if (warrantsFullReload && Context.coreOnlyMode) {
                Logger.log('coreOnlyMode: skipping full page reload on SPA navigation (archetype UX is inactive).');
            }
        } catch (error) {
            Logger.error('Failed to check archetype match on navigation:', error);
        } finally {
            navigationHandlerActive = false;
            if (navigationPendingUrl && navigationPendingUrl !== newUrl) {
                const pendingUrl = navigationPendingUrl;
                navigationPendingUrl = null;
                Logger.debug('Navigation handler: processing queued URL: ' + pendingUrl);
                void handleNavigation(pendingUrl, newUrl);
                return;
            }
            navigationPendingUrl = null;
        }
        
        Logger.debug('Handling navigation, reinitializing...');
        
        // Clean up archetype plugins and resources
        Context.initialized = false;
        Context.outdatedPlugins = []; // Clear outdated plugins list on navigation
        if (mutationRafId !== null) {
            cancelAnimationFrame(mutationRafId);
            mutationRafId = null;
        }
        PluginManager.cleanupArchetypePlugins();
        CleanupRegistry.cleanup();
        
        // Clear archetype plugins
        PluginManager.clearArchetypePlugins();
        PluginLoader._loadedPluginFiles.clear();
        
        // Small delay to let SPA finish its DOM updates
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Reinitialize for the new page
        await initializeForPage();
    }
    
    function waitForBody() {
        return new Promise((resolve) => {
            if (document.body) {
                resolve();
            } else {
                const observer = new MutationObserver(() => {
                    if (document.body) {
                        observer.disconnect();
                        resolve();
                    }
                });
                observer.observe(document.documentElement, { childList: true, subtree: true });
            }
        });
    }
    
    // ============= STARTUP =============
    async function startup() {
        console.log(`${LOG_PREFIX} v${VERSION}`);
        Logger.log('Starting...');
        try {
            Storage.migratePageLocalStorageOnce();
            purgePrivilegedScriptStorage();
            NetworkObserver.init();
            NavigationManager.init();
            NavigationManager.onNavigate(handleNavigation);
            await waitForBody();
            await initializeCorePlugins();
            await initializeForPage();
        } catch (error) {
            if (DEV_SCRIPTS_ENABLED && isArchetypesHttp404Error(error)) {
                yieldToMainForOrphanedBranch('archetypes.json HTTP 404 during startup');
                return;
            }
            Logger.error('Startup failed:', error);
        }
    }

    startup();
    }

    if (MAIN_LIKE_BRANCHES.includes(GITHUB_CONFIG.branch)) {
        writeMainActiveBranchMarker();
        NetworkObserver.init();
        setTimeout(function() {
            void (async function() {
                try {
                    const pageWindow = Context.getPageWindow();
                    if (pageWindow && pageWindow.localStorage) {
                        let orphanBranch = pageWindow.localStorage.getItem(ORPHAN_BRANCH_STORAGE_KEY);
                        if (orphanBranch) {
                            await waitForOrphanProbe(orphanBranch);
                            orphanBranch = pageWindow.localStorage.getItem(ORPHAN_BRANCH_STORAGE_KEY);
                            const devActiveAfterProbe = pageWindow.localStorage.getItem(DEV_ACTIVE_STORAGE_KEY);
                            if (!orphanBranch || devActiveAfterProbe) {
                                if (devActiveAfterProbe) {
                                    pageWindow.localStorage.removeItem(DEV_ACTIVE_STORAGE_KEY);
                                }
                                console.log(
                                    `${LOG_PREFIX} - Feature branch recovered from orphan; main userscript yielding`
                                );
                                return;
                            }
                            pageWindow.localStorage.removeItem(DEV_ACTIVE_STORAGE_KEY);
                            pageWindow.localStorage.removeItem(DEV_ID_STORAGE_KEY);
                            console.log(
                                `${LOG_PREFIX} - Orphaned feature branch "${orphanBranch}"; main userscript will run`
                            );
                            pageWindow.localStorage.removeItem('fleet-godmode');
                        } else {
                            const devActiveBranch = pageWindow.localStorage.getItem(DEV_ACTIVE_STORAGE_KEY);
                            const devIdBranch = pageWindow.localStorage.getItem(DEV_ID_STORAGE_KEY);
                            if (devActiveBranch) {
                                pageWindow.localStorage.removeItem(DEV_ACTIVE_STORAGE_KEY);
                                return;
                            }
                            if (devIdBranch && !MAIN_LIKE_BRANCHES.includes(devIdBranch)) {
                                return;
                            }
                            pageWindow.localStorage.removeItem('fleet-godmode');
                        }
                    }
                } catch (e) {
                    // treat as no dev build
                }
                runFleet();
            })();
        }, SCRIPT_HANDSHAKE_DELAY_MS);
    } else {
        NetworkObserver.init();
        setTimeout(function() {
            void (async function() {
                function showOrphanYieldModalIfNoMain() {
                    if (getMainActiveBranchMarker()) return;
                    if (document.body) {
                        showNonDevRedirectModal();
                        console.log(`${LOG_PREFIX} - Orphaned branch with no main install; redirect modal shown`);
                    } else {
                        document.addEventListener('DOMContentLoaded', showNonDevRedirectModal);
                        console.log(`${LOG_PREFIX} - Orphaned branch with no main install; redirect modal listener added`);
                    }
                }

                let skipArchetypesProbe = false;
                if (isCurrentBranchOrphaned() || getStashedOrphanProbe()) {
                    const orphanProbe = startOrphanProbeIfNeeded() || probeBranchArchetypesStatus();
                    const orphanProbeStatus = await orphanProbe;
                    if (orphanProbeStatus === 200) {
                        clearOrphanMarkerForCurrentBranch();
                        writeDevActiveBranchMarker();
                        console.log(
                            `${LOG_PREFIX} - Branch "${GITHUB_CONFIG.branch}" archetypes restored; clearing orphan marker`
                        );
                        skipArchetypesProbe = true;
                    } else {
                        clearFeatureClaimsForCurrentBranch();
                        if (orphanProbeStatus === 404) {
                            console.log(
                                `${LOG_PREFIX} - Branch "${GITHUB_CONFIG.branch}" is still orphaned; yielding to main userscript`
                            );
                        } else {
                            console.warn(
                                `${LOG_PREFIX} - Orphan re-probe failed (HTTP ${orphanProbeStatus || 'network'}); staying yielded`
                            );
                        }
                        showOrphanYieldModalIfNoMain();
                        return;
                    }
                }

                let isDev = false;
                console.log("[Fleet UX Enhancer] - Checking if dev mode is enabled");
                try {
                    const pageWindow = Context.getPageWindow();
                    if (pageWindow && pageWindow.localStorage) {
                        const devIdBranch = pageWindow.localStorage.getItem(DEV_ID_STORAGE_KEY);
                        isDev = devIdBranch === 'main' || devIdBranch === GITHUB_CONFIG.branch;
                        if (isDev) {
                            pageWindow.localStorage.removeItem(DEV_ID_STORAGE_KEY);
                            console.log(`[Fleet UX Enhancer] - Dev ID detected for branch "${devIdBranch}", removing dev ID key`);
                        }
                        pageWindow.localStorage.removeItem('fleet-godmode');
                    }
                } catch (e) {
                    // treat as non-dev
                }
                if (!isDev) {
                    if (document.body) {
                        showNonDevRedirectModal();
                        console.log("[Fleet UX Enhancer] - Non-dev redirect modal shown");
                    } else {
                        document.addEventListener('DOMContentLoaded', showNonDevRedirectModal);
                        console.log("[Fleet UX Enhancer] - Non-dev redirect modal listener added");
                    }
                    return;
                }

                if (!skipArchetypesProbe) {
                    const archetypesStatus = await probeBranchArchetypesStatus();
                    if (archetypesStatus === 404) {
                        yieldToMainForOrphanedBranch('archetypes.json HTTP 404');
                        return;
                    }
                    if (archetypesStatus === 200) {
                        clearOrphanMarkerForCurrentBranch();
                    } else if (archetypesStatus === 0) {
                        console.warn(
                            `${LOG_PREFIX} Archetypes probe failed (network); proceeding without orphaning`
                        );
                    } else {
                        console.warn(
                            `${LOG_PREFIX} Archetypes probe returned HTTP ${archetypesStatus}; proceeding without orphaning`
                        );
                    }
                }
                runFleet();
            })();
        }, SCRIPT_HANDSHAKE_DELAY_MS);
    }
})();