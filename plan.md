# 📋 Implementation Plan: Pencatat Keuangan V2

## Deskripsi
Web fullstack sederhana untuk mencatat keuangan pribadi (pemasukan & pengeluaran) dengan fitur autentikasi, pencatatan transaksi, dan riwayat yang bisa difilter dan diekspor ke CSV.

**Tech Stack:**
| Layer | Teknologi |
|-------|-----------|
| Backend | Rust + Actix-web 4 |
| Database | SQLite (rusqlite dengan bundled) |
| Frontend | HTML + DaisyUI v5 + Tailwind CSS v4 + Vanilla JS |
| Auth | Session-based (actix-session + cookie) |
| Password | Argon2 |
| Deployment | Native (dev) / Docker (prod, ARM) |

---

## Arsitektur Sistem

```
┌──────────────────┐         ┌──────────────────────────────┐        ┌──────────────┐
│                  │  GET /   │                              │        │              │
│  Browser         │────────▶│  Actix-web Server             │        │  SQLite      │
│  (HTML+DaisyUI   │         │                              │        │  (data.db)   │
│   +Vanilla JS)   │  API    │  ┌─ Static File Server       │        │              │
│                  │────────▶│  ├─ API Routes /api/*         │───────▶│              │
│                  │◀────────│  └─ Session Middleware         │◀───────│              │
│                  │  JSON   │                              │        │              │
└──────────────────┘         └──────────────────────────────┘        └──────────────┘
```

## Struktur Project

```
pencatat-keuanganV2/
├── Cargo.toml
├── Dockerfile
├── docker-compose.yml
├── .dockerignore
├── .env.example
├── README.md
├── plan.md                  # File ini
├── data/                    # SQLite database (gitignored)
│   └── .gitkeep
├── static/                  # Frontend files (served by actix-files)
│   ├── index.html           # Login/Signup page
│   ├── catat.html           # Halaman pencatatan
│   ├── riwayat.html         # Halaman riwayat
│   ├── css/
│   │   └── style.css        # Custom styles
│   └── js/
│       ├── auth.js          # Login/signup logic + session check
│       ├── catat.js         # Form pencatatan logic
│       ├── riwayat.js       # Riwayat + filter + export logic
│       └── common.js        # Shared utilities (fetch wrapper, navbar, dll)
└── src/
    ├── main.rs              # Server setup, routing, middleware
    ├── config.rs            # Configuration (port, db path, secrets)
    ├── db.rs                # Database initialization & connection pool
    ├── models.rs            # Data structs (serde Serialize/Deserialize)
    ├── handlers/
    │   ├── mod.rs
    │   ├── auth.rs          # Login, signup, logout, session check
    │   ├── transaction.rs   # CRUD transaksi
    │   ├── category.rs      # CRUD kategori
    │   └── export.rs        # CSV export
    └── middleware/
        ├── mod.rs
        └── auth_guard.rs    # Middleware cek session untuk protected routes
```

---

## Database Schema

### Tabel Users
```sql
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Tabel Categories
```sql
CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, name, type)
);
```

### Tabel Transactions
```sql
CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
    payment_method TEXT NOT NULL CHECK(payment_method IN ('cash', 'cashless')),
    amount REAL NOT NULL CHECK(amount > 0),
    date TEXT NOT NULL,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id)
);

-- Indexes untuk performa query
CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, date);
CREATE INDEX IF NOT EXISTS idx_transactions_user_type ON transactions(user_id, type);
CREATE INDEX IF NOT EXISTS idx_categories_user ON categories(user_id);
```

### Kategori Default (di-seed saat user baru signup)

**Pengeluaran:**
- Makan
- Minuman
- Transportasi
- Belanja
- Tagihan
- Hiburan
- Kesehatan
- Pendidikan
- Lainnya

**Pemasukan:**
- Gaji
- Uang Kiriman
- Freelance
- Investasi
- Bonus
- Lainnya

---

## API Endpoints

### Auth (Tidak perlu login)
| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| `POST` | `/api/auth/signup` | Register user baru |
| `POST` | `/api/auth/login` | Login user |

### Auth (Perlu login)
| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| `POST` | `/api/auth/logout` | Logout (hapus session) |
| `GET` | `/api/auth/me` | Cek session aktif, return user info |

### Transaksi (Perlu login)
| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| `POST` | `/api/transactions` | Tambah transaksi baru |
| `GET` | `/api/transactions` | List transaksi (dengan query params filter) |
| `DELETE` | `/api/transactions/{id}` | Hapus transaksi |

**Query params untuk GET `/api/transactions`:**
```
?type=income|expense|all
&payment_method=cash|cashless|all
&date_from=2026-10-01
&date_to=2026-10-31
&page=1
&per_page=20
```

### Kategori (Perlu login)
| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| `GET` | `/api/categories` | List semua kategori user |
| `GET` | `/api/categories?type=income` | List kategori berdasarkan tipe |
| `POST` | `/api/categories` | Tambah kategori baru |
| `DELETE` | `/api/categories/{id}` | Hapus kategori (non-default saja) |

### Export (Perlu login)
| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| `GET` | `/api/export/csv` | Export transaksi ke CSV (pakai filter yang sama) |

---

## Milestones

---

### 🏗️ Milestone 1: Project Setup & Database Foundation

**Tujuan:** Setup project Rust, install semua dependencies, inisialisasi database.

#### Tasks:
- [ ] Buat `Cargo.toml` dengan semua dependencies
- [ ] Buat `src/config.rs` — Konfigurasi dari environment variables:
  - `DATABASE_URL` (default: `data/data.db`)
  - `SERVER_HOST` (default: `127.0.0.1`)
  - `SERVER_PORT` (default: `8080`)
  - `SESSION_SECRET` (random key, minimal 64 bytes)
- [ ] Buat `src/db.rs` — Database initialization:
  - Fungsi `init_db()` yang membuat semua tabel
  - Menggunakan `Mutex<Connection>` yang di-wrap dalam `actix_web::web::Data`
- [ ] Buat `src/models.rs` — Struct data:
  - User, Category, Transaction
  - CreateTransactionRequest, LoginRequest, SignupRequest
  - ApiResponse (generic response wrapper)
- [ ] Buat `src/main.rs` — Skeleton server:
  - Setup actix-web server
  - Attach database connection ke app state
  - Setup session middleware
  - Route `/` ke static files
  - Health check endpoint `GET /api/health`
- [ ] Buat folder `static/` dan `data/`
- [ ] Buat `.env.example`

#### Dependencies (Cargo.toml):
```toml
[package]
name = "pencatat-keuangan"
version = "0.1.0"
edition = "2021"

[dependencies]
actix-web = "4"
actix-files = "0.6"
actix-cors = "0.7"
actix-session = { version = "0.10", features = ["cookie-session"] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
rusqlite = { version = "0.41", features = ["bundled"] }
argon2 = "0.6"
csv = "1.4"
chrono = { version = "0.4", features = ["serde"] }
env_logger = "0.11"
log = "0.4"
uuid = { version = "1", features = ["v4"] }
dotenv = "0.15"
```

#### Kriteria Selesai:
- `cargo build` sukses tanpa error
- Server bisa start di `localhost:8080`
- `GET /api/health` merespon `200 OK`
- Database `data/data.db` terbuat otomatis dengan semua tabel

---

### 🔐 Milestone 2: Autentikasi (Signup, Login, Logout)

**Tujuan:** User bisa signup, login, logout, dan session bertahan saat refresh.

#### Tasks:
- [ ] Buat `src/handlers/auth.rs`:
  - `POST /api/auth/signup` — Validasi input, hash password (Argon2), insert user, seed kategori default, set session
  - `POST /api/auth/login` — Cari user, verify password, set session
  - `POST /api/auth/logout` — Hapus session
  - `GET /api/auth/me` — Cek session, return user info
- [ ] Buat `src/middleware/auth_guard.rs`:
  - Cek session cookie di setiap request ke protected route
  - Jika tidak ada session → return 401 Unauthorized
  - Jika ada → inject user_id ke request
- [ ] Buat `static/index.html` — Halaman Login/Signup:
  - Tab toggle antara Login dan Signup form
  - Form login: username, password
  - Form signup: display name, username, password, confirm password
  - DaisyUI card + form styling
- [ ] Buat `static/js/auth.js` — Frontend auth logic
- [ ] Buat `static/js/common.js` — Shared utilities:
  - `apiFetch(url, options)` — wrapper fetch dengan error handling
  - `checkAuth()` — cek session, redirect ke login jika expired
  - `renderNavbar()` — generate navbar HTML
  - `showToast(message, type)` — DaisyUI toast notification
  - `formatRupiah(number)` — format angka ke Rupiah

#### UI Wireframe - Halaman Login/Signup:
```
┌─────────────────────────────────────┐
│         Pencatat Keuangan           │
│                                     │
│  ┌─────────────┬───────────────┐    │
│  │   Login     │   Signup      │    │  ← Tab toggle
│  └─────────────┴───────────────┘    │
│                                     │
│  Username:  [_________________]     │
│                                     │
│  Password:  [_________________]     │
│                                     │
│           [  🔑 Login  ]           │
│                                     │
└─────────────────────────────────────┘
```

#### Kriteria Selesai:
- Bisa signup user baru → otomatis login → redirect ke catat.html
- Bisa login dengan user yang sudah ada
- Refresh halaman → session masih aktif (tidak perlu login ulang)
- Logout → redirect ke halaman login
- Akses halaman protected tanpa login → redirect ke login

---

### 📝 Milestone 3: Pencatatan Transaksi (Pemasukan & Pengeluaran)

**Tujuan:** User bisa mencatat transaksi pemasukan dan pengeluaran.

#### Tasks:
- [ ] Buat `src/handlers/category.rs`:
  - `GET /api/categories?type=income|expense` — List kategori user
  - `POST /api/categories` — Tambah kategori baru
  - `DELETE /api/categories/{id}` — Hapus kategori (cek bukan default, cek milik user)
- [ ] Buat `src/handlers/transaction.rs`:
  - `POST /api/transactions` — Tambah transaksi (validasi input)
  - `DELETE /api/transactions/{id}` — Hapus transaksi (cek milik user)
- [ ] Buat `static/catat.html` — Halaman Pencatatan
- [ ] Buat `static/js/catat.js` — Frontend pencatatan:
  - Load kategori dari API
  - Toggle tab pengeluaran/pemasukan → ganti dropdown kategori
  - Submit form → POST ke API
  - Tampilkan transaksi hari ini di bawah form
  - Tombol hapus transaksi

#### UI Wireframe - Halaman Catat:
```
┌─────────────────────────────────────┐
│  Navbar (Catat | Riwayat | Logout)  │
├─────────────────────────────────────┤
│                                     │
│  ┌─────────────┬───────────────┐    │
│  │ Pengeluaran │  Pemasukan    │    │  ← Toggle tabs
│  └─────────────┴───────────────┘    │
│                                     │
│  Kategori:  [▼ Dropdown        ]    │  ← Berubah sesuai tab aktif
│                                     │
│  Jenis:     ○ Cash  ○ Cashless      │  ← Radio buttons
│                                     │
│  Nominal:   [Rp _______________]    │
│                                     │
│  Tanggal:   [📅 _______________]    │  ← Default: hari ini
│                                     │
│  Keterangan:[_________________]     │  ← Opsional
│                                     │
│           [  💾 Simpan  ]           │
│                                     │
│  ── Transaksi Hari Ini ──────────   │
│  | Makan   | Cash     | Rp25.000 | 🗑️ │
│  | Transport| Cashless | Rp15.000| 🗑️ │
│                                     │
└─────────────────────────────────────┘
```

#### Kriteria Selesai:
- Bisa menambah transaksi pengeluaran dengan kategori, jenis, nominal, tanggal, keterangan
- Bisa menambah transaksi pemasukan dengan kategori yang berbeda
- Toggle tab mengubah dropdown kategori
- Transaksi hari ini muncul di bawah form
- Bisa menghapus transaksi

---

### 📊 Milestone 4: Riwayat & Filter

**Tujuan:** User bisa melihat riwayat transaksi dengan berbagai filter.

#### Tasks:
- [ ] Modifikasi `src/handlers/transaction.rs` — Tambah handler GET dengan filter:
  - Filter by `type` (income/expense/all)
  - Filter by `payment_method` (cash/cashless/all)
  - Filter by date range (`date_from`, `date_to`)
  - Pagination (`page`, `per_page`)
  - Return total count + data
- [ ] Buat `static/riwayat.html` — Halaman Riwayat
- [ ] Buat `static/js/riwayat.js` — Frontend riwayat:
  - Preset periode: Hari Ini, Minggu Ini, Bulan Ini, Bulan Lalu, Custom
  - Auto-load data (default: Bulan Ini)
  - Ringkasan: total pemasukan, pengeluaran, saldo
  - Tabel riwayat dengan pagination
  - Tombol hapus per baris

#### UI Wireframe - Halaman Riwayat:
```
┌─────────────────────────────────────────┐
│  Navbar (Catat | Riwayat | Logout)      │
├─────────────────────────────────────────┤
│                                         │
│  ┌─── Filter ─────────────────────────┐ │
│  │ Periode: [▼ Bulan Ini          ]   │ │
│  │ Custom:  [Dari 📅] — [Sampai 📅]  │ │  ← Muncul jika pilih "Custom"
│  │ Tipe:    ○ Semua ○ Masuk ○ Keluar  │ │
│  │ Jenis:   ○ Semua ○ Cash ○ Cashless │ │
│  │ [ 🔍 Cari ]    [ 📥 Export CSV ]   │ │
│  └────────────────────────────────────┘ │
│                                         │
│  ── Ringkasan ────────────────────────  │
│  Total Pemasukan:   Rp 5.000.000       │
│  Total Pengeluaran: Rp 3.200.000       │
│  Saldo:             Rp 1.800.000       │
│                                         │
│  ── Tabel Riwayat ───────────────────── │
│  | Tanggal  | Tipe | Kategori | Jenis | │
│  | Nominal    | Keterangan     | Aksi  | │
│  |----------|------|----------|-------| │
│  | 29/10/26 | 🔴   | Makan    | Cash  | │
│  | Rp25.000   | —              | 🗑️    | │
│  | 29/10/26 | 🟢   | Gaji     | TF    | │
│  | Rp5.000.000| Gaji Oktober   | 🗑️    | │
│  |----------|------|----------|-------| │
│                                         │
│  [◀ Prev]  Halaman 1 dari 5  [Next ▶]  │
│                                         │
└─────────────────────────────────────────┘
```

#### Kriteria Selesai:
- Filter by tipe berfungsi (pemasukan/pengeluaran/semua)
- Filter by jenis transaksi berfungsi (cash/cashless/semua)
- Filter by periode berfungsi (preset + custom date range)
- Pagination berfungsi
- Ringkasan (total pemasukan, pengeluaran, saldo) akurat
- Bisa hapus transaksi dari tabel riwayat

---

### 📥 Milestone 5: Export CSV

**Tujuan:** User bisa export data transaksi ke file CSV.

#### Tasks:
- [ ] Buat `src/handlers/export.rs`:
  - `GET /api/export/csv` — Export transaksi ke CSV
  - Terima filter params yang sama dengan GET transactions
  - Query semua data (tanpa pagination)
  - Generate CSV: Tanggal, Tipe, Kategori, Jenis Transaksi, Nominal, Keterangan
  - Return sebagai file download (`Content-Disposition: attachment`)
- [ ] Modifikasi `static/js/riwayat.js`:
  - Tombol Export CSV → buka URL `/api/export/csv` dengan filter params aktif
  - Browser otomatis download file

#### Format CSV Output:
```csv
Tanggal,Tipe,Kategori,Jenis Transaksi,Nominal,Keterangan
2026-10-29,Pengeluaran,Makan,Cash,25000,Makan siang
2026-10-29,Pemasukan,Gaji,Cashless,5000000,Gaji Oktober
```

#### Kriteria Selesai:
- File CSV terdownload saat klik tombol Export
- Isi CSV sesuai dengan filter yang aktif
- File bisa dibuka di Excel / Google Sheets dengan benar

---

### 🎨 Milestone 6: Polish UI & UX

**Tujuan:** UI yang responsive, polished, dan user-friendly.

#### Tasks:
- [ ] Buat `static/css/style.css` — Custom styling tambahan
- [ ] Modifikasi semua halaman HTML:
  - Loading spinner saat fetch data
  - Empty state (belum ada transaksi)
  - Konfirmasi sebelum hapus (DaisyUI modal)
  - Toast notifications yang konsisten
  - Form validation visual feedback
  - Navbar active state indicator
- [ ] Modifikasi `static/js/common.js`:
  - Auto-redirect ke login jika session expired (401 response)
  - Format tanggal Indonesia (DD/MM/YYYY)
- [ ] Responsive design:
  - Mobile-first layout
  - Tabel responsive (scroll horizontal atau card view di mobile)

#### Kriteria Selesai:
- UI responsive di mobile dan desktop
- Loading states muncul saat fetch data
- Toast notification muncul saat sukses/error
- Modal konfirmasi muncul saat hapus
- Empty state ditampilkan jika belum ada data

---

### 🐳 Milestone 7: Docker & Production Setup

**Tujuan:** Aplikasi siap deploy di server ARM menggunakan Docker.

#### Tasks:
- [ ] Buat `Dockerfile` — Multi-stage build:
  ```dockerfile
  # Stage 1: Build
  FROM rust:1.96-bookworm AS builder
  WORKDIR /app
  COPY Cargo.toml Cargo.lock ./
  COPY src/ ./src/
  RUN cargo build --release

  # Stage 2: Runtime
  FROM debian:bookworm-slim
  RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
  WORKDIR /app
  COPY --from=builder /app/target/release/pencatat-keuangan .
  COPY static/ ./static/
  RUN mkdir -p data
  EXPOSE 8080
  ENV SERVER_HOST=0.0.0.0
  ENV SERVER_PORT=8080
  ENV DATABASE_URL=data/data.db
  CMD ["./pencatat-keuangan"]
  ```
- [ ] Buat `.dockerignore`
- [ ] Buat `docker-compose.yml` dengan volume untuk data persistence
- [ ] Buat `README.md` — Dokumentasi lengkap:
  - Cara setup development
  - Cara build & run native
  - Cara deploy dengan Docker
  - API documentation ringkas

#### Kriteria Selesai:
- `docker build` sukses
- `docker run` → semua fitur bekerja di container
- Data persist setelah container restart (volume)
- README jelas dan lengkap

---

## Verification Plan

### Per Milestone
| Milestone | Verifikasi |
|-----------|------------|
| M1 | `cargo build` sukses, server start, `GET /api/health` → 200 OK |
| M2 | Signup → Login → Refresh (session persist) → Logout → Redirect |
| M3 | Tambah pengeluaran → Muncul di list → Tambah pemasukan → Hapus |
| M4 | Filter by tipe → Data sesuai → Filter by periode → Pagination OK |
| M5 | Export CSV → File download → Buka di spreadsheet → Data benar |
| M6 | Mobile responsive → Loading states → Toast → Modal konfirmasi |
| M7 | Docker build → Docker run → Semua fitur OK → Data persist |

### Command untuk Testing
```bash
# Development
cargo build                    # Cek kompilasi
cargo run                      # Jalankan server
curl localhost:8080/api/health # Test health check

# Production
docker build -t pencatat-keuangan .
docker run -p 8080:8080 -v keuangan-data:/app/data pencatat-keuangan
```

---

## Frontend CDN Dependencies

```html
<!-- Tailwind CSS v4 (browser script) -->
<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>

<!-- DaisyUI v5 -->
<link href="https://cdn.jsdelivr.net/npm/daisyui@5" rel="stylesheet" type="text/css" />
```

---

> **Catatan:** Proses pengerjaan mengikuti urutan milestone M1 → M7 secara berurutan.
> Setiap milestone harus diverifikasi sebelum lanjut ke milestone berikutnya.
