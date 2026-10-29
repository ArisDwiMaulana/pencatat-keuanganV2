use std::env;

#[derive(Clone, Debug)]
pub struct Config {
    pub server_host: String,
    pub server_port: u16,
    pub database_url: String,
    pub session_secret: String,
}

impl Config {
    pub fn from_env() -> Self {
        let server_host = env::var("SERVER_HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
        let server_port = env::var("SERVER_PORT")
            .ok()
            .and_then(|p| p.parse::<u16>().ok())
            .unwrap_or(8080);
        let database_url = env::var("DATABASE_URL").unwrap_or_else(|_| "data/data.db".to_string());
        let session_secret = env::var("SESSION_SECRET").unwrap_or_else(|_| {
            "pencatat_keuangan_v2_default_session_secret_key_which_is_at_least_64_bytes_long_12345".to_string()
        });

        Config {
            server_host,
            server_port,
            database_url,
            session_secret,
        }
    }
}
