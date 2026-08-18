mod admin;
mod auth;
mod billing;
mod config;
mod data;
mod error;
mod limits;
mod ratelimit;

use std::sync::Arc;
use std::time::Duration;

use axum::http::{header, HeaderValue, Method};
use axum::middleware;
use axum::routing::{delete, get, post, put};
use axum::Router;
use sqlx::postgres::PgPoolOptions;
use tokio::sync::RwLock;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;

use crate::auth::JwksCache;
use crate::config::Config;
use crate::ratelimit::RateLimiter;

#[derive(Clone)]
pub struct AppState {
    pub pool: sqlx::PgPool,
    pub config: Arc<Config>,
    pub http: reqwest::Client,
    pub jwks: Arc<RwLock<JwksCache>>,
    pub limiter: Arc<RateLimiter>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "lifeos_api=info,tower_http=info".into()),
        )
        .init();

    let config = Config::from_env()?;

    // Serving pool, pointed at Neon's POOLED endpoint. Ten per instance is
    // cheap against a pooler that accepts 10k clients, so several Cloud Run
    // instances can each hold one without approaching the limit.
    //
    // idle_timeout sits below Neon's five-minute scale-to-zero window on
    // purpose: let sqlx retire an idle connection itself, rather than have the
    // compute suspend and hand a request a socket that is already dead.
    // acquire_timeout has to absorb a cold wake, which is the normal case here
    // — this database is asleep more often than it is awake.
    let pool = PgPoolOptions::new()
        // Above the ten concurrent reads a single /v1/data now issues, so one
        // page load cannot take the whole pool and stall a request beside it.
        .max_connections(20)
        .min_connections(0)
        .idle_timeout(Duration::from_secs(180))
        .max_lifetime(Duration::from_secs(1800))
        .acquire_timeout(Duration::from_secs(30))
        .connect(&config.database_url)
        .await?;

    // Migrations deliberately do NOT go through the pooler. sqlx guards them
    // with a session-level advisory lock, which PgBouncer's transaction
    // pooling does not support: lock and unlock can land on different
    // backends, so the lock guards nothing, and an unlock that misses strands
    // it — after which every future cold start blocks on boot. Use the direct
    // endpoint when one is configured, on a pool that closes straight after.
    match config.migration_database_url.as_deref() {
        Some(url) => {
            let migrator = PgPoolOptions::new()
                .max_connections(1)
                .acquire_timeout(Duration::from_secs(30))
                .connect(url)
                .await?;
            sqlx::migrate!("./migrations").run(&migrator).await?;
            migrator.close().await;
        }
        None => sqlx::migrate!("./migrations").run(&pool).await?,
    }
    tracing::info!("migrations applied");

    let origins: Vec<HeaderValue> = config
        .frontend_origins
        .iter()
        .filter_map(|o| o.parse().ok())
        .collect();
    let cors = CorsLayer::new()
        .allow_origin(origins)
        .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE])
        .allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION]);

    let state = AppState {
        pool,
        config: Arc::new(config.clone()),
        http: reqwest::Client::new(),
        jwks: Arc::new(RwLock::new(JwksCache::default())),
        limiter: Arc::new(RateLimiter::default()),
    };

    let app = Router::new()
        .route("/health", get(auth::health))
        .route("/v1/auth/google", post(auth::google_login))
        .route("/v1/auth/dev", post(auth::dev_login))
        .route("/v1/auth/logout", post(auth::logout))
        .route("/v1/me", get(auth::me))
        .route("/v1/data", get(data::load))
        .route("/v1/data/{table}", put(data::upsert))
        .route("/v1/data/{table}", delete(data::remove))
        .route("/v1/import", post(data::import))
        .route("/v1/export", get(data::export))
        .route("/v1/settings", get(data::get_settings))
        .route("/v1/settings", put(data::put_settings))
        .route("/v1/billing/subscribe", post(billing::subscribe))
        .route("/v1/billing/confirm", post(billing::confirm))
        .route("/v1/billing/webhook", post(billing::webhook))
        .route("/v1/admin/stats", get(admin::stats))
        .route("/v1/admin/users", get(admin::users))
        .route("/v1/admin/grant", post(admin::grant))
        .layer(middleware::from_fn_with_state(state.clone(), ratelimit::rate_limit_mw))
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(state.clone());

    let addr = format!("0.0.0.0:{}", state.config.port);
    tracing::info!("LoopUpward API listening on {addr}");
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}
