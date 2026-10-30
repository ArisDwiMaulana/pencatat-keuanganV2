// Auth logic for Login / Signup

document.addEventListener('DOMContentLoaded', async () => {
    // If user already logged in, redirect directly to catat.html
    const user = await checkAuth(false);
    if (user) {
        window.location.href = '/catat.html';
        return;
    }

    setupTabs();
    setupForms();
});

function setupTabs() {
    const tabLogin = document.getElementById('tab-login');
    const tabSignup = document.getElementById('tab-signup');
    const formLogin = document.getElementById('form-login');
    const formSignup = document.getElementById('form-signup');

    if (!tabLogin || !tabSignup || !formLogin || !formSignup) return;

    tabLogin.addEventListener('click', (e) => {
        e.preventDefault();
        tabLogin.classList.add('tab-active');
        tabSignup.classList.remove('tab-active');
        formLogin.classList.remove('hidden');
        formSignup.classList.add('hidden');
    });

    tabSignup.addEventListener('click', (e) => {
        e.preventDefault();
        tabSignup.classList.add('tab-active');
        tabLogin.classList.remove('tab-active');
        formSignup.classList.remove('hidden');
        formLogin.classList.add('hidden');
    });
}

function setupForms() {
    const formLogin = document.getElementById('form-login');
    const formSignup = document.getElementById('form-signup');

    if (formLogin) {
        formLogin.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('btn-login');
            const usernameInput = document.getElementById('login-username');
            const passwordInput = document.getElementById('login-password');

            const username = usernameInput.value.trim();
            const password = passwordInput.value;

            if (!username || !password) {
                showToast('Username dan password wajib diisi', 'warning');
                return;
            }

            setLoading(btn, true, 'Sedang masuk...');

            try {
                const res = await apiFetch('/api/auth/login', {
                    method: 'POST',
                    body: JSON.stringify({ username, password }),
                });

                if (res.ok && res.data && res.data.success) {
                    showToast('Login berhasil! Mengalihkan...', 'success');
                    setTimeout(() => {
                        window.location.href = '/catat.html';
                    }, 500);
                } else {
                    const msg = (res.data && res.data.message) || 'Username atau password salah';
                    showToast(msg, 'error');
                }
            } catch (err) {
                showToast('Terjadi kesalahan jaringan', 'error');
            } finally {
                setLoading(btn, false, '🔑 Masuk');
            }
        });
    }

    if (formSignup) {
        formSignup.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('btn-signup');
            const displayName = document.getElementById('signup-name').value.trim();
            const username = document.getElementById('signup-username').value.trim();
            const password = document.getElementById('signup-password').value;
            const confirmPassword = document.getElementById('signup-confirm-password').value;

            if (!displayName) {
                showToast('Nama tampilan wajib diisi', 'warning');
                return;
            }

            if (username.length < 3) {
                showToast('Username minimal 3 karakter', 'warning');
                return;
            }

            if (password.length < 6) {
                showToast('Password minimal 6 karakter', 'warning');
                return;
            }

            if (password !== confirmPassword) {
                showToast('Konfirmasi password tidak cocok', 'warning');
                return;
            }

            setLoading(btn, true, 'Mendaftarkan...');

            try {
                const res = await apiFetch('/api/auth/signup', {
                    method: 'POST',
                    body: JSON.stringify({
                        display_name: displayName,
                        username,
                        password,
                    }),
                });

                if (res.ok && res.data && res.data.success) {
                    showToast('Pendaftaran berhasil! Mengalihkan...', 'success');
                    setTimeout(() => {
                        window.location.href = '/catat.html';
                    }, 500);
                } else {
                    const msg = (res.data && res.data.message) || 'Gagal mendaftar';
                    showToast(msg, 'error');
                }
            } catch (err) {
                showToast('Terjadi kesalahan jaringan', 'error');
            } finally {
                setLoading(btn, false, '✨ Buat Akun');
            }
        });
    }
}

function setLoading(button, isLoading, text) {
    if (!button) return;
    button.disabled = isLoading;
    if (isLoading) {
        button.innerHTML = `<span class="loading loading-spinner loading-sm"></span> ${text}`;
    } else {
        button.innerHTML = text;
    }
}
