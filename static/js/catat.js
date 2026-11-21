// Frontend logic for the transaction input page (catat.html)

const catatState = {
    type: 'expense', // 'expense' | 'income'
    categories: [],
};

document.addEventListener('DOMContentLoaded', async () => {
    const user = await checkAuth(true);
    if (!user) return;

    renderNavbar('catat', user);

    setupDateField();
    setupTodayDateLabel();
    setupTabs();
    setupForm();
    setupDeleteHandler();

    await loadCategories();
    await loadTodayTransactions();
});

/* ---------------------------------- Setup --------------------------------- */

function setupDateField() {
    const dateInput = document.getElementById('date');
    if (dateInput) dateInput.value = todayISO();
}

function setupTodayDateLabel() {
    const label = document.getElementById('today-date');
    if (label) label.textContent = `(${formatTanggalIndo(todayISO())})`;
}

function setupTabs() {
    const tabExpense = document.getElementById('tab-expense');
    const tabIncome = document.getElementById('tab-income');

    if (!tabExpense || !tabIncome) return;

    tabExpense.addEventListener('click', () => switchType('expense'));
    tabIncome.addEventListener('click', () => switchType('income'));
}

async function switchType(type) {
    if (catatState.type === type) return;
    catatState.type = type;

    const tabExpense = document.getElementById('tab-expense');
    const tabIncome = document.getElementById('tab-income');

    const isExpense = type === 'expense';
    tabExpense.classList.toggle('tab-active', isExpense);
    tabIncome.classList.toggle('tab-active', !isExpense);

    // Kategori berbeda per tipe; bersihkan pilihan & error sebelumnya.
    clearFieldError(document.getElementById('category'));
    await loadCategories();
}

function setupForm() {
    const form = document.getElementById('form-transaction');
    if (!form) return;

    const categorySelect = document.getElementById('category');
    const amountInput = document.getElementById('amount');
    const dateInput = document.getElementById('date');
    const noteInput = document.getElementById('note');

    [
        [categorySelect, 'change'],
        [amountInput, 'input'],
        [dateInput, 'change'],
        [noteInput, 'input'],
    ].forEach(([input, eventName]) => {
        if (!input) return;
        input.addEventListener(eventName, () => clearFieldError(input));
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearFormErrors(form);

        const categoryId = Number(categorySelect.value);
        const amount = Number(amountInput.value);
        const date = dateInput.value;
        const note = noteInput.value.trim();
        const paymentMethod =
            document.querySelector('input[name="payment_method"]:checked')?.value || 'cash';
        let valid = true;

        if (!categoryId) {
            setFieldError(categorySelect, 'Pilih kategori terlebih dahulu');
            valid = false;
        }

        if (!amount || isNaN(amount) || amount <= 0) {
            setFieldError(amountInput, 'Nominal harus lebih dari 0');
            valid = false;
        }

        if (!date) {
            setFieldError(dateInput, 'Tanggal wajib diisi');
            valid = false;
        }

        if (!valid) {
            showToast('Lengkapi data transaksi terlebih dahulu', 'warning');
            return;
        }

        const btn = document.getElementById('btn-save');
        setButtonLoading(btn, true, 'Menyimpan...');

        try {
            const res = await apiFetch('/api/transactions', {
                method: 'POST',
                body: JSON.stringify({
                    category_id: categoryId,
                    type: catatState.type,
                    payment_method: paymentMethod,
                    amount,
                    date,
                    note: note || null,
                }),
            });

            if (res.ok && res.data && res.data.success) {
                showToast(res.data.message || 'Transaksi berhasil disimpan', 'success');
                amountInput.value = '';
                noteInput.value = '';
                amountInput.focus();
                await loadTodayTransactions();
            } else {
                const msg = (res.data && res.data.message) || 'Gagal menyimpan transaksi';
                showToast(msg, 'error');
            }
        } finally {
            setButtonLoading(btn, false);
        }
    });
}

function setupDeleteHandler() {
    const tbody = document.getElementById('today-list');
    if (!tbody) return;

    tbody.addEventListener('click', async (e) => {
        const button = e.target.closest('button[data-delete-id]');
        if (!button) return;

        const id = button.getAttribute('data-delete-id');
        const confirmed = await showConfirmDialog({
            title: 'Hapus Transaksi',
            message: 'Transaksi ini akan dihapus permanen. Lanjutkan?',
            confirmText: 'Ya, Hapus',
        });

        if (!confirmed) return;

        button.disabled = true;

        try {
            const res = await apiFetch(`/api/transactions/${id}`, { method: 'DELETE' });

            if (res.ok && res.data && res.data.success) {
                showToast(res.data.message || 'Transaksi berhasil dihapus', 'success');
                await loadTodayTransactions();
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

/* --------------------------------- Data ---------------------------------- */

async function loadCategories() {
    const select = document.getElementById('category');
    if (!select) return;

    select.disabled = true;
    select.innerHTML = '<option value="">Memuat kategori...</option>';

    const res = await apiFetch(`/api/categories?type=${encodeURIComponent(catatState.type)}`);

    select.disabled = false;

    if (!res.ok || !res.data || !res.data.success) {
        catatState.categories = [];
        select.innerHTML = '<option value="">Gagal memuat kategori</option>';
        const msg = (res.data && res.data.message) || 'Gagal memuat kategori';
        showToast(msg, 'error');
        return;
    }

    catatState.categories = res.data.data || [];

    if (catatState.categories.length === 0) {
        select.innerHTML = '<option value="">Belum ada kategori</option>';
        return;
    }

    const options = catatState.categories
        .map((cat) => `<option value="${cat.id}">${escapeHtml(cat.name)}</option>`)
        .join('');

    select.innerHTML = `<option value="" selected disabled>Pilih kategori</option>${options}`;
    select.value = '';
}

async function loadTodayTransactions() {
    const loading = document.getElementById('today-loading');
    const empty = document.getElementById('today-empty');
    const wrapper = document.getElementById('today-table-wrapper');
    const tbody = document.getElementById('today-list');
    const summary = document.getElementById('today-summary');

    if (!tbody) return;

    loading.classList.remove('hidden');
    empty.classList.add('hidden');
    wrapper.classList.add('hidden');

    try {
        const today = todayISO();
        const res = await apiFetch(
            `/api/transactions?date_from=${today}&date_to=${today}&per_page=100`
        );

        if (!res.ok || !res.data || !res.data.success) {
            const msg = (res.data && res.data.message) || 'Gagal memuat transaksi';
            showToast(msg, 'error');
            empty.classList.remove('hidden');
            summary.innerHTML = '';
            return;
        }

        const transactions = (res.data.data && res.data.data.items) || [];
        renderTodayTransactions(transactions);
    } finally {
        loading.classList.add('hidden');
    }
}

function renderTodayTransactions(transactions) {
    const empty = document.getElementById('today-empty');
    const wrapper = document.getElementById('today-table-wrapper');
    const tbody = document.getElementById('today-list');
    const summary = document.getElementById('today-summary');

    let incomeTotal = 0;
    let expenseTotal = 0;

    transactions.forEach((trx) => {
        if (trx.type === 'income') incomeTotal += trx.amount;
        else expenseTotal += trx.amount;
    });

    summary.innerHTML = `
        <span class="badge badge-success badge-sm text-white">Masuk: ${formatRupiah(incomeTotal)}</span>
        <span class="badge badge-error badge-sm text-white">Keluar: ${formatRupiah(expenseTotal)}</span>
    `;

    if (transactions.length === 0) {
        tbody.innerHTML = '';
        wrapper.classList.add('hidden');
        empty.classList.remove('hidden');
        return;
    }

    empty.classList.add('hidden');
    wrapper.classList.remove('hidden');

    tbody.innerHTML = transactions
        .map((trx) => {
            const isIncome = trx.type === 'income';
            const amountClass = isIncome ? 'text-success' : 'text-error';
            const sign = isIncome ? '+' : '−';
            const methodLabel = trx.payment_method === 'cash' ? 'Cash' : 'Cashless';
            const note = trx.note
                ? `<div class="text-xs text-base-content/60 mt-0.5">${escapeHtml(trx.note)}</div>`
                : '';

            return `
                <tr>
                    <td>
                        <div class="font-medium">${escapeHtml(trx.category_name)}</div>
                        ${note}
                    </td>
                    <td class="whitespace-nowrap text-xs">${methodLabel}</td>
                    <td class="text-right whitespace-nowrap font-semibold ${amountClass}">
                        ${sign} ${formatRupiah(trx.amount)}
                    </td>
                    <td class="text-right">
                        <button
                            type="button"
                            class="btn btn-error btn-xs"
                            data-delete-id="${trx.id}"
                            title="Hapus transaksi"
                            aria-label="Hapus transaksi"
                        >Hapus</button>
                    </td>
                </tr>
            `;
        })
        .join('');
}

/* -------------------------------- Helpers -------------------------------- */

function todayISO() {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
}
