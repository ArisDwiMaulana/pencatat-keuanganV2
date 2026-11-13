// Frontend logic for the transaction history page (riwayat.html)

const riwayatState = {
    page: 1,
    perPage: 20,
    total: 0,
    totalPages: 0,
};

document.addEventListener('DOMContentLoaded', async () => {
    const user = await checkAuth(true);
    if (!user) return;

    renderNavbar('riwayat', user);

    setupCustomDateDefaults();
    setupFilterListeners();
    setupPagination();
    setupDeleteHandler();

    await loadTransactions(1);
});

/* --------------------------------- Filter -------------------------------- */

function setupCustomDateDefaults() {
    const [from, to] = getMonthRange(0);
    const fromInput = document.getElementById('date-from');
    const toInput = document.getElementById('date-to');

    if (fromInput) fromInput.value = from;
    if (toInput) toInput.value = to;
}

function setupFilterListeners() {
    const form = document.getElementById('filter-form');
    const period = document.getElementById('period');

    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            loadTransactions(1);
        });
    }

    if (period) {
        period.addEventListener('change', () => {
            toggleCustomRange();
            loadTransactions(1);
        });
    }

    document.querySelectorAll('input[name="filter-type"]').forEach((radio) => {
        radio.addEventListener('change', () => loadTransactions(1));
    });

    document.querySelectorAll('input[name="filter-payment"]').forEach((radio) => {
        radio.addEventListener('change', () => loadTransactions(1));
    });

    ['date-from', 'date-to'].forEach((id) => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('change', () => {
                if (isCustomPeriod() && customRangeIsComplete()) {
                    loadTransactions(1);
                }
            });
        }
    });

    const btnReset = document.getElementById('btn-reset');
    if (btnReset) {
        btnReset.addEventListener('click', () => {
            if (period) period.value = 'month';

            document.querySelector('input[name="filter-type"][value="all"]').checked = true;
            document.querySelector('input[name="filter-payment"][value="all"]').checked = true;

            setupCustomDateDefaults();
            toggleCustomRange();
            loadTransactions(1);
        });
    }
}

function toggleCustomRange() {
    const customRange = document.getElementById('custom-range');
    if (!customRange) return;
    customRange.classList.toggle('hidden', !isCustomPeriod());
}

function isCustomPeriod() {
    return document.getElementById('period')?.value === 'custom';
}

function customRangeIsComplete() {
    return Boolean(document.getElementById('date-from')?.value && document.getElementById('date-to')?.value);
}

function getSelectedFilter(name, fallback = 'all') {
    return document.querySelector(`input[name="${name}"]:checked`)?.value || fallback;
}

function getDateRange() {
    const period = document.getElementById('period')?.value || 'month';

    switch (period) {
        case 'today': {
            const today = todayISO();
            return { from: today, to: today };
        }
        case 'week': {
            return getWeekRange();
        }
        case 'month': {
            const [from, to] = getMonthRange(0);
            return { from, to };
        }
        case 'last_month': {
            const [from, to] = getMonthRange(-1);
            return { from, to };
        }
        case 'custom':
        default: {
            return {
                from: document.getElementById('date-from')?.value || '',
                to: document.getElementById('date-to')?.value || '',
            };
        }
    }
}

/* --------------------------------- Data ---------------------------------- */

async function loadTransactions(page = 1) {
    const loading = document.getElementById('history-loading');
    const empty = document.getElementById('history-empty');
    const wrapper = document.getElementById('history-table-wrapper');
    const pagination = document.getElementById('pagination');
    const tbody = document.getElementById('transaction-list');

    const range = getDateRange();

    if (!range.from || !range.to) {
        showToast('Lengkapi tanggal "Dari" dan "Sampai" untuk filter custom', 'warning');
        return;
    }

    if (range.from > range.to) {
        showToast('Tanggal "Dari" tidak boleh melebihi "Sampai"', 'warning');
        return;
    }

    riwayatState.page = Math.max(1, page);

    const params = new URLSearchParams({
        date_from: range.from,
        date_to: range.to,
        type: getSelectedFilter('filter-type'),
        payment_method: getSelectedFilter('filter-payment'),
        page: String(riwayatState.page),
        per_page: String(riwayatState.perPage),
    });

    loading.classList.remove('hidden');
    empty.classList.add('hidden');
    wrapper.classList.add('hidden');
    pagination.classList.add('hidden');

    try {
        const res = await apiFetch(`/api/transactions?${params.toString()}`);

        if (!res.ok || !res.data || !res.data.success) {
            const msg = (res.data && res.data.message) || 'Gagal memuat riwayat transaksi';
            showToast(msg, 'error');
            tbody.innerHTML = '';
            renderSummary(null);
            document.getElementById('result-info').textContent = '';
            empty.classList.remove('hidden');
            return;
        }

        const payload = res.data.data || {};
        const items = payload.items || [];

        riwayatState.total = payload.total || 0;
        riwayatState.totalPages = payload.total_pages || 0;

        renderSummary(payload.summary);
        renderTransactions(items);
        updateResultInfo(items.length);

        if (items.length === 0) {
            empty.classList.remove('hidden');
        } else {
            wrapper.classList.remove('hidden');
        }

        renderPagination();
    } finally {
        loading.classList.add('hidden');
    }
}

function renderSummary(summary) {
    const income = summary ? summary.total_income : 0;
    const expense = summary ? summary.total_expense : 0;
    const balance = summary ? summary.balance : 0;

    document.getElementById('summary-income').textContent = formatRupiah(income);
    document.getElementById('summary-expense').textContent = formatRupiah(expense);

    const balanceEl = document.getElementById('summary-balance');
    balanceEl.textContent = formatRupiah(balance);
    balanceEl.classList.remove('text-success', 'text-error');
    balanceEl.classList.add(balance >= 0 ? 'text-success' : 'text-error');
}

function renderTransactions(transactions) {
    const tbody = document.getElementById('transaction-list');
    if (!tbody) return;

    tbody.innerHTML = transactions
        .map((trx) => {
            const isIncome = trx.type === 'income';
            const badge = isIncome
                ? '<span class="badge badge-success badge-sm text-white">Masuk</span>'
                : '<span class="badge badge-error badge-sm text-white">Keluar</span>';
            const amountClass = isIncome ? 'text-success' : 'text-error';
            const sign = isIncome ? '+' : '−';
            const methodLabel = trx.payment_method === 'cash' ? '💵 Cash' : '💳 Cashless';
            const note = trx.note || '';
            const noteCell = note
                ? `<span class="block max-w-[12rem] truncate text-base-content/70" title="${escapeHtml(note)}">${escapeHtml(note)}</span>`
                : '<span class="text-base-content/40">—</span>';

            return `
                <tr>
                    <td class="whitespace-nowrap">${formatDateIndo(trx.date)}</td>
                    <td>${badge}</td>
                    <td class="font-medium whitespace-nowrap">${escapeHtml(trx.category_name)}</td>
                    <td class="whitespace-nowrap text-xs">${methodLabel}</td>
                    <td class="text-right whitespace-nowrap font-semibold ${amountClass}">
                        ${sign} ${formatRupiah(trx.amount)}
                    </td>
                    <td>${noteCell}</td>
                    <td class="text-right">
                        <button
                            type="button"
                            class="btn btn-ghost btn-xs text-error"
                            data-delete-id="${trx.id}"
                            title="Hapus transaksi"
                            aria-label="Hapus transaksi"
                        >🗑️</button>
                    </td>
                </tr>
            `;
        })
        .join('');
}

function updateResultInfo(shownCount) {
    const info = document.getElementById('result-info');
    if (!info) return;

    if (riwayatState.total === 0) {
        info.textContent = 'Tidak ada data';
        return;
    }

    const start = (riwayatState.page - 1) * riwayatState.perPage + 1;
    const end = start + shownCount - 1;
    info.textContent = `Menampilkan ${start}–${end} dari ${riwayatState.total} transaksi`;
}

/* ------------------------------- Pagination ------------------------------ */

function setupPagination() {
    const btnPrev = document.getElementById('btn-prev');
    const btnNext = document.getElementById('btn-next');

    if (btnPrev) {
        btnPrev.addEventListener('click', () => {
            if (riwayatState.page > 1) loadTransactions(riwayatState.page - 1);
        });
    }

    if (btnNext) {
        btnNext.addEventListener('click', () => {
            if (riwayatState.page < riwayatState.totalPages) {
                loadTransactions(riwayatState.page + 1);
            }
        });
    }
}

function renderPagination() {
    const pagination = document.getElementById('pagination');
    const pageInfo = document.getElementById('page-info');
    const btnPrev = document.getElementById('btn-prev');
    const btnNext = document.getElementById('btn-next');

    if (riwayatState.total === 0) {
        pagination.classList.add('hidden');
        return;
    }

    pagination.classList.remove('hidden');
    pageInfo.textContent = `Halaman ${riwayatState.page} dari ${Math.max(1, riwayatState.totalPages)}`;
    btnPrev.disabled = riwayatState.page <= 1;
    btnNext.disabled = riwayatState.page >= riwayatState.totalPages;
}

/* --------------------------------- Delete -------------------------------- */

function setupDeleteHandler() {
    const tbody = document.getElementById('transaction-list');
    if (!tbody) return;

    tbody.addEventListener('click', async (e) => {
        const button = e.target.closest('button[data-delete-id]');
        if (!button) return;

        const id = button.getAttribute('data-delete-id');
        if (!confirm('Yakin ingin menghapus transaksi ini?')) return;

        button.disabled = true;

        try {
            const res = await apiFetch(`/api/transactions/${id}`, { method: 'DELETE' });

            if (res.ok && res.data && res.data.success) {
                showToast(res.data.message || 'Transaksi berhasil dihapus', 'success');

                // Jika baris terakhir di halaman ini dihapus, mundur satu halaman.
                const rowsOnPage = document.querySelectorAll('#transaction-list tr').length;
                const targetPage =
                    rowsOnPage === 1 && riwayatState.page > 1
                        ? riwayatState.page - 1
                        : riwayatState.page;

                await loadTransactions(targetPage);
            } else {
                const msg = (res.data && res.data.message) || 'Gagal menghapus transaksi';
                showToast(msg, 'error');
                button.disabled = false;
            }
        } catch (err) {
            button.disabled = false;
            showToast('Terjadi kesalahan jaringan', 'error');
        }
    });
}

/* -------------------------------- Helpers -------------------------------- */

function pad2(value) {
    return String(value).padStart(2, '0');
}

function toISODate(date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function todayISO() {
    return toISODate(new Date());
}

function getMonthRange(monthOffset = 0) {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + monthOffset + 1, 0);
    return [toISODate(firstDay), toISODate(lastDay)];
}

function getWeekRange() {
    const now = new Date();
    // Senin sebagai awal minggu (0 = Minggu, 1 = Senin, ...).
    const dayIndex = (now.getDay() + 6) % 7;
    const monday = new Date(now);
    monday.setDate(now.getDate() - dayIndex);
    return { from: toISODate(monday), to: toISODate(now) };
}

function formatDateIndo(isoDate) {
    if (!isoDate) return '—';
    const [year, month, day] = isoDate.split('-');
    if (!year || !month || !day) return isoDate;
    return `${day}/${month}/${year}`;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
