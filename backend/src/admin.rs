use axum::extract::{Query, State};
use axum::Json;
use chrono::{Duration, Utc};
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::Row;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::billing::set_premium;
use crate::error::{ApiError, ApiResult};
use crate::AppState;

const GRANT_DAYS: &[i64] = &[7, 31, 183, 366, 36_500];

pub async fn stats(State(state): State<AppState>, user: AuthUser) -> ApiResult<Json<Value>> {
    user.require_owner()?;
    let row = sqlx::query(
        "select
           (select count(*) from users) as users,
           (select count(*) from users where premium_until > now()) as premium,
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
        "select id, email, name, role, premium_until, plan, currency, created_at from users
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

    if body.revoke {
        set_premium(&state, body.user_id, None, None, None).await?;
        return Ok(Json(json!({ "ok": true, "premiumUntil": null })));
    }

    let days = body.days.ok_or_else(|| ApiError::BadRequest("days required".into()))?;
    if !GRANT_DAYS.contains(&days) {
        return Err(ApiError::BadRequest("invalid duration".into()));
    }

    // extend from the current expiry when still premium, otherwise from now
    let row = sqlx::query("select premium_until from users where id = $1")
        .bind(body.user_id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or(ApiError::NotFound)?;
    let current: Option<chrono::DateTime<Utc>> = row.get("premium_until");
    let base = match current {
        Some(t) if t > Utc::now() => t,
        _ => Utc::now(),
    };
    let until = base + Duration::days(days);
    set_premium(&state, body.user_id, Some(until), Some("granted"), None).await?;
    Ok(Json(json!({ "ok": true, "premiumUntil": until })))
}
