use actix_web::{delete, get, post, web, HttpResponse, Responder};
use rusqlite::params;
use serde::Deserialize;

use crate::db::DbPool;
use crate::middleware::AuthenticatedUser;
use crate::models::{ApiResponse, Category, CreateCategoryRequest};

#[derive(Debug, Deserialize)]
pub struct CategoryQuery {
    pub r#type: Option<String>,
}

fn row_to_category(row: &rusqlite::Row<'_>) -> rusqlite::Result<Category> {
    Ok(Category {
        id: row.get(0)?,
        user_id: row.get(1)?,
        name: row.get(2)?,
        r#type: row.get(3)?,
        is_default: row.get::<_, i64>(4)? != 0,
        created_at: row.get(5)?,
    })
}

#[get("/api/categories")]
pub async fn list_categories(
    db: web::Data<DbPool>,
    auth: AuthenticatedUser,
    query: web::Query<CategoryQuery>,
) -> impl Responder {
    if let Some(ref tipe) = query.r#type {
        if tipe != "income" && tipe != "expense" {
            return HttpResponse::BadRequest().json(ApiResponse::<()>::error(
                "Tipe kategori harus 'income' atau 'expense'",
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

    let mut stmt = match conn.prepare(
        "SELECT id, user_id, name, type, is_default, created_at
         FROM categories
         WHERE user_id = ?1 AND (?2 IS NULL OR type = ?2)
         ORDER BY id ASC",
    ) {
        Ok(s) => s,
        Err(e) => {
            log::error!("Prepare list categories error: {}", e);
            return HttpResponse::InternalServerError().json(ApiResponse::<()>::error(
                "Terjadi kesalahan pada database",
            ));
        }
    };

    let categories_res: rusqlite::Result<Vec<Category>> = stmt
        .query_map(params![auth.user_id, query.r#type], row_to_category)
        .and_then(|rows| rows.collect());

    match categories_res {
        Ok(categories) => HttpResponse::Ok().json(ApiResponse::success(
            "Daftar kategori berhasil diambil",
            categories,
        )),
        Err(e) => {
            log::error!("Query list categories error: {}", e);
            HttpResponse::InternalServerError().json(ApiResponse::<()>::error(
                "Gagal mengambil daftar kategori",
            ))
        }
    }
}

#[post("/api/categories")]
pub async fn create_category(
    db: web::Data<DbPool>,
    auth: AuthenticatedUser,
    body: web::Json<CreateCategoryRequest>,
) -> impl Responder {
    let name = body.name.trim();
    let tipe = body.r#type.trim();

    if name.is_empty() {
        return HttpResponse::BadRequest().json(ApiResponse::<()>::error(
            "Nama kategori tidak boleh kosong",
        ));
    }

    if name.len() > 50 {
        return HttpResponse::BadRequest().json(ApiResponse::<()>::error(
            "Nama kategori maksimal 50 karakter",
        ));
    }

    if tipe != "income" && tipe != "expense" {
        return HttpResponse::BadRequest().json(ApiResponse::<()>::error(
            "Tipe kategori harus 'income' atau 'expense'",
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

    match conn.execute(
        "INSERT INTO categories (user_id, name, type, is_default) VALUES (?1, ?2, ?3, 0)",
        params![auth.user_id, name, tipe],
    ) {
        Ok(_) => {
            let category_id = conn.last_insert_rowid();
            let category_res = conn.query_row(
                "SELECT id, user_id, name, type, is_default, created_at
                 FROM categories WHERE id = ?1 AND user_id = ?2",
                params![category_id, auth.user_id],
                row_to_category,
            );

            match category_res {
                Ok(category) => HttpResponse::Created()
                    .json(ApiResponse::success("Kategori berhasil ditambahkan", category)),
                Err(e) => {
                    log::error!("Fetch created category error: {}", e);
                    HttpResponse::InternalServerError().json(ApiResponse::<()>::error(
                        "Kategori tersimpan, tetapi gagal mengambil datanya",
                    ))
                }
            }
        }
        Err(e) => {
            let message = match e {
                rusqlite::Error::SqliteFailure(err, _)
                    if err.code == rusqlite::ErrorCode::ConstraintViolation =>
                {
                    "Kategori dengan nama dan tipe tersebut sudah ada"
                }
                _ => {
                    log::error!("Insert category error: {}", e);
                    "Gagal menambahkan kategori"
                }
            };
            HttpResponse::BadRequest().json(ApiResponse::<()>::error(message))
        }
    }
}

#[delete("/api/categories/{id}")]
pub async fn delete_category(
    db: web::Data<DbPool>,
    auth: AuthenticatedUser,
    path: web::Path<i64>,
) -> impl Responder {
    let category_id = path.into_inner();

    let conn = match db.lock() {
        Ok(guard) => guard,
        Err(_) => {
            return HttpResponse::InternalServerError().json(ApiResponse::<()>::error(
                "Gagal menghubungkan ke database",
            ));
        }
    };

    let category_res: rusqlite::Result<(bool, String)> = conn.query_row(
        "SELECT is_default, name FROM categories WHERE id = ?1 AND user_id = ?2",
        params![category_id, auth.user_id],
        |row| Ok((row.get::<_, i64>(0)? != 0, row.get(1)?)),
    );

    let (is_default, name) = match category_res {
        Ok(data) => data,
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            return HttpResponse::NotFound().json(ApiResponse::<()>::error(
                "Kategori tidak ditemukan",
            ));
        }
        Err(e) => {
            log::error!("Query category before delete error: {}", e);
            return HttpResponse::InternalServerError().json(ApiResponse::<()>::error(
                "Gagal mengambil data kategori",
            ));
        }
    };

    if is_default {
        return HttpResponse::BadRequest().json(ApiResponse::<()>::error(
            "Kategori default tidak dapat dihapus",
        ));
    }

    // Jangan hapus kategori yang masih dipakai transaksi (FK tidak memakai ON DELETE CASCADE).
    let used_count: i64 = match conn.query_row(
        "SELECT COUNT(*) FROM transactions WHERE category_id = ?1 AND user_id = ?2",
        params![category_id, auth.user_id],
        |row| row.get(0),
    ) {
        Ok(count) => count,
        Err(e) => {
            log::error!("Count transactions by category error: {}", e);
            return HttpResponse::InternalServerError().json(ApiResponse::<()>::error(
                "Gagal memeriksa penggunaan kategori",
            ));
        }
    };

    if used_count > 0 {
        return HttpResponse::BadRequest().json(ApiResponse::<()>::error(
            "Kategori tidak dapat dihapus karena masih digunakan oleh transaksi",
        ));
    }

    match conn.execute(
        "DELETE FROM categories WHERE id = ?1 AND user_id = ?2",
        params![category_id, auth.user_id],
    ) {
        Ok(0) => HttpResponse::NotFound().json(ApiResponse::<()>::error(
            "Kategori tidak ditemukan",
        )),
        Ok(_) => HttpResponse::Ok().json(ApiResponse::<()>::ok_msg(format!(
            "Kategori \"{}\" berhasil dihapus",
            name
        ))),
        Err(e) => {
            log::error!("Delete category error: {}", e);
            HttpResponse::InternalServerError().json(ApiResponse::<()>::error(
                "Gagal menghapus kategori",
            ))
        }
    }
}
