use actix_web::{get, web, HttpResponse, Responder};
use rusqlite::params;
use serde::Deserialize;

use crate::db::DbPool;
use crate::handlers::transaction::{
    row_to_transaction, TransactionFilter, TRANSACTION_FILTER, TRANSACTION_SELECT,
};
use crate::middleware::AuthenticatedUser;
use crate::models::{ApiResponse, TransactionWithCategory};

#[derive(Debug, Deserialize)]
pub struct ExportQuery {
    pub r#type: Option<String>,
    pub payment_method: Option<String>,
    pub date_from: Option<String>,
    pub date_to: Option<String>,
}

/// Format nominal tanpa pemisah ribuan agar mudah dibaca spreadsheet.
/// Nilai bulat ditulis tanpa desimal (25000), selain itu maksimal 2 desimal.
fn format_amount(amount: f64) -> String {
    if amount.fract() == 0.0 {
        format!("{:.0}", amount)
    } else {
        format!("{:.2}", amount)
    }
}

fn build_csv(items: &[TransactionWithCategory]) -> Result<Vec<u8>, csv::Error> {
    let mut writer = csv::WriterBuilder::new().from_writer(Vec::new());

    writer.write_record([
        "Tanggal",
        "Tipe",
        "Kategori",
        "Jenis Transaksi",
        "Nominal",
        "Keterangan",
    ])?;

    for trx in items {
        let tipe = if trx.r#type == "income" {
            "Pemasukan"
        } else {
            "Pengeluaran"
        };
        let method = if trx.payment_method == "cash" {
            "Cash"
        } else {
            "Cashless"
        };
        let amount = format_amount(trx.amount);
        let note = trx.note.as_deref().unwrap_or("");

        writer.write_record([
            trx.date.as_str(),
            tipe,
            trx.category_name.as_str(),
            method,
            amount.as_str(),
            note,
        ])?;
    }

    writer
        .into_inner()
        .map_err(|into_inner_error| csv::Error::from(into_inner_error.into_error()))
}

#[get("/api/export/csv")]
pub async fn export_csv(
    db: web::Data<DbPool>,
    auth: AuthenticatedUser,
    query: web::Query<ExportQuery>,
) -> impl Responder {
    let filter = match TransactionFilter::parse(
        query.r#type.as_deref(),
        query.payment_method.as_deref(),
        query.date_from.as_deref(),
        query.date_to.as_deref(),
    ) {
        Ok(filter) => filter,
        Err(msg) => {
            return HttpResponse::BadRequest().json(ApiResponse::<()>::error(msg));
        }
    };

    let conn = match db.lock() {
        Ok(guard) => guard,
        Err(_) => {
            return HttpResponse::InternalServerError().json(ApiResponse::<()>::error(
                "Gagal menghubungkan ke database",
            ));
        }
    };

    // Export selalu mengambil seluruh data sesuai filter (tanpa pagination).
    let sql = format!(
        "{} {} ORDER BY t.date DESC, t.created_at DESC, t.id DESC",
        TRANSACTION_SELECT, TRANSACTION_FILTER
    );

    let mut stmt = match conn.prepare(&sql) {
        Ok(s) => s,
        Err(e) => {
            log::error!("Prepare export transactions error: {}", e);
            return HttpResponse::InternalServerError().json(ApiResponse::<()>::error(
                "Terjadi kesalahan pada database",
            ));
        }
    };

    let items_res: rusqlite::Result<Vec<TransactionWithCategory>> = stmt
        .query_map(
            params![
                auth.user_id,
                filter.type_filter,
                filter.payment_filter,
                filter.date_from,
                filter.date_to
            ],
            row_to_transaction,
        )
        .and_then(|rows| rows.collect());

    let items = match items_res {
        Ok(items) => items,
        Err(e) => {
            log::error!("Query export transactions error: {}", e);
            return HttpResponse::InternalServerError().json(ApiResponse::<()>::error(
                "Gagal mengambil data untuk export",
            ));
        }
    };

    let csv_bytes = match build_csv(&items) {
        Ok(bytes) => bytes,
        Err(e) => {
            log::error!("Build CSV error: {}", e);
            return HttpResponse::InternalServerError().json(ApiResponse::<()>::error(
                "Gagal membuat file CSV",
            ));
        }
    };

    // BOM UTF-8 agar Excel mendeteksi encoding dengan benar.
    let mut body = Vec::with_capacity(csv_bytes.len() + 3);
    body.extend_from_slice(&[0xEF, 0xBB, 0xBF]);
    body.extend_from_slice(&csv_bytes);

    let filename = format!(
        "riwayat-transaksi-{}.csv",
        chrono::Local::now().format("%Y-%m-%d")
    );

    HttpResponse::Ok()
        .content_type("text/csv; charset=utf-8")
        .insert_header((
            "Content-Disposition",
            format!("attachment; filename=\"{}\"", filename),
        ))
        .insert_header(("Cache-Control", "no-store"))
        .body(body)
}
