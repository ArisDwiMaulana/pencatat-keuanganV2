use actix_session::Session;
use actix_web::{get, post, web, HttpResponse, Responder};
use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use rusqlite::params;

use crate::db::DbPool;
use crate::middleware::AuthenticatedUser;
use crate::models::{ApiResponse, LoginRequest, SignupRequest, User};

const DEFAULT_EXPENSE_CATEGORIES: &[&str] = &[
    "Makan",
    "Minuman",
    "Transportasi",
    "Belanja",
    "Tagihan",
    "Hiburan",
    "Kesehatan",
    "Pendidikan",
    "Lainnya",
];

const DEFAULT_INCOME_CATEGORIES: &[&str] = &[
    "Gaji",
    "Uang Kiriman",
    "Freelance",
    "Investasi",
    "Bonus",
    "Lainnya",
];

#[post("/signup")]
pub async fn signup(
    db: web::Data<DbPool>,
    session: Session,
    body: web::Json<SignupRequest>,
) -> impl Responder {
    let display_name = body.display_name.trim();
    let username = body.username.trim().to_lowercase();
    let password = &body.password;

    if display_name.is_empty() {
        return HttpResponse::BadRequest().json(ApiResponse::<()>::error(
            "Nama tampilan tidak boleh kosong",
        ));
    }

    if username.len() < 3 {
        return HttpResponse::BadRequest().json(ApiResponse::<()>::error(
            "Username minimal 3 karakter",
        ));
    }

    if password.len() < 6 {
        return HttpResponse::BadRequest().json(ApiResponse::<()>::error(
            "Password minimal 6 karakter",
        ));
    }

    // Hash password with Argon2
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    let password_hash = match argon2.hash_password(password.as_bytes(), &salt) {
        Ok(h) => h.to_string(),
        Err(e) => {
            log::error!("Argon2 hash error: {}", e);
            return HttpResponse::InternalServerError().json(ApiResponse::<()>::error(
                "Gagal mengenkripsi kata sandi",
            ));
        }
    };

    let mut conn = match db.lock() {
        Ok(guard) => guard,
        Err(_) => {
            return HttpResponse::InternalServerError().json(ApiResponse::<()>::error(
                "Gagal menghubungkan ke database",
            ));
        }
    };

    // Check if username already exists
    let user_exists: bool = match conn.query_row(
        "SELECT COUNT(*) FROM users WHERE username = ?1",
        params![username],
        |row| row.get::<_, i64>(0),
    ) {
        Ok(count) => count > 0,
        Err(e) => {
            log::error!("Database query error: {}", e);
            return HttpResponse::InternalServerError().json(ApiResponse::<()>::error(
                "Terjadi kesalahan pada database",
            ));
        }
    };

    if user_exists {
        return HttpResponse::BadRequest().json(ApiResponse::<()>::error(
            "Username sudah digunakan, silakan pilih yang lain",
        ));
    }

    // Insert user & default categories inside transaction
    let tx = match conn.transaction() {
        Ok(t) => t,
        Err(e) => {
            log::error!("Transaction begin error: {}", e);
            return HttpResponse::InternalServerError().json(ApiResponse::<()>::error(
                "Terjadi kesalahan pada sistem",
            ));
        }
    };

    let user_id = match tx.execute(
        "INSERT INTO users (username, password_hash, display_name) VALUES (?1, ?2, ?3)",
        params![username, password_hash, display_name],
    ) {
        Ok(_) => tx.last_insert_rowid(),
        Err(e) => {
            log::error!("Insert user error: {}", e);
            return HttpResponse::InternalServerError().json(ApiResponse::<()>::error(
                "Gagal membuat akun baru",
            ));
        }
    };

    // Seed default expense categories
    for cat in DEFAULT_EXPENSE_CATEGORIES {
        if let Err(e) = tx.execute(
            "INSERT INTO categories (user_id, name, type, is_default) VALUES (?1, ?2, 'expense', 1)",
            params![user_id, cat],
        ) {
            log::error!("Seed expense category error: {}", e);
            return HttpResponse::InternalServerError().json(ApiResponse::<()>::error(
                "Gagal menginisialisasi kategori akun",
            ));
        }
    }

    // Seed default income categories
    for cat in DEFAULT_INCOME_CATEGORIES {
        if let Err(e) = tx.execute(
            "INSERT INTO categories (user_id, name, type, is_default) VALUES (?1, ?2, 'income', 1)",
            params![user_id, cat],
        ) {
            log::error!("Seed income category error: {}", e);
            return HttpResponse::InternalServerError().json(ApiResponse::<()>::error(
                "Gagal menginisialisasi kategori akun",
            ));
        }
    }

    if let Err(e) = tx.commit() {
        log::error!("Transaction commit error: {}", e);
        return HttpResponse::InternalServerError().json(ApiResponse::<()>::error(
            "Gagal menyimpan data pendaftaran",
        ));
    }

    // Set session cookie
    if let Err(e) = session.insert("user_id", user_id) {
        log::error!("Session insert error: {}", e);
        return HttpResponse::InternalServerError().json(ApiResponse::<()>::error(
            "Gagal membuat sesi login",
        ));
    }

    let user_response = User {
        id: user_id,
        username,
        password_hash: String::new(),
        display_name: display_name.to_string(),
        created_at: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
    };

    HttpResponse::Ok().json(ApiResponse::success(
        "Pendaftaran berhasil! Selamat datang.",
        user_response,
    ))
}

#[post("/login")]
pub async fn login(
    db: web::Data<DbPool>,
    session: Session,
    body: web::Json<LoginRequest>,
) -> impl Responder {
    let username = body.username.trim().to_lowercase();
    let password = &body.password;

    if username.is_empty() || password.is_empty() {
        return HttpResponse::BadRequest().json(ApiResponse::<()>::error(
            "Username dan password wajib diisi",
        ));
    }

    let conn = match db.lock() {
        Ok(guard) => guard,
        Err(_) => {
            return HttpResponse::InternalServerError().json(ApiResponse::<()>::error(
                "Gagal menghubungkan ke database",
            ));
        }
    };

    let user_res: Result<(i64, String, String, String, String), rusqlite::Error> = conn.query_row(
        "SELECT id, username, password_hash, display_name, created_at FROM users WHERE username = ?1",
        params![username],
        |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
            ))
        },
    );

    let (user_id, found_username, stored_hash, display_name, created_at) = match user_res {
        Ok(data) => data,
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            return HttpResponse::Unauthorized().json(ApiResponse::<()>::error(
                "Username atau password salah",
            ));
        }
        Err(e) => {
            log::error!("Database query error on login: {}", e);
            return HttpResponse::InternalServerError().json(ApiResponse::<()>::error(
                "Terjadi kesalahan saat memeriksa akun",
            ));
        }
    };

    // Verify Argon2 password
    let parsed_hash = match PasswordHash::new(&stored_hash) {
        Ok(h) => h,
        Err(e) => {
            log::error!("PasswordHash parse error: {}", e);
            return HttpResponse::InternalServerError().json(ApiResponse::<()>::error(
                "Terjadi kesalahan format enkripsi",
            ));
        }
    };

    let argon2 = Argon2::default();
    if argon2
        .verify_password(password.as_bytes(), &parsed_hash)
        .is_err()
    {
        return HttpResponse::Unauthorized().json(ApiResponse::<()>::error(
            "Username atau password salah",
        ));
    }

    // Set session cookie
    if let Err(e) = session.insert("user_id", user_id) {
        log::error!("Session insert error on login: {}", e);
        return HttpResponse::InternalServerError().json(ApiResponse::<()>::error(
            "Gagal membuat sesi login",
        ));
    }

    let user_response = User {
        id: user_id,
        username: found_username,
        password_hash: String::new(),
        display_name,
        created_at,
    };

    HttpResponse::Ok().json(ApiResponse::success("Login berhasil!", user_response))
}

#[post("/logout")]
pub async fn logout(session: Session) -> impl Responder {
    session.purge();
    HttpResponse::Ok().json(ApiResponse::<()>::ok_msg("Logout berhasil!"))
}

#[get("/me")]
pub async fn me(
    db: web::Data<DbPool>,
    auth: AuthenticatedUser,
) -> impl Responder {
    let conn = match db.lock() {
        Ok(guard) => guard,
        Err(_) => {
            return HttpResponse::InternalServerError().json(ApiResponse::<()>::error(
                "Gagal menghubungkan ke database",
            ));
        }
    };

    let user_res = conn.query_row(
        "SELECT id, username, display_name, created_at FROM users WHERE id = ?1",
        params![auth.user_id],
        |row| {
            Ok(User {
                id: row.get(0)?,
                username: row.get(1)?,
                password_hash: String::new(),
                display_name: row.get(2)?,
                created_at: row.get(3)?,
            })
        },
    );

    match user_res {
        Ok(user) => HttpResponse::Ok().json(ApiResponse::success("Data user ditemukan", user)),
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            HttpResponse::Unauthorized().json(ApiResponse::<()>::error("User tidak ditemukan"))
        }
        Err(e) => {
            log::error!("Database query me error: {}", e);
            HttpResponse::InternalServerError().json(ApiResponse::<()>::error("Gagal mengambil data user"))
        }
    }
}
