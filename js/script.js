const N8N_BASE_URL = 'https://n8n-production-5ac7.up.railway.app';

// ── n8n Cloud Webhook Path Mapping ──────────────────────────────────
// Maps local human-readable webhook names → n8n Cloud webhook paths
const WEBHOOK_PATHS = {
    'identify-client': '6d4ece33-47af-4c2c-84ff-e513f3c3c15f',
    'register-client': 'df693c0f-0e3b-40dd-8624-a13262699291',
    'offboard-client': '1d6aa569-d921-444d-ad1b-fe20b6e26509',
    're-onboard': 'bf2121ed-dd0d-4f6c-84c1-26ffe36584f8',
    'upgrade-client': 'manage-platform',
      'send-oauth-link':  'send-oauth-links',
    };

// --- Firebase Realtime Database Configuration ---
const firebaseConfig = {
    apiKey: "5izPMgz7sv2vF3G1aXxMUUQbF8g4PV2E4gGufsu2",
    databaseURL: "https://rynex-ssm-1667e-default-rtdb.asia-southeast1.firebasedatabase.app/"
};

if (typeof firebase !== 'undefined' && !firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

let currentFirebaseSheetData = [];

// --- Centralized Validation Utilities ---
function normalizeString(value) {
    return String(value || '').trim().toLowerCase();
}
function normalizePhone(value) {
    return String(value || '').replace(/\D/g, '');
}
function normalizeEmail(value) {
    return normalizeString(value);
}
function generateStandardPayload(client, platforms = null) {
    if (!client) return { client_id: '', email: '', phone: '', status: '', platforms: [] };
    return {
        client_id: client.client_id || client.clientid || '',
        email: normalizeEmail(client.email || client['Email ID'] || ''),
        phone: normalizePhone(client.phone || client['Phone Number'] || ''),
        status: client.status || '',
        platforms: platforms || client.platforms || []
    };
}

function generateOAuthPayload(client, platforms, mode = 'single') {
    const selectedPlatforms = uniquePlatforms(platforms || []);
    return {
        ...generateStandardPayload(client, selectedPlatforms),
        clientid: client ? (client.client_id || client.clientid || '') : '',
        auth_mode: mode,
        send_all: mode === 'all',
        platform: mode === 'single' ? selectedPlatforms[0] : '',
        platforms: selectedPlatforms
    };
}
// ----------------------------------------

const WEBHOOKS = {
    identifyClient: 'identify-client',
    registerClient: 'register-client',
    sendOauthLink: 'send-oauth-link'
};

// Platform-specific OAuth callback webhook paths (called from manual OAuth form)
const OAUTH_CALLBACK_PATHS = {
    'YT': 'ssm-oauth-callback-youtube',
    'IG': 'ssm-oauth-callback-meta',
    'FB': 'ssm-oauth-callback-meta',
    'LI': 'ssm-oauth-callback-linkedin',
};
let currentClient = JSON.parse(localStorage.getItem('current_client') || localStorage.getItem('currentclient') || 'null');
let dashboardClientRecords = JSON.parse(localStorage.getItem('dashboard_client_records') || '[]');
let isSigningOut = false;
const openAccordionState = {
    activePlatform: '',
    authPlatform: ''
};

function showToast(message, type) {
    const existing = document.getElementById('toast-notification');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'toast-notification';
    toast.textContent = message;
    toast.style.position = 'fixed';
    toast.style.bottom = '32px';
    toast.style.right = '32px';
    toast.style.zIndex = '9999';
    toast.style.background = 'var(--bg-secondary)';
    toast.style.border = type === 'error' ? '1px solid var(--danger)' : '1px solid var(--border-color)';
    toast.style.color = type === 'error' ? 'var(--danger)' : 'var(--text-primary)';
    toast.style.padding = '16px 20px';
    toast.style.borderRadius = 'var(--radius-md)';
    toast.style.fontSize = '0.9rem';
    toast.style.boxShadow = 'var(--shadow-lg)';
    toast.style.transform = 'translateY(16px)';
    toast.style.opacity = '0';
    toast.style.transition = 'transform 0.3s ease, opacity 0.3s ease';

    document.body.appendChild(toast);

    requestAnimationFrame(() => {
        toast.style.transform = 'translateY(0)';
        toast.style.opacity = '1';
    });

    setTimeout(() => {
        toast.style.transform = 'translateY(16px)';
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function showDashboardExitWarning() {
    const existing = document.getElementById('dashboard-exit-warning');
    if (existing) existing.remove();

    const backdrop = document.createElement('div');
    backdrop.id = 'dashboard-exit-warning';
    backdrop.style.cssText = `
        position: fixed; inset: 0; z-index: 9999;
        background: rgba(0,0,0,0.65); backdrop-filter: blur(6px);
        display: flex; align-items: center; justify-content: center;
        opacity: 0; transition: opacity 0.25s ease;
    `;

    const card = document.createElement('div');
    card.style.cssText = `
        background: linear-gradient(160deg, #1a1a1a 0%, #0d0d0d 100%);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 16px; padding: 40px 36px 32px;
        max-width: 400px; width: 90%; text-align: center;
        box-shadow: 0 24px 64px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06);
        transform: scale(0.9) translateY(10px);
        transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease;
        opacity: 0;
    `;

    card.innerHTML = `
        <div style="width:56px; height:56px; margin:0 auto 20px; border-radius:50%;
            background: rgba(239,68,68,0.12); display:flex; align-items:center; justify-content:center;">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
        </div>
        <h3 style="margin:0 0 8px; font-size:1.2rem; font-weight:700; color:#f5f5f5;">
            Hold on!
        </h3>
        <p style="margin:0 0 6px; font-size:0.92rem; color:#a1a1aa; line-height:1.55;">
            You're trying to navigate away from the dashboard.
        </p>
        <p style="margin:0 0 28px; font-size:0.85rem; color:#71717a; line-height:1.5;">
            To leave, please use the <span style="color:#ef4444; font-weight:600;">Sign Out</span> button at the bottom of the dashboard.
        </p>
        <button id="exit-warning-ok-btn" style="
            background: linear-gradient(135deg, #ef4444, #dc2626); color: #fff;
            border: none; border-radius: 10px; padding: 11px 40px;
            font-size: 0.9rem; font-weight: 600; cursor: pointer;
            transition: transform 0.15s, box-shadow 0.15s;
            box-shadow: 0 4px 16px rgba(239,68,68,0.3);
        ">Got it</button>
    `;

    backdrop.appendChild(card);
    document.body.appendChild(backdrop);

    requestAnimationFrame(() => {
        backdrop.style.opacity = '1';
        card.style.opacity = '1';
        card.style.transform = 'scale(1) translateY(0)';
    });

    const dismiss = () => {
        card.style.opacity = '0';
        card.style.transform = 'scale(0.95) translateY(6px)';
        backdrop.style.opacity = '0';
        setTimeout(() => backdrop.remove(), 300);
    };

    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) dismiss(); });
    card.querySelector('#exit-warning-ok-btn').addEventListener('click', dismiss);
    card.querySelector('#exit-warning-ok-btn').addEventListener('mouseenter', (e) => {
        e.target.style.transform = 'scale(1.04)';
        e.target.style.boxShadow = '0 6px 20px rgba(239,68,68,0.45)';
    });
    card.querySelector('#exit-warning-ok-btn').addEventListener('mouseleave', (e) => {
        e.target.style.transform = 'scale(1)';
        e.target.style.boxShadow = '0 4px 16px rgba(239,68,68,0.3)';
    });
}

// --- Networking ---
async function checkN8nStatus() {
    const dots = [document.getElementById('n8n-dot'), document.getElementById('n8n-login-dot')];
    const texts = [document.getElementById('n8n-text'), document.getElementById('n8n-login-text')];

    try {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 3000);
        const res = await fetch(`${N8N_BASE_URL}/healthz`, { signal: controller.signal });
        dots.forEach(d => { if (d) d.style.background = '#30A46C'; });
        texts.forEach(t => { if (t) t.textContent = 'System Online'; });
    } catch (err) {
        try {
            await fetch(N8N_BASE_URL, { mode: 'no-cors' });
            dots.forEach(d => { if (d) d.style.background = '#30A46C'; });
            texts.forEach(t => { if (t) t.textContent = 'System Online'; });
        } catch {
            dots.forEach(d => { if (d) d.style.background = '#E5484D'; });
            texts.forEach(t => { if (t) t.textContent = 'System Offline'; });
        }
    }
}

let latestDashboardSyncRequestId = 0;
const DASHBOARD_SYNC_INTERVAL_MS = 15000;
let dashboardSyncIntervalId = null;
let pendingDashboardSyncTimeoutId = null;
let lastSyncTimestamp = 0;
// --- Firebase Realtime Listener ---
if (typeof firebase !== 'undefined') {
    const dataRef = firebase.database().ref('dashboardData');
    dataRef.on('value', (snapshot) => {
        const data = snapshot.val();
        
        let sheetsArray = null;
        if (Array.isArray(data)) {
            sheetsArray = data;
        } else if (data && Array.isArray(data.sheetsData)) {
            sheetsArray = data.sheetsData;
        } else if (data && data.dashboardData && Array.isArray(data.dashboardData.sheetsData)) {
            sheetsArray = data.dashboardData.sheetsData;
        }

        if (sheetsArray && sheetsArray.length > 0) {
            currentFirebaseSheetData = sheetsArray;
            
            // GLOBAL UI SYNC: Update all views seamlessly in the background
            
            // 1. Silently update all left panel lists (Clients, Status, Token tabs)
            if (typeof refreshLeftClientList === 'function') {
                refreshLeftClientList({ auto: true, silent: true });
            }
            
            // 2. If a client is actively logged into the Dashboard, sync their specific data instantly
            if (typeof currentClient !== 'undefined' && currentClient !== null && !isSigningOut) {
                if (typeof syncClientData === 'function') {
                    syncClientData();
                }
            }
        }
    }, (error) => {
        console.error("Firebase Sync Error:", error);
    });
}

function syncClientDataManual() {
    return syncClientData();
}

function syncClientData() {
    return new Promise(async (resolve) => {
        if (!currentClient) return resolve();

        const clientId = currentClient.client_id || currentClient.clientid || currentClient['Client ID'] || '';
        const email    = currentClient['Email ID'] || currentClient.email || '';
        const phone    = normalizePhone(
            currentClient['Phone Number'] || currentClient.phone || ''
        );

        if (!clientId && (!email || !phone)) return resolve();

        const requestId = ++latestDashboardSyncRequestId;

        try {
            const allRecords = await fetchClientRowsFromGoogleSheet();
            if (requestId !== latestDashboardSyncRequestId) return resolve();

            let rec = allRecords.find(r => r['Client ID'] === clientId);
            if (!rec && phone) {
                rec = allRecords.find(r => normalizePhone(r['Phone Number']) === phone);
            }
            if (!rec && email) {
                rec = allRecords.find(r => normalizeEmail(r['Email ID']) === normalizeEmail(email));
            }

            if (!rec) return resolve();

            const freshId = rec['Client ID'] || clientId;

            const freshClient = {
                ...rec,
                client_id:     freshId,
                name:          rec['Full Name']    || '',
                email:         rec['Email ID']     || '',
                phone:         rec['Phone Number'] || '',
                brand_name:    rec['Brand Name']   || '',
                platforms: (
                    rec['Platforms Active']
                        ? rec['Platforms Active'].split(',').map(s => String(s).trim()).filter(Boolean)
                        : []
                ),
                status:        rec['Status']       || 'active',
                platform_data: currentClient.platform_data || {}
            };

            currentClient = freshClient;
            isSigningOut = false;
            localStorage.setItem('current_client', JSON.stringify(currentClient));

            dashboardClientRecords = allRecords;
            localStorage.setItem('dashboard_client_records', JSON.stringify(dashboardClientRecords));

            if (window.location.hash === '#dashboard' || window.location.hash === '') {
                updateDashboardData(currentClient);
                updatePlatformStatus(currentClient);
                updateAuthStatus(currentClient);
                renderClientList(dashboardClientRecords);
                renderManagePlatformChoices();
            }
            resolve(currentClient);
        } catch (err) {
            console.error('Direct sheet sync failed:', err);
            resolve();
        }
    });
}

function shouldSyncClientData() {
    return Boolean(currentClient && (currentClient.client_id || currentClient.clientid) && document.visibilityState !== 'hidden');
}

function requestClientDataSync(delay = 0) {
    if (!shouldSyncClientData()) return;
    if (pendingDashboardSyncTimeoutId) clearTimeout(pendingDashboardSyncTimeoutId);

    pendingDashboardSyncTimeoutId = setTimeout(() => {
        pendingDashboardSyncTimeoutId = null;
        syncClientData();
    }, delay);
}

function startDashboardAutoSync() {
    return;
}

function stopDashboardAutoSync() {
    if (!dashboardSyncIntervalId) return;
    clearInterval(dashboardSyncIntervalId);
    dashboardSyncIntervalId = null;
}

function refreshClientDataAfterMutation(delay = 1000) {
    return;
}

async function callWebhook(path, payload, onSuccess, onError, setLoading) {
    const resolvedPath = WEBHOOK_PATHS[path] || path;
    if (setLoading) setLoading(true);
    try {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 120000);
        const response = await fetch(`${N8N_BASE_URL}/webhook/${resolvedPath}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache, no-store',
                'Pragma': 'no-cache',
            },
            cache: 'no-store',
            body: JSON.stringify(payload),
            signal: controller.signal,
        });
        const text = await response.text();
        let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }
        if (!response.ok) {
            const message = data.message || data.error || data.raw || `Request failed with status ${response.status}`;
            throw new Error(message);
        }
        onSuccess(data, response.status);
    } catch (err) {
        if (onError) onError(err.message);
    } finally {
        if (setLoading) setLoading(false);
    }
}

function showOutput(id, data, isError) {
    const el = document.getElementById(id);
    if (!el) return;

    // Remove show class and force reflow to ensure animation triggers even if already visible
    el.classList.remove('show');
    void el.offsetWidth; 

    let displayText = data;
    if (typeof data === 'object') {
        displayText = data.message || data.error || (isError ? 'An error occurred.' : 'Action completed successfully.');
    }

    el.classList.add('show');
    el.style.color = isError ? 'var(--danger)' : 'var(--success)';
    el.textContent = displayText;
    scheduleDashboardFeedbackFade(el);
}

function showRegisterModal(title, message, options = {}) {
    const modal = document.getElementById('action-modal');
    const titleEl = document.getElementById('modal-title');
    const descEl = document.getElementById('modal-desc');
    const confirmBtn = document.getElementById('modal-confirm');
    const cancelBtn = document.querySelector('#action-modal .btn-secondary');
    if (!modal || !titleEl || !descEl) return;

    pendingAction = '';
    modal.dataset.registerModal = 'true';
    if (options.keepOpen) modal.dataset.keepOpen = 'true';
    else delete modal.dataset.keepOpen;

    titleEl.textContent = title;
    descEl.textContent = message;

    if (confirmBtn) {
        confirmBtn.disabled = Boolean(options.confirmDisabled);
        confirmBtn.textContent = options.confirmText || 'OK';
        confirmBtn.className = options.confirmClass || 'btn btn-primary';
        confirmBtn.style.display = options.hideConfirm ? 'none' : '';
        confirmBtn.onclick = options.confirmAction || (() => closeRegisterModal(true));
    }

    if (cancelBtn) {
        cancelBtn.disabled = Boolean(options.cancelDisabled);
        cancelBtn.textContent = options.cancelText || 'Close';
        cancelBtn.style.display = options.hideCancel ? 'none' : '';
        cancelBtn.onclick = options.cancelAction || (() => closeRegisterModal(true));
    }

    modal.classList.add('show');
}

function closeRegisterModal(force = false) {
    const modal = document.getElementById('action-modal');
    if (!modal || modal.dataset.registerModal !== 'true') return;
    if (!force && modal.dataset.keepOpen === 'true') return;
    modal.classList.remove('show');
    delete modal.dataset.registerModal;
    delete modal.dataset.keepOpen;
    bindLifecycleConfirmHandler();
}

function scheduleDashboardFeedbackFade(el, delay = 3000) {
    if (!el || !el.closest('#view-dashboard')) return;
    if (el.dataset.fadeTimer) clearTimeout(Number(el.dataset.fadeTimer));
    el.style.transition = 'opacity 0.3s ease';
    el.style.opacity = '1';
    el.dataset.fadeTimer = setTimeout(() => {
        el.style.opacity = '0';
        setTimeout(() => {
            el.classList.remove('show');
            el.style.opacity = '';
            el.textContent = '';
            delete el.dataset.fadeTimer;
        }, 300);
    }, delay);
}

function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[char]));
}

function safeExternalUrl(value) {
    const raw = String(value || '').trim();
    if (!raw || raw === 'N/A') return '';
    const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    try {
        const url = new URL(candidate);
        return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
    } catch {
        return '';
    }
}

function formatCaptionLines(value) {
    if (Array.isArray(value)) return value.map(v => String(v).trim()).filter(Boolean);
    return String(value || '')
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);
}

function renderCaptionLines(value) {
    const lines = formatCaptionLines(value);
    if (!lines.length || (lines.length === 1 && isSheetEmpty(lines[0]))) return 'N/A';
    return lines.map(line => `<span>${escapeHTML(line)}</span>`).join('');
}

function getResponseRecord(data) {
    const rawRec = data.record || data.client_record || (Array.isArray(data) ? data[0] : data) || {};
    return Array.isArray(rawRec) ? (rawRec[0] || {}) : rawRec;
}

function getResponseRecords(data, fallbackRecord = {}) {
    const candidates = [
        data && data.records,
        data && data.clients,
        data && data.client_records,
        data && data.data,
        Array.isArray(data) ? data : null
    ];

    for (const candidate of candidates) {
        if (!Array.isArray(candidate)) continue;
        const records = candidate.filter(item => item && typeof item === 'object');
        if (records.length) return records;
    }

    return fallbackRecord && typeof fallbackRecord === 'object' && Object.keys(fallbackRecord).length
        ? [fallbackRecord]
        : [];
}

function getMatchingClientRecord(records, clientId) {
    const normalizedClientId = normalizeString(clientId);
    if (!normalizedClientId) return null;

    return (records || []).find((record) =>
        normalizeString(getRecordColumnValue(record, 'Client ID', 'client_id', 'clientid')) === normalizedClientId
    ) || null;
}

function getResponseClientId(data, rec, fallback = '') {
    const first = Array.isArray(data) ? (data[0] || {}) : {};
    return rec['Client ID'] || rec.client_id || rec.clientid || data.client_id || data.clientid || first.client_id || first.clientid || fallback || '';
}

// --- Sign Out ---
function signOut() {
    isSigningOut = true;

    // Clear in-memory client
    currentClient = null;
    openAccordionState.activePlatform = '';
    openAccordionState.authPlatform = '';
    stopDashboardAutoSync();
    if (pendingDashboardSyncTimeoutId) {
        clearTimeout(pendingDashboardSyncTimeoutId);
        pendingDashboardSyncTimeoutId = null;
    }

    // Clear all session data from localStorage
    localStorage.removeItem('current_client');
    localStorage.removeItem('currentclient');
    localStorage.removeItem('dashboard_client_records');
    clearRegistrationDraft();

    // Clear dashboard DOM so stale data doesn't persist
    clearDashboardDOM();

    window.location.hash = '#login';
}

function clearDashboardDOM() {
    // Clear platform tags
    const tagsEl = document.getElementById('dash-platform-tags');
    if (tagsEl) tagsEl.textContent = '—';

    // Clear active platforms grid and reset its listener binding
    const activeGrid = document.getElementById('active-platform-grid');
    if (activeGrid) { activeGrid.innerHTML = ''; }

    // Clear auth platforms grid and reset its listener binding
    const authGrid = document.getElementById('auth-platform-grid');
    if (authGrid) { authGrid.innerHTML = ''; }

    // Hide auth success banner
    const authBanner = document.getElementById('auth-success-banner');
    if (authBanner) {
        authBanner.style.display = 'none';
        authBanner.style.visibility = 'hidden';
        authBanner.style.opacity = '0';
    }
    document.querySelectorAll('.auth-inline-status, #dashboard-exit-warning').forEach(el => el.remove());

    // Reset header
    const headerName = document.getElementById('header-client-name');
    if (headerName) headerName.textContent = 'No Client Active';
    const headerInitials = document.getElementById('header-client-initials');
    if (headerInitials) headerInitials.textContent = '--';
}

// --- Router ---
const routes = ['#login', '#register', '#dashboard', '#auth', '#platform', '#analytics', '#lifecycle'];
let registerExitAllowed = false;

function registrationDraftExists() {
    const identity = JSON.parse(localStorage.getItem('draftidentity') || '{}');
    const platforms = JSON.parse(localStorage.getItem('draftplatforms') || '[]');
    const settings = JSON.parse(localStorage.getItem('draftplatformsettings') || '{}');
    return Boolean(identity.name || identity.email || identity.phone || identity.brand || platforms.length || Object.keys(settings).length);
}

function clearRegistrationDraft() {
    localStorage.removeItem('draftidentity');
    localStorage.removeItem('draftplatforms');
    localStorage.removeItem('draftplatformsettings');
    localStorage.removeItem('draftregisterstep');
}

function goToLoginFromRegister(clearDraft = true) {
    registerExitAllowed = true;
    if (clearDraft) clearRegistrationDraft();
    window.location.hash = '#login';
}

function navigate() {
    let hash = window.location.hash || '#login';
    if (!routes.includes(hash)) hash = '#login';

    if (!currentClient && hash === '#login' && !registerExitAllowed && registrationDraftExists()) {
        window.location.hash = '#register';
        return;
    }
    if (hash !== '#login') registerExitAllowed = false;

    if (currentClient && hash === '#login' && !isSigningOut) {
        window.location.hash = '#dashboard';
        showDashboardExitWarning();
        return;
    }

    if (!currentClient && !['#login', '#register'].includes(hash)) {
        window.location.hash = '#login';
        return;
    }

    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(v => v.classList.remove('active'));

    document.getElementById('view-' + hash.substring(1)).classList.add('active');
    const activeNav = document.querySelector(`.nav-item[data-route="${hash}"]`);
    if (activeNav) activeNav.classList.add('active');

    const topbar = document.getElementById('topbar');
    const mainContent = document.getElementById('main-content');

    if (hash === '#login') {
        topbar.style.display = 'none';
        mainContent.style.marginLeft = '0';
        // Clear any leftover dashboard DOM from previous session
        clearDashboardDOM();
        renderClientList(dashboardClientRecords);
        renderStatusList(dashboardClientRecords);
        refreshLeftClientList({ auto: true, silent: dashboardClientRecords.length > 0 });
    } else if (hash === '#register') {
        topbar.style.display = 'none';
        mainContent.style.marginLeft = '0';

        const draft = JSON.parse(localStorage.getItem('draftidentity') || '{}');
        const regEmail = document.getElementById('reg_email');
        const regPhone = document.getElementById('reg_phone');
        
        if (draft.email || draft.phone) {
            document.getElementById('reg_name').value = draft.name || '';
            
            regEmail.value = draft.email || '';
            if (draft.email) {
                regEmail.readOnly = true;
                regEmail.style.opacity = '0.6';
                regEmail.style.cursor = 'not-allowed';
            } else {
                regEmail.readOnly = false;
                regEmail.style.opacity = '1';
                regEmail.style.cursor = 'text';
            }
            
            regPhone.value = draft.phone || '';
            if (draft.phone) {
                regPhone.readOnly = true;
                regPhone.style.opacity = '0.6';
                regPhone.style.cursor = 'not-allowed';
            } else {
                regPhone.readOnly = false;
                regPhone.style.opacity = '1';
                regPhone.style.cursor = 'text';
            }
            
            document.getElementById('reg_brand').value = draft.brand || '';

            const draftPlats = JSON.parse(localStorage.getItem('draftplatforms') || '[]');
            document.querySelectorAll('.platform-card.selectable').forEach(el => {
                if (draftPlats.includes(el.getAttribute('data-plat'))) {
                    el.classList.add('active');
                } else {
                    el.classList.remove('active');
                }
            });
        } else {
            document.getElementById('reg_name').value = '';
            
            regEmail.value = '';
            regEmail.readOnly = false;
            regEmail.style.opacity = '1';
            regEmail.style.cursor = 'text';
            
            regPhone.value = '';
            regPhone.readOnly = false;
            regPhone.style.opacity = '1';
            regPhone.style.cursor = 'text';
            
            document.getElementById('reg_brand').value = '';
            document.querySelectorAll('.platform-card.selectable').forEach(el => el.classList.remove('active'));
        }

        const platContainer = document.getElementById('platform-settings-container');
        if (platContainer) platContainer.innerHTML = '';

        const draftSettings = JSON.parse(localStorage.getItem('draftplatformsettings') || '{}');
        if (Object.keys(draftSettings).length > 0) {
            generatePlatformSettings();
            for (const p in draftSettings) {
                const d = draftSettings[p];
                if (document.getElementById(`reg_${p}_name`)) document.getElementById(`reg_${p}_name`).value = d.name || '';
                if (document.getElementById(`reg_${p}_link`)) document.getElementById(`reg_${p}_link`).value = d.link || '';
                if (document.getElementById(`reg_${p}_niche`)) document.getElementById(`reg_${p}_niche`).value = d.niche || '';
                if (document.getElementById(`reg_${p}_tone`)) document.getElementById(`reg_${p}_tone`).value = d.tone || '';
                if (document.getElementById(`reg_${p}_format`)) document.getElementById(`reg_${p}_format`).value = d.format || '';
                if (document.getElementById(`reg_${p}_emoji`)) document.getElementById(`reg_${p}_emoji`).value = d.emoji || '';
                if (document.getElementById(`reg_${p}_post_time`)) document.getElementById(`reg_${p}_post_time`).value = d.posttime || d.post_time || '';
                if (document.getElementById(`reg_${p}_timezone`)) document.getElementById(`reg_${p}_timezone`).value = d.timezone || 'Asia/Kolkata';
                if (document.getElementById(`reg_${p}_language`)) document.getElementById(`reg_${p}_language`).value = d.language || '';
                if (document.getElementById(`reg_${p}_content_type`)) document.getElementById(`reg_${p}_content_type`).value = d.contenttype || d.content_type || '';
                if (document.getElementById(`reg_${p}_captions`)) {
                    document.getElementById(`reg_${p}_captions`).value = Array.isArray(d.reference_captions)
                        ? d.reference_captions.join('\n')
                        : d.captions || '';
                }
            }
        }

        const savedStep = Number(localStorage.getItem('draftregisterstep') || (Object.keys(draftSettings).length > 0 ? '3' : '1'));
        nextStep(savedStep >= 1 && savedStep <= 3 ? savedStep : 1);

        const dupWarn = document.getElementById('duplicate-warning');
        if (dupWarn) dupWarn.style.display = 'none';

        const resReg = document.getElementById('res-register');
        if (resReg) {
            resReg.classList.remove('show');
            resReg.textContent = '';
        }
    } else {
        topbar.style.display = 'flex';
        mainContent.style.marginLeft = '0';

        // Update header logic
        const displayName = getClientDisplayName();
        document.getElementById('header-client-name').textContent = currentClient ? displayName : 'No Active Client';
        const initialsEl = document.getElementById('header-client-initials');
        if (initialsEl) initialsEl.textContent = currentClient ? getInitials(displayName) : '--';
    }

    if (hash === '#dashboard') {
        // Clear stale DOM before rendering new client data
        clearDashboardDOM();
        renderDashboard();          // render immediately with cached data as placeholder
        updateDashboardData(currentClient);
        renderClientList();
        renderActivePlatforms();
        renderAuthGrid();
        renderManagePlatformChoices(true);
    } else {
        stopDashboardAutoSync();
    }
    if (hash === '#auth') renderAuthGrid();
}

document.querySelectorAll('.nav-item[data-route]').forEach(el => {
    el.addEventListener('click', (e) => {
        window.location.hash = e.target.getAttribute('data-route');
    });
});
window.addEventListener('hashchange', navigate);

// --- Back-button / gesture interception ---
// Push an extra history entry so "back" stays on this page and triggers popstate
(function trapBackButton() {
    history.pushState({ dashboardTrap: true }, '');

    window.addEventListener('popstate', (e) => {
        if (currentClient && !isSigningOut) {
            // User pressed back while logged in — block and show warning
            history.pushState({ dashboardTrap: true }, '');
            showDashboardExitWarning();
        }
    });
})();

// Fallback: if user tries to close the tab or navigate to a different URL entirely
window.addEventListener('beforeunload', (e) => {
    if (currentClient && !isSigningOut) {
        e.preventDefault();
        e.returnValue = '';
    }
});

function writeClipboardText(text) {
    if (navigator.clipboard && window.isSecureContext) {
        return navigator.clipboard.writeText(text);
    }

    return new Promise((resolve, reject) => {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();

        try {
            const ok = document.execCommand('copy');
            document.body.removeChild(textarea);
            ok ? resolve() : reject(new Error('Copy failed'));
        } catch (err) {
            document.body.removeChild(textarea);
            reject(err);
        }
    });
}

const CLIENT_COPY_ICON = `
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
        <path d="M7 14V4.8C7 3.8 7.8 3 8.8 3H15" stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round"></path>
        <rect x="10" y="7" width="9" height="14" rx="1.6" stroke-width="2.7"></rect>
    </svg>
`;
const CLIENT_COPY_CHECK_ICON = `
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
        <path d="M6 12.5l4 4L18 7.5" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></path>
    </svg>
`;
const CLIENT_COPY_ERROR_ICON = `
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
        <path d="M12 7v6" stroke-width="2.2" stroke-linecap="round"></path>
        <path d="M12 17h.01" stroke-width="2.8" stroke-linecap="round"></path>
    </svg>
`;

let currentTokenFilter = 'all';
let currentStatusFilter = 'all';
let currentClientsSort = 'default';

document.addEventListener('click', (event) => {
    const refreshButton = event.target.closest('#left-client-refresh-btn');
    if (refreshButton) {
        refreshLeftClientList({ refreshTab: currentLeftTab });
        return;
    }

    const statusFilterBtn = event.target.closest('#status-filter-btn');
    if (statusFilterBtn) {
        const dropdown = document.getElementById('status-filter-dropdown');
        if (dropdown) dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
        return;
    }

    const statusFilterOpt = event.target.closest('.status-filter-opt');
    if (statusFilterOpt) {
        currentStatusFilter = statusFilterOpt.getAttribute('data-val') || 'all';
        const dropdown = document.getElementById('status-filter-dropdown');
        if (dropdown) dropdown.style.display = 'none';
        
        document.querySelectorAll('.status-filter-opt').forEach(el => el.style.background = 'transparent');
        statusFilterOpt.style.background = 'rgba(255,255,255,0.1)';
        
        if (typeof renderStatusList === 'function') {
            renderStatusList();
        }
        return;
    }

    const statusDropdown = document.getElementById('status-filter-dropdown');
    if (statusDropdown && statusDropdown.style.display !== 'none' && !event.target.closest('#status-filter-btn')) {
        statusDropdown.style.display = 'none';
    }

    const filterBtn = event.target.closest('#token-filter-btn');
    if (filterBtn) {
        const dropdown = document.getElementById('token-filter-dropdown');
        if (dropdown) dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
        return;
    }

    const filterOpt = event.target.closest('.token-filter-opt');
    if (filterOpt) {
        currentTokenFilter = filterOpt.getAttribute('data-val') || 'all';
        const dropdown = document.getElementById('token-filter-dropdown');
        if (dropdown) dropdown.style.display = 'none';
        
        document.querySelectorAll('.token-filter-opt').forEach(el => el.style.background = 'transparent');
        filterOpt.style.background = 'rgba(255,255,255,0.1)';
        
        if (typeof renderTokenList === 'function') {
            renderTokenList();
        }
        return;
    }

    const dropdown = document.getElementById('token-filter-dropdown');
    if (dropdown && dropdown.style.display !== 'none' && !event.target.closest('#token-filter-btn')) {
        dropdown.style.display = 'none';
    }

    const clientsSortBtn = event.target.closest('#clients-sort-btn');
    if (clientsSortBtn) {
        const dd = document.getElementById('clients-sort-dropdown');
        if (dd) dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
        return;
    }

    const clientsSortOpt = event.target.closest('.clients-sort-opt');
    if (clientsSortOpt) {
        currentClientsSort = clientsSortOpt.getAttribute('data-val') || 'default';
        const dd = document.getElementById('clients-sort-dropdown');
        if (dd) dd.style.display = 'none';
        
        document.querySelectorAll('.clients-sort-opt').forEach(el => {
            el.style.background = 'transparent';
            el.style.color = 'var(--text-secondary)';
        });
        clientsSortOpt.style.background = 'rgba(255,255,255,0.1)';
        clientsSortOpt.style.color = '#fff';
        
        if (typeof renderClientList === 'function') {
            renderClientList();
        }
        return;
    }

    const clientsDropdown = document.getElementById('clients-sort-dropdown');
    if (clientsDropdown && clientsDropdown.style.display !== 'none' && !event.target.closest('#clients-sort-btn')) {
        clientsDropdown.style.display = 'none';
    }

    const copyButton = event.target.closest('[data-copy-client-id]');
    if (!copyButton) return;

    const clientId = copyButton.getAttribute('data-copy-client-id') || '';
    if (!clientId || clientId === '—') return;

    writeClipboardText(clientId).then(() => {
        copyButton.innerHTML = CLIENT_COPY_CHECK_ICON;
        copyButton.classList.add('is-copied');
        setTimeout(() => {
            copyButton.innerHTML = CLIENT_COPY_ICON;
            copyButton.classList.remove('is-copied');
        }, 1500);
    }).catch(() => {
        copyButton.innerHTML = CLIENT_COPY_ERROR_ICON;
        copyButton.classList.add('is-error');
        setTimeout(() => {
            copyButton.innerHTML = CLIENT_COPY_ICON;
            copyButton.classList.remove('is-error');
        }, 1500);
    });
});

// --- Left Panel Tabs ---
let currentLeftTab = 'clients';
function setLeftTab(tab) {
    currentLeftTab = tab;
    const tabs = ['clients', 'status', 'token'];
    tabs.forEach(t => {
        const el = document.getElementById(`left-tab-${t}`);
        const content = document.getElementById(`left-content-${t}`);
        if (t === tab) {
            if (el) {
                el.style.background = '#1a1a1a';
                el.style.color = '#fff';
                el.style.border = '1px solid rgba(255,255,255,0.05)';
            }
            if (content) content.style.display = 'block';
        } else {
            if (el) {
                el.style.background = 'transparent';
                el.style.color = '#888';
                el.style.border = '1px solid transparent';
            }
            if (content) content.style.display = 'none';
        }
    });
}

// --- Identify (Login) ---
function forceRegister() {
    clearRegistrationDraft();
    localStorage.setItem('draftidentity', JSON.stringify({}));
    localStorage.setItem('draftregisterstep', '1');
    registerExitAllowed = false;
    window.location.hash = '#register';
}

let currentLoginMethod = 'details';
function setLoginMethod(method) {
    const res = document.getElementById('res-identify');
    if (res) res.classList.remove('show');

    currentLoginMethod = method;
    const tabId = document.getElementById('tab-id');
    const tabDetails = document.getElementById('tab-details');

    if (method === 'id') {
        tabId.style.background = 'var(--bg-secondary)';
        tabId.style.color = 'var(--text-primary)';
        tabId.style.boxShadow = 'var(--shadow-sm)';
        tabDetails.style.background = 'transparent';
        tabDetails.style.color = 'var(--text-secondary)';
        tabDetails.style.boxShadow = 'none';
        document.getElementById('method-id').style.display = 'block';
        document.getElementById('method-details').style.display = 'none';

        // Clear details fields
        document.getElementById('id_email').value = '';
        document.getElementById('id_phone').value = '';
        document.getElementById('id_email').required = false;
        document.getElementById('id_phone').required = false;
        document.getElementById('id_client_id').required = true;

    } else {
        tabDetails.style.background = 'var(--bg-secondary)';
        tabDetails.style.color = 'var(--text-primary)';
        tabDetails.style.boxShadow = 'var(--shadow-sm)';
        tabId.style.background = 'transparent';
        tabId.style.color = 'var(--text-secondary)';
        tabId.style.boxShadow = 'none';
        document.getElementById('method-details').style.display = 'block';
        document.getElementById('method-id').style.display = 'none';

        // Clear ID field
        document.getElementById('id_client_id').value = '';
        document.getElementById('id_client_id').required = false;
        document.getElementById('id_email').required = true;
        document.getElementById('id_phone').required = true;
    }
}

document.getElementById('form-identify').addEventListener('submit', (e) => {
    e.preventDefault();

    // Clear previous error state to provide visual feedback on "Continue" click
    const resIdentify = document.getElementById('res-identify');
    if (resIdentify) {
        resIdentify.classList.remove('show');
        resIdentify.textContent = '';
    }

    const email = document.getElementById('id_email').value;
    const phone = document.getElementById('id_phone').value;
    const clientId = document.getElementById('id_client_id').value;

    if (currentLoginMethod === 'id') {
        if (!clientId) {
            showOutput('res-identify', 'Please provide a Client ID.', true);
            return;
        }
    } else {
        if (!email || !phone || phone.length !== 10) {
            showOutput('res-identify', 'Both Email and a 10-digit Phone number are required to verify identity.', true);
            return;
        }
    }

    const submitBtn = e.target.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    const payload = {
        client_id: document.getElementById('id_client_id').value,
        email: normalizeEmail(document.getElementById('id_email').value),
        phone: normalizePhone(document.getElementById('id_phone').value)
    };

    const setLoad = (b) => {
        document.getElementById('loading-identify').style.display = b ? 'flex' : 'none';
        if (!b && submitBtn) submitBtn.disabled = false;
    };
    callWebhook('identify-client', payload, (data) => {
        const status = data.status || data.raw;
        const rec = getResponseRecord(data);
        const currentStatus = (rec['Status'] || status || '').toUpperCase();

        if (currentStatus === 'MISSING_FIELDS') {
            showOutput('res-identify', 'Error: Missing required fields. Please provide Email or Phone.', true);
            return;
        }

        if (currentStatus === 'WRONG_INPUT') {
            showOutput('res-identify', 'The entered details do not match our records.', true);
            return;
        }

        if (currentStatus === 'NO_MATCH' || currentStatus === 'NOMATCH') {
            if (currentLoginMethod === 'id') {
                showOutput('res-identify', 'The entered details do not match our records.', true);
            } else {
                // If neither email nor mobile matches, redirect to onboarding
                const el = document.getElementById('res-identify');
                if (el) el.classList.remove('show');
                localStorage.setItem('draftidentity', JSON.stringify(payload));
                window.location.hash = '#register';
            }
            return;
        }

        if (status === 'DUPLICATE') {
            showOutput('res-identify', 'Warning: Duplicate account detected. Proceeding to dashboard.', false);
        } else {
            const el = document.getElementById('res-identify');
            if (el) el.classList.remove('show');
        }

        // FOUND or DUPLICATE — store full response and go to dashboard
        const clientId = getResponseClientId(data, rec, payload.client_id || '');
        if (!clientId) {
            showOutput('res-identify', data.message || data.error || 'Client lookup did not return a Client ID.', true);
            return;
        }
        currentClient = {
            ...rec,
            client_id: clientId,
            name: rec['Full Name'] || data.name || data.full_name || payload.name || '',
            email: rec['Email ID'] || data.email || payload.email || '',
            phone: rec['Phone Number'] || data.phone || payload.phone || '',
            brand_name: rec['Brand Name'] || data.brand_name || '',
            platforms: (rec['Platforms Active'] ? rec['Platforms Active'].split(',').map(s => s.trim()).filter(Boolean) : null)
                || data.platforms || [],
            status: rec['Status'] || data.status || 'active',
            platform_data: data.platform_data || {}
        };
        isSigningOut = false;
        openAccordionState.activePlatform = '';
        openAccordionState.authPlatform = '';
        localStorage.setItem('current_client', JSON.stringify(currentClient));
        dashboardClientRecords = [currentClient];
        localStorage.setItem('dashboard_client_records', JSON.stringify(dashboardClientRecords));

        // Immediate redirection on success
        window.location.hash = '#dashboard';
    }, (err) => showOutput('res-identify', err, true), setLoad);
});

// --- Registration ---
function validateStep1() {
    const name = document.getElementById('reg_name');
    const email = document.getElementById('reg_email');
    const phone = document.getElementById('reg_phone');
    const brand = document.getElementById('reg_brand');

    if (!name.value) return name.reportValidity();
    if (!email.value) return email.reportValidity();
    if (!phone.value) return phone.reportValidity();
    if (!brand.value) return brand.reportValidity();

    if (!email.checkValidity()) return email.reportValidity();
    if (!phone.checkValidity()) return phone.reportValidity();

    const payload = {
        email: email.value,
        phone: phone.value
    };

    // Clear any previous response/error messages in registration
    const resReg = document.getElementById('res-register');
    if (resReg) {
        resReg.classList.remove('show');
        resReg.textContent = '';
    }

    const btn = document.querySelector('#reg-step-1 .btn-primary');
    const originalText = btn ? btn.textContent : 'Next';

    const setLoad = (b) => {
        if (btn) {
            btn.disabled = b;
            btn.textContent = b ? 'Checking...' : originalText;
        }
        document.getElementById('loading-register').style.display = 'none';
        const statusText = document.getElementById('reg-status-text');
        if (b) {
            statusText.textContent = 'Checking for existing client records...';
            statusText.style.display = 'block';
            showRegisterModal('Checking Client Records', 'Checking for existing client records...', {
                hideConfirm: true,
                hideCancel: true,
                confirmDisabled: true,
                cancelDisabled: true
            });
        } else {
            statusText.textContent = '';
            closeRegisterModal(false);
        }
    };

    callWebhook('identify-client', payload, (data) => {
        const status = data.status || data.raw;

        if (document.getElementById('conflict-msg')) {
            document.getElementById('conflict-msg').remove();
        }

        if (status === 'NOMATCH' || status === 'NO_MATCH') {
            document.getElementById('duplicate-warning').style.display = 'none';
            closeRegisterModal(true);
            nextStep(2);
        } else if (status === 'STRONGMATCH' || status === 'MEDIUMMATCH') {
            document.getElementById('duplicate-warning').style.display = 'none';
            showRegisterModal('Duplicate Record Found', 'An account with these details already exists. Please return to the login screen and use Client Details to authenticate.', {
                keepOpen: true,
                confirmText: 'Go to Login',
                cancelText: 'Close',
                confirmAction: () => {
                    closeRegisterModal(true);
                    goToLoginFromRegister(true);
                }
            });
        } else if (status === 'CONFLICT') {
            document.getElementById('duplicate-warning').style.display = 'none';
            showRegisterModal('Conflicting Records Found', 'Conflicting records were found. Contact Rynex Agency before continuing.', {
                keepOpen: true,
                hideConfirm: true,
                cancelText: 'Close'
            });
        } else {
            // Fallback for DUPLICATE/FOUND
            document.getElementById('duplicate-warning').style.display = 'none';
            showRegisterModal('Duplicate Record Found', 'An account with these details already exists. Please return to the login screen and use Client Details to authenticate.', {
                keepOpen: true,
                confirmText: 'Go to Login',
                cancelText: 'Close',
                confirmAction: () => {
                    closeRegisterModal(true);
                    goToLoginFromRegister(true);
                }
            });
        }
    }, (err) => {
        // Fail open: proceed to step 2 on network error
        if (document.getElementById('conflict-msg')) document.getElementById('conflict-msg').remove();
        document.getElementById('duplicate-warning').style.display = 'none';
        closeRegisterModal(true);
        nextStep(2);
    }, setLoad);
}

function nextStep(step) {
    localStorage.setItem('draftregisterstep', String(step));
    document.querySelectorAll('[id^="reg-step-"]').forEach(el => el.style.display = 'none');
    document.getElementById('reg-step-' + step).style.display = 'block';

    // Clear platform selection error when navigating away from any step
    const platErr = document.getElementById('platform-error-msg');
    if (platErr) platErr.classList.remove('show');

    document.querySelectorAll('.step-indicator').forEach((el, i) => {
        if (i < step - 1) { el.classList.add('completed'); el.classList.remove('active'); }
        else if (i === step - 1) { el.classList.add('active'); el.classList.remove('completed'); }
        else { el.classList.remove('active', 'completed'); }
    });
}

function generatePlatformSettings() {
    const container = document.getElementById('platform-settings-container');
    container.innerHTML = '';
    const selected = Array.from(document.querySelectorAll('#reg-step-2 .platform-card.active')).map(el => el.getAttribute('data-plat'));

    const step2 = document.getElementById('reg-step-2');
    if (step2 && step2.style.display !== 'none') {
        const errorMsg = document.getElementById('platform-error-msg');
        if (selected.length === 0) {
            if (errorMsg) {
                errorMsg.classList.remove('show');
                void errorMsg.offsetWidth; 
                errorMsg.classList.add('show');
            }
            return;
        } else {
            if (errorMsg) errorMsg.classList.remove('show');
        }
    }

    const platformNames = { 'YT': 'Youtube', 'IG': 'Instagram', 'FB': 'Facebook', 'LI': 'LinkedIn' };
    selected.forEach(p => {
        const fullName = platformNames[p] || p;
        container.innerHTML += `
          <h3 style="margin-bottom:12px; margin-top:32px; color:var(--text-primary);">${fullName}</h3>
          <div class="card platform-setting-block" data-plat="${p}" style="margin-bottom:16px; border-top: 1px solid var(--border-color);">
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px;">
              <div class="form-group"><label>Name</label><input type="text" id="reg_${p}_name" placeholder="e.g. ${fullName} official page" required></div>
              <div class="form-group"><label>Link</label><input type="url" id="reg_${p}_link" placeholder="https://example.com/profile" required></div>
              <div class="form-group"><label>Niche</label><input type="text" id="reg_${p}_niche" placeholder="e.g. Fitness coaching" required></div>
              <div class="form-group"><label>Tone</label><input type="text" id="reg_${p}_tone" placeholder="e.g. Friendly, expert, concise" required></div>
              <div class="form-group"><label>Format</label><input type="text" id="reg_${p}_format" placeholder="e.g. Reel, carousel, short post" required></div>
              <div class="form-group"><label>Emoji</label><input type="text" id="reg_${p}_emoji" placeholder="e.g. Minimal, brand-safe" required></div>
              <div class="form-group"><label>Post Time</label><input type="text" id="reg_${p}_post_time" placeholder="e.g. 14:30" inputmode="text" required></div>
              <div class="form-group"><label>Timezone</label><input type="text" id="reg_${p}_timezone" value="Asia/Kolkata" required></div>
              <div class="form-group"><label>Language</label><input type="text" id="reg_${p}_language" placeholder="e.g. English" required></div>
              <div class="form-group"><label>Content Type</label><input type="text" id="reg_${p}_content_type" placeholder="e.g. Educational + promotional" required></div>
              <div class="form-group" style="grid-column: span 2;"><label>Reference Captions (one per line)</label><textarea id="reg_${p}_captions" rows="3" placeholder="Example caption one&#10;Example caption two&#10;Example caption three" required></textarea></div>
            </div>
          </div>
        `;
    });

    container.querySelectorAll('input, select, textarea').forEach(el => {
        el.addEventListener('input', saveDraftPlatformSettings);
    });

    const draftSettings = JSON.parse(localStorage.getItem('draftplatformsettings') || '{}');
    if (Object.keys(draftSettings).length > 0) {
        for (const p in draftSettings) {
            const d = draftSettings[p];
            if (document.getElementById(`reg_${p}_name`)) document.getElementById(`reg_${p}_name`).value = d.name || '';
            if (document.getElementById(`reg_${p}_link`)) document.getElementById(`reg_${p}_link`).value = d.link || '';
            if (document.getElementById(`reg_${p}_niche`)) document.getElementById(`reg_${p}_niche`).value = d.niche || '';
            if (document.getElementById(`reg_${p}_tone`)) document.getElementById(`reg_${p}_tone`).value = d.tone || '';
            if (document.getElementById(`reg_${p}_format`)) document.getElementById(`reg_${p}_format`).value = d.format || '';
            if (document.getElementById(`reg_${p}_emoji`)) document.getElementById(`reg_${p}_emoji`).value = d.emoji || '';
            if (document.getElementById(`reg_${p}_post_time`)) document.getElementById(`reg_${p}_post_time`).value = d.posttime || d.post_time || '';
            if (document.getElementById(`reg_${p}_timezone`)) document.getElementById(`reg_${p}_timezone`).value = d.timezone || 'Asia/Kolkata';
            if (document.getElementById(`reg_${p}_language`)) document.getElementById(`reg_${p}_language`).value = d.language || '';
            if (document.getElementById(`reg_${p}_content_type`)) document.getElementById(`reg_${p}_content_type`).value = d.contenttype || d.content_type || '';
            if (document.getElementById(`reg_${p}_captions`)) {
                document.getElementById(`reg_${p}_captions`).value = Array.isArray(d.reference_captions)
                    ? d.reference_captions.join('\n')
                    : d.captions || '';
            }
        }
    }

    nextStep(3);
}

function parseReferenceCaptions(rawValue, platform = '') {
    const raw = String(rawValue || '').trim();
    if (!raw) return [];

    const tryParseArray = (value) => {
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : null;
        } catch (err) {
            return null;
        }
    };

    const embeddedArray = raw.match(/"reference_captions"\s*:\s*(\[[\s\S]*?\])/i);
    const parsed = tryParseArray(embeddedArray ? embeddedArray[1] : raw);
    if (parsed) {
        return parsed.map(item => String(item).trim()).filter(Boolean);
    }

    const platformPattern = platform ? new RegExp(`^${platform}\\s*[:=-]\\s*`, 'i') : null;
    return raw
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line && line !== '[' && line !== ']')
        .filter(line => !/^"?reference_captions"?\s*:?$/i.test(line))
        .map(line => line.replace(/,$/, '').trim())
        .map(line => line.replace(/^["']|["']$/g, '').trim())
        .map(line => platformPattern ? line.replace(platformPattern, '').trim() : line)
        .filter(Boolean);
}

function getRegistrationPlatformBlocks() {
    return Array.from(document.querySelectorAll('#platform-settings-container .platform-setting-block[data-plat]'));
}

function getRegistrationPayloadPlatforms() {
    const visiblePlatforms = getRegistrationPlatformBlocks()
        .map(block => block.getAttribute('data-plat'))
        .filter(Boolean);

    return visiblePlatforms.length > 0
        ? visiblePlatforms
        : Array.from(document.querySelectorAll('#reg-step-2 .platform-card.active')).map(el => el.getAttribute('data-plat'));
}

document.getElementById('form-register').addEventListener('submit', (e) => {
    e.preventDefault();

    // Clear previous error state
    const resReg = document.getElementById('res-register');
    if (resReg) {
        resReg.classList.remove('show');
        resReg.textContent = '';
    }

    if (document.getElementById('reg-step-3').style.display === 'none') {
        if (document.getElementById('reg-step-1').style.display !== 'none') {
            validateStep1();
        } else if (document.getElementById('reg-step-2').style.display !== 'none') {
            generatePlatformSettings();
        }
        return;
    }

    const selected = getRegistrationPayloadPlatforms();

    let incompletePlatform = null;
    let incompleteField = null;
    for (const p of selected) {
        const fields = ['name', 'link', 'niche', 'tone', 'format', 'emoji', 'post_time', 'timezone', 'language', 'content_type', 'captions'];
        for (const f of fields) {
            const el = document.getElementById(`reg_${p}_${f}`);
            if (!el || !el.value.trim()) {
                incompletePlatform = p;
                incompleteField = el ? el.previousElementSibling.textContent : f;
                break;
            }
        }
        if (incompletePlatform) break;
    }

    if (incompletePlatform) {
        showOutput('res-register', `Warning: ${incompletePlatform} Settings is incomplete. Missing field: ${incompleteField}`, true);
        return;
    }
    else {
        const el = document.getElementById('res-register');
        if (el) el.classList.remove('show');
    }

    const per_platform = {};

    selected.forEach(p => {
        const caps = document.getElementById(`reg_${p}_captions`).value;
        per_platform[p] = {
            name: document.getElementById(`reg_${p}_name`).value,
            link: document.getElementById(`reg_${p}_link`).value,
            niche: document.getElementById(`reg_${p}_niche`).value,
            tone: document.getElementById(`reg_${p}_tone`).value,
            format: document.getElementById(`reg_${p}_format`).value,
            emoji: document.getElementById(`reg_${p}_emoji`).value,
            post_time: document.getElementById(`reg_${p}_post_time`).value,
            timezone: document.getElementById(`reg_${p}_timezone`).value,
            language: document.getElementById(`reg_${p}_language`).value,
            content_type: document.getElementById(`reg_${p}_content_type`).value,
            reference_captions: parseReferenceCaptions(caps, p)
        };
    });

    const payload = {
        full_name: document.getElementById('reg_name').value,
        email: document.getElementById('reg_email').value,
        phone: document.getElementById('reg_phone').value,
        brand_name: document.getElementById('reg_brand').value,
        platforms: selected,
        per_platform
    };

    const submitBtn = e.target.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    const setLoad = (b) => {
        document.getElementById('loading-register').style.display = 'none';
        const statusText = document.getElementById('reg-status-text');
        if (b) {
            statusText.textContent = 'Your account is being created...';
            statusText.style.display = 'block';
            showRegisterModal('Creating Account', 'Your account is being created. Please wait...', {
                hideConfirm: true,
                hideCancel: true,
                confirmDisabled: true,
                cancelDisabled: true
            });
        } else {
            statusText.textContent = '';
            closeRegisterModal(false);
        }
        if (!b && submitBtn) submitBtn.disabled = false;
    };

    callWebhook('register-client', payload, (data, code) => {
        const status = data.status || data.raw;

        if (status === 'DUPLICATE' || data.message === 'Duplicate record found.') {
            document.getElementById('duplicate-warning').style.display = 'none';
            setLoad(false);
            showRegisterModal('Duplicate Record Found', 'An account with these details already exists. Please return to the login screen and use Client Details to authenticate.', {
                keepOpen: true,
                confirmText: 'Go to Login',
                cancelText: 'Close',
                confirmAction: () => {
                    closeRegisterModal(true);
                    goToLoginFromRegister(true);
                }
            });
            const el = document.getElementById('res-register');
            if (el) el.classList.remove('show');
            return;
        } else {
            document.getElementById('duplicate-warning').style.display = 'none';
        }

        const msg = (Array.isArray(data) ? (data[0]?.message) : data.message) || '';
        if (code === 201 || msg.toLowerCase().includes('registered') || (Array.isArray(data) && data[0]?.client_id)) {
            const rec = getResponseRecord(data);
            const clientId = getResponseClientId(data, rec);
            if (!clientId) {
                setLoad(false);
                showOutput('res-register', 'Registration completed but no Client ID was returned.', true);
                return;
            }
            currentClient = {
                ...rec,
                clientid: clientId,
                client_id: clientId,
                fullname: payload.full_name,
                name: payload.full_name,
                email: payload.email,
                phone: payload.phone,
                brandname: payload.brand_name,
                platforms: payload.platforms || [],
                status: 'active'
            };
            isSigningOut = false;
            openAccordionState.activePlatform = '';
            openAccordionState.authPlatform = '';
            localStorage.setItem('currentclient', JSON.stringify(currentClient));
            localStorage.setItem('current_client', JSON.stringify(currentClient)); // Safety copy for existing code
            dashboardClientRecords = [currentClient];
            localStorage.setItem('dashboard_client_records', JSON.stringify(dashboardClientRecords));
            clearRegistrationDraft();
            refreshClientDataAfterMutation();

            setLoad(false);
            closeRegisterModal(true);
            const popupClientId = document.getElementById('popup-client-id');
            if (popupClientId) popupClientId.textContent = clientId;
            const successModal = document.getElementById('success-modal');
            if (successModal) {
                successModal.classList.add('show');
                setTimeout(() => {
                    successModal.classList.remove('show');
                    window.location.hash = '#dashboard';
                }, 2500);
            } else {
                window.location.hash = '#dashboard';
            }
        } else {
            setLoad(false);
            showOutput('res-register', data, true);
        }
    }, (err) => {
        setLoad(false);
        showOutput('res-register', 'Connection failed. Please check n8n is running.', true);
    }, setLoad);
});

// Prefill Register from Identity
window.addEventListener('load', () => {
    checkN8nStatus();
    const draft = JSON.parse(localStorage.getItem('draftidentity') || '{}');
    if (draft.email) document.getElementById('reg_email').value = draft.email;
    if (draft.phone) document.getElementById('reg_phone').value = draft.phone;
    if (draft.name) document.getElementById('reg_name').value = draft.name;
    navigate();
});

// --- Draft Saving Logic ---
function saveDraftIdentity() {
    localStorage.setItem('draftidentity', JSON.stringify({
        name: document.getElementById('reg_name').value,
        email: document.getElementById('reg_email').value,
        phone: document.getElementById('reg_phone').value,
        brand: document.getElementById('reg_brand').value
    }));
}

function saveDraftPlatforms() {
    const activePlats = Array.from(document.querySelectorAll('#reg-step-2 .platform-card.selectable.active')).map(el => el.getAttribute('data-plat'));
    localStorage.setItem('draftplatforms', JSON.stringify(activePlats));
}

function saveDraftPlatformSettings() {
    const draft = {};
    const activePlats = Array.from(document.querySelectorAll('#reg-step-2 .platform-card.selectable.active')).map(el => el.getAttribute('data-plat'));

    document.querySelectorAll('.platform-setting-block').forEach(block => {
        const p = block.getAttribute('data-plat');
        if (activePlats.includes(p)) {
            draft[p] = {
                name: document.getElementById(`reg_${p}_name`) ? document.getElementById(`reg_${p}_name`).value : '',
                link: document.getElementById(`reg_${p}_link`) ? document.getElementById(`reg_${p}_link`).value : '',
                niche: document.getElementById(`reg_${p}_niche`) ? document.getElementById(`reg_${p}_niche`).value : '',
                tone: document.getElementById(`reg_${p}_tone`) ? document.getElementById(`reg_${p}_tone`).value : '',
                format: document.getElementById(`reg_${p}_format`) ? document.getElementById(`reg_${p}_format`).value : '',
                emoji: document.getElementById(`reg_${p}_emoji`) ? document.getElementById(`reg_${p}_emoji`).value : '',
                posttime: document.getElementById(`reg_${p}_post_time`) ? document.getElementById(`reg_${p}_post_time`).value : '',
                timezone: document.getElementById(`reg_${p}_timezone`) ? document.getElementById(`reg_${p}_timezone`).value : '',
                language: document.getElementById(`reg_${p}_language`) ? document.getElementById(`reg_${p}_language`).value : '',
                contenttype: document.getElementById(`reg_${p}_content_type`) ? document.getElementById(`reg_${p}_content_type`).value : '',
                captions: document.getElementById(`reg_${p}_captions`) ? document.getElementById(`reg_${p}_captions`).value : ''
            };
        }
    });

    const existingDraft = JSON.parse(localStorage.getItem('draftplatformsettings') || '{}');
    activePlats.forEach(p => {
        if (!draft[p] && existingDraft[p]) {
            draft[p] = existingDraft[p];
        }
    });
    localStorage.setItem('draftplatformsettings', JSON.stringify(draft));
}

['reg_name', 'reg_email', 'reg_phone', 'reg_brand'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', saveDraftIdentity);
});

const getVal = (possibleKeys) => {
    if (!currentClient) return null;
    const searchObjs = [currentClient];
    if (currentClient.platform_data) searchObjs.push(currentClient.platform_data);
    if (currentClient.platformdata) searchObjs.push(currentClient.platformdata);

    for (const obj of searchObjs) {
        if (!obj || typeof obj !== 'object') continue;
        const keys = Object.keys(obj);
        for (const pk of possibleKeys) {
            const lowerPk = pk.toLowerCase().replace(/[^a-z0-9]/g, '');
            for (const k of keys) {
                const lowerK = k.toLowerCase().replace(/[^a-z0-9]/g, '');
                if (lowerPk === lowerK) {
                    const val = obj[k];
                    if (val !== undefined && val !== null && val !== '' && val !== '—' && val !== 'N/A') return val;
                }
            }
        }
    }
    return null;
};

const getClientColumnValue = (columnName) => {
    if (!currentClient || typeof currentClient !== 'object') return '';
    const targetKey = columnName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const sourceKey = Object.keys(currentClient).find((key) =>
        key.toLowerCase().replace(/[^a-z0-9]/g, '') === targetKey
    );
    if (!sourceKey) return '';
    const value = currentClient[sourceKey];
    if (value === undefined || value === null || value === '' || value === '—' || value === 'N/A') return '';
    return value;
};

const getRecordColumnValue = (record, columnName, ...fallbacks) => {
    if (!record || typeof record !== 'object') return '';
    const possibleKeys = [columnName, ...fallbacks];
    const keys = Object.keys(record);

    for (const possibleKey of possibleKeys) {
        const targetKey = String(possibleKey).toLowerCase().replace(/[^a-z0-9]/g, '');
        const sourceKey = keys.find((key) =>
            key.toLowerCase().replace(/[^a-z0-9]/g, '') === targetKey
        );
        if (!sourceKey) continue;
        const value = record[sourceKey];
        if (value !== undefined && value !== null && value !== '' && value !== 'â€”' && value !== 'N/A') return value;
    }
    return '';
};

const getClientDisplayName = () => {
    if (!currentClient) return '';
    return currentClient['Full Name'] || currentClient.fullname || currentClient.full_name || currentClient.name || currentClient.email || '';
};

const getInitials = (name) => {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return '--';
};

// --- Dashboard ---
// Helper: resolve a field by trying exact sheet column name first, then fallback keys
function getField(sheetCol, ...fallbacks) {
    const allKeys = [sheetCol, ...fallbacks];
    for (const key of allKeys) {
        const val = currentClient[key];
        if (val !== undefined && val !== null && val !== '' && val !== '—' && val !== 'N/A') return val;
    }
    return getClientColumnValue(sheetCol) || '';
}

function formatDashboardDateTime(value) {
    const raw = String(value || '').trim();
    if (!raw || raw === 'â€”' || raw === '—' || raw === 'N/A') return '';

    const timeFirst = raw.match(/^(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)\s*(?:-|,|\s)\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})$/i);
    if (timeFirst) return `${timeFirst[2]} - ${timeFirst[1]}`;

    const date = raw.match(/\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/);
    const time = raw.match(/\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?/i);
    if (date && time && time.index < date.index) {
        return `${date[0]} - ${time[0]}`;
    }

    return raw;
}

function renderDashboard() {
    if (!currentClient) return;

    // ── Update header with current client name ──
    const displayName = getClientDisplayName();
    const headerName = document.getElementById('header-client-name');
    if (headerName) headerName.textContent = displayName || 'No Client Active';
    const headerInitials = document.getElementById('header-client-initials');
    if (headerInitials) headerInitials.textContent = displayName ? getInitials(displayName) : '--';

    // ── Stats Grid ──
    const clientId = getField('Client ID', 'client_id', 'clientid');
    const brand = getField('Brand Name', 'brand_name', 'brandname');
    const status = getField('Status', 'status');
    const onboardDate = formatDashboardDateTime(getField('Onboarding Date'));
    const offboardDate = formatDashboardDateTime(getField('Offboard Date'));

    const lowerStatus = (status || '').toLowerCase();
    const isOffboarded = lowerStatus.includes('offboard');

    document.getElementById('dash-client-id-stat').textContent = clientId || '—';
    document.getElementById('dash-brand-stat').textContent = brand || '—';

    const statusEl = document.getElementById('dash-client-status-wrapper');
    const capStatus = status ? status.charAt(0).toUpperCase() + status.slice(1) : '—';
    statusEl.textContent = capStatus;
    if (isOffboarded) {
        statusEl.style.color = 'var(--danger)';
    } else if (lowerStatus.includes('pending')) {
        statusEl.style.color = 'var(--warning)';
    } else if (lowerStatus.includes('onboard') || lowerStatus.includes('active')) {
        statusEl.style.color = 'var(--success)';
    } else {
        statusEl.style.color = 'var(--text-primary)';
    }

    // 4th stat card: contextual date based on status
    const statusDateLabel = isOffboarded ? 'Offboard Date' : 'Onboarding Date';
    const statusDate = isOffboarded ? offboardDate : onboardDate;
    document.getElementById('dash-status-date-label').textContent = statusDateLabel;
    const statusDateVal = document.getElementById('dash-status-date-stat');
    statusDateVal.textContent = statusDate || '—';
    statusDateVal.style.color = isOffboarded ? 'var(--danger)' : (statusDate ? 'var(--success)' : 'var(--text-primary)');

    // ── Client Profile Card ──
    document.getElementById('dash-full-name').textContent = getField('Full Name', 'fullname', 'full_name', 'name') || '—';
    document.getElementById('dash-email').textContent = getField('Email ID', 'email', 'email_id') || '—';
    document.getElementById('dash-phone').textContent = getField('Phone Number', 'phone', 'phone_number') || '—';

    const tagsEl = document.getElementById('dash-platform-tags');
    const dashboardPlatforms = getClientPlatforms();
    if (dashboardPlatforms.length > 0) {
        tagsEl.innerHTML = dashboardPlatforms.map(p =>
            `<span class="badge badge-gray" style="font-size:0.8rem;">${escapeHTML(p)}</span>`
        ).join('');
    } else {
        tagsEl.textContent = '—';
    }

    document.getElementById('dash-current-cycle').textContent = getField('Current Cycle', 'currentcycle', 'cycle') || '1';

    // Profile date: show the opposite date from the stat card
    const profileDateLabel = isOffboarded ? 'Onboarding Date' : 'Offboard Date';
    const profileDate = isOffboarded ? onboardDate : offboardDate;
    document.getElementById('dash-profile-status-date-label').textContent = profileDateLabel;
    document.getElementById('dash-profile-status-date').textContent = profileDate || '—';

    // Root Folder (sheet: "Root Folder URL")
    const folderUrl = getField('Root Folder URL', 'rootfolderurl', 'folderurl') || '';
    const folderEl = document.getElementById('dash-root-folder');
    const safeFolderUrl = safeExternalUrl(folderUrl);
    if (safeFolderUrl) {
        folderEl.textContent = '';
        const link = document.createElement('a');
        link.href = safeFolderUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.style.color = 'var(--accent)';
        link.style.textDecoration = 'none';
        link.textContent = 'Open Drive ↗';
        folderEl.appendChild(link);
    } else {
        folderEl.textContent = '—';
    }

    // Duplicate Flag (sheet: "Duplicate_Flag")
    document.getElementById('dash-duplicate-flag').textContent = getField('Duplicate_Flag', 'Duplicate Flag', 'duplicateflag', 'duplicate') || '—';

    // Last Updated (sheet: "Last Updated")
    document.getElementById('dash-last-updated').textContent = formatDashboardDateTime(getField('Last Updated', 'lastupdated', 'updatedat')) || '—';

    if (typeof validateUpgForm === 'function') validateUpgForm();

    let refreshBtn = document.getElementById('manual-refresh-btn');
    const topbarSecondary = document.querySelector('.topbar-secondary');
    const topbarHeaderName = document.getElementById('header-client-name');
    const initialsEl = document.getElementById('header-client-initials');
    if (!refreshBtn) {
        if (topbarSecondary) {
            refreshBtn = document.createElement('button');
            refreshBtn.id = 'manual-refresh-btn';
            refreshBtn.textContent = '\u27F3 Refresh';
            refreshBtn.style.background = 'transparent';
            refreshBtn.style.border = '1px solid rgba(255,255,255,0.2)';
            refreshBtn.style.color = '#ccc';
            refreshBtn.style.fontSize = '0.8rem';
            refreshBtn.style.padding = '5px 12px';
            refreshBtn.style.borderRadius = '6px';
            refreshBtn.style.cursor = 'pointer';
            refreshBtn.style.marginRight = '8px';
        }
    }
    if (refreshBtn && topbarSecondary) {
        topbarSecondary.insertBefore(refreshBtn, topbarHeaderName || topbarSecondary.firstChild);
    }

    // Wire up the manual refresh button if present
    if (refreshBtn && !refreshBtn.dataset.listenerBound) {
        refreshBtn.dataset.listenerBound = 'true';
        refreshBtn.addEventListener('click', () => {
            refreshBtn.disabled = true;
            refreshBtn.textContent = '\u27F3 Syncing...';
            lastSyncTimestamp = 0; // reset guard for manual trigger
            syncClientData().then(() => {
                refreshBtn.disabled = false;
                refreshBtn.textContent = '\u27F3 Refresh';
            });
        });
    }
}

function setTextIfChanged(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    const next = value || '—';
    if (el.textContent !== next) el.textContent = next;
}

let leftClientListRequestId = 0;

const CLIENT_SHEET_CSV_URL = '';
const CLIENT_SHEET_ID = '1YIL-_jZvSevBLhSmuGTmLE5bxYx-5ikuleDK4Lq5s4s';
const CLIENT_SHEET_GID = '0';

function getClientSheetCsvUrl() {
    const savedUrl = localStorage.getItem('client_sheet_csv_url') || '';
    const savedId = localStorage.getItem('client_sheet_id') || '';
    const savedGid = localStorage.getItem('client_sheet_gid') || CLIENT_SHEET_GID;

    if (CLIENT_SHEET_CSV_URL) return CLIENT_SHEET_CSV_URL;
    if (savedUrl) return savedUrl;

    const sheetId = CLIENT_SHEET_ID || savedId;
    if (!sheetId) return '';
    return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/gviz/tq?tqx=out:csv&gid=${encodeURIComponent(savedGid || '0')}`;
}

function getClientSheetGvizUrl(callbackName) {
    const savedId = localStorage.getItem('client_sheet_id') || '';
    const savedGid = localStorage.getItem('client_sheet_gid') || CLIENT_SHEET_GID;
    const sheetId = CLIENT_SHEET_ID || savedId;
    if (!sheetId) return '';
    return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/gviz/tq?gid=${encodeURIComponent(savedGid || '0')}&headers=1&tqx=responseHandler:${encodeURIComponent(callbackName)}`;
}

function fetchSheetViaJsonp() {
    return new Promise((resolve, reject) => {
        const callbackName = `rynexSheetCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const sheetUrl = getClientSheetGvizUrl(callbackName);
        if (!sheetUrl) {
            reject(new Error('Client data source is not configured.'));
            return;
        }

        const script = document.createElement('script');
        const timeoutId = setTimeout(() => {
            cleanup();
            reject(new Error('Client data load timed out.'));
        }, 12000);

        function cleanup() {
            clearTimeout(timeoutId);
            delete window[callbackName];
            if (script.parentNode) script.parentNode.removeChild(script);
        }

        window[callbackName] = (response) => {
            cleanup();
            if (!response || response.status === 'error') {
                reject(new Error(response?.errors?.[0]?.detailed_message || 'Client data load failed.'));
                return;
            }

            const table = response.table || {};
            const headers = (table.cols || []).map(col => col.label || col.id || '');
            const rows = (table.rows || []).map(row =>
                (row.c || []).map(cell => {
                    if (!cell) return '';
                    if (cell.f !== null && cell.f !== undefined) return String(cell.f);
                    if (cell.v !== null && cell.v !== undefined) return String(cell.v);
                    return '';
                })
            );
            resolve([headers, ...rows]);
        };

        script.onerror = () => {
            cleanup();
            reject(new Error('Client data source could not be loaded. Check sharing access.'));
        };
        script.src = sheetUrl;
        document.head.appendChild(script);
    });
}

async function fetchClientRowsFromGoogleSheet() {
    // If Firebase has populated data, use it instantly
    if (currentFirebaseSheetData && currentFirebaseSheetData.length > 0) {
        return mapSheetClientRows(currentFirebaseSheetData);
    }
    
    // Otherwise, fallback to the direct Google Sheets JSONP call
    if (!getClientSheetCsvUrl()) {
        throw new Error('Client data source is not configured.');
    }
    return mapSheetClientRows(await fetchSheetViaJsonp());
}

function normalizeHeader(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function mapSheetClientRows(rows) {
    if (!rows.length) return [];

    const headers = rows[0];
    const normHeaders = headers.map(normalizeHeader);
    const findIndex = (...names) => names
        .map(normalizeHeader)
        .map(name => normHeaders.indexOf(name))
        .find(index => index >= 0);

    const clientIdIndex = findIndex('Client ID', 'client_id', 'clientid');
    const brandNameIndex = findIndex('Brand Name', 'brand_name', 'brandname');
    const phoneIndex = findIndex('Phone Number', 'phone', 'phone_number', 'phonenumber');

    if (clientIdIndex === undefined || brandNameIndex === undefined || phoneIndex === undefined) {
        throw new Error('Sheet must include Client ID, Brand Name, and Phone Number columns.');
    }

    return rows.slice(1).map(row => {
        const record = {};
        for (let i = 0; i < headers.length; i++) {
            if (headers[i]) {
                record[headers[i]] = String(row[i] || '').trim();
            }
        }
        // Ensure standard keys exist
        record['Client ID'] = String(row[clientIdIndex] || '').trim();
        record['Brand Name'] = String(row[brandNameIndex] || '').trim();
        record['Phone Number'] = String(row[phoneIndex] || '').trim();
        
        return record;
    }).filter(record => record['Client ID'] || record['Brand Name'] || record['Phone Number']);
}





function getLeftClientListRowsContainer(list) {
    if (!list) return null;

    let rowsContainer = list.querySelector('#client-list-rows');
    if (rowsContainer) return rowsContainer;

    const gridColumns = '1fr 1fr 1.25fr';
    const headerStyle = `
        position: sticky;
        top: 0;
        z-index: 3;
        padding: 10px 20px;
        background: #050505;
        border-top: 1px solid rgba(255,255,255,0.06);
        border-bottom: 1px solid rgba(255,255,255,0.12);
    `;
    const headerInnerStyle = `
        display: grid;
        grid-template-columns: ${gridColumns};
        align-items: center;
        gap: 12px;
        background: #111;
        border-radius: 8px;
    `;
    const headerCellStyle = `
        display: flex;
        align-items: center;
        justify-content: center;
        min-width: 0;
        min-height: 46px;
        padding: 0 8px;
        color: var(--text-secondary);
        border: 1px solid transparent;
        font-size: 0.94rem;
        font-weight: 700;
        letter-spacing: 0;
        line-height: 1.2;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    `;

    const CLIENTS_SORT_ICON = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 15l5 5 5-5M7 9l5-5 5 5"/></svg>`;

    list.innerHTML = `
        <div id="client-list-header" style="${headerStyle}">
            <div style="${headerInnerStyle}">
                <div style="${headerCellStyle}; position:relative; overflow:visible;">
                    Brand Name
                    <div id="clients-sort-btn" style="display:inline-flex; align-items:center; margin-left:6px; cursor:pointer;" title="Sort Brand Name">
                        ${CLIENTS_SORT_ICON}
                    </div>
                    <div id="clients-sort-dropdown" style="display:none; position:absolute; top:100%; right:auto; left:0; background:#1a1a1a; border:1px solid #333; border-radius:6px; padding:4px 0; min-width:140px; box-shadow:0 4px 12px rgba(0,0,0,0.5); z-index:100; text-transform:none; font-weight:600;">
                        <div class="clients-sort-opt" data-val="default" style="padding:8px 16px; cursor:pointer; font-size:0.85rem; color:#fff; background:rgba(255,255,255,0.1);">Sheet Order</div>
                        <div class="clients-sort-opt" data-val="asc" style="padding:8px 16px; cursor:pointer; font-size:0.85rem; color:var(--text-secondary);">A-Z</div>
                        <div class="clients-sort-opt" data-val="desc" style="padding:8px 16px; cursor:pointer; font-size:0.85rem; color:var(--text-secondary);">Z-A</div>
                    </div>
                </div>
                <div style="${headerCellStyle}">Phone Number</div>
                <div style="${headerCellStyle}">Client ID</div>
            </div>
        </div>
        <div id="client-list-rows"></div>
    `;

    return list.querySelector('#client-list-rows');
}

async function refreshLeftClientList(options = {}) {
    const activeTab = options.refreshTab || 'clients';
    const clientList = document.getElementById('left-content-clients');
    const statusList = document.getElementById('left-content-status');
    const btn = document.getElementById('left-client-refresh-btn');
    const statusEl = document.getElementById('left-client-refresh-status');

    const activeList = activeTab === 'status' ? statusList : clientList;
    if (!activeList) return;

    const requestId = ++leftClientListRequestId;
    if (btn && !options.silent) {
        btn.disabled = true;
        btn.textContent = 'Refreshing...';
    }
    if (statusEl) statusEl.textContent = '';

    try {
        const records = await fetchClientRowsFromGoogleSheet();
        if (requestId !== leftClientListRequestId) return;
        dashboardClientRecords = records;
        localStorage.setItem('dashboard_client_records', JSON.stringify(dashboardClientRecords));
        renderClientList(records);
        renderStatusList(records);
        renderTokenList(records);
        if (statusEl) statusEl.textContent = '';
    } catch (err) {
        if (requestId !== leftClientListRequestId) return;
        if (activeTab === 'status') {
            const errorRowsContainer = getLeftStatusListRowsContainer(statusList);
            if (errorRowsContainer) {
                errorRowsContainer.innerHTML = `<div id="status-list-empty" style="padding: 20px; color: var(--danger); font-size: 0.9rem;">${escapeHTML(err || 'Failed to load status data.')}</div>`;
            }
        } else if (activeTab === 'token') {
            const tokenList = document.getElementById('left-content-token');
            const errorRowsContainer = getLeftTokenListRowsContainer(tokenList);
            if (errorRowsContainer) {
                errorRowsContainer.innerHTML = `<div id="token-list-empty" style="padding: 20px; color: var(--danger); font-size: 0.9rem;">${escapeHTML(err || 'Failed to load token data.')}</div>`;
            }
        } else {
            const errorRowsContainer = getLeftClientListRowsContainer(clientList);
            if (errorRowsContainer) {
                errorRowsContainer.innerHTML = `<div id="client-list-empty" style="padding: 20px; color: var(--danger); font-size: 0.9rem;">${escapeHTML(err || 'Failed to load client data.')}</div>`;
            }
        }
        if (statusEl) statusEl.textContent = 'Refresh failed';
    } finally {
        if (requestId === leftClientListRequestId && btn && !options.silent) {
            btn.disabled = false;
            btn.textContent = 'Refresh';
        }
    }
}

function renderClientList(records = dashboardClientRecords) {
    const list = document.getElementById('left-content-clients');
    if (!list) return;

    const rowsContainer = getLeftClientListRowsContainer(list);
    if (!rowsContainer) return;

    let cleanRecords = (records || []).filter(record => record && typeof record === 'object');
    if (!cleanRecords.length) {
        rowsContainer.innerHTML = '<div id="client-list-empty" style="padding: 20px; color: #999; font-size: 0.9rem;">No client records found.</div>';
        return;
    }

    if (currentClientsSort === 'asc') {
        cleanRecords = [...cleanRecords].sort((a, b) => {
            const nameA = (getRecordColumnValue(a, 'Brand Name', 'brand_name', 'brandname') || '').toLowerCase();
            const nameB = (getRecordColumnValue(b, 'Brand Name', 'brand_name', 'brandname') || '').toLowerCase();
            return nameA.localeCompare(nameB);
        });
    } else if (currentClientsSort === 'desc') {
        cleanRecords = [...cleanRecords].sort((a, b) => {
            const nameA = (getRecordColumnValue(a, 'Brand Name', 'brand_name', 'brandname') || '').toLowerCase();
            const nameB = (getRecordColumnValue(b, 'Brand Name', 'brand_name', 'brandname') || '').toLowerCase();
            return nameB.localeCompare(nameA);
        });
    }

    const gridColumns = '1fr 1fr 1.25fr';
    const cellStyle = `
        min-width: 0;
        color: var(--text-primary);
        font-size: 0.9rem;
        font-weight: 600;
        line-height: 1.35;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        text-align: center;
    `;

    const rows = cleanRecords.map((record, index) => {
        const clientId = getRecordColumnValue(record, 'Client ID', 'client_id', 'clientid') || '—';
        const brandName = getRecordColumnValue(record, 'Brand Name', 'brand_name', 'brandname') || '—';
        const phone = normalizePhone(getRecordColumnValue(record, 'Phone Number', 'phone', 'phone_number')) || '—';
        const border = index === cleanRecords.length - 1 ? 'transparent' : 'rgba(255,255,255,0.05)';

        return `
        <div class="client-data-row" style="
            display: grid;
            grid-template-columns: ${gridColumns};
            align-items: center;
            padding: 10px 20px;
            border-bottom: 1px solid ${border};
            gap: 12px;
        ">
            <div class="client-data-point" style="${cellStyle}">${escapeHTML(brandName)}</div>

            <div class="client-data-point" style="${cellStyle} color: var(--text-secondary);">${escapeHTML(phone)}</div>

            <div class="client-data-point" style="${cellStyle} color: var(--success); font-family: monospace; display:grid; grid-template-columns:minmax(0, 1fr) 22px; align-items:center; gap:6px;">
                <span style="min-width:0; overflow:hidden; text-overflow:ellipsis; text-align:right;">${escapeHTML(clientId)}</span>
                <button
                    type="button"
                    data-copy-client-id="${escapeHTML(clientId)}"
                    class="client-copy-btn"
                    title="Copy Client ID"
                >${CLIENT_COPY_ICON}</button>
            </div>

        </div>
    `;
    }).join('');

    rowsContainer.innerHTML = rows;
}

function getLeftStatusListRowsContainer(list) {
    if (!list) return null;

    let rowsContainer = list.querySelector('#status-list-rows');
    if (rowsContainer) return rowsContainer;

    const gridColumns = '1.25fr 1fr 1fr';
    const headerStyle = `
        position: sticky;
        top: 0;
        z-index: 3;
        padding: 10px 20px;
        background: #050505;
        border-top: 1px solid rgba(255,255,255,0.06);
        border-bottom: 1px solid rgba(255,255,255,0.12);
    `;
    const headerInnerStyle = `
        display: grid;
        grid-template-columns: ${gridColumns};
        align-items: center;
        gap: 12px;
        background: #111;
        border-radius: 8px;
    `;
    const headerCellStyle = `
        display: flex;
        align-items: center;
        justify-content: center;
        min-width: 0;
        min-height: 46px;
        padding: 0 8px;
        color: var(--text-secondary);
        border: 1px solid transparent;
        font-size: 0.94rem;
        font-weight: 700;
        letter-spacing: 0;
        line-height: 1.2;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    `;

    const STATUS_FILTER_ICON = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 15l5 5 5-5M7 9l5-5 5 5"/></svg>`;

    list.innerHTML = `
        <div id="status-list-header" style="${headerStyle}">
            <div style="${headerInnerStyle}">
                <div style="${headerCellStyle}">Client ID</div>
                <div style="${headerCellStyle}">Brand Name</div>
                <div style="${headerCellStyle}; position:relative; overflow:visible;">
                    Status
                    <div id="status-filter-btn" style="display:inline-flex; align-items:center; margin-left:6px; cursor:pointer;" title="Filter Status">
                        ${STATUS_FILTER_ICON}
                    </div>
                    <div id="status-filter-dropdown" style="display:none; position:absolute; top:100%; right:0; background:#1a1a1a; border:1px solid #333; border-radius:6px; padding:4px 0; min-width:160px; box-shadow:0 4px 12px rgba(0,0,0,0.5); z-index:100; text-transform:none; font-weight:600;">
                        <div class="status-filter-opt" data-val="all" style="padding:8px 16px; cursor:pointer; font-size:0.85rem; color:#fff; background:rgba(255,255,255,0.1);">All</div>
                        <div class="status-filter-opt" data-val="pending activation" style="padding:8px 16px; cursor:pointer; font-size:0.85rem; color:var(--warning);">Pending Activation</div>
                        <div class="status-filter-opt" data-val="active" style="padding:8px 16px; cursor:pointer; font-size:0.85rem; color:var(--success);">Active</div>
                    </div>
                </div>
            </div>
        </div>
        <div id="status-list-rows"></div>
    `;

    return list.querySelector('#status-list-rows');
}

function renderStatusList(records = dashboardClientRecords) {
    const list = document.getElementById('left-content-status');
    if (!list) return;

    const rowsContainer = getLeftStatusListRowsContainer(list);
    if (!rowsContainer) return;

    const cleanRecords = (records || []).filter(record => {
        if (!record || typeof record !== 'object') return false;
        const status = getRecordColumnValue(record, 'Status', 'status');
        const normStatus = normalizeString(status);
        if (normStatus !== 'pending activation' && normStatus !== 'active') return false;
        
        if (currentStatusFilter === 'all') return true;
        return normStatus === currentStatusFilter;
    });

    if (!cleanRecords.length) {
        rowsContainer.innerHTML = '<div id="status-list-empty" style="padding: 20px; color: #999; font-size: 0.9rem;">No matching status data found.</div>';
        return;
    }

    const gridColumns = '1.25fr 1fr 1fr';
    const cellStyle = `
        min-width: 0;
        color: var(--text-primary);
        font-size: 0.9rem;
        font-weight: 600;
        line-height: 1.35;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        text-align: center;
    `;

    const rows = cleanRecords.map((record, index) => {
        const clientId = getRecordColumnValue(record, 'Client ID', 'client_id', 'clientid') || '—';
        const brandName = getRecordColumnValue(record, 'Brand Name', 'brand_name', 'brandname') || '—';
        const status = getRecordColumnValue(record, 'Status', 'status') || '—';
        const border = index === cleanRecords.length - 1 ? 'transparent' : 'rgba(255,255,255,0.05)';
        
        let statusColor = 'var(--text-secondary)';
        const normStatus = normalizeString(status);
        if (normStatus === 'pending activation') statusColor = 'var(--warning)';
        else if (normStatus === 'active') statusColor = 'var(--success)';

        return `
        <div class="client-data-row" style="
            display: grid;
            grid-template-columns: ${gridColumns};
            align-items: center;
            padding: 10px 20px;
            border-bottom: 1px solid ${border};
            gap: 12px;
        ">
            <div class="client-data-point" style="${cellStyle} color: var(--text-secondary); font-family: monospace; display:flex; align-items:center; justify-content:center; gap:6px;">
                <span>${escapeHTML(clientId)}</span>
                <button
                    type="button"
                    data-copy-client-id="${escapeHTML(clientId)}"
                    class="client-copy-btn"
                    title="Copy Client ID"
                >${CLIENT_COPY_ICON}</button>
            </div>
            <div class="client-data-point" style="${cellStyle}">${escapeHTML(brandName)}</div>
            <div class="client-data-point" style="${cellStyle} color: ${statusColor};">${escapeHTML(status)}</div>
        </div>
    `;
    }).join('');

    rowsContainer.innerHTML = rows;
}

function getLeftTokenListRowsContainer(list) {
    if (!list) return null;

    let rowsContainer = list.querySelector('#token-list-rows');
    if (rowsContainer) return rowsContainer;

    const gridColumns = '1.25fr 1fr 1fr';
    const headerStyle = `
        position: sticky;
        top: 0;
        z-index: 3;
        padding: 10px 20px;
        background: #050505;
        border-top: 1px solid rgba(255,255,255,0.06);
        border-bottom: 1px solid rgba(255,255,255,0.12);
    `;
    const headerInnerStyle = `
        display: grid;
        grid-template-columns: ${gridColumns};
        align-items: center;
        gap: 12px;
        background: #111;
        border-radius: 8px;
    `;
    const headerCellStyle = `
        display: flex;
        align-items: center;
        justify-content: center;
        min-width: 0;
        min-height: 46px;
        padding: 0 8px;
        color: var(--text-secondary);
        border: 1px solid transparent;
        font-size: 0.94rem;
        font-weight: 700;
        letter-spacing: 0;
        line-height: 1.2;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    `;

    const TOKEN_FILTER_ICON = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 15l5 5 5-5M7 9l5-5 5 5"/></svg>`;

    list.innerHTML = `
        <div id="token-list-header" style="${headerStyle}">
            <div style="${headerInnerStyle}">
                <div style="${headerCellStyle}">Client ID</div>
                <div style="${headerCellStyle}">Platforms</div>
                <div style="${headerCellStyle}; position:relative; overflow:visible;">
                    Status
                    <div id="token-filter-btn" style="display:inline-flex; align-items:center; margin-left:6px; cursor:pointer;" title="Filter Status">
                        ${TOKEN_FILTER_ICON}
                    </div>
                    <div id="token-filter-dropdown" style="display:none; position:absolute; top:100%; right:0; background:#1a1a1a; border:1px solid #333; border-radius:6px; padding:4px 0; min-width:120px; box-shadow:0 4px 12px rgba(0,0,0,0.5); z-index:100; text-transform:none; font-weight:600;">
                        <div class="token-filter-opt" data-val="all" style="padding:8px 16px; cursor:pointer; font-size:0.85rem; color:#fff; background:rgba(255,255,255,0.1);">All</div>
                        <div class="token-filter-opt" data-val="not initiated" style="padding:8px 16px; cursor:pointer; font-size:0.85rem; color:var(--danger);">Not Initiated</div>
                        <div class="token-filter-opt" data-val="initiated" style="padding:8px 16px; cursor:pointer; font-size:0.85rem; color:var(--warning);">Initiated</div>
                        <div class="token-filter-opt" data-val="active" style="padding:8px 16px; cursor:pointer; font-size:0.85rem; color:var(--success);">Active</div>
                    </div>
                </div>
            </div>
        </div>
        <div id="token-list-rows"></div>
    `;

    return list.querySelector('#token-list-rows');
}

function renderTokenList(records = dashboardClientRecords) {
    const list = document.getElementById('left-content-token');
    if (!list) return;

    const rowsContainer = getLeftTokenListRowsContainer(list);
    if (!rowsContainer) return;

    const cleanRecords = (records || []).filter(record => record && typeof record === 'object');
    
    const groupedRows = [];
    cleanRecords.forEach(record => {
        const clientId = getRecordColumnValue(record, 'Client ID', 'client_id', 'clientid') || '—';
        const platformsActiveStr = record['Platforms Active'] || '';
        const activePlatforms = platformsActiveStr.split(',').map(s => s.trim().toUpperCase());
        
        const platforms = [
            { id: 'YT', key: 'YT_Token_Status' },
            { id: 'IG', key: 'IG_Token_Status' },
            { id: 'FB', key: 'FB_Token_Status' },
            { id: 'LI', key: 'LI_Token_Status' }
        ];
        
        const clientPlatforms = [];
        platforms.forEach(plat => {
            if (!activePlatforms.includes(plat.id)) return;
            const status = record[plat.key];
            if (status && status !== '—') {
                const normStatus = normalizeString(status);
                if (currentTokenFilter === 'all' || normStatus === currentTokenFilter) {
                    clientPlatforms.push({
                        platform: plat.id,
                        status: status,
                        normStatus: normStatus
                    });
                }
            }
        });

        if (clientPlatforms.length > 0) {
            groupedRows.push({
                clientId: clientId,
                platforms: clientPlatforms
            });
        }
    });

    if (!groupedRows.length) {
        rowsContainer.innerHTML = '<div id="token-list-empty" style="padding: 20px; color: #999; font-size: 0.9rem;">No token data found.</div>';
        return;
    }

    const gridColumns = '1.25fr 1fr 1fr';
    const cellStyle = `
        min-width: 0;
        color: var(--text-primary);
        font-size: 0.9rem;
        font-weight: 600;
        line-height: 1.35;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        text-align: center;
    `;

    const rows = groupedRows.map((gr, index) => {
        const border = index === groupedRows.length - 1 ? 'transparent' : 'rgba(255,255,255,0.05)';
        
        const platformsHtml = gr.platforms.map(p => `<div style="margin: 4px 0;">${escapeHTML(p.platform)}</div>`).join('');
        const statusesHtml = gr.platforms.map(p => {
            let statusColor = 'var(--text-secondary)';
            if (p.normStatus === 'not initiated') statusColor = 'var(--danger)';
            else if (p.normStatus === 'initiated') statusColor = 'var(--warning)';
            else if (p.normStatus === 'active') statusColor = 'var(--success)';
            return `<div style="margin: 4px 0; color: ${statusColor};">${escapeHTML(p.status)}</div>`;
        }).join('');

        return `
        <div class="client-data-row" style="
            display: grid;
            grid-template-columns: ${gridColumns};
            align-items: center;
            padding: 10px 20px;
            border-bottom: 1px solid ${border};
            gap: 12px;
        ">
            <div class="client-data-point" style="${cellStyle} color: var(--text-secondary); font-family: monospace; display:flex; align-items:center; justify-content:center; gap:6px;">
                <span>${escapeHTML(gr.clientId)}</span>
                <button
                    type="button"
                    data-copy-client-id="${escapeHTML(gr.clientId)}"
                    class="client-copy-btn"
                    title="Copy Client ID"
                >${CLIENT_COPY_ICON}</button>
            </div>
            <div class="client-data-point" style="${cellStyle} display:flex; flex-direction:column; justify-content:center;">${platformsHtml}</div>
            <div class="client-data-point" style="${cellStyle} display:flex; flex-direction:column; justify-content:center;">${statusesHtml}</div>
        </div>
    `;
    }).join('');

    rowsContainer.innerHTML = rows;
}

function renderRootFolderLink(folderEl, folderUrl) {
    if (!folderEl) return;
    const safeFolderUrl = safeExternalUrl(folderUrl);
    if (safeFolderUrl) {
        const existing = folderEl.querySelector('a');
        if (existing && existing.href === safeFolderUrl) return;
        folderEl.textContent = '';
        const link = document.createElement('a');
        link.href = safeFolderUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.style.color = 'var(--accent)';
        link.style.textDecoration = 'none';
        link.textContent = 'Open Drive ↗';
        folderEl.appendChild(link);
    } else {
        folderEl.textContent = '—';
    }
}

function updateDashboardData(newData) {
    if (!newData) return;
    currentClient = newData;

    const displayName = getClientDisplayName();
    setTextIfChanged('header-client-name', displayName || 'No Client Active');
    setTextIfChanged('header-client-initials', displayName ? getInitials(displayName) : '--');

    const clientId = getField('Client ID', 'client_id', 'clientid');
    const brand = getField('Brand Name', 'brand_name', 'brandname');
    const status = getField('Status', 'status');
    const onboardDate = formatDashboardDateTime(getField('Onboarding Date'));
    const offboardDate = formatDashboardDateTime(getField('Offboard Date'));
    const lowerStatus = (status || '').toLowerCase();
    const isOffboarded = lowerStatus.includes('offboard');

    setTextIfChanged('dash-client-id-stat', clientId);
    setTextIfChanged('dash-brand-stat', brand);

    const statusEl = document.getElementById('dash-client-status-wrapper');
    if (statusEl) {
        statusEl.textContent = status ? status.charAt(0).toUpperCase() + status.slice(1) : '—';
        statusEl.style.color = isOffboarded
            ? 'var(--danger)'
            : lowerStatus.includes('pending')
                ? 'var(--warning)'
                : (lowerStatus.includes('onboard') || lowerStatus.includes('active'))
                    ? 'var(--success)'
                    : 'var(--text-primary)';
    }

    const statusDateLabel = isOffboarded ? 'Offboard Date' : 'Onboarding Date';
    const statusDate = isOffboarded ? offboardDate : onboardDate;
    setTextIfChanged('dash-status-date-label', statusDateLabel);
    const statusDateVal = document.getElementById('dash-status-date-stat');
    if (statusDateVal) {
        statusDateVal.textContent = statusDate || '—';
        statusDateVal.style.color = isOffboarded ? 'var(--danger)' : (statusDate ? 'var(--success)' : 'var(--text-primary)');
    }

    setTextIfChanged('dash-full-name', getField('Full Name', 'fullname', 'full_name', 'name'));
    setTextIfChanged('dash-email', getField('Email ID', 'email', 'email_id'));
    setTextIfChanged('dash-phone', getField('Phone Number', 'phone', 'phone_number'));
    setTextIfChanged('dash-current-cycle', getField('Current Cycle', 'currentcycle', 'cycle') || '1');

    const profileDateLabel = isOffboarded ? 'Onboarding Date' : 'Offboard Date';
    const profileDate = isOffboarded ? onboardDate : offboardDate;
    setTextIfChanged('dash-profile-status-date-label', profileDateLabel);
    setTextIfChanged('dash-profile-status-date', profileDate);

    renderRootFolderLink(document.getElementById('dash-root-folder'), getField('Root Folder URL', 'rootfolderurl', 'folderurl') || '');
    setTextIfChanged('dash-duplicate-flag', getField('Duplicate_Flag', 'Duplicate Flag', 'duplicateflag', 'duplicate'));
    setTextIfChanged('dash-last-updated', formatDashboardDateTime(getField('Last Updated', 'lastupdated', 'updatedat')));

    const tagsEl = document.getElementById('dash-platform-tags');
    if (tagsEl) {
        const platforms = getClientPlatforms();
        const nextTags = platforms.length > 0
            ? platforms.map(p => `<span class="badge badge-gray" style="font-size:0.8rem;">${escapeHTML(p)}</span>`).join('')
            : '—';
        if (tagsEl.innerHTML !== nextTags) tagsEl.innerHTML = nextTags;
    }

    if (typeof validateUpgForm === 'function') validateUpgForm();
}

function sendOauthLink(btn, p) {
    if (!currentClient || (!currentClient.clientid && !currentClient.client_id)) return;
    const originalText = btn.textContent;
    const targetCard = btn.closest('[data-token-card]') || document.querySelector(`[data-token-card][data-platform="${p}"]`);

    const setLoad = (b) => {
        btn.disabled = b;
        btn.textContent = b ? 'Generating...' : originalText;
        if (b) {
            showAuthLinkStatus(`Individual platform link is being generated for ${p}.`, 'loading', targetCard);
        }
    };

    const payload = generateOAuthPayload(currentClient, [p], 'single');

    callWebhook('send-oauth-link', payload, (data) => {
        showAuthLinkStatus(`Authentication link generated successfully for ${p}.`, 'success', targetCard);
        refreshClientDataAfterMutation();
    }, (err) => {
        showAuthLinkStatus(`Failed to generate authentication link for ${p}.`, 'error', targetCard);
    }, setLoad);
}

function validateUpgForm() {
    if (!currentClient) return;
    const actionEl = document.getElementById('dash-upg-action');
    const platEl = document.getElementById('dash-upg-plat');
    const msgDiv = document.getElementById('dash-upg-msg');
    const settingsDiv = document.getElementById('dash-upg-settings');
    if (!actionEl || !platEl || !msgDiv || !settingsDiv) return;
    const action = actionEl.value;
    const plat = platEl.value;

    const isActive = (currentClient.platforms || []).includes(plat);

    if (action === 'add') {
        settingsDiv.style.display = 'grid';
        if (isActive) {
            msgDiv.style.display = 'block';
            msgDiv.textContent = 'This platform is already active.';
        } else {
            msgDiv.style.display = 'none';
        }
    } else {
        settingsDiv.style.display = 'none';
        if (!isActive) {
            msgDiv.style.display = 'block';
            msgDiv.textContent = 'This platform is not currently active.';
        } else {
            msgDiv.style.display = 'none';
        }
    }
}

function submitUpgForm() {
    if (!currentClient) return;
    const btn = document.getElementById('dash-upg-submit');
    const action = document.getElementById('dash-upg-action').value;
    const plat = document.getElementById('dash-upg-plat').value;
    const msgDiv = document.getElementById('dash-upg-msg');

    if (msgDiv.style.display === 'block') return;

    const originalText = btn.textContent;
    const setLoad = (b) => {
        btn.disabled = b;
        btn.textContent = b ? 'Applying...' : originalText;
    };

    const clientId = currentClient.clientid || currentClient.client_id;
    const payload = {
        clientid: clientId,
        client_id: clientId,
        action: action,
        platform: plat
    };

    if (action === 'add') {
        const getValue = (id) => document.getElementById(id).value;
        const caps = getValue('dash-upg-captions').split('\n').filter(l => l.trim() !== '');
        payload.platformdata = {
            [plat]: {
                name: getValue('dash-upg-name'),
                link: getValue('dash-upg-link'),
                niche: getValue('dash-upg-niche'),
                tone: getValue('dash-upg-tone'),
                format: getValue('dash-upg-format'),
                emoji: getValue('dash-upg-emoji'),
                posttime: getValue('dash-upg-posttime'),
                timezone: getValue('dash-upg-timezone'),
                language: getValue('dash-upg-language'),
                contenttype: getValue('dash-upg-contenttype')
            }
        };
        payload.referencecaptions = caps;
    }

    callWebhook('upgrade-client', payload, (data) => {
        showToast('Platform updated successfully', 'info');
        if (!currentClient.platforms) currentClient.platforms = [];
        if (action === 'add' && !currentClient.platforms.includes(plat)) {
            currentClient.platforms.push(plat);
        } else if (action === 'remove' && currentClient.platforms.includes(plat)) {
            currentClient.platforms = currentClient.platforms.filter(p => p !== plat);
        }
        localStorage.setItem('current_client', JSON.stringify(currentClient));
        renderDashboard();
        renderAuthGrid();
        refreshClientDataAfterMutation();
    }, (err) => {
        showToast('Failed to update platform', 'error');
    }, setLoad);
}

// --- Auth Center ---
function normalizePlatformCode(platform) {
    const normalized = String(platform || '').trim().toLowerCase();
    const map = {
        yt: 'YT',
        youtube: 'YT',
        ig: 'IG',
        instagram: 'IG',
        fb: 'FB',
        facebook: 'FB',
        li: 'LI',
        linkedin: 'LI',
        linkedIn: 'LI'
    };
    return map[normalized] || String(platform || '').trim().toUpperCase();
}

function uniquePlatforms(platforms) {
    return [...new Set(platforms.map(normalizePlatformCode).filter(Boolean))];
}

const PLATFORM_NAMES = { YT: 'YouTube', IG: 'Instagram', FB: 'Facebook', LI: 'LinkedIn' };
// [fieldKey, displayLabel, sheetSuffix]
const PLATFORM_SETTING_FIELDS = [
    ['name', 'Name', 'Name'],
    ['link', 'Link', 'Link'],
    ['niche', 'Niche', 'Niche'],
    ['tone', 'Tone', 'Tone'],
    ['format', 'Format', 'Format'],
    ['emoji', 'Emoji', 'Emoji'],
    ['post_time', 'Post Time', 'Post_Time'],
    ['timezone', 'Timezone', 'Timezone'],
    ['language', 'Language', 'Language'],
    ['content_type', 'Content Type', 'ContentType'],
    ['reference_captions', 'Reference Captions (one per line)', 'Caption']
];

// Flip "HH:MM:SS - DD/MM/YYYY" to "DD/MM/YYYY - HH:MM:SS"
function flipDateTimeOrder(v) {
    if (!v || typeof v !== 'string') return v;
    // Match patterns like "16:23:51 - 26/05/2026" (time - date)
    const m = v.match(/^(\d{1,2}:\d{2}(?::\d{2})?)\s*[-–]\s*(\d{1,2}\/\d{1,2}\/\d{2,4})$/);
    if (m) return m[2] + ' - ' + m[1];
    return v;
}

// Exact sheet column names for platform auth fields
const PLATFORM_AUTH_FIELDS = {
    token_status: 'Token_Status',
    token_expiry: 'Token_Expiry',
    renewal_sent: 'Renewal_Sent',
    last_authed: 'Last_Authed'
};

function getClientPlatforms() {
    if (!currentClient) return [];

    if (Array.isArray(currentClient.platforms) && currentClient.platforms.length > 0) {
        return uniquePlatforms(currentClient.platforms);
    }
    if (typeof currentClient.platforms === 'string' && currentClient.platforms.trim()) {
        return uniquePlatforms(currentClient.platforms.split(','));
    }

    // Check raw sheet column "Platforms Active" directly
    const rawPlatforms = currentClient['Platforms Active'];
    if (rawPlatforms) {
        if (Array.isArray(rawPlatforms)) return uniquePlatforms(rawPlatforms);
        if (typeof rawPlatforms === 'string' && rawPlatforms.trim()) return uniquePlatforms(rawPlatforms.split(','));
    }

    const platformValue = getVal(['platformsactive', 'platforms']);
    if (Array.isArray(platformValue)) {
        return uniquePlatforms(platformValue);
    }
    if (typeof platformValue === 'string') {
        return uniquePlatforms(platformValue.split(','));
    }

    const platformData = currentClient.platform_data || currentClient.platformdata || {};
    const nestedPlatformKeys = Object.keys(platformData).filter(k => ['YT', 'IG', 'FB', 'LI'].includes(k.toUpperCase()));
    if (nestedPlatformKeys.length > 0) {
        return uniquePlatforms(nestedPlatformKeys);
    }

    // Infer from token status — only count real statuses, not 'N/A' or 'Not Initiated'
    const platformKeys = ['YT', 'IG', 'FB', 'LI'];
    const inferred = platformKeys.filter(p => {
        const ts = currentClient[`${p}_Token_Status`] || getVal([`${p}tokenstatus`]) || '';
        return ts && !isSheetEmpty(ts);
    });
    return uniquePlatforms(inferred);
}

// Helper: check if a value from the sheet should be treated as empty/absent
function isSheetEmpty(val) {
    if (val === undefined || val === null) return true;
    const s = String(val).trim().toLowerCase();
    return s === '' || s === 'n/a' || s === 'na' || s === 'not initiated' || s === '-' || s === '—';
}

/**
 * Resolve a platform setting value.
 * Tries exact sheet column name first (e.g., "YT_Name"), then nested platform_data, then fuzzy match.
 */
function getPlatformSheetValue(platform, fieldKey, fieldLabel, sheetSuffix) {
    // 1. Try exact sheet column name: e.g., "YT_Name", "IG_Post_Time"
    const exactCol = `${platform}_${sheetSuffix || fieldLabel}`;
    const exactVal = currentClient[exactCol];
    if (exactVal !== undefined && exactVal !== null && !isSheetEmpty(exactVal)) {
        return Array.isArray(exactVal) ? exactVal.join('\n') : String(exactVal);
    }

    // 2. Try nested platform_data object
    const platformData = currentClient.platform_data || currentClient.platformdata || {};
    const nested = platformData[platform] || platformData[platform.toLowerCase()] || platformData[PLATFORM_NAMES[platform]] || {};
    if (nested && typeof nested === 'object') {
        const candidates = [fieldKey, sheetSuffix, fieldLabel, fieldKey.replace(/_/g, '')];
        for (const c of candidates) {
            if (!c) continue;
            const normalizedC = c.toLowerCase().replace(/[^a-z0-9]/g, '');
            const match = Object.keys(nested).find(k => k.toLowerCase().replace(/[^a-z0-9]/g, '') === normalizedC);
            if (match && !isSheetEmpty(nested[match])) {
                return Array.isArray(nested[match]) ? nested[match].join('\n') : String(nested[match]);
            }
        }
    }

    // 3. Fuzzy match on currentClient with platform prefix
    const allKeys = Object.keys(currentClient);
    const normalizedTarget = `${platform}${(sheetSuffix || fieldKey)}`.toLowerCase().replace(/[^a-z0-9]/g, '');
    const fuzzyMatch = allKeys.find(k => k.toLowerCase().replace(/[^a-z0-9]/g, '') === normalizedTarget);
    if (fuzzyMatch && !isSheetEmpty(currentClient[fuzzyMatch])) {
        const v = currentClient[fuzzyMatch];
        return Array.isArray(v) ? v.join('\n') : String(v);
    }

    return 'N/A';
}

function renderActivePlatforms() {
    if (!currentClient) return;
    const grid = document.getElementById('active-platform-grid');
    if (!grid) return;
    const platforms = getClientPlatforms();

    if (platforms.length === 0) {
        grid.innerHTML = `
          <div class="token-empty-state">
            <h4 style="margin-bottom:8px;">No active platforms</h4>
            <p>Platform settings will appear here once they are available.</p>
          </div>
        `;
    } else {
        grid.innerHTML = platforms.map((p) => {
            const pName = PLATFORM_NAMES[p] || p;
            const isOpen = openAccordionState.activePlatform === p;
            const safeP = escapeHTML(p);
            const safePName = escapeHTML(pName);
            const fields = PLATFORM_SETTING_FIELDS.map(([key, label, sheetSuffix]) => {
                const value = getPlatformSheetValue(p, key, label, sheetSuffix);
                const isLink = key === 'link' && value !== 'N/A';
                const href = isLink ? safeExternalUrl(value) : '';
                const safeValue = escapeHTML(value);
                const safeLabel = escapeHTML(label);
                const isCaptions = key === 'reference_captions';
                const valueMarkup = isCaptions
                    ? renderCaptionLines(value)
                    : (href ? `<a href="${escapeHTML(href)}" target="_blank" rel="noopener noreferrer">${safeValue}</a>` : safeValue);
                return `
              <div class="${key === 'reference_captions' ? 'wide' : ''}">
                <span class="token-detail-label">${safeLabel}</span>
                <span class="token-detail-value${isCaptions ? ' token-detail-value-multiline' : ''}" data-platform-field="${escapeHTML(key)}">${valueMarkup}</span>
              </div>
            `;
            }).join('');

            return `
            <div class="token-card${isOpen ? ' is-open' : ''}" data-active-platform-card data-platform="${safeP}">
              <button type="button" class="token-card-header" data-active-platform-toggle="${safeP}" aria-expanded="${isOpen ? 'true' : 'false'}">
                <span class="token-platform">
                  <span class="token-platform-code">${safeP}</span>
                  <span>${safePName}</span>
                </span>
              </button>
              <div class="token-card-body">
                <div class="active-platform-detail-grid">${fields}</div>
              </div>
            </div>
          `;
        }).join('');
    }

    if (!grid.dataset.listenerBound) {
        grid.dataset.listenerBound = 'true';
        grid.addEventListener('click', function (e) {
            const toggle = e.target.closest('[data-active-platform-toggle]');
            if (!toggle) return;
            const card = toggle.closest('[data-active-platform-card]');
            const isOpen = card.classList.contains('is-open');
            const platform = card.getAttribute('data-platform') || '';
            grid.querySelectorAll('[data-active-platform-card]').forEach(c => {
                c.classList.remove('is-open');
                const cToggle = c.querySelector('[data-active-platform-toggle]');
                if (cToggle) cToggle.setAttribute('aria-expanded', 'false');
            });
            if (!isOpen) {
                card.classList.add('is-open');
                toggle.setAttribute('aria-expanded', 'true');
                openAccordionState.activePlatform = platform;
            } else {
                openAccordionState.activePlatform = '';
            }
        });
    }
}

function samePlatformSet(renderedCards, platforms) {
    const rendered = renderedCards.map(card => card.getAttribute('data-platform')).filter(Boolean).sort().join('|');
    const expected = platforms.map(normalizePlatformCode).filter(Boolean).sort().join('|');
    return rendered === expected;
}

function setPlatformFieldValue(el, key, value) {
    if (!el) return;
    if (key === 'reference_captions') {
        el.classList.add('token-detail-value-multiline');
        const nextHtml = renderCaptionLines(value);
        if (el.innerHTML !== nextHtml) el.innerHTML = nextHtml;
        return;
    }
    const isLink = key === 'link' && value !== 'N/A';
    const href = isLink ? safeExternalUrl(value) : '';
    if (href) {
        const existing = el.querySelector('a');
        if (existing && existing.href === href && existing.textContent === String(value)) return;
        el.textContent = '';
        const link = document.createElement('a');
        link.href = href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = value;
        el.appendChild(link);
        return;
    }
    if (el.textContent !== String(value)) el.textContent = value;
}

function updatePlatformStatus(newData) {
    if (!newData) return;
    currentClient = newData;

    const grid = document.getElementById('active-platform-grid');
    if (!grid) return;
    const platforms = getClientPlatforms();
    const cards = Array.from(grid.querySelectorAll('[data-active-platform-card]'));

    if (platforms.length === 0 || !samePlatformSet(cards, platforms)) {
        renderActivePlatforms();
        return;
    }

    platforms.forEach((platform) => {
        const card = cards.find(c => c.getAttribute('data-platform') === platform);
        if (!card) return;
        PLATFORM_SETTING_FIELDS.forEach(([key, label, sheetSuffix]) => {
            const el = card.querySelector(`[data-platform-field="${key}"]`);
            const value = getPlatformSheetValue(platform, key, label, sheetSuffix);
            setPlatformFieldValue(el, key, value);
        });
    });
}

function showAuthLinkStatus(message, type, targetCard = null) {
    if (targetCard) {
        document.querySelectorAll('.auth-inline-status').forEach(el => {
            if (el.parentElement !== targetCard.parentElement || el.previousElementSibling !== targetCard) el.remove();
        });

        let inlineStatus = targetCard.nextElementSibling;
        if (!inlineStatus || !inlineStatus.classList.contains('auth-inline-status')) {
            inlineStatus = document.createElement('div');
            inlineStatus.className = 'auth-inline-status';
            targetCard.insertAdjacentElement('afterend', inlineStatus);
        } else {
            inlineStatus.classList.remove('show');
            void inlineStatus.offsetWidth;
        }

        if (inlineStatus.dataset.fadeTimer) clearTimeout(Number(inlineStatus.dataset.fadeTimer));
        inlineStatus.textContent = message;
        inlineStatus.className = `auth-inline-status auth-inline-status-${type}`;
        requestAnimationFrame(() => inlineStatus.classList.add('show'));

        if (type !== 'loading') {
            inlineStatus.dataset.fadeTimer = setTimeout(() => {
                inlineStatus.classList.remove('show');
                setTimeout(() => inlineStatus.remove(), 300);
            }, 3000);
        }
        return;
    }

    document.querySelectorAll('.auth-inline-status').forEach(el => el.remove());
    const banner = document.getElementById('auth-success-banner');
    const title = document.getElementById('auth-status-title');
    const timestamp = document.getElementById('auth-timestamp');
    const copyBtn = document.getElementById('auth-copy-link-btn');
    const output = document.getElementById('res-auth-all');
    if (!banner || !title || !timestamp) return;

    if (banner.dataset.fadeTimer) clearTimeout(Number(banner.dataset.fadeTimer));
    banner.style.display = 'block';
    banner.style.visibility = 'visible';
    banner.style.background = 'transparent';
    banner.style.border = '0';
    banner.style.boxShadow = 'none';
    banner.style.padding = '0';
    banner.style.margin = '-12px 0 36px';
    banner.style.opacity = '1';
    title.textContent = message;
    title.style.color = type === 'error' ? 'var(--danger)' : type === 'success' ? 'var(--success)' : 'var(--text-primary)';
    timestamp.textContent = type === 'loading' ? 'Please wait...' : new Date().toLocaleString();
    if (copyBtn) copyBtn.style.display = 'none';
    if (output) {
        output.classList.remove('show');
        output.textContent = '';
    }
    banner.style.transition = 'opacity 0.3s ease';
    if (type === 'loading') return;

    banner.dataset.fadeTimer = setTimeout(() => {
        banner.style.opacity = '0';
        setTimeout(() => {
            banner.style.display = 'none';
            banner.style.visibility = 'hidden';
            banner.style.opacity = '';
            delete banner.dataset.fadeTimer;
        }, 300);
    }, 3000);
}

function getAuthDisplay(platform) {
    const getAuthField = (field) => {
        const sheetCol = `${platform}_${PLATFORM_AUTH_FIELDS[field]}`;
        const exact = currentClient[sheetCol];
        if (exact !== undefined && exact !== null && !isSheetEmpty(exact)) return exact;
        const fuzzy = getVal([sheetCol, `${platform}${PLATFORM_AUTH_FIELDS[field]}`.replace(/_/g, ''), `${platform}${field.replace(/_/g, '')}`]) || '';
        return isSheetEmpty(fuzzy) ? '' : fuzzy;
    };
    const resolveVal = (v) => {
        const normalized = normalizeString(v);
        return (!v || normalized === 'na' || normalized === 'n/a' || normalized === 'not initiated') ? 'N/A' : v;
    };
    const tStatus = getAuthField('token_status');
    let badgeLabel = resolveVal(tStatus);
    if (badgeLabel === 'Active' || badgeLabel === 'active') {
        badgeLabel = 'Active';
    } else if (badgeLabel === 'Expired' || badgeLabel === 'expired') {
        badgeLabel = 'Expired';
    } else if (badgeLabel === 'Approaching' || badgeLabel === 'approaching') {
        badgeLabel = 'Approaching';
    } else if (badgeLabel === 'N/A') {
        badgeLabel = 'Not Initiated';
    } else if (badgeLabel.toLowerCase().includes('initiated') || badgeLabel.toLowerCase().includes('sent')) {
        badgeLabel = 'Initiated';
    }

    return {
        token_status: badgeLabel,
        token_expiry: flipDateTimeOrder(resolveVal(getAuthField('token_expiry'))),
        last_authed: flipDateTimeOrder(resolveVal(getAuthField('last_authed'))),
        renewal_sent: resolveVal(getAuthField('renewal_sent')),
        statusClass: badgeLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    };
}

function renderAuthGrid() {
    if (!currentClient) return;

    const grid = document.getElementById('auth-platform-grid');
    if (!grid) return;

    const platforms = getClientPlatforms();

    if (platforms.length > 0) {
        grid.innerHTML = platforms.map((p, index) => {
            // Try exact sheet column first (e.g., "YT_Token_Status"), then fuzzy fallback
            const getAuthField = (field) => {
                const sheetCol = `${p}_${PLATFORM_AUTH_FIELDS[field]}`;
                const exact = currentClient[sheetCol];
                if (exact !== undefined && exact !== null && !isSheetEmpty(exact)) return exact;
                const fuzzy = getVal([sheetCol, `${p}${PLATFORM_AUTH_FIELDS[field]}`.replace(/_/g, ''), `${p}${field.replace(/_/g, '')}`]) || '';
                return isSheetEmpty(fuzzy) ? '' : fuzzy;
            };
            const tStatus = getAuthField('token_status');
            const tExpiry = getAuthField('token_expiry');
            const lastAuthed = getAuthField('last_authed');
            const renewalSent = getAuthField('renewal_sent');

            const resolveVal = (v) => {
                const normalized = normalizeString(v);
                return (!v || normalized === 'na' || normalized === 'n/a' || normalized === 'not initiated') ? 'N/A' : v;
            };
            const statusVal = resolveVal(tStatus);

            let badgeLabel = statusVal;
            if (statusVal === 'Active' || statusVal === 'active') {
                badgeLabel = 'Active';
            } else if (statusVal === 'Expired' || statusVal === 'expired') {
                badgeLabel = 'Expired';
            } else if (statusVal === 'Approaching' || statusVal === 'approaching') {
                badgeLabel = 'Approaching';
            } else if (statusVal === 'N/A') {
                badgeLabel = 'Not Initiated';
            } else if (statusVal.toLowerCase().includes('initiated') || statusVal.toLowerCase().includes('sent')) {
                badgeLabel = 'Initiated';
            }
            const statusClass = badgeLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-');
            const safeBadgeLabel = escapeHTML(badgeLabel);
            const safeLastAuthed = escapeHTML(flipDateTimeOrder(resolveVal(lastAuthed)));
            const safeTokenExpiry = escapeHTML(flipDateTimeOrder(resolveVal(tExpiry)));
            const safeRenewalSent = escapeHTML(resolveVal(renewalSent));

            const pName = PLATFORM_NAMES[p] || p;
            const safeP = escapeHTML(p);
            const safePName = escapeHTML(pName);
            const isOpen = openAccordionState.authPlatform === p;

            return `
            <div class="token-card${isOpen ? ' is-open' : ''}" data-token-card data-platform="${safeP}">
              <button type="button" class="token-card-header" data-token-toggle="${safeP}" aria-expanded="${isOpen ? 'true' : 'false'}">
                <span class="token-platform">
                  <span class="token-platform-code">${safeP}</span>
                  <span>${safePName}</span>
                </span>
                <span class="token-card-actions">
                  <span class="token-status-text token-status-${statusClass}" data-auth-status-text>${safeBadgeLabel}</span>
                </span>
              </button>
              <div class="token-card-body">
                <div class="token-detail-grid">
                  <div class="token-detail-stack">
                    <div>
                      <span class="token-detail-label">Token Status</span>
                      <span class="token-detail-value token-status-${statusClass}" data-auth-field="token_status">${safeBadgeLabel}</span>
                    </div>
                    <div>
                      <span class="token-detail-label">Last Authed</span>
                      <span class="token-detail-value" data-auth-field="last_authed">${safeLastAuthed}</span>
                    </div>
                  </div>
                  <div class="token-detail-stack">
                    <div>
                      <span class="token-detail-label">Token Expiry</span>
                      <span class="token-detail-value" data-auth-field="token_expiry">${safeTokenExpiry}</span>
                    </div>
                    <div>
                      <span class="token-detail-label">Renewal Sent</span>
                      <span class="token-detail-value" data-auth-field="renewal_sent">${safeRenewalSent}</span>
                    </div>
                  </div>
                </div>
                <div class="token-oauth-action">
                  <button type="button" class="token-oauth-link" data-platform="${safeP}">Send OAuth Link</button>
                </div>
              </div>
            </div>
          `;
        }).join('');
    } else {
        grid.innerHTML = `
          <div class="token-empty-state">
            <h4 style="margin-bottom:8px;">No platforms connected</h4>
            <p>Onboard a client or add platforms to populate this grid.</p>
          </div>
        `;
    }

    if (!grid.dataset.listenerBound) {
        grid.dataset.listenerBound = 'true';
        grid.addEventListener('click', function (e) {
            const toggle = e.target.closest('[data-token-toggle]');
            if (toggle) {
                const card = toggle.closest('[data-token-card]');
                const isOpen = card.classList.contains('is-open');
                const platform = card.getAttribute('data-platform') || '';

                grid.querySelectorAll('[data-token-card]').forEach(c => {
                    c.classList.remove('is-open');
                    const cToggle = c.querySelector('[data-token-toggle]');
                    if (cToggle) cToggle.setAttribute('aria-expanded', 'false');
                });

                if (!isOpen) {
                    card.classList.add('is-open');
                    toggle.setAttribute('aria-expanded', 'true');
                    openAccordionState.authPlatform = platform;
                } else {
                    openAccordionState.authPlatform = '';
                }
                return;
            }

            const btn = e.target.closest('.token-oauth-link[data-platform]');
            if (!btn) return;
            if (!currentClient) return;
            const plat = btn.getAttribute('data-platform');
            const card = btn.closest('[data-token-card]');
            const originalText = btn.textContent;
            const payload = generateOAuthPayload(currentClient, [plat], 'single');
            callWebhook(
                'send-oauth-link',
                payload,
                () => {
                    showAuthLinkStatus(`Authentication link generated successfully for ${plat}.`, 'success', card);
                    refreshClientDataAfterMutation();
                },
                () => {
                    showAuthLinkStatus(`Failed to generate authentication link for ${plat}.`, 'error', card);
                },
                (loading) => {
                    btn.disabled = loading;
                    btn.textContent = loading ? 'Generating...' : originalText;
                    if (loading) {
                        showAuthLinkStatus(`Individual platform link is being generated for ${plat}.`, 'loading', card);
                    }
                }
            );
        });
    }
}

function updateAuthStatus(newData) {
    if (!newData) return;
    currentClient = newData;

    const grid = document.getElementById('auth-platform-grid');
    if (!grid) return;
    const platforms = getClientPlatforms();
    const cards = Array.from(grid.querySelectorAll('[data-token-card]'));

    if (platforms.length === 0 || !samePlatformSet(cards, platforms)) {
        renderAuthGrid();
        return;
    }

    platforms.forEach((platform) => {
        const card = cards.find(c => c.getAttribute('data-platform') === platform);
        if (!card) return;
        const auth = getAuthDisplay(platform);
        const statusText = card.querySelector('[data-auth-status-text]');
        if (statusText) {
            statusText.className = `token-status-text token-status-${auth.statusClass}`;
            if (statusText.textContent !== auth.token_status) statusText.textContent = auth.token_status;
        }
        ['token_status', 'token_expiry', 'last_authed', 'renewal_sent'].forEach((field) => {
            const el = card.querySelector(`[data-auth-field="${field}"]`);
            if (!el) return;
            if (field === 'token_status') {
                el.className = `token-detail-value token-status-${auth.statusClass}`;
            }
            if (el.textContent !== auth[field]) el.textContent = auth[field];
        });
    });
}
async function generateAllAuth() {
    const platforms = getClientPlatforms();
    if (!currentClient || platforms.length === 0) {
        showAuthLinkStatus('No active platforms available for authentication link generation.', 'error');
        return;
    }
    
    const btn = document.querySelector('button[onclick="generateAllAuth()"]');
    const originalText = btn ? btn.textContent : 'Generate All Links';
    
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Generating...';
    }
    showAuthLinkStatus('Fetching fresh client data...', 'loading');
    
    // Always fetch fresh registry row before generating links
    await syncClientDataManual();
    
    // Re-onboarding flow logic: allow if Offboarded, Pending Activation, Stalled
    const allowedStatuses = ['offboarded', 'pending activation', 'stalled'];
    if (!allowedStatuses.includes(normalizeString(currentClient.status))) {
        showAuthLinkStatus(`Cannot generate links. Client status is ${currentClient.status}.`, 'error');
        if (btn) {
            btn.disabled = false;
            btn.textContent = originalText;
        }
        return;
    }

    const payload = generateOAuthPayload(currentClient, platforms, 'all');
    
    callWebhook('send-oauth-link', payload, (data) => {
        showAuthLinkStatus('Authentication links generated successfully for all platforms.', 'success');
        refreshClientDataAfterMutation();
    }, (err) => {
        showAuthLinkStatus('Failed to generate authentication links for all platforms.', 'error');
    }, (loading) => {
        if (btn) {
            btn.disabled = loading;
            btn.textContent = loading ? 'Generating...' : originalText;
        }
        if (loading) {
            showAuthLinkStatus('Your authentication links are being generated for all platforms.', 'loading');
        }
    });
}

async function generateAuth(plat) {
    if (!currentClient) return;
    const targetCard = document.querySelector(`[data-token-card][data-platform="${plat}"]`);

    showAuthLinkStatus(`Fetching fresh client data for ${plat}...`, 'loading', targetCard);
    await syncClientDataManual();

    const allowedStatuses = ['offboarded', 'pending activation', 'stalled'];
    if (!allowedStatuses.includes(normalizeString(currentClient.status))) {
        showAuthLinkStatus(`Cannot generate link. Client status is ${currentClient.status}.`, 'error', targetCard);
        return;
    }

    const payload = generateOAuthPayload(currentClient, [plat], 'single');
    callWebhook('send-oauth-link', payload, (data) => {
        showAuthLinkStatus(`Authentication link generated successfully for ${plat}.`, 'success', targetCard);
        refreshClientDataAfterMutation();
    }, (err) => {
        showAuthLinkStatus(`Failed to generate authentication link for ${plat}.`, 'error', targetCard);
    }, (loading) => {
        if (loading) {
            showAuthLinkStatus(`Individual platform link is being generated for ${plat}.`, 'loading', targetCard);
        }
    });
}

const cbExpiry = document.getElementById('cb_expiry');
if (cbExpiry) {
    cbExpiry.addEventListener('input', function (e) {
        if (e.inputType === 'deleteContentBackward') return;
        let v = e.target.value.replace(/\D/g, '');
        let formatted = '';
        if (v.length > 0) formatted += v.substring(0, 2);
        if (v.length >= 2) formatted += '-' + v.substring(2, 4);
        if (v.length >= 4) formatted += '-' + v.substring(4, 8);
        if (v.length >= 8) formatted += ' ' + v.substring(8, 10);
        if (v.length >= 10) formatted += ':' + v.substring(10, 12);
        e.target.value = formatted.substring(0, 16);
    });
}

const oauthCallbackForm = document.getElementById('form-oauth-cb');
if (oauthCallbackForm) {
    oauthCallbackForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const platform = document.getElementById('cb_plat').value;
        const basePayload = generateStandardPayload(currentClient, [platform]);
        const payload = {
            ...basePayload,
            platform: platform,
            access_token: document.getElementById('cb_token').value,
            expiry_date: (function () {
                const val = document.getElementById('cb_expiry').value;
                const match = val.match(/^(\d{2})-(\d{2})-(\d{4})\s(\d{2}):(\d{2})$/);
                if (match) {
                    return new Date(`${match[3]}-${match[2]}-${match[1]}T${match[4]}:${match[5]}`).toISOString();
                }
                return new Date(val).toISOString();
            })()
        };
        // Route to platform-specific OAuth callback endpoint
        const oauthPath = OAUTH_CALLBACK_PATHS[platform] || 'ssm-oauth-callback-youtube';
        const setLoad = (b) => document.getElementById('loading-oauth-cb').style.display = b ? 'flex' : 'none';
        callWebhook(oauthPath, payload, async (d) => {
            showOutput('res-oauth-cb', d, false);
            // OAuth completion logic: Check if all requested platforms are authenticated
            await syncClientDataManual();
            const reqPlats = getClientPlatforms();
            let allActive = true;
            reqPlats.forEach(p => {
                const sheetCol = `${p}_Token_Status`;
                const tStatus = currentClient[sheetCol] || '';
                if (normalizeString(tStatus) !== 'active') allActive = false;
            });
            if (allActive && normalizeString(currentClient.status) === 'pending activation') {
                const completePayload = generateStandardPayload(currentClient);
                completePayload.status = 'Active';
                callWebhook('re-onboard', completePayload, () => {
                    syncClientDataManual(); // Refresh one last time
                });
            }
        }, (e) => showOutput('res-oauth-cb', e, true), setLoad);
    });
}

// --- Platform Manager ---
const ALL_PLATFORMS = ['YT', 'IG', 'FB', 'LI'];

function renderManagePlatformChoices(force) {
    const container = document.getElementById('upg-platform-choices');
    if (!container) return;

    // Don't re-render while the user is actively interacting with the form
    if (!force) {
        const upgradeSection = document.getElementById('view-dashboard');
        const settingsList = document.getElementById('upg-platform-settings-list');
        const hasSelectedPlatforms = container.querySelector('input[type="checkbox"]:checked');
        const hasActiveInput = upgradeSection && upgradeSection.contains(document.activeElement) &&
            (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA' || document.activeElement.tagName === 'SELECT');
        const hasSettingsContent = settingsList && settingsList.innerHTML.trim().length > 0;

        if (hasSelectedPlatforms || hasActiveInput || hasSettingsContent) return;
    }

    const action          = (document.getElementById('upg_action') || {}).value || 'add';
    const activePlatforms = getClientPlatforms();

    const eligible = action === 'add'
        ? ALL_PLATFORMS.filter(p => !activePlatforms.includes(p))
        : ALL_PLATFORMS.filter(p =>  activePlatforms.includes(p));

    if (eligible.length === 0) {
        container.innerHTML = `
                <div style="padding: 12px 0; color: var(--text-secondary); font-size: 0.9rem;">
                    ${action === 'add'
                ? 'All available platforms are already active.'
                : 'No active platforms available to remove.'}
                </div>`;
        // Clear any open settings panel since there is nothing to select
        const settingsBlock = document.getElementById('upg-settings-block');
        const settingsList  = document.getElementById('upg-platform-settings-list');
        if (settingsBlock) settingsBlock.classList.remove('has-settings');
        if (settingsList)  settingsList.innerHTML = '';
        return;
    }

    container.innerHTML = eligible.map(p => `
            <div class="card platform-card selectable manage-platform-card"
                 onclick="toggleUpgradePlatform(this)" data-plat="${escapeHTML(p)}">
                <input type="checkbox" value="${escapeHTML(p)}" hidden>
                <div class="platform-header" style="justify-content: center;">
                    <span class="platform-icon">${escapeHTML(PLATFORM_NAMES[p] || p)}</span>
                </div>
            </div>
        `).join('');

    // Reset settings panel when the choice list is rebuilt
    handleUpgradePlatformSelection();
}

function setUpgradeAction(action) {
    const actionEl = document.getElementById('upg_action');
    const addBtn = document.getElementById('upg-action-add');
    const removeBtn = document.getElementById('upg-action-remove');
    const submitBtn = document.getElementById('upg-submit-btn');
    if (actionEl) actionEl.value = action;
    if (addBtn) addBtn.classList.toggle('active', action === 'add');
    if (removeBtn) removeBtn.classList.toggle('active', action === 'remove');
    if (submitBtn) submitBtn.textContent = action === 'add' ? 'Add Platform' : 'Remove Platform';
    toggleUpgFields();
    renderManagePlatformChoices(true);
}

function toggleUpgFields() {
    const act = document.getElementById('upg_action').value;
    if (act !== 'add') {
        document.getElementById('upg-settings-block').classList.remove('has-settings');
    }
}

function getSelectedUpgradePlatforms() {
    return Array.from(document.querySelectorAll('#upg-platform-choices input[type="checkbox"]:checked')).map(el => el.value);
}

function toggleUpgradePlatform(card) {
    const checkbox = card.querySelector('input[type="checkbox"]');
    if (!checkbox) return;
    checkbox.checked = !checkbox.checked;
    card.classList.toggle('active', checkbox.checked);
    handleUpgradePlatformSelection();
}

function handleUpgradePlatformSelection() {
    const act = document.getElementById('upg_action').value;
    const container = document.getElementById('upg-platform-settings-list');
    const settingsBlock = document.getElementById('upg-settings-block');
    if (!container) return;
    if (act !== 'add') {
        container.innerHTML = '';
        if (settingsBlock) settingsBlock.classList.remove('has-settings');
        return;
    }
    const selected = getSelectedUpgradePlatforms();
    if (settingsBlock) settingsBlock.classList.toggle('has-settings', selected.length > 0);
    container.innerHTML = selected.map((p) => {
        const pName = PLATFORM_NAMES[p] || p;
        return `
          <div class="card platform-setting-block upg-platform-settings" data-upg-settings="${p}">
            <h4 style="margin-bottom:12px;">${pName}</h4>
            <div class="upg-settings-grid">
              <div class="form-group"><label>Name</label><input type="text" data-field="name" placeholder="e.g. ${pName} official page" required></div>
              <div class="form-group"><label>Link</label><input type="text" data-field="link" placeholder="https://example.com/profile" required></div>
              <div class="form-group"><label>Niche</label><input type="text" data-field="niche" placeholder="e.g. Fitness coaching" required></div>
              <div class="form-group"><label>Tone</label><input type="text" data-field="tone" placeholder="e.g. Friendly, expert, concise" required></div>
              <div class="form-group"><label>Format</label><input type="text" data-field="format" placeholder="e.g. Reel, carousel, short post" required></div>
              <div class="form-group"><label>Emoji</label><input type="text" data-field="emoji" placeholder="e.g. Minimal, brand-safe" required></div>
              <div class="form-group"><label>Post Time</label><input type="text" data-field="post_time" placeholder="e.g. 14:30" required></div>
              <div class="form-group"><label>Timezone</label><input type="text" data-field="timezone" value="Asia/Kolkata" required></div>
              <div class="form-group"><label>Language</label><input type="text" data-field="language" placeholder="e.g. English" required></div>
              <div class="form-group"><label>Content Type</label><input type="text" data-field="content_type" placeholder="e.g. Educational + promotional" required></div>
              <div class="form-group" style="grid-column: 1 / -1;"><label>Reference Captions (one per line)</label><textarea rows="4" data-field="reference_captions" placeholder="Example caption one&#10;Example caption two&#10;Example caption three" required></textarea></div>
            </div>
          </div>
        `;
    }).join('');
}

function applyLocalPlatformMutation(action, selectedPlatforms, perPlatformSettings = {}) {
    if (!currentClient) return;

    const selected = uniquePlatforms(selectedPlatforms);
    const currentPlatforms = getClientPlatforms();
    const nextPlatforms = action === 'add'
        ? uniquePlatforms([...currentPlatforms, ...selected])
        : currentPlatforms.filter(platform => !selected.includes(platform));

    currentClient.platforms = nextPlatforms;
    currentClient['Platforms Active'] = nextPlatforms.join(', ');

    const platformData = {
        ...(currentClient.platform_data || currentClient.platformdata || {})
    };

    selected.forEach(platform => {
        if (action === 'remove') {
            delete platformData[platform];
            delete platformData[platform.toLowerCase()];
            PLATFORM_SETTING_FIELDS.forEach(([, , sheetSuffix]) => {
                delete currentClient[`${platform}_${sheetSuffix}`];
            });
            Object.values(PLATFORM_AUTH_FIELDS).forEach(sheetSuffix => {
                delete currentClient[`${platform}_${sheetSuffix}`];
            });
            return;
        }

        const settings = perPlatformSettings[platform] || {};
        platformData[platform] = {
            ...(platformData[platform] || {}),
            ...settings
        };

        PLATFORM_SETTING_FIELDS.forEach(([fieldKey, , sheetSuffix]) => {
            if (settings[fieldKey] === undefined) return;
            currentClient[`${platform}_${sheetSuffix}`] = Array.isArray(settings[fieldKey])
                ? settings[fieldKey].join('\n')
                : settings[fieldKey];
        });
    });

    currentClient.platform_data = platformData;
    currentClient.platformdata = platformData;

    const clientId = currentClient.client_id || currentClient.clientid || currentClient['Client ID'] || '';
    dashboardClientRecords = (dashboardClientRecords || []).map(record => {
        const recordId = record.client_id || record.clientid || record['Client ID'] || '';
        return recordId && clientId && recordId === clientId
            ? { ...record, platforms: nextPlatforms, 'Platforms Active': nextPlatforms.join(', '), platform_data: platformData, platformdata: platformData }
            : record;
    });

    localStorage.setItem('current_client', JSON.stringify(currentClient));
    localStorage.setItem('dashboard_client_records', JSON.stringify(dashboardClientRecords));

    updateDashboardData(currentClient);
    renderActivePlatforms();
    renderAuthGrid();
    renderManagePlatformChoices(true);
}

document.getElementById('form-upgrade').addEventListener('submit', (e) => {
    e.preventDefault();
    const act = document.getElementById('upg_action').value;
    const selectedPlatforms = getSelectedUpgradePlatforms();
    if (selectedPlatforms.length === 0) {
        showOutput('res-upgrade', 'Please select at least one platform.', true);
        return;
    }
    const clientId = currentClient ? (currentClient.client_id || currentClient.clientid || '') : '';
    const payload = {
        client_id: clientId,
        clientid: clientId,
        action: act,
        platforms: selectedPlatforms
    };
    if (act === 'add') {
        const settingsBlocks = Array.from(document.querySelectorAll('[data-upg-settings]'));
        const missing = settingsBlocks.some(block => {
            return Array.from(block.querySelectorAll('input, textarea')).some(input => !input.value.trim());
        });
        if (missing || settingsBlocks.length !== selectedPlatforms.length) {
            showOutput('res-upgrade', 'Please complete all Platform Settings fields before adding platforms.', true);
            return;
        }
        payload.per_platform = {};
        settingsBlocks.forEach(block => {
            const platform = block.getAttribute('data-upg-settings');
            payload.per_platform[platform] = {};
            block.querySelectorAll('[data-field]').forEach(input => {
                const field = input.getAttribute('data-field');
                payload.per_platform[platform][field] = field === 'reference_captions'
                    ? parseReferenceCaptions(input.value, platform)
                    : input.value.trim();
            });
        });
    }
    const setLoad = (b) => document.getElementById('loading-upgrade').style.display = b ? 'flex' : 'none';
    showOutput('res-upgrade', act === 'remove' ? 'Removing platform...' : 'Adding platform...', act === 'remove');
    callWebhook('upgrade-client', payload, (d) => {
        const completedMessage = act === 'remove'
            ? `${selectedPlatforms.length === 1 ? 'Platform' : 'Platforms'} removed successfully.`
            : d;
        showOutput('res-upgrade', completedMessage, false);
        if (currentClient) {
            applyLocalPlatformMutation(act, selectedPlatforms, payload.per_platform || {});
        }
    }, (e) => showOutput('res-upgrade', e, true), setLoad);
});

// --- Lifecycle Modals ---
let pendingAction = '';
function showModal(action) {
    pendingAction = action;
    const t = document.getElementById('modal-title');
    const d = document.getElementById('modal-desc');
    const b = document.getElementById('modal-confirm');
    const cancelBtn = document.querySelector('#action-modal .btn-secondary');
    const status = normalizeString(getField('Status', 'status'));
    const isOffboarded = status.includes('offboard');
    const isActive = status.includes('active') || status.includes('onboard');

    if (cancelBtn) {
        cancelBtn.style.display = '';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.onclick = closeModal;
    }
    if (b) {
        b.style.display = '';
        b.disabled = false;
        b.textContent = 'Confirm';
    }

    if (action === 'reonboard') {
        if (!isOffboarded) {
            t.textContent = 'Re-onboard Not Possible';
            d.textContent = isActive
                ? 'This client is already active and cannot be re-onboarded.'
                : 'Only offboarded clients can be re-onboarded.';
            if (b) b.style.display = 'none';
            if (cancelBtn) cancelBtn.textContent = 'Close';
            document.getElementById('action-modal').classList.add('show');
            return;
        }
        t.textContent = 'Confirm Re-onboard';
        d.textContent = 'This will re-activate the client and restart the onboarding process. Would you like to continue?';
        b.className = 'btn btn-primary';
    } else if (action === 'offboard') {
        if (isOffboarded) {
            t.textContent = 'Already Offboarded';
            d.textContent = 'This client is already offboarded and cannot be offboarded again.';
            if (b) b.style.display = 'none';
            if (cancelBtn) cancelBtn.textContent = 'Close';
            document.getElementById('action-modal').classList.add('show');
            return;
        }
        t.textContent = 'Confirm Offboarding';
        d.textContent = 'This will permanently delete client data and revoke all access.';
        b.className = 'btn btn-danger';
    }
    bindLifecycleConfirmHandler();
    document.getElementById('action-modal').classList.add('show');
}

function closeModal() {
    document.getElementById('action-modal').classList.remove('show');
    pendingAction = '';
}

function setLifecycleModalState(title, message, options = {}) {
    const t = document.getElementById('modal-title');
    const d = document.getElementById('modal-desc');
    const b = document.getElementById('modal-confirm');
    const cancelBtn = document.querySelector('#action-modal .btn-secondary');
    if (t) t.textContent = title;
    if (d) d.textContent = message;
    if (b) {
        b.disabled = Boolean(options.confirmDisabled);
        b.textContent = options.confirmText || 'Confirm';
        b.className = options.confirmClass || b.className;
        b.style.display = options.hideConfirm ? 'none' : '';
    }
    if (cancelBtn) {
        cancelBtn.disabled = Boolean(options.cancelDisabled);
        cancelBtn.textContent = options.cancelText || 'Cancel';
        cancelBtn.style.display = options.hideCancel ? 'none' : '';
        cancelBtn.onclick = options.cancelAction || closeModal;
    }
}

function showOffboardCompletionChoice() {
    const confirmBtn = document.getElementById('modal-confirm');
    const cancelBtn = document.querySelector('#action-modal .btn-secondary');
    setLifecycleModalState('Offboard Successful', 'The client was offboarded successfully. Do you want to return to the home page?', {
        confirmText: 'Yes',
        confirmClass: 'btn btn-primary',
        cancelText: 'No'
    });
    if (confirmBtn) {
        confirmBtn.onclick = () => {
            closeModal();
            signOut();
        };
    }
    if (cancelBtn) {
        cancelBtn.onclick = () => {
            closeModal();
            renderDashboard();
            updateDashboardData(currentClient);
            renderActivePlatforms();
            renderAuthGrid();
            renderManagePlatformChoices(true);
        };
    }
}

function bindLifecycleConfirmHandler() {
    const confirmBtn = document.getElementById('modal-confirm');
    if (!confirmBtn) return;
    confirmBtn.onclick = handleLifecycleConfirm;
}

function handleLifecycleConfirm() {
    const cid = currentClient ? (currentClient.client_id || currentClient.clientid) : '';
    const actionToExecute = pendingAction;

    // Pass the entire client object plus explicit ID keys to ensure the webhook has all details it needs
    const payload = generateStandardPayload(currentClient);

    if (actionToExecute === 'reonboard') {
        setLifecycleModalState('Re-onboarding Client', 'Re-onboarding is in progress. Please wait...', {
            confirmDisabled: true,
            cancelDisabled: true,
            confirmText: 'Processing...'
        });
        callWebhook('re-onboard', payload, (d) => {
            setLifecycleModalState('Re-onboard Successful', 'The client was re-onboarded successfully.', {
                hideConfirm: true,
                hideCancel: true
            });
            refreshClientDataAfterMutation();
            setTimeout(() => closeModal(), 1500);
        }, (e) => {
            setLifecycleModalState('Re-onboard Failed', e || 'Failed to re-onboard client.', {
                confirmText: 'Try Again',
                confirmClass: 'btn btn-primary',
                cancelText: 'Close'
            });
            bindLifecycleConfirmHandler();
        }, () => { });
    } else if (actionToExecute === 'offboard') {
        setLifecycleModalState('Offboarding Client', 'Offboarding is in progress. Please wait...', {
            confirmDisabled: true,
            cancelDisabled: true,
            confirmText: 'Processing...'
        });
        callWebhook('offboard-client', payload, (d) => {
            currentClient = {
                ...currentClient,
                status: 'Offboarded',
                Status: 'Offboarded',
                'Offboard Date': d.offboard_date || d.offboardDate || new Date().toISOString()
            };
            localStorage.setItem('current_client', JSON.stringify(currentClient));
            showOffboardCompletionChoice();
        }, (e) => {
            setLifecycleModalState('Offboard Failed', e || 'Failed to offboard client.', {
                confirmText: 'Try Again',
                confirmClass: 'btn btn-danger',
                cancelText: 'Close'
            });
            bindLifecycleConfirmHandler();
        }, () => { });
    }
}

bindLifecycleConfirmHandler();


function copyClientId() {
    const id = document.getElementById('popup-client-id').textContent;
    navigator.clipboard.writeText(id).then(() => {
        const btn = document.getElementById('copy-client-id-btn');
        btn.innerHTML = '<svg width="14" height="14" fill="none" stroke="#30A46C" stroke-width="2" viewBox="0 0 24 24" style="display:block;"><polyline points="20 6 9 17 4 12"/></svg> Copied!';
        btn.style.color = '#30A46C';
        btn.style.borderColor = '#30A46C';
        setTimeout(() => {
            btn.innerHTML = '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="display:block;"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy';
            btn.style.color = '';
            btn.style.borderColor = '';
        }, 2000);
    });
}

function copyDashClientId() {
    const id = currentClient ? currentClient.client_id : '';
    if (!id) return;
    navigator.clipboard.writeText(id).then(() => {
        const btn = document.querySelector('#dash-client-id button');
        if (btn) {
            btn.style.color = '#30A46C';
            setTimeout(() => { btn.style.color = ''; }, 2000);
        }
    });
}

