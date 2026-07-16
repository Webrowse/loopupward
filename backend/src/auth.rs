use std::collections::HashMap;
use std::time::{Duration, Instant};

use axum::extract::{FromRequestParts, State};
use axum::http::request::Parts;
use axum::Json;
use chrono::{DateTime, Utc};
use jsonwebtoken::{decode, decode_header, Algorithm, DecodingKey, Validation};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use sqlx::Row;
use uuid::Uuid;

use crate::error::{ApiError, ApiResult};
use crate::limits::caps_json;
use crate::AppState;

const SESSION_DAYS: i64 = 90;
const GOOGLE_JWKS_URL: &str = "https://www.googleapis.com/oauth2/v3/certs";

/* ————— session tokens ————— */

pub fn hash_token(token: &str) -> String {
    hex::encode(Sha256::digest(token.as_bytes()))
}

fn new_token() -> String {
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    hex::encode(bytes)
}

/* ————— authenticated user extractor ————— */

#[derive(Clone, Debug)]
pub struct AuthUser {
    pub id: Uuid,
    pub email: String,
    pub name: Option<String>,
    pub avatar_url: Option<String>,
    pub role: String,
    pub premium_until: Option<DateTime<Utc>>,
    pub plan: Option<String>,
    pub currency: Option<String>,
    pub token_hash: String,
}

impl AuthUser {
    pub fn premium(&self) -> bool {
        self.premium_until.map(|t| t > Utc::now()).unwrap_or(false)
    }
    pub fn is_owner(&self) -> bool {
        self.role == "owner"
    }
    pub fn require_owner(&self) -> ApiResult<()> {
        if self.is_owner() { Ok(()) } else { Err(ApiError::Forbidden) }
    }
}

pub fn bearer_token(parts: &Parts) -> Option<String> {
    parts
        .headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .map(|v| v.to_string())
}

impl FromRequestParts<AppState> for AuthUser {
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, Self::Rejection> {
        let token = bearer_token(parts).ok_or(ApiError::Unauthorized)?;
        let token_hash = hash_token(&token);
        let row = sqlx::query(
            "select u.id, u.email, u.name, u.avatar_url, u.role, u.premium_until, u.plan, u.currency
             from sessions s join users u on u.id = s.user_id
             where s.token_hash = $1 and s.expires_at > now()",
        )
        .bind(&token_hash)
        .fetch_optional(&state.pool)
        .await?
        .ok_or(ApiError::Unauthorized)?;

        // opportunistic last_seen touch; failures are irrelevant
        let pool = state.pool.clone();
        let th = token_hash.clone();
        tokio::spawn(async move {
            let _ = sqlx::query("update sessions set last_seen = now() where token_hash = $1")
                .bind(th)
                .execute(&pool)
                .await;
        });

        Ok(AuthUser {
            id: row.get("id"),
            email: row.get("email"),
            name: row.get("name"),
            avatar_url: row.get("avatar_url"),
            role: row.get("role"),
            premium_until: row.get("premium_until"),
            plan: row.get("plan"),
            currency: row.get("currency"),
            token_hash,
        })
    }
}

/* ————— Google ID token verification ————— */

#[derive(Default)]
pub struct JwksCache {
    fetched: Option<Instant>,
    keys: HashMap<String, (String, String)>, // kid -> (n, e)
}

#[derive(Deserialize)]
struct GoogleClaims {
    sub: String,
    email: String,
    #[serde(default)]
    email_verified: bool,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    picture: Option<String>,
}

async fn google_keys(state: &AppState) -> ApiResult<HashMap<String, (String, String)>> {
    {
        let cache = state.jwks.read().await;
        if let Some(at) = cache.fetched {
            if at.elapsed() < Duration::from_secs(3600) && !cache.keys.is_empty() {
                return Ok(cache.keys.clone());
            }
        }
    }
    let body: Value = state
        .http
        .get(GOOGLE_JWKS_URL)
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    let mut keys = HashMap::new();
    for k in body["keys"].as_array().cloned().unwrap_or_default() {
        if let (Some(kid), Some(n), Some(e)) =
            (k["kid"].as_str(), k["n"].as_str(), k["e"].as_str())
        {
            keys.insert(kid.to_string(), (n.to_string(), e.to_string()));
        }
    }
    let mut cache = state.jwks.write().await;
    cache.fetched = Some(Instant::now());
    cache.keys = keys.clone();
    Ok(keys)
}

async fn verify_google_credential(state: &AppState, credential: &str) -> ApiResult<GoogleClaims> {
    if state.config.google_client_id.is_empty() {
        return Err(ApiError::NotConfigured("Google sign-in"));
    }
    let header = decode_header(credential)
        .map_err(|_| ApiError::BadRequest("Invalid credential".into()))?;
    let kid = header.kid.ok_or_else(|| ApiError::BadRequest("Invalid credential".into()))?;
    let keys = google_keys(state).await?;
    let (n, e) = keys
        .get(&kid)
        .ok_or_else(|| ApiError::BadRequest("Unknown signing key".into()))?;
    let key = DecodingKey::from_rsa_components(n, e)
        .map_err(|_| ApiError::BadRequest("Invalid signing key".into()))?;
    let mut validation = Validation::new(Algorithm::RS256);
    validation.set_audience(&[state.config.google_client_id.as_str()]);
    validation.set_issuer(&["https://accounts.google.com", "accounts.google.com"]);
    let data = decode::<GoogleClaims>(credential, &key, &validation)
        .map_err(|_| ApiError::Unauthorized)?;
    if !data.claims.email_verified {
        return Err(ApiError::BadRequest("Google account email is not verified".into()));
    }
    Ok(data.claims)
}

/* ————— shared login plumbing ————— */

async fn upsert_user(
    state: &AppState,
    google_sub: Option<&str>,
    email: &str,
    name: Option<&str>,
    avatar: Option<&str>,
) -> ApiResult<Uuid> {
    let role = if !state.config.owner_email.is_empty()
        && email.eq_ignore_ascii_case(&state.config.owner_email)
    {
        "owner"
    } else {
        "user"
    };
    let row = sqlx::query(
        "insert into users (google_sub, email, name, avatar_url, role)
         values ($1, $2, $3, $4, $5)
         on conflict (email) do update
           set google_sub = coalesce(excluded.google_sub, users.google_sub),
               name = coalesce(excluded.name, users.name),
               avatar_url = coalesce(excluded.avatar_url, users.avatar_url),
               role = case when excluded.role = 'owner' then 'owner' else users.role end
         returning id",
    )
    .bind(google_sub)
    .bind(email)
    .bind(name)
    .bind(avatar)
    .bind(role)
    .fetch_one(&state.pool)
    .await?;
    Ok(row.get("id"))
}

async fn create_session(state: &AppState, user_id: Uuid) -> ApiResult<String> {
    let token = new_token();
    sqlx::query(
        "insert into sessions (token_hash, user_id, expires_at)
         values ($1, $2, now() + make_interval(days => $3))",
    )
    .bind(hash_token(&token))
    .bind(user_id)
    .bind(SESSION_DAYS as i32)
    .execute(&state.pool)
    .await?;
    Ok(token)
}

fn user_payload(u: &AuthUser) -> Value {
    json!({
        "id": u.id,
        "email": u.email,
        "name": u.name,
        "avatarUrl": u.avatar_url,
        "role": u.role,
        "premium": u.premium(),
        "premiumUntil": u.premium_until,
        "plan": u.plan,
        "currency": u.currency,
        "limits": caps_json(u.premium()),
    })
}

async fn load_auth_user(state: &AppState, id: Uuid) -> ApiResult<AuthUser> {
    let row = sqlx::query(
        "select id, email, name, avatar_url, role, premium_until, plan, currency from users where id = $1",
    )
    .bind(id)
    .fetch_one(&state.pool)
    .await?;
    Ok(AuthUser {
        id: row.get("id"),
        email: row.get("email"),
        name: row.get("name"),
        avatar_url: row.get("avatar_url"),
        role: row.get("role"),
        premium_until: row.get("premium_until"),
        plan: row.get("plan"),
        currency: row.get("currency"),
        token_hash: String::new(),
    })
}

/* ————— handlers ————— */

#[derive(Deserialize)]
pub struct GoogleLoginBody {
    credential: String,
}

pub async fn google_login(
    State(state): State<AppState>,
    Json(body): Json<GoogleLoginBody>,
) -> ApiResult<Json<Value>> {
    let claims = verify_google_credential(&state, &body.credential).await?;
    let user_id = upsert_user(
        &state,
        Some(&claims.sub),
        &claims.email,
        claims.name.as_deref(),
        claims.picture.as_deref(),
    )
    .await?;
    let token = create_session(&state, user_id).await?;
    let user = load_auth_user(&state, user_id).await?;
    Ok(Json(json!({ "token": token, "user": user_payload(&user) })))
}

#[derive(Deserialize)]
pub struct DevLoginBody {
    secret: String,
    email: String,
    #[serde(default)]
    name: Option<String>,
}

/// Local-development login. Active only when DEV_LOGIN_SECRET is set.
pub async fn dev_login(
    State(state): State<AppState>,
    Json(body): Json<DevLoginBody>,
) -> ApiResult<Json<Value>> {
    let secret = state
        .config
        .dev_login_secret
        .as_deref()
        .ok_or(ApiError::NotFound)?;
    if body.secret != secret {
        return Err(ApiError::Unauthorized);
    }
    let user_id = upsert_user(&state, None, &body.email, body.name.as_deref(), None).await?;
    let token = create_session(&state, user_id).await?;
    let user = load_auth_user(&state, user_id).await?;
    Ok(Json(json!({ "token": token, "user": user_payload(&user) })))
}

pub async fn logout(State(state): State<AppState>, user: AuthUser) -> ApiResult<Json<Value>> {
    sqlx::query("delete from sessions where token_hash = $1")
        .bind(&user.token_hash)
        .execute(&state.pool)
        .await?;
    Ok(Json(json!({ "ok": true })))
}

pub async fn me(user: AuthUser) -> Json<Value> {
    Json(user_payload(&user))
}

#[derive(Serialize)]
pub struct Health {
    ok: bool,
}

pub async fn health() -> Json<Health> {
    Json(Health { ok: true })
}
