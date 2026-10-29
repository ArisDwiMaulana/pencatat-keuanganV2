#![allow(dead_code)]

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub id: i64,
    pub username: String,
    #[serde(skip_serializing)]
    pub password_hash: String,
    pub display_name: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Category {
    pub id: i64,
    pub user_id: i64,
    pub name: String,
    pub r#type: String, // "income" or "expense"
    pub is_default: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Transaction {
    pub id: i64,
    pub user_id: i64,
    pub category_id: i64,
    pub r#type: String, // "income" or "expense"
    pub payment_method: String, // "cash" or "cashless"
    pub amount: f64,
    pub date: String,
    pub note: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransactionWithCategory {
    pub id: i64,
    pub user_id: i64,
    pub category_id: i64,
    pub category_name: String,
    pub r#type: String,
    pub payment_method: String,
    pub amount: f64,
    pub date: String,
    pub note: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct SignupRequest {
    pub display_name: String,
    pub username: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateCategoryRequest {
    pub name: String,
    pub r#type: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateTransactionRequest {
    pub category_id: i64,
    pub r#type: String,
    pub payment_method: String,
    pub amount: f64,
    pub date: String,
    pub note: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ApiResponse<T> {
    pub success: bool,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<T>,
}

impl<T> ApiResponse<T> {
    pub fn success(message: impl Into<String>, data: T) -> Self {
        ApiResponse {
            success: true,
            message: message.into(),
            data: Some(data),
        }
    }

    pub fn ok_msg(message: impl Into<String>) -> ApiResponse<()> {
        ApiResponse {
            success: true,
            message: message.into(),
            data: None,
        }
    }

    pub fn error(message: impl Into<String>) -> ApiResponse<()> {
        ApiResponse {
            success: false,
            message: message.into(),
            data: None,
        }
    }
}

#[derive(Debug, Serialize)]
pub struct HealthResponse {
    pub status: String,
    pub app: String,
    pub version: String,
}
