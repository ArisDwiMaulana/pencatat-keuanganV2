use actix_files::Files;
use actix_session::{storage::CookieSessionStore, SessionMiddleware};
use actix_web::cookie::{Key, SameSite};
use actix_web::{get, middleware::Logger, web, App, HttpResponse, HttpServer, Responder};
use std::sync::Mutex;

mod config;
mod db;
mod handlers;
mod middleware;
mod models;

use config::Config;
use models::HealthResponse;

#[get("/api/health")]
async fn health_check() -> impl Responder {
    HttpResponse::Ok().json(HealthResponse {
        status: "ok".to_string(),
        app: "pencatat-keuangan".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    })
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    // Load .env file if present
    dotenv::dotenv().ok();

    // Initialize logger
    env_logger::init_from_env(env_logger::Env::new().default_filter_or("info"));

    let config = Config::from_env();
    log::info!("Starting server on {}:{}", config.server_host, config.server_port);

    // Initialize Database
    let conn = db::init_db(&config.database_url)
        .expect("Failed to initialize database");
    let db_data = web::Data::new(Mutex::new(conn));

    // Secret key for cookie session (must be at least 64 bytes)
    let secret_bytes = config.session_secret.as_bytes();
    let secret_key = if secret_bytes.len() >= 64 {
        Key::from(secret_bytes)
    } else {
        // Fallback pad to 64 bytes if shorter
        let mut key_buf = vec![0u8; 64];
        let copy_len = secret_bytes.len().min(64);
        key_buf[..copy_len].copy_from_slice(&secret_bytes[..copy_len]);
        Key::from(&key_buf)
    };

    let bind_addr = (config.server_host.clone(), config.server_port);

    HttpServer::new(move || {
        App::new()
            .app_data(db_data.clone())
            .wrap(Logger::default())
            .wrap(
                SessionMiddleware::builder(CookieSessionStore::default(), secret_key.clone())
                    .cookie_name("id_session".to_string())
                    .cookie_secure(false) // Set to false so HTTP in dev works
                    .cookie_same_site(SameSite::Lax)
                    .cookie_http_only(true)
                    .build(),
            )
            // Health check API
            .service(health_check)
            // Auth endpoints
            .service(
                web::scope("/api/auth")
                    .service(handlers::auth::signup)
                    .service(handlers::auth::login)
                    .service(handlers::auth::logout)
                    .service(handlers::auth::me),
            )
            // Static files (must be registered after specific API endpoints)
            .service(Files::new("/", "./static").index_file("index.html"))
    })
    .bind(bind_addr)?
    .run()
    .await
}
