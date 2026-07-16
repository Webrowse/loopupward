use axum::extract::{Query, State};
use axum::Json;
use chrono::{Duration, Utc};
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::Row;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult};
use crate::AppState;

const GRANT_DAYS: &[i64] = &[7, 31, 183, 366, 36_500];

pub async fn stats(State(state): State<AppState>, user: AuthUser) -> ApiResult<Json<Value>> {
    user.require_owner()?;
    let row = sqlx::query(
        "select
           (select count(*) from users) as users,
           (select count(*) from users where premium_until > now() or admin_premium_until > now()) as premium,
           (select count(*) from subscriptions where status = 'active') as active_subs,
           (select count(*) from items) as items,
           (select count(*) from seeds) as seeds,
           (select count(*) from actions where done) as completed_actions",
    )
    .fetch_one(&state.pool)
    .await?;
    Ok(Json(json!({
        "users": row.get::<i64, _>("users"),
        "premium": row.get::<i64, _>("premium"),
        "activeSubscriptions": row.get::<i64, _>("active_subs"),
        "items": row.get::<i64, _>("items"),
        "seeds": row.get::<i64, _>("seeds"),
        "completedActions": row.get::<i64, _>("completed_actions"),
    })))
}

#[derive(Deserialize)]
pub struct UsersQuery {
    #[serde(default)]
    q: String,
}

pub async fn users(
    State(state): State<AppState>,
    user: AuthUser,
    Query(query): Query<UsersQuery>,
) -> ApiResult<Json<Value>> {
    user.require_owner()?;
    let like = format!("%{}%", query.q.trim());
    let rows = sqlx::query(
        "select id, email, name, role, premium_until, admin_premium_until, plan, currency, created_at from users
         where ($1 = '%%' or email ilike $1 or name ilike $1)
         order by created_at desc limit 50",
    )
    .bind(&like)
    .fetch_all(&state.pool)
    .await?;
    let users: Vec<Value> = rows
        .iter()
        .map(|r| {
            json!({
                "id": r.get::<Uuid, _>("id"),
                "email": r.get::<String, _>("email"),
                "name": r.get::<Option<String>, _>("name"),
                "role": r.get::<String, _>("role"),
                "premiumUntil": r.get::<Option<chrono::DateTime<Utc>>, _>("premium_until"),
                "adminPremiumUntil": r.get::<Option<chrono::DateTime<Utc>>, _>("admin_premium_until"),
                "plan": r.get::<Option<String>, _>("plan"),
                "currency": r.get::<Option<String>, _>("currency"),
                "createdAt": r.get::<chrono::DateTime<Utc>, _>("created_at"),
            })
        })
        .collect();
    Ok(Json(json!({ "users": users })))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GrantBody {
    user_id: Uuid,
    #[serde(default)]
    days: Option<i64>,
    #[serde(default)]
    revoke: bool,
}

pub async fn grant(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<GrantBody>,
) -> ApiResult<Json<Value>> {
    user.require_owner()?;

    // grants live in their own column: a Razorpay renewal webhook rewrites
    // premium_until and must never be able to wipe an owner's grant — and a
    // revoke here must never touch time the user actually paid for
    if body.revoke {
        let done = sqlx::query("update users set admin_premium_until = null where id = $1")
            .bind(body.user_id)
            .execute(&state.pool)
            .await?;
        if done.rows_affected() == 0 {
            return Err(ApiError::NotFound);
        }
        return Ok(Json(json!({ "ok": true, "adminPremiumUntil": null })));
    }

    let days = body.days.ok_or_else(|| ApiError::BadRequest("days required".into()))?;
    if !GRANT_DAYS.contains(&days) {
        return Err(ApiError::BadRequest("invalid duration".into()));
    }

    // extend from the current grant when one is still running, otherwise from now
    let row = sqlx::query("select admin_premium_until from users where id = $1")
        .bind(body.user_id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or(ApiError::NotFound)?;
    let current: Option<chrono::DateTime<Utc>> = row.get("admin_premium_until");
    let base = match current {
        Some(t) if t > Utc::now() => t,
        _ => Utc::now(),
    };
    let until = base + Duration::days(days);
    sqlx::query("update users set admin_premium_until = $2 where id = $1")
        .bind(body.user_id)
        .bind(until)
        .execute(&state.pool)
        .await?;
    Ok(Json(json!({ "ok": true, "adminPremiumUntil": until })))
}
