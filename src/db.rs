use rusqlite::{Connection, Result};
use std::fs;
use std::path::Path;
use std::sync::Mutex;

#[allow(dead_code)]
pub type DbPool = Mutex<Connection>;

pub fn init_db(database_url: &str) -> Result<Connection> {
    if let Some(parent) = Path::new(database_url).parent() {
        if !parent.as_os_str().is_empty() {
            let _ = fs::create_dir_all(parent);
        }
    }

    let conn = Connection::open(database_url)?;

    // Enable foreign keys
    conn.execute_batch("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;")?;

    // Create tables
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            display_name TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

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

        CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, date);
        CREATE INDEX IF NOT EXISTS idx_transactions_user_type ON transactions(user_id, type);
        CREATE INDEX IF NOT EXISTS idx_categories_user ON categories(user_id);
        "#,
    )?;

    log::info!("Database initialized successfully at {}", database_url);
    Ok(conn)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_init_db_creates_tables() {
        let conn = init_db(":memory:").expect("Failed to initialize in-memory db");

        // Verify users table exists
        let mut stmt = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
            .unwrap();
        let exists = stmt.exists([]).unwrap();
        assert!(exists, "users table should exist");

        // Verify categories table exists
        let mut stmt = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='categories'")
            .unwrap();
        let exists = stmt.exists([]).unwrap();
        assert!(exists, "categories table should exist");

        // Verify transactions table exists
        let mut stmt = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='transactions'")
            .unwrap();
        let exists = stmt.exists([]).unwrap();
        assert!(exists, "transactions table should exist");

        // Verify indexes exist
        let mut stmt = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_transactions_user_date'")
            .unwrap();
        assert!(stmt.exists([]).unwrap(), "idx_transactions_user_date should exist");
    }
}
