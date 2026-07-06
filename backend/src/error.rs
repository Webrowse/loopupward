use axum::{http::StatusCode, response::IntoResponse, response::Response, Json};
use serde_json::json;

#[derive(Debug)]
pub enum ApiError {
    Unauthorized,
    Forbidden,
    NotFound,
    BadRequest(String),
    /// A free-plan or storage cap was hit; the client shows an upgrade nudge.
    Limit(String),
    TooManyRequests,
    NotConfigured(&'static str),
    Internal(anyhow::Error),
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, code, message) = match &self {
            ApiError::Unauthorized => (StatusCode::UNAUTHORIZED, "unauthorized", "Sign in first".into()),
            ApiError::Forbidden => (StatusCode::FORBIDDEN, "forbidden", "Not allowed".into()),
            ApiError::NotFound => (StatusCode::NOT_FOUND, "not_found", "Not found".into()),
            ApiError::BadRequest(m) => (StatusCode::BAD_REQUEST, "bad_request", m.clone()),
            ApiError::Limit(m) => (StatusCode::PAYMENT_REQUIRED, "limit", m.clone()),
            ApiError::TooManyRequests => (
                StatusCode::TOO_MANY_REQUESTS, "rate_limited", "Slow down a little".into(),
            ),
            ApiError::NotConfigured(what) => (
                StatusCode::SERVICE_UNAVAILABLE, "not_configured", format!("{what} is not configured"),
            ),
            ApiError::Internal(e) => {
                tracing::error!("internal error: {e:#}");
                (StatusCode::INTERNAL_SERVER_ERROR, "internal", "Something went wrong".into())
            }
        };
        (status, Json(json!({ "error": message, "code": code }))).into_response()
    }
}

impl<E: Into<anyhow::Error>> From<E> for ApiError {
    fn from(e: E) -> Self {
        ApiError::Internal(e.into())
    }
}

pub type ApiResult<T> = Result<T, ApiError>;
