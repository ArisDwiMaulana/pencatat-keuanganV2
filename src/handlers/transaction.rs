use actix_web::{delete, get, post, web, HttpResponse, Responder};
use chrono::NaiveDate;
use rusqlite::params;
use serde::Deserialize;

use crate::db::DbPool;
use crate::middleware::AuthenticatedUser;
use crate::models::{
    ApiResponse, CreateTransactionRequest, TransactionListResponse, TransactionSummary,
    TransactionWithCategory,
};

#[derive(Debug, Deserialize)]
pub struct TransactionQuery {
    pub r#type: Option<String>,
    pub payment_method: Option<String>,
    pub date_from: Option<String>,
    pub date_to: Option<String>,
    pub page: Option<i64>,
    pub per_page: Option<i64>,
}

const DEFAULT_PER_PAGE: i64 = 20;
const MAX_PER_PAGE: i64 = 100;

const TRANSACTION_SELECT: &str = "SELECT t.id, t.user_id, t.category_id, c.name, t.type,
            t.payment_method, t.amount, t.date, t.note, t.created_at
     FROM transactions t
     JOIN categories c ON c.id = t.category_id";

const TRANSACTION_FILTER: &str = "WHERE t.user_id = ?1
       AND (?2 IS NULL OR t.type = ?2)
       AND (?3 IS NULL OR t.payment_method = ?3)
       AND (?4 IS NULL OR t.date >= ?4)
       AND (?5 IS NULL OR t.date <= ?5)";

fn row_to_transaction(row: &rusqlite::Row<'_>) -> rusqlite::Result<TransactionWithCategory> {
    Ok(TransactionWithCategory {
        id: row.get(0)?,
        user_id: row.get(1)?,
        category_id: row.get(2)?,
        category_name: row.get(3)?,
        r#type: row.get(4)?,
        payment_method: row.get(5)?,
        amount: row.get(6)?,
        date: row.get(7)?,
        note: row.get(8)?,
        created_at: row.get(9)?,
    })
}

fn is_valid_date(value: &str) -> bool {
    NaiveDate::parse_from_str(value, "%Y-%m-%d").is_ok()
}

/// Normalisasi filter opsional: nilai kosong / "all" berarti tanpa filter.
fn normalize_filter(value: Option<&str>, allowed: &[&'static str]) -> Result<Option<&'static str>, String> {
    match value.map(str::trim) {
        None | Some("") | Some("all") => Ok(None),
        Some(v) => allowed
            .iter()
            .find(|allowed_value| **allowed_value == v)
            .copied()
            .map(Some)
            .ok_or_else(|| format!("Nilai filter '{}' tidak valid", v)),
    }
}

#[post("/api/transactions")]
pub async fn create_transaction(
    db: web::Data<DbPool>,
    auth: AuthenticatedUser,
    body: web::Json<CreateTransactionRequest>,
) -> impl Responder {
    let req = body.into_inner();

    let tipe = req.r#type.trim();
    if tipe != "income" && tipe != "expense" {
        return HttpResponse::BadRequest().json(ApiResponse::<()>::error(
            "Tipe transaksi harus 'income' atau 'expense'",
        ));
    }

    let payment_method = req.payment_method.trim();
    if payment_method != "cash" && payment_method != "cashless" {
        return HttpResponse::BadRequest().json(ApiResponse::<()>::error(
            "Jenis transaksi harus 'cash' atau 'cashless'",
        ));
    }

    if !req.amount.is_finite() || req.amount <= 0.0 {
        return HttpResponse::BadRequest().json(ApiResponse::<()>::error(
            "Nominal transaksi harus lebih dari 0",
        ));
    }

    let amount = (req.amount * 100.0).round() / 100.0;
    if amount > 1_000_000_000_000.0 {
        return HttpResponse::BadRequest().json(ApiResponse::<()>::error(
            "Nominal transaksi terlalu besar",
        ));
    }

    let date = req.date.trim();
    if !is_valid_date(date) {
        return HttpResponse::BadRequest().json(ApiResponse::<()>::error(
            "Format tanggal tidak valid (gunakan YYYY-MM-DD)",
        ));
    }

    let note = req
        .note
        .map(|n| n.trim().to_string())
        .filter(|n| !n.is_empty());

    if let Some(ref n) = note {
        if n.len() > 255 {
            return HttpResponse::BadRequest().json(ApiResponse::<()>::error(
                "Keterangan maksimal 255 karakter",
            ));
        }
    }

    let conn = match db.lock() {
        Ok(guard) => guard,
        Err(_) => {
            return HttpResponse::InternalServerError().json(ApiResponse::<()>::error(
                "Gagal menghubungkan ke database",
            ));
        }
    };

    // Pastikan kategori milik user dan tipenya sesuai.
    let category_res: rusqlite::Result<String> = conn.query_row(
        "SELECT type FROM categories WHERE id = ?1 AND user_id = ?2",
        params![req.category_id, auth.user_id],
        |row| row.get(0),
    );

    let category_type = match category_res {
        Ok(t) => t,
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            return HttpResponse::BadRequest().json(ApiResponse::<()>::error(
                "Kategori tidak ditemukan",
            ));
        }
        Err(e) => {
            log::error!("Query category on create transaction error: {}", e);
            return HttpResponse::InternalServerError().json(ApiResponse::<()>::error(
                "Gagal memeriksa kategori",
            ));
        }
    };

    if category_type != tipe {
        return HttpResponse::BadRequest().json(ApiResponse::<()>::error(
            "Tipe kategori tidak sesuai dengan tipe transaksi",
        ));
    }

    let insert_res = conn.execute(
        "INSERT INTO transactions (user_id, category_id, type, payment_method, amount, date, note)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            auth.user_id,
            req.category_id,
            tipe,
            payment_method,
            amount,
            date,
            note
        ],
    );

    if let Err(e) = insert_res {
        log::error!("Insert transaction error: {}", e);
        return HttpResponse::InternalServerError().json(ApiResponse::<()>::error(
            "Gagal menyimpan transaksi",
        ));
    }

    let transaction_id = conn.last_insert_rowid();
    let sql = format!("{} WHERE t.id = ?1 AND t.user_id = ?2", TRANSACTION_SELECT);
    let transaction_res = conn.query_row(&sql, params![transaction_id, auth.user_id], row_to_transaction);

    match transaction_res {
        Ok(transaction) => HttpResponse::Created().json(ApiResponse::success(
            "Transaksi berhasil disimpan",
            transaction,
        )),
        Err(e) => {
            log::error!("Fetch created transaction error: {}", e);
            HttpResponse::InternalServerError().json(ApiResponse::<()>::error(
                "Transaksi tersimpan, tetapi gagal mengambil datanya",
            ))
        }
    }
}

#[get("/api/transactions")]
pub async fn list_transactions(
    db: web::Data<DbPool>,
    auth: AuthenticatedUser,
    query: web::Query<TransactionQuery>,
) -> impl Responder {
    // --- Validasi filter ---
    let type_filter = match normalize_filter(query.r#type.as_deref(), &["income", "expense"]) {
        Ok(v) => v,
        Err(msg) => {
            return HttpResponse::BadRequest()
                .json(ApiResponse::<()>::error(format!("Filter type: {}", msg)));
        }
    };

    let payment_filter =
        match normalize_filter(query.payment_method.as_deref(), &["cash", "cashless"]) {
            Ok(v) => v,
            Err(msg) => {
                return HttpResponse::BadRequest()
                    .json(ApiResponse::<()>::error(format!("Filter payment_method: {}", msg)));
            }
        };

    let date_from = query.date_from.as_deref().map(str::trim).filter(|d| !d.is_empty());
    let date_to = query.date_to.as_deref().map(str::trim).filter(|d| !d.is_empty());

    if let Some(d) = date_from {
        if !is_valid_date(d) {
            return HttpResponse::BadRequest().json(ApiResponse::<()>::error(
                "Parameter date_from tidak valid (gunakan YYYY-MM-DD)",
            ));
        }
    }

    if let Some(d) = date_to {
        if !is_valid_date(d) {
            return HttpResponse::BadRequest().json(ApiResponse::<()>::error(
                "Parameter date_to tidak valid (gunakan YYYY-MM-DD)",
            ));
        }
    }

    if let (Some(from), Some(to)) = (date_from, date_to) {
        if from > to {
            return HttpResponse::BadRequest().json(ApiResponse::<()>::error(
                "Rentang tanggal tidak valid: date_from melebihi date_to",
            ));
        }
    }

    let page = query.page.unwrap_or(1).max(1);
    let per_page = query
        .per_page
        .unwrap_or(DEFAULT_PER_PAGE)
        .clamp(1, MAX_PER_PAGE);
    let offset = (page - 1) * per_page;

    let conn = match db.lock() {
        Ok(guard) => guard,
        Err(_) => {
            return HttpResponse::InternalServerError().json(ApiResponse::<()>::error(
                "Gagal menghubungkan ke database",
            ));
        }
    };

    let filter_params = params![
        auth.user_id,
        type_filter,
        payment_filter,
        date_from,
        date_to
    ];

    // --- Total data sesuai filter (tanpa pagination) ---
    let count_sql = format!(
        "SELECT COUNT(*) FROM transactions t {}",
        TRANSACTION_FILTER
    );
    let total: i64 = match conn.query_row(&count_sql, filter_params, |row| row.get(0)) {
        Ok(total) => total,
        Err(e) => {
            log::error!("Count transactions error: {}", e);
            return HttpResponse::InternalServerError().json(ApiResponse::<()>::error(
                "Gagal menghitung jumlah transaksi",
            ));
        }
    };

    // --- Ringkasan pemasukan / pengeluaran / saldo sesuai filter ---
    let summary_sql = format!(
        "SELECT
            COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount END), 0),
            COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount END), 0)
         FROM transactions t {}",
        TRANSACTION_FILTER
    );
    let summary_res: rusqlite::Result<(f64, f64)> =
        conn.query_row(&summary_sql, filter_params, |row| {
            Ok((row.get(0)?, row.get(1)?))
        });

    let (total_income, total_expense) = match summary_res {
        Ok(data) => data,
        Err(e) => {
            log::error!("Summary transactions error: {}", e);
            return HttpResponse::InternalServerError().json(ApiResponse::<()>::error(
                "Gagal menghitung ringkasan transaksi",
            ));
        }
    };

    // --- Ambil data halaman yang diminta ---
    let list_sql = format!(
        "{} {} ORDER BY t.date DESC, t.created_at DESC, t.id DESC LIMIT ?6 OFFSET ?7",
        TRANSACTION_SELECT, TRANSACTION_FILTER
    );

    let mut stmt = match conn.prepare(&list_sql) {
        Ok(s) => s,
        Err(e) => {
            log::error!("Prepare list transactions error: {}", e);
            return HttpResponse::InternalServerError().json(ApiResponse::<()>::error(
                "Terjadi kesalahan pada database",
            ));
        }
    };

    let items_res: rusqlite::Result<Vec<TransactionWithCategory>> = stmt
        .query_map(
            params![
                auth.user_id,
                type_filter,
                payment_filter,
                date_from,
                date_to,
                per_page,
                offset
            ],
            row_to_transaction,
        )
        .and_then(|rows| rows.collect());

    let items = match items_res {
        Ok(items) => items,
        Err(e) => {
            log::error!("Query list transactions error: {}", e);
            return HttpResponse::InternalServerError().json(ApiResponse::<()>::error(
                "Gagal mengambil daftar transaksi",
            ));
        }
    };

    let total_pages = if total == 0 {
        0
    } else {
        (total + per_page - 1) / per_page
    };

    HttpResponse::Ok().json(ApiResponse::success(
        "Daftar transaksi berhasil diambil",
        TransactionListResponse {
            items,
            total,
            page,
            per_page,
            total_pages,
            summary: TransactionSummary {
                total_income,
                total_expense,
                balance: total_income - total_expense,
            },
        },
    ))
}

#[delete("/api/transactions/{id}")]
pub async fn delete_transaction(
    db: web::Data<DbPool>,
    auth: AuthenticatedUser,
    path: web::Path<i64>,
) -> impl Responder {
    let transaction_id = path.into_inner();

    let conn = match db.lock() {
        Ok(guard) => guard,
        Err(_) => {
            return HttpResponse::InternalServerError().json(ApiResponse::<()>::error(
                "Gagal menghubungkan ke database",
            ));
        }
    };

    match conn.execute(
        "DELETE FROM transactions WHERE id = ?1 AND user_id = ?2",
        params![transaction_id, auth.user_id],
    ) {
        Ok(0) => HttpResponse::NotFound().json(ApiResponse::<()>::error(
            "Transaksi tidak ditemukan",
        )),
        Ok(_) => HttpResponse::Ok().json(ApiResponse::<()>::ok_msg(
            "Transaksi berhasil dihapus",
        )),
        Err(e) => {
            log::error!("Delete transaction error: {}", e);
            HttpResponse::InternalServerError().json(ApiResponse::<()>::error(
                "Gagal menghapus transaksi",
            ))
        }
    }
}
