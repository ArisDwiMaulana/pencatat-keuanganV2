// Auth logic for Login / Signup

document.addEventListener('DOMContentLoaded', async () => {
    // If user already logged in, redirect directly to catat.html
    const user = await checkAuth(false);
    if (user) {
        window.location.replace('/catat.html');
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
        clearFormErrors(formSignup);
    });

    tabSignup.addEventListener('click', (e) => {
        e.preventDefault();
        tabSignup.classList.add('tab-active');
        tabLogin.classList.remove('tab-active');
        formSignup.classList.remove('hidden');
        formLogin.classList.add('hidden');
        clearFormErrors(formLogin);
    });
}

function setupForms() {
    const formLogin = document.getElementById('form-login');
    const formSignup = document.getElementById('form-signup');

    if (formLogin) {
        const usernameInput = document.getElementById('login-username');
        const passwordInput = document.getElementById('login-password');
        const btn = document.getElementById('btn-login');

        [usernameInput, passwordInput].forEach((input) => {
            if (!input) return;
            input.addEventListener('input', () => clearFieldError(input));
        });

        formLogin.addEventListener('submit', async (e) => {
            e.preventDefault();
            clearFormErrors(formLogin);

            const username = usernameInput.value.trim();
            const password = passwordInput.value;
            let valid = true;

            if (!username) {
                setFieldError(usernameInput, 'Username wajib diisi');
                valid = false;
            }

            if (!password) {
                setFieldError(passwordInput, 'Password wajib diisi');
                valid = false;
            }

            if (!valid) {
                showToast('Lengkapi data login terlebih dahulu', 'warning');
                return;
            }

            setButtonLoading(btn, true, 'Sedang masuk...');

            try {
                const res = await apiFetch('/api/auth/login', {
                    method: 'POST',
                    body: JSON.stringify({ username, password }),
                });

                if (res.ok && res.data && res.data.success) {
                    showToast('Login berhasil! Mengalihkan...', 'success');
                    setTimeout(() => {
                        window.location.replace('/catat.html');
                    }, 500);
                } else {
                    const msg = (res.data && res.data.message) || 'Username atau password salah';
                    showToast(msg, 'error');
                    if (res.status === 401) {
                        setFieldError(passwordInput, 'Periksa kembali username dan password Anda');
                    }
                }
            } catch (err) {
                showToast('Terjadi kesalahan jaringan', 'error');
            } finally {
                setButtonLoading(btn, false);
            }
        });
    }

    if (formSignup) {
        const displayNameInput = document.getElementById('signup-name');
        const usernameInput = document.getElementById('signup-username');
        const passwordInput = document.getElementById('signup-password');
        const confirmInput = document.getElementById('signup-confirm-password');
        const btn = document.getElementById('btn-signup');

        [displayNameInput, usernameInput, passwordInput, confirmInput].forEach((input) => {
            if (!input) return;
            input.addEventListener('input', () => clearFieldError(input));
        });

        formSignup.addEventListener('submit', async (e) => {
            e.preventDefault();
            clearFormErrors(formSignup);

            const displayName = displayNameInput.value.trim();
            const username = usernameInput.value.trim();
            const password = passwordInput.value;
            const confirmPassword = confirmInput.value;
            let valid = true;

            if (!displayName) {
                setFieldError(displayNameInput, 'Nama tampilan wajib diisi');
                valid = false;
            }

            if (username.length < 3) {
                setFieldError(usernameInput, 'Username minimal 3 karakter');
                valid = false;
            }

            if (password.length < 6) {
                setFieldError(passwordInput, 'Password minimal 6 karakter');
                valid = false;
            }

            if (password !== confirmPassword) {
                setFieldError(confirmInput, 'Konfirmasi password tidak cocok');
                valid = false;
            }

            if (!valid) {
                showToast('Periksa kembali data pendaftaran Anda', 'warning');
                return;
            }

            setButtonLoading(btn, true, 'Mendaftarkan...');

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
                        window.location.replace('/catat.html');
                    }, 500);
                } else {
                    const msg = (res.data && res.data.message) || 'Gagal mendaftar';
                    showToast(msg, 'error');

                    if (msg.toLowerCase().includes('username')) {
                        setFieldError(usernameInput, msg);
                    } else if (msg.toLowerCase().includes('password')) {
                        setFieldError(passwordInput, msg);
                    } else if (msg.toLowerCase().includes('nama')) {
                        setFieldError(displayNameInput, msg);
                    }
                }
            } catch (err) {
                showToast('Terjadi kesalahan jaringan', 'error');
            } finally {
                setButtonLoading(btn, false);
            }
        });
    }
}
