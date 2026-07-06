use std::env;

#[derive(Clone)]
pub struct Config {
    pub database_url: String,
    pub port: u16,
    pub google_client_id: String,
    pub owner_email: String,
    pub frontend_origins: Vec<String>,
    pub razorpay_key_id: Option<String>,
    pub razorpay_key_secret: Option<String>,
    pub razorpay_webhook_secret: Option<String>,
    pub plan_quarterly: Option<String>,
    pub plan_halfyearly: Option<String>,
    pub plan_yearly: Option<String>,
    /// When set, POST /v1/auth/dev {secret,email} issues a session without
    /// Google — for local development and CI only. Never set in production.
    pub dev_login_secret: Option<String>,
}

fn opt(key: &str) -> Option<String> {
    env::var(key).ok().filter(|v| !v.trim().is_empty())
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        Ok(Self {
            database_url: env::var("DATABASE_URL")
                .map_err(|_| anyhow::anyhow!("DATABASE_URL is required"))?,
            port: opt("PORT").and_then(|p| p.parse().ok()).unwrap_or(8080),
            google_client_id: opt("GOOGLE_CLIENT_ID").unwrap_or_default(),
            owner_email: opt("OWNER_EMAIL").unwrap_or_default(),
            frontend_origins: opt("FRONTEND_ORIGINS")
                .unwrap_or_else(|| "http://localhost:3000".into())
                .split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect(),
            razorpay_key_id: opt("RAZORPAY_KEY_ID"),
            razorpay_key_secret: opt("RAZORPAY_KEY_SECRET"),
            razorpay_webhook_secret: opt("RAZORPAY_WEBHOOK_SECRET"),
            plan_quarterly: opt("RAZORPAY_PLAN_QUARTERLY"),
            plan_halfyearly: opt("RAZORPAY_PLAN_HALFYEARLY"),
            plan_yearly: opt("RAZORPAY_PLAN_YEARLY"),
            dev_login_secret: opt("DEV_LOGIN_SECRET"),
        })
    }
}
