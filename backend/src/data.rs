use axum::extract::{Path, State};
use axum::Json;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{PgConnection, Postgres, Row, Transaction};
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult};
use crate::limits::*;
use crate::AppState;

/* ————— row types (wire format == frontend camelCase JSON) ————— */

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Area {
    pub id: Uuid,
    pub name: String,
    pub emoji: String,
    pub color: String,
    pub position: i32,
    pub created_at: i64,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    pub id: Uuid,
    pub area_id: Option<Uuid>,
    pub parent_id: Option<Uuid>,
    pub kind: String,
    pub tracker: String,
    pub title: String,
    #[serde(default)]
    pub note: String,
    pub target: Option<f64>,
    #[serde(default)]
    pub current: f64,
    pub unit: Option<String>,
    pub horizon: Option<String>,
    pub status: String,
    pub cadence: Option<String>,
    #[serde(default)]
    pub cadence_days: Option<Vec<i32>>,
    #[serde(default)]
    pub cadence_count: Option<i32>,
    #[serde(default)]
    pub pinned: bool,
    #[serde(default)]
    pub position: i32,
    pub created_at: i64,
    pub completed_at: Option<i64>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Seed {
    pub id: Uuid,
    pub text: String,
    pub created_at: i64,
    pub item_id: Option<Uuid>,
    pub archived_at: Option<i64>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionRow {
    pub id: Uuid,
    pub item_id: Option<Uuid>,
    pub title: String,
    pub date: String,
    #[serde(default)]
    pub done: bool,
    pub done_at: Option<i64>,
    #[serde(default = "one")]
    pub amount: f64,
    pub created_at: i64,
}

fn one() -> f64 {
    1.0
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogRow {
    pub id: Uuid,
    pub item_id: Uuid,
    pub date: String,
    pub op: String,
    pub value: f64,
    pub created_at: i64,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Reflection {
    pub id: Uuid,
    pub period: String,
    pub period_key: String,
    #[serde(default)]
    pub text: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct DbPayload {
    pub areas: Vec<Area>,
    pub items: Vec<Item>,
    pub seeds: Vec<Seed>,
    pub actions: Vec<ActionRow>,
    pub logs: Vec<LogRow>,
    pub reflections: Vec<Reflection>,
}

/* ————— validation ————— */

const KINDS: &[&str] = &[
    "note", "quote", "idea", "dream", "goal", "habit", "project", "book",
    "milestone", "principle", "promise", "lesson", "memory",
];
const TRACKERS: &[&str] = &["none", "check", "counter", "percent", "money", "habit", "book"];
const STATUSES: &[&str] = &["active", "done", "someday", "archived"];
const HORIZONS: &[&str] = &["someday", "life", "year", "quarter", "month", "week", "today"];
const CADENCES: &[&str] = &["daily", "weekdays", "days", "weekly", "monthly"];
const PERIODS: &[&str] = &["week", "month", "quarter", "year"];

fn bad(msg: impl Into<String>) -> ApiError {
    ApiError::BadRequest(msg.into())
}

fn ck_len(field: &str, s: &str, max: usize) -> ApiResult<()> {
    if s.chars().count() > max {
        return Err(bad(format!("{field} is too long (max {max} characters)")));
    }
    Ok(())
}

fn ck_in(field: &str, v: &str, allowed: &[&str]) -> ApiResult<()> {
    if !allowed.contains(&v) {
        return Err(bad(format!("{field} has an unknown value")));
    }
    Ok(())
}

fn ck_opt_in(field: &str, v: &Option<String>, allowed: &[&str]) -> ApiResult<()> {
    match v {
        Some(s) => ck_in(field, s, allowed),
        None => Ok(()),
    }
}

fn ck_date(s: &str) -> ApiResult<()> {
    let bytes = s.as_bytes();
    let ok = bytes.len() == 10
        && bytes[4] == b'-'
        && bytes[7] == b'-'
        && s.chars().enumerate().all(|(i, c)| i == 4 || i == 7 || c.is_ascii_digit());
    if ok { Ok(()) } else { Err(bad("date must be YYYY-MM-DD")) }
}

fn ck_num(field: &str, v: f64) -> ApiResult<()> {
    if v.is_finite() && v.abs() < 1e15 { Ok(()) } else { Err(bad(format!("{field} is out of range"))) }
}

impl Area {
    fn validate(&self) -> ApiResult<()> {
        if self.name.trim().is_empty() {
            return Err(bad("area name is required"));
        }
        ck_len("name", &self.name, MAX_NAME)?;
        ck_len("emoji", &self.emoji, MAX_EMOJI)?;
        ck_len("color", &self.color, 32)
    }
}

impl Item {
    fn validate(&self) -> ApiResult<()> {
        if self.title.trim().is_empty() {
            return Err(bad("title is required"));
        }
        ck_len("title", &self.title, MAX_TITLE)?;
        ck_len("note", &self.note, MAX_NOTE)?;
        ck_in("kind", &self.kind, KINDS)?;
        ck_in("tracker", &self.tracker, TRACKERS)?;
        ck_in("status", &self.status, STATUSES)?;
        ck_opt_in("horizon", &self.horizon, HORIZONS)?;
        ck_opt_in("cadence", &self.cadence, CADENCES)?;
        if let Some(days) = &self.cadence_days {
            if days.len() > 7 || days.iter().any(|d| !(0..=6).contains(d)) {
                return Err(bad("cadenceDays must be weekday numbers 0–6"));
            }
        }
        if let Some(n) = self.cadence_count {
            if !(1..=100).contains(&n) {
                return Err(bad("cadenceCount is out of range"));
            }
        }
        if let Some(u) = &self.unit {
            ck_len("unit", u, MAX_UNIT)?;
        }
        if let Some(t) = self.target {
            ck_num("target", t)?;
        }
        ck_num("current", self.current)
    }
}

impl Seed {
    fn validate(&self) -> ApiResult<()> {
        if self.text.trim().is_empty() {
            return Err(bad("seed text is required"));
        }
        ck_len("text", &self.text, MAX_SEED_TEXT)
    }
}

impl ActionRow {
    fn validate(&self) -> ApiResult<()> {
        if self.title.trim().is_empty() {
            return Err(bad("action title is required"));
        }
        ck_len("title", &self.title, MAX_TITLE)?;
        ck_date(&self.date)?;
        ck_num("amount", self.amount)
    }
}

impl LogRow {
    fn validate(&self) -> ApiResult<()> {
        ck_in("op", &self.op, &["add", "set"])?;
        ck_date(&self.date)?;
        ck_num("value", self.value)
    }
}

impl Reflection {
    fn validate(&self) -> ApiResult<()> {
        ck_in("period", &self.period, PERIODS)?;
        ck_len("periodKey", &self.period_key, 16)?;
        ck_len("text", &self.text, MAX_REFLECTION_TEXT)
    }
}

/* ————— per-table SQL ————— */

async fn upsert_areas(conn: &mut PgConnection, user: Uuid, rows: &[Area]) -> ApiResult<()> {
    for r in rows {
        r.validate()?;
        sqlx::query(
            "insert into areas (id, user_id, name, emoji, color, position, created_at_ms)
             values ($1, $2, $3, $4, $5, $6, $7)
             on conflict (id) do update set
               name = excluded.name, emoji = excluded.emoji, color = excluded.color,
               position = excluded.position
             where areas.user_id = $2",
        )
        .bind(r.id).bind(user).bind(&r.name).bind(&r.emoji).bind(&r.color)
        .bind(r.position).bind(r.created_at)
        .execute(&mut *conn)
        .await?;
    }
    Ok(())
}

async fn upsert_items(conn: &mut PgConnection, user: Uuid, rows: &[Item]) -> ApiResult<()> {
    for r in rows {
        r.validate()?;
        sqlx::query(
            "insert into items (id, user_id, area_id, parent_id, kind, tracker, title, note,
               target, current, unit, horizon, status, cadence, cadence_days, cadence_count,
               pinned, position, created_at_ms, completed_at_ms)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
             on conflict (id) do update set
               area_id = excluded.area_id, parent_id = excluded.parent_id,
               kind = excluded.kind, tracker = excluded.tracker, title = excluded.title,
               note = excluded.note, target = excluded.target, current = excluded.current,
               unit = excluded.unit, horizon = excluded.horizon, status = excluded.status,
               cadence = excluded.cadence, cadence_days = excluded.cadence_days,
               cadence_count = excluded.cadence_count, pinned = excluded.pinned,
               position = excluded.position, completed_at_ms = excluded.completed_at_ms
             where items.user_id = $2",
        )
        .bind(r.id).bind(user).bind(r.area_id).bind(r.parent_id).bind(&r.kind)
        .bind(&r.tracker).bind(&r.title).bind(&r.note).bind(r.target).bind(r.current)
        .bind(&r.unit).bind(&r.horizon).bind(&r.status).bind(&r.cadence)
        .bind(&r.cadence_days).bind(r.cadence_count).bind(r.pinned)
        .bind(r.position).bind(r.created_at).bind(r.completed_at)
        .execute(&mut *conn)
        .await?;
    }
    Ok(())
}

async fn upsert_seeds(conn: &mut PgConnection, user: Uuid, rows: &[Seed]) -> ApiResult<()> {
    for r in rows {
        r.validate()?;
        sqlx::query(
            "insert into seeds (id, user_id, text, item_id, created_at_ms, archived_at_ms)
             values ($1, $2, $3, $4, $5, $6)
             on conflict (id) do update set
               text = excluded.text, item_id = excluded.item_id,
               archived_at_ms = excluded.archived_at_ms
             where seeds.user_id = $2",
        )
        .bind(r.id).bind(user).bind(&r.text).bind(r.item_id)
        .bind(r.created_at).bind(r.archived_at)
        .execute(&mut *conn)
        .await?;
    }
    Ok(())
}

async fn upsert_actions(conn: &mut PgConnection, user: Uuid, rows: &[ActionRow]) -> ApiResult<()> {
    for r in rows {
        r.validate()?;
        sqlx::query(
            "insert into actions (id, user_id, item_id, title, date, done, done_at_ms, amount, created_at_ms)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             on conflict (id) do update set
               item_id = excluded.item_id, title = excluded.title, date = excluded.date,
               done = excluded.done, done_at_ms = excluded.done_at_ms, amount = excluded.amount
             where actions.user_id = $2",
        )
        .bind(r.id).bind(user).bind(r.item_id).bind(&r.title).bind(&r.date)
        .bind(r.done).bind(r.done_at).bind(r.amount).bind(r.created_at)
        .execute(&mut *conn)
        .await?;
    }
    Ok(())
}

async fn upsert_logs(conn: &mut PgConnection, user: Uuid, rows: &[LogRow]) -> ApiResult<()> {
    for r in rows {
        r.validate()?;
        sqlx::query(
            "insert into logs (id, user_id, item_id, date, op, value, created_at_ms)
             values ($1,$2,$3,$4,$5,$6,$7)
             on conflict (id) do update set
               date = excluded.date, op = excluded.op, value = excluded.value
             where logs.user_id = $2",
        )
        .bind(r.id).bind(user).bind(r.item_id).bind(&r.date).bind(&r.op)
        .bind(r.value).bind(r.created_at)
        .execute(&mut *conn)
        .await?;
    }
    Ok(())
}

async fn upsert_reflections(conn: &mut PgConnection, user: Uuid, rows: &[Reflection]) -> ApiResult<()> {
    for r in rows {
        r.validate()?;
        sqlx::query(
            "insert into reflections (id, user_id, period, period_key, text, created_at_ms, updated_at_ms)
             values ($1,$2,$3,$4,$5,$6,$7)
             on conflict (id) do update set
               period = excluded.period, period_key = excluded.period_key,
               text = excluded.text, updated_at_ms = excluded.updated_at_ms
             where reflections.user_id = $2",
        )
        .bind(r.id).bind(user).bind(&r.period).bind(&r.period_key).bind(&r.text)
        .bind(r.created_at).bind(r.updated_at)
        .execute(&mut *conn)
        .await?;
    }
    Ok(())
}

/* ————— caps enforcement (checked inside the transaction, then commit) ————— */

async fn count(conn: &mut PgConnection, table: &str, user: Uuid) -> ApiResult<i64> {
    let sql = format!("select count(*) as n from {table} where user_id = $1");
    let row = sqlx::query(&sql).bind(user).fetch_one(conn).await?;
    Ok(row.get("n"))
}

async fn enforce_caps(
    conn: &mut PgConnection,
    user: &AuthUser,
    tables: &[&str],
) -> ApiResult<()> {
    let c = caps(user.premium());
    for &t in tables {
        let n = count(conn, t, user.id).await?;
        let cap = match t {
            "areas" => c.areas,
            "items" => c.items_total,
            "seeds" => c.seeds,
            "actions" => c.actions,
            "logs" => c.logs,
            "reflections" => c.reflections,
            _ => i64::MAX,
        };
        if n > cap {
            return Err(ApiError::Limit(limit_message(t, user.premium())));
        }
    }
    if tables.contains(&"items") {
        let row = sqlx::query(
            "select count(*) as n from items where user_id = $1 and status = 'active'",
        )
        .bind(user.id)
        .fetch_one(&mut *conn)
        .await?;
        let n: i64 = row.get("n");
        if n > c.active_items {
            return Err(ApiError::Limit(limit_message("active items", user.premium())));
        }
    }
    if tables.contains(&"areas") {
        let n = count(conn, "areas", user.id).await?;
        if n > c.areas {
            return Err(ApiError::Limit(limit_message("life areas", user.premium())));
        }
    }
    Ok(())
}

fn limit_message(what: &str, premium: bool) -> String {
    if premium {
        format!("You've reached the storage cap for {what}")
    } else {
        format!("The free plan limit for {what} is full — premium removes it")
    }
}

/* ————— handlers ————— */

pub async fn load(State(state): State<AppState>, user: AuthUser) -> ApiResult<Json<DbPayload>> {
    Ok(Json(load_all(&state, user.id).await?))
}

pub async fn load_all(state: &AppState, user: Uuid) -> ApiResult<DbPayload> {
    let areas = sqlx::query("select * from areas where user_id = $1 order by position")
        .bind(user).fetch_all(&state.pool).await?
        .iter().map(|r| Area {
            id: r.get("id"), name: r.get("name"), emoji: r.get("emoji"),
            color: r.get("color"), position: r.get("position"), created_at: r.get("created_at_ms"),
        }).collect();
    let items = sqlx::query("select * from items where user_id = $1 order by position")
        .bind(user).fetch_all(&state.pool).await?
        .iter().map(|r| Item {
            id: r.get("id"), area_id: r.get("area_id"), parent_id: r.get("parent_id"),
            kind: r.get("kind"), tracker: r.get("tracker"), title: r.get("title"),
            note: r.get("note"), target: r.get("target"), current: r.get("current"),
            unit: r.get("unit"), horizon: r.get("horizon"), status: r.get("status"),
            cadence: r.get("cadence"), cadence_days: r.get("cadence_days"),
            cadence_count: r.get("cadence_count"),
            pinned: r.get("pinned"), position: r.get("position"),
            created_at: r.get("created_at_ms"), completed_at: r.get("completed_at_ms"),
        }).collect();
    let seeds = sqlx::query("select * from seeds where user_id = $1 order by created_at_ms desc")
        .bind(user).fetch_all(&state.pool).await?
        .iter().map(|r| Seed {
            id: r.get("id"), text: r.get("text"), created_at: r.get("created_at_ms"),
            item_id: r.get("item_id"), archived_at: r.get("archived_at_ms"),
        }).collect();
    let actions = sqlx::query("select * from actions where user_id = $1")
        .bind(user).fetch_all(&state.pool).await?
        .iter().map(|r| ActionRow {
            id: r.get("id"), item_id: r.get("item_id"), title: r.get("title"),
            date: r.get("date"), done: r.get("done"), done_at: r.get("done_at_ms"),
            amount: r.get("amount"), created_at: r.get("created_at_ms"),
        }).collect();
    let logs = sqlx::query("select * from logs where user_id = $1")
        .bind(user).fetch_all(&state.pool).await?
        .iter().map(|r| LogRow {
            id: r.get("id"), item_id: r.get("item_id"), date: r.get("date"),
            op: r.get("op"), value: r.get("value"), created_at: r.get("created_at_ms"),
        }).collect();
    let reflections = sqlx::query("select * from reflections where user_id = $1")
        .bind(user).fetch_all(&state.pool).await?
        .iter().map(|r| Reflection {
            id: r.get("id"), period: r.get("period"), period_key: r.get("period_key"),
            text: r.get("text"), created_at: r.get("created_at_ms"), updated_at: r.get("updated_at_ms"),
        }).collect();

    Ok(DbPayload { areas, items, seeds, actions, logs, reflections })
}

#[derive(Deserialize)]
pub struct RowsBody {
    rows: Vec<Value>,
}

pub async fn upsert(
    State(state): State<AppState>,
    user: AuthUser,
    Path(table): Path<String>,
    Json(body): Json<RowsBody>,
) -> ApiResult<Json<Value>> {
    if body.rows.len() > MAX_BATCH_ROWS {
        return Err(ApiError::BadRequest(format!("Max {MAX_BATCH_ROWS} rows per request")));
    }
    let mut tx: Transaction<'_, Postgres> = state.pool.begin().await?;
    apply_upsert(&mut tx, &user, &table, body.rows).await?;
    enforce_caps(&mut tx, &user, &[table.as_str()]).await?;
    tx.commit().await?;
    Ok(Json(json!({ "ok": true })))
}

async fn apply_upsert(
    tx: &mut Transaction<'_, Postgres>,
    user: &AuthUser,
    table: &str,
    rows: Vec<Value>,
) -> ApiResult<()> {
    fn parse<T: serde::de::DeserializeOwned>(rows: Vec<Value>) -> ApiResult<Vec<T>> {
        rows.into_iter()
            .map(|v| serde_json::from_value(v).map_err(|e| bad(format!("invalid row: {e}"))))
            .collect()
    }
    match table {
        "areas" => upsert_areas(tx.as_mut(), user.id, &parse::<Area>(rows)?).await,
        "items" => upsert_items(tx.as_mut(), user.id, &parse::<Item>(rows)?).await,
        "seeds" => upsert_seeds(tx.as_mut(), user.id, &parse::<Seed>(rows)?).await,
        "actions" => upsert_actions(tx.as_mut(), user.id, &parse::<ActionRow>(rows)?).await,
        "logs" => upsert_logs(tx.as_mut(), user.id, &parse::<LogRow>(rows)?).await,
        "reflections" => upsert_reflections(tx.as_mut(), user.id, &parse::<Reflection>(rows)?).await,
        _ => Err(ApiError::NotFound),
    }
}

#[derive(Deserialize)]
pub struct IdsBody {
    ids: Vec<Uuid>,
}

pub async fn remove(
    State(state): State<AppState>,
    user: AuthUser,
    Path(table): Path<String>,
    Json(body): Json<IdsBody>,
) -> ApiResult<Json<Value>> {
    const TABLES: &[&str] = &["areas", "items", "seeds", "actions", "logs", "reflections"];
    if !TABLES.contains(&table.as_str()) {
        return Err(ApiError::NotFound);
    }
    if body.ids.len() > MAX_BATCH_ROWS {
        return Err(ApiError::BadRequest(format!("Max {MAX_BATCH_ROWS} ids per request")));
    }
    let sql = format!("delete from {table} where user_id = $1 and id = any($2)");
    sqlx::query(&sql)
        .bind(user.id)
        .bind(&body.ids)
        .execute(&state.pool)
        .await?;
    Ok(Json(json!({ "ok": true })))
}

/// One-shot migration of an on-device (localStorage) life into the cloud.
pub async fn import(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<DbPayload>,
) -> ApiResult<Json<Value>> {
    let total = body.areas.len() + body.items.len() + body.seeds.len()
        + body.actions.len() + body.logs.len() + body.reflections.len();
    if total > MAX_IMPORT_ROWS {
        return Err(ApiError::BadRequest(format!("Import too large (max {MAX_IMPORT_ROWS} rows)")));
    }
    let mut tx = state.pool.begin().await?;
    upsert_areas(tx.as_mut(), user.id, &body.areas).await?;
    upsert_items(tx.as_mut(), user.id, &body.items).await?;
    upsert_seeds(tx.as_mut(), user.id, &body.seeds).await?;
    upsert_actions(tx.as_mut(), user.id, &body.actions).await?;
    upsert_logs(tx.as_mut(), user.id, &body.logs).await?;
    upsert_reflections(tx.as_mut(), user.id, &body.reflections).await?;
    enforce_caps(
        &mut tx,
        &user,
        &["areas", "items", "seeds", "actions", "logs", "reflections"],
    )
    .await?;
    tx.commit().await?;
    Ok(Json(json!({ "ok": true, "imported": total })))
}

pub async fn export(State(state): State<AppState>, user: AuthUser) -> ApiResult<Json<Value>> {
    let data = load_all(&state, user.id).await?;
    Ok(Json(json!({
        "app": "LoopUpward",
        "exportedAt": chrono::Utc::now().to_rfc3339(),
        "account": { "email": user.email },
        "data": data,
    })))
}
