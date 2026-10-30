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
            const isAuthPage = window.location.pathname === '/' || window.location.pathname.endsWith('index.html');
            if (!isAuthPage) {
                window.location.href = '/index.html';
            }
            return { ok: false, status: 401, data: data || { message: 'Sesi berakhir, silakan login kembali' } };
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
            window.location.href = '/index.html';
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
        window.location.href = '/index.html';
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
    alert.innerHTML = `<span>${message}</span>`;

    container.appendChild(alert);

    setTimeout(() => {
        alert.classList.add('opacity-0');
        setTimeout(() => alert.remove(), 300);
    }, duration);
}

/**
 * Render shared Navbar for Catat and Riwayat pages
 */
function renderNavbar(activePage = 'catat', user = null) {
    const navPlaceholder = document.getElementById('navbar-placeholder');
    if (!navPlaceholder) return;

    const displayName = user ? (user.display_name || user.username) : 'Pengguna';

    navPlaceholder.innerHTML = `
        <div class="navbar bg-base-100 shadow-sm border-b border-base-200 px-4 md:px-8">
            <div class="flex-1">
                <a href="/catat.html" class="btn btn-ghost text-xl font-bold tracking-tight text-primary flex items-center gap-2">
                    <span>💰</span> Pencatat Keuangan
                </a>
            </div>
            <div class="flex-none gap-2">
                <ul class="menu menu-horizontal px-1 gap-1">
                    <li>
                        <a href="/catat.html" class="${activePage === 'catat' ? 'active font-semibold' : ''}">
                            📝 Catat
                        </a>
                    </li>
                    <li>
                        <a href="/riwayat.html" class="${activePage === 'riwayat' ? 'active font-semibold' : ''}">
                            📊 Riwayat
                        </a>
                    </li>
                </ul>

                <div class="dropdown dropdown-end ml-2">
                    <div tabindex="0" role="button" class="btn btn-ghost btn-circle avatar placeholder bg-primary/10 text-primary">
                        <span class="text-sm font-semibold">${displayName.charAt(0).toUpperCase()}</span>
                    </div>
                    <ul tabindex="0" class="mt-3 z-[1] p-2 shadow menu menu-sm dropdown-content bg-base-100 rounded-box w-52 border border-base-200">
                        <li class="menu-title px-4 py-2">
                            <span class="text-xs text-base-content/60">Halo,</span>
                            <span class="font-bold text-base-content text-sm truncate">${displayName}</span>
                        </li>
                        <div class="divider my-1"></div>
                        <li>
                            <button onclick="logout()" class="text-error hover:bg-error/10">
                                🚪 Keluar (Logout)
                            </button>
                        </li>
                    </ul>
                </div>
            </div>
        </div>
    `;
}
