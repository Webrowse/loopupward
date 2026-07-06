mod admin;
mod auth;
mod billing;
mod config;
mod data;
mod error;
mod limits;
mod ratelimit;

use std::sync::Arc;

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
    let pool = PgPoolOptions::new()
        .max_connections(10)
        .connect(&config.database_url)
        .await?;
    sqlx::migrate!("./migrations").run(&pool).await?;
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
