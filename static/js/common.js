// Common shared utilities for Pencatat Keuangan

/**
 * Custom fetch wrapper with credentials (cookie session) and JSON handling
 */
async function apiFetch(url, options = {}) {
    const defaultHeaders = {
        'Content-Type': 'application/json',
    };

    const config = {
        ...options,
        headers: {
            ...defaultHeaders,
            ...options.headers,
        },
        credentials: 'include', // Ensure cookies are sent and received
    };

    try {
        const response = await fetch(url, config);
        const data = await response.json().catch(() => null);

        if (response.status === 401) {
            // Unauthorized - if not on index.html/login page, redirect
            const isAuthPage =
                window.location.pathname === '/' ||
                window.location.pathname.endsWith('index.html');
            if (!isAuthPage) {
                window.location.replace('/index.html');
            }
            return {
                ok: false,
                status: 401,
                data: data || { message: 'Sesi berakhir, silakan login kembali' },
            };
        }

        return {
            ok: response.ok,
            status: response.status,
            data,
        };
    } catch (err) {
        console.error('Network or fetch error:', err);
        return {
            ok: false,
            status: 0,
            data: { message: 'Gagal terhubung ke server. Periksa koneksi Anda.' },
        };
    }
}

/**
 * Check active authentication session
 */
async function checkAuth(redirectIfUnauth = true) {
    const res = await apiFetch('/api/auth/me');
    if (res.ok && res.data && res.data.success) {
        return res.data.data;
    } else {
        if (redirectIfUnauth) {
            window.location.replace('/index.html');
        }
        return null;
    }
}

/**
 * Logout user
 */
async function logout() {
    try {
        await apiFetch('/api/auth/logout', { method: 'POST' });
    } finally {
        window.location.replace('/index.html');
    }
}

/**
 * Format number to Indonesian Rupiah
 */
function formatRupiah(number) {
    if (isNaN(number)) return 'Rp 0';
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(number);
}

/**
 * Format ISO date (YYYY-MM-DD) to Indonesian format (DD/MM/YYYY)
 */
function formatTanggalIndo(dateString) {
    if (!dateString) return '—';

    const parts = String(dateString).slice(0, 10).split('-');
    if (parts.length !== 3) return String(dateString);

    const [year, month, day] = parts;
    return `${day}/${month}/${year}`;
}

/**
 * Escape user-provided text before injecting it into innerHTML
 */
function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Show DaisyUI toast notification
 * type: 'success' | 'error' | 'warning' | 'info'
 */
function showToast(message, type = 'info', duration = 3000) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast toast-top toast-end z-50';
        document.body.appendChild(container);
    }

    const alert = document.createElement('div');
    const alertClass = {
        success: 'alert alert-success text-white',
        error: 'alert alert-error text-white',
        warning: 'alert alert-warning text-white',
        info: 'alert alert-info text-white',
    }[type] || 'alert alert-info';

    alert.className = `${alertClass} shadow-lg flex items-center gap-2 transition-all duration-300`;
    alert.setAttribute('role', 'status');
    alert.innerHTML = `<span>${escapeHtml(message)}</span>`;

    container.appendChild(alert);

    setTimeout(() => {
        alert.classList.add('opacity-0');
        setTimeout(() => alert.remove(), 300);
    }, duration);
}

/**
 * Toggle a button into a loading state while preserving its original content.
 */
function setButtonLoading(button, isLoading, loadingText = 'Memuat...') {
    if (!button) return;

    if (isLoading) {
        if (!button.dataset.originalHtml) {
            button.dataset.originalHtml = button.innerHTML;
        }
        button.disabled = true;
        button.innerHTML = `<span class="loading loading-spinner loading-sm"></span> ${escapeHtml(loadingText)}`;
    } else {
        button.disabled = false;
        if (button.dataset.originalHtml) {
            button.innerHTML = button.dataset.originalHtml;
            delete button.dataset.originalHtml;
        }
    }
}

/* ---------------------------- Form validation ---------------------------- */

/**
 * Mark a form field as invalid and show an inline error message.
 */
function setFieldError(input, message) {
    if (!input) return;

    const errorClass =
        input.tagName === 'SELECT'
            ? 'select-error'
            : input.tagName === 'TEXTAREA'
              ? 'textarea-error'
              : 'input-error';

    // Untuk field yang dibungkus <label class="input ...">, beri class error
    // pada wrapper agar border DaisyUI ikut berubah warna.
    const wrapper = input.closest('label.input, label.select, label.textarea');
    [input, wrapper].forEach((target) => {
        if (!target) return;
        target.classList.add(errorClass);
    });

    input.setAttribute('aria-invalid', 'true');

    const container = input.closest('.form-control') || input.parentElement;
    if (!container) return;

    let errorEl = container.querySelector('.field-error');
    if (!errorEl) {
        errorEl = document.createElement('p');
        errorEl.className = 'field-error';
        container.appendChild(errorEl);
    }

    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
}

function clearFieldError(input) {
    if (!input) return;

    const wrapper = input.closest('label.input, label.select, label.textarea');
    [input, wrapper].forEach((target) => {
        if (!target) return;
        target.classList.remove('input-error', 'select-error', 'textarea-error');
    });
    input.removeAttribute('aria-invalid');

    const container = input.closest('.form-control') || input.parentElement;
    const errorEl = container ? container.querySelector('.field-error') : null;
    if (errorEl) {
        errorEl.textContent = '';
        errorEl.classList.add('hidden');
    }
}

function clearFormErrors(form) {
    if (!form) return;
    form.querySelectorAll('input, select, textarea').forEach((input) => clearFieldError(input));
}

/* ----------------------------- Confirm dialog ---------------------------- */

function ensureConfirmDialog() {
    let dialog = document.getElementById('app-confirm-dialog');
    if (dialog) return dialog;

    document.body.insertAdjacentHTML(
        'beforeend',
        `
        <dialog id="app-confirm-dialog" class="modal">
            <div class="modal-box max-w-sm">
                <h3 class="text-lg font-bold" data-confirm-title>Konfirmasi</h3>
                <p class="py-3 text-sm text-base-content/70" data-confirm-message></p>
                <div class="modal-action">
                    <form method="dialog" class="flex gap-2">
                        <button type="submit" class="btn btn-ghost btn-sm" value="cancel" data-confirm-cancel>Batal</button>
                        <button type="submit" class="btn btn-error btn-sm" value="confirm" data-confirm-ok>Ya</button>
                    </form>
                </div>
            </div>
            <form method="dialog" class="modal-backdrop">
                <button>close</button>
            </form>
        </dialog>
        `
    );

    return document.getElementById('app-confirm-dialog');
}

/**
 * Show a DaisyUI confirmation modal. Resolves to true when confirmed.
 * Falls back to window.confirm on browsers without <dialog> support.
 */
function showConfirmDialog({
    title = 'Konfirmasi',
    message = '',
    confirmText = 'Ya, Lanjutkan',
    cancelText = 'Batal',
    danger = true,
} = {}) {
    return new Promise((resolve) => {
        const dialog = ensureConfirmDialog();

        if (!dialog || typeof dialog.showModal !== 'function') {
            resolve(window.confirm(message || title));
            return;
        }

        dialog.querySelector('[data-confirm-title]').textContent = title;
        dialog.querySelector('[data-confirm-message]').textContent = message;
        dialog.querySelector('[data-confirm-cancel]').textContent = cancelText;

        const okButton = dialog.querySelector('[data-confirm-ok]');
        okButton.textContent = confirmText;
        okButton.className = `btn btn-sm ${danger ? 'btn-error' : 'btn-primary'}`;

        const onClose = () => {
            dialog.removeEventListener('close', onClose);
            resolve(dialog.returnValue === 'confirm');
        };

        dialog.addEventListener('close', onClose);
        dialog.returnValue = '';
        dialog.showModal();
    });
}

/* --------------------------------- Theme --------------------------------- */

const THEME_STORAGE_KEY = 'pencatat-theme';

function getCurrentTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

function updateThemeControls(theme) {
    const isDark = theme === 'dark';

    document.querySelectorAll('[data-theme-icon]').forEach((el) => {
        el.textContent = isDark ? '☀️' : '🌙';
    });

    document.querySelectorAll('[data-theme-toggle]').forEach((el) => {
        el.setAttribute('aria-label', isDark ? 'Aktifkan mode terang' : 'Aktifkan mode gelap');
        el.setAttribute('title', isDark ? 'Mode terang' : 'Mode gelap');
    });

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', isDark ? '#1d232a' : '#ffffff');
}

function applyTheme(theme, persist = true) {
    const normalized = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', normalized);

    if (persist) {
        try {
            localStorage.setItem(THEME_STORAGE_KEY, normalized);
        } catch (e) {
            // localStorage bisa tidak tersedia (mode privat); abaikan.
        }
    }

    updateThemeControls(normalized);
}

function toggleTheme() {
    applyTheme(getCurrentTheme() === 'dark' ? 'light' : 'dark');
}

function initTheme() {
    updateThemeControls(getCurrentTheme());

    // Ikuti perubahan tema sistem hanya jika user belum memilih secara manual.
    if (window.matchMedia) {
        const media = window.matchMedia('(prefers-color-scheme: dark)');
        const onChange = (event) => {
            let stored = null;
            try {
                stored = localStorage.getItem(THEME_STORAGE_KEY);
            } catch (e) {
                // abaikan
            }
            if (!stored) applyTheme(event.matches ? 'dark' : 'light', false);
        };

        if (media.addEventListener) media.addEventListener('change', onChange);
        else if (media.addListener) media.addListener(onChange);
    }
}

/* --------------------------------- Navbar -------------------------------- */

/**
 * Render shared Navbar for Catat and Riwayat pages
 */
function renderNavbar(activePage = 'catat', user = null) {
    const navPlaceholder = document.getElementById('navbar-placeholder');
    if (!navPlaceholder) return;

    const displayName = user ? user.display_name || user.username : 'Pengguna';
    const safeName = escapeHtml(displayName);
    const initial = escapeHtml(displayName.charAt(0).toUpperCase() || '?');

    const isCatat = activePage === 'catat';
    const isRiwayat = activePage === 'riwayat';
    const isDark = getCurrentTheme() === 'dark';
    const linkClass = (isActive) =>
        `px-2 md:px-3 rounded-lg transition-colors ${
            isActive ? 'active bg-primary/10 text-primary font-semibold' : ''
        }`;

    navPlaceholder.innerHTML = `
        <div class="navbar sticky top-0 z-40 min-h-14 bg-base-100 border-b border-base-200 px-3 md:px-8">
            <div class="flex-1 min-w-0">
                <a href="/catat.html" class="btn btn-ghost px-1.5 md:px-2 text-lg md:text-xl font-bold tracking-tight text-primary">
                    <span class="hidden sm:inline">Pencatat Keuangan</span>
                    <span class="sm:hidden">Pencatat</span>
                </a>
            </div>
            <div class="flex-none flex items-center gap-1 md:gap-2">
                <ul class="menu menu-horizontal px-0 gap-0.5">
                    <li>
                        <a href="/catat.html" class="${linkClass(isCatat)}"${isCatat ? ' aria-current="page"' : ''}>
                            Catat
                        </a>
                    </li>
                    <li>
                        <a href="/riwayat.html" class="${linkClass(isRiwayat)}"${isRiwayat ? ' aria-current="page"' : ''}>
                            Riwayat
                        </a>
                    </li>
                </ul>

                <button type="button" class="btn btn-ghost btn-circle" data-theme-toggle onclick="toggleTheme()" aria-label="Ganti tema">
                    <span data-theme-icon aria-hidden="true">${isDark ? '☀️' : '🌙'}</span>
                </button>

                <div class="dropdown dropdown-end">
                    <div tabindex="0" role="button" class="btn btn-ghost btn-circle avatar placeholder bg-primary/10 text-primary" aria-label="Menu pengguna">
                        <span class="text-sm font-semibold">${initial}</span>
                    </div>
                    <ul tabindex="0" class="mt-3 z-[1] p-2 shadow menu menu-sm dropdown-content bg-base-100 rounded-box w-56 border border-base-200">
                        <li class="menu-title px-4 py-2">
                            <span class="text-xs text-base-content/60">Halo,</span>
                            <span class="font-bold text-base-content text-sm truncate">${safeName}</span>
                        </li>
                        <li><div class="divider my-0"></div></li>
                        <li>
                            <button type="button" onclick="logout()" class="text-error hover:bg-error/10">
                                Keluar (Logout)
                            </button>
                        </li>
                    </ul>
                </div>
            </div>
        </div>
    `;

    updateThemeControls(getCurrentTheme());
}

// Terapkan ikon/tombol tema setelah DOM tersedia (script dimuat di akhir body).
initTheme();
