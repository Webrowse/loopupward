use axum::body::Bytes;
use axum::extract::State;
use axum::http::HeaderMap;
use axum::Json;
use chrono::{DateTime, Duration, Utc};
use hmac::{Hmac, Mac};
use serde::Deserialize;
use serde_json::{json, Value};
use sha2::Sha256;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult};
use crate::AppState;

type HmacSha256 = Hmac<Sha256>;

const GRACE_DAYS: i64 = 3;

fn plan_months(plan: &str) -> Option<i64> {
    match plan {
        "quarterly" => Some(3),
        "halfyearly" => Some(6),
        "yearly" => Some(12),
        _ => None,
    }
}

fn plan_id<'a>(state: &'a AppState, plan: &str, currency: &str) -> Option<&'a str> {
    match (plan, currency) {
        ("quarterly", "INR") => state.config.plan_quarterly.as_deref(),
        ("halfyearly", "INR") => state.config.plan_halfyearly.as_deref(),
        ("yearly", "INR") => state.config.plan_yearly.as_deref(),
        ("quarterly", "USD") => state.config.plan_quarterly_usd.as_deref(),
        ("halfyearly", "USD") => state.config.plan_halfyearly_usd.as_deref(),
        ("yearly", "USD") => state.config.plan_yearly_usd.as_deref(),
        _ => None,
    }
}

fn default_currency() -> String {
    "INR".into()
}

fn hmac_hex(secret: &str, message: &str) -> String {
    let mut mac = HmacSha256::new_from_slice(secret.as_bytes()).expect("hmac accepts any key size");
    mac.update(message.as_bytes());
    hex::encode(mac.finalize().into_bytes())
}

fn constant_time_eq(a: &str, b: &str) -> bool {
    a.len() == b.len()
        && a.bytes().zip(b.bytes()).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

/* ————— subscribe ————— */

fn valid_currency(c: &str) -> bool {
    c == "INR" || c == "USD"
}

#[derive(Deserialize)]
pub struct SubscribeBody {
    plan: String,
    #[serde(default = "default_currency")]
    currency: String,
}

pub async fn subscribe(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<SubscribeBody>,
) -> ApiResult<Json<Value>> {
    let months = plan_months(&body.plan)
        .ok_or_else(|| ApiError::BadRequest("unknown plan".into()))?;
    if !valid_currency(&body.currency) {
        return Err(ApiError::BadRequest("unknown currency".into()));
    }
    let (key_id, key_secret) = match (&state.config.razorpay_key_id, &state.config.razorpay_key_secret) {
        (Some(id), Some(secret)) => (id.clone(), secret.clone()),
        _ => return Err(ApiError::NotConfigured("Payments")),
    };
    let rzp_plan = plan_id(&state, &body.plan, &body.currency)
        .ok_or(ApiError::NotConfigured("This plan"))?
        .to_string();

    // enough cycles for ~10 years of renewals
    let total_count = (120 / months).max(1);
    let resp: Value = state
        .http
        .post("https://api.razorpay.com/v1/subscriptions")
        .basic_auth(&key_id, Some(&key_secret))
        .json(&json!({
            "plan_id": rzp_plan,
            "total_count": total_count,
            "customer_notify": 1,
            "notes": {
                "user_id": user.id.to_string(),
                "loopupward_plan": body.plan,
                "loopupward_currency": body.currency,
            },
        }))
        .send()
        .await?
        .json()
        .await?;

    let sub_id = resp["id"]
        .as_str()
        .ok_or_else(|| ApiError::Internal(anyhow::anyhow!("razorpay error: {resp}")))?;

    Ok(Json(json!({
        "subscriptionId": sub_id,
        "keyId": key_id,
        "user": { "email": user.email, "name": user.name },
    })))
}

/* ————— confirm (instant activation after checkout; webhook stays authoritative) ————— */

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfirmBody {
    payment_id: String,
    subscription_id: String,
    signature: String,
    plan: String,
    #[serde(default = "default_currency")]
    currency: String,
}

pub async fn confirm(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<ConfirmBody>,
) -> ApiResult<Json<Value>> {
    let months = plan_months(&body.plan)
        .ok_or_else(|| ApiError::BadRequest("unknown plan".into()))?;
    if !valid_currency(&body.currency) {
        return Err(ApiError::BadRequest("unknown currency".into()));
    }
    let key_secret = state
        .config
        .razorpay_key_secret
        .as_deref()
        .ok_or(ApiError::NotConfigured("Payments"))?;

    let expected = hmac_hex(key_secret, &format!("{}|{}", body.payment_id, body.subscription_id));
    if !constant_time_eq(&expected, &body.signature) {
        return Err(ApiError::BadRequest("bad signature".into()));
    }

    let until = Utc::now() + Duration::days(months * 30 + GRACE_DAYS + months / 3);
    set_premium(&state, user.id, Some(until), Some(&body.plan), Some(&body.currency)).await?;
    upsert_subscription(
        &state,
        &body.subscription_id,
        user.id,
        Some(&body.plan),
        "active",
        Some(until),
        Some(&body.currency),
    )
    .await?;

    Ok(Json(json!({ "ok": true, "premiumUntil": until })))
}

/* ————— webhook (source of truth for the lifecycle) ————— */

pub async fn webhook(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> ApiResult<Json<Value>> {
    let secret = state
        .config
        .razorpay_webhook_secret
        .as_deref()
        .ok_or(ApiError::NotConfigured("Webhook"))?;
    let signature = headers
        .get("x-razorpay-signature")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let raw = std::str::from_utf8(&body).map_err(|_| ApiError::BadRequest("bad body".into()))?;
    if !constant_time_eq(&hmac_hex(secret, raw), signature) {
        return Err(ApiError::BadRequest("bad signature".into()));
    }

    let event: Value = serde_json::from_str(raw).map_err(|_| ApiError::BadRequest("bad json".into()))?;
    let event_name = event["event"].as_str().unwrap_or("");
    let sub = &event["payload"]["subscription"]["entity"];
    let Some(sub_id) = sub["id"].as_str() else {
        return Ok(Json(json!({ "ok": true, "skipped": true })));
    };
    let Some(user_id) = sub["notes"]["user_id"].as_str().and_then(|s| Uuid::parse_str(s).ok()) else {
        return Ok(Json(json!({ "ok": true, "skipped": "no user" })));
    };
    let plan = sub["notes"]["loopupward_plan"].as_str();
    let currency = sub["notes"]["loopupward_currency"].as_str();
    let status = sub["status"].as_str().unwrap_or("unknown");
    let period_end: Option<DateTime<Utc>> = sub["current_end"]
        .as_i64()
        .and_then(|secs| DateTime::from_timestamp(secs, 0))
        .map(|t| t + Duration::days(GRACE_DAYS));

    upsert_subscription(&state, sub_id, user_id, plan, status, period_end, currency).await?;

    match event_name {
        // paid through the current cycle (+grace) — premium until then
        "subscription.activated" | "subscription.charged" | "subscription.resumed" => {
            if let Some(until) = period_end {
                set_premium(&state, user_id, Some(until), plan, currency).await?;
            }
        }
        // cancellations/halts: no action — already-paid time is honored,
        // premium simply lapses at premium_until
        _ => {}
    }

    Ok(Json(json!({ "ok": true })))
}

/* ————— shared ————— */

pub async fn set_premium(
    state: &AppState,
    user_id: Uuid,
    until: Option<DateTime<Utc>>,
    plan: Option<&str>,
    currency: Option<&str>,
) -> ApiResult<()> {
    sqlx::query("update users set premium_until = $2, plan = $3, currency = $4 where id = $1")
        .bind(user_id)
        .bind(until)
        .bind(plan)
        .bind(currency)
        .execute(&state.pool)
        .await?;
    Ok(())
}

async fn upsert_subscription(
    state: &AppState,
    id: &str,
    user_id: Uuid,
    plan: Option<&str>,
    status: &str,
    period_end: Option<DateTime<Utc>>,
    currency: Option<&str>,
) -> ApiResult<()> {
    sqlx::query(
        "insert into subscriptions (id, user_id, plan, status, current_period_end, currency, updated_at)
         values ($1, $2, $3, $4, $5, $6, now())
         on conflict (id) do update set
           plan = coalesce(excluded.plan, subscriptions.plan),
           status = excluded.status,
           current_period_end = excluded.current_period_end,
           currency = coalesce(excluded.currency, subscriptions.currency),
           updated_at = now()",
    )
    .bind(id)
    .bind(user_id)
    .bind(plan)
    .bind(status)
    .bind(period_end)
    .bind(currency)
    .execute(&state.pool)
    .await?;
    Ok(())
}
