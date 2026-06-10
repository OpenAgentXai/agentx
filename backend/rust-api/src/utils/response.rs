use axum::Json;
use serde::Serialize;
use serde_json::json;

/// Standard API response wrapper
#[derive(Debug, Serialize)]
pub struct ApiResponse<T: Serialize> {
    pub success: bool,
    pub data: T,
}

/// Paginated response wrapper
#[derive(Debug, Serialize)]
pub struct PaginatedResponse<T: Serialize> {
    pub success: bool,
    pub data: Vec<T>,
    pub pagination: Pagination,
}

#[derive(Debug, Serialize)]
pub struct Pagination {
    pub total: i64,
    pub page: i32,
    pub per_page: i32,
    pub total_pages: i32,
}

/// Create a success response
pub fn success<T: Serialize>(data: T) -> Json<serde_json::Value> {
    Json(json!({
        "success": true,
        "data": data,
    }))
}

/// Create a paginated success response
pub fn paginated<T: Serialize>(data: Vec<T>, total: i64, page: i32, per_page: i32) -> Json<serde_json::Value> {
    let total_pages = ((total as f64) / (per_page as f64)).ceil() as i32;
    Json(json!({
        "success": true,
        "data": data,
        "pagination": {
            "total": total,
            "page": page,
            "per_page": per_page,
            "total_pages": total_pages,
        }
    }))
}

/// Create a message-only success response
pub fn message(msg: &str) -> Json<serde_json::Value> {
    Json(json!({
        "success": true,
        "message": msg,
    }))
}

/// Normalize pagination parameters
pub fn normalize_pagination(page: Option<i32>, per_page: Option<i32>) -> (i32, i32, i64) {
    let page = page.unwrap_or(1).max(1);
    let per_page = per_page.unwrap_or(20).clamp(1, 100);
    let offset = ((page - 1) * per_page) as i64;
    (page, per_page, offset)
}
