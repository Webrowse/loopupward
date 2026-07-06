use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use axum::extract::{Request, State};
use axum::middleware::Next;
use axum::response::Response;

use crate::auth::hash_token;
use crate::error::ApiError;
use crate::AppState;

/// Fixed-window in-memory limiter. One backend instance (Railway) makes this
/// honest; move to Redis only if the service scales horizontally.
#[derive(Default)]
pub struct RateLimiter {
    windows: Mutex<HashMap<String, (u64, u32)>>,
}

impl RateLimiter {
    /// Returns true when the call is allowed.
    pub fn check(&self, key: &str, max_per_minute: u32) -> bool {
        let minute = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
            / 60;
        let mut map = self.windows.lock().unwrap();
        // keep the map from growing without bound
        if map.len() > 100_000 {
            map.retain(|_, (m, _)| *m == minute);
        }
        let entry = map.entry(key.to_string()).or_insert((minute, 0));
        if entry.0 != minute {
            *entry = (minute, 0);
        }
        entry.1 += 1;
        entry.1 <= max_per_minute
    }
}

pub async fn rate_limit_mw(
    State(state): State<AppState>,
    request: Request,
    next: Next,
) -> Result<Response, ApiError> {
    let path = request.uri().path().to_string();

    // identify the caller: session token when present, else client IP
    let key = request
        .headers()
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .map(hash_token)
        .or_else(|| {
            request
                .headers()
                .get("x-forwarded-for")
                .and_then(|v| v.to_str().ok())
                .map(|v| v.split(',').next().unwrap_or("").trim().to_string())
        })
        .unwrap_or_else(|| "anon".to_string());

    let (bucket, max) = if path.starts_with("/v1/auth") {
        (format!("auth:{key}"), 20)
    } else if path == "/v1/import" {
        (format!("import:{key}"), 6)
    } else {
        (format!("api:{key}"), 240)
    };

    if !state.limiter.check(&bucket, max) {
        return Err(ApiError::TooManyRequests);
    }
    Ok(next.run(request).await)
}
