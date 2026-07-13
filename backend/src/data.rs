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
    /// which specific week/month/quarter/year this horizon points at, e.g.
    /// "2026-W28" / "2026-08" / "2026-Q3" / "2026" — unset for someday/today/none
    #[serde(default)]
    pub horizon_period: Option<String>,
    /// horizon "date" only: resurface every year on horizon_period's
    /// month/day (a birthday) instead of once (a one-off appointment)
    #[serde(default)]
    pub date_repeats_yearly: bool,
    /// rich (HTML) body for note-kind items — separate from `note` above,
    /// which stays a plain-text annotation available to every kind
    #[serde(default)]
    pub rich_body: Option<String>,
    pub status: String,
    pub cadence: Option<String>,
    #[serde(default)]
    pub cadence_days: Option<Vec<i32>>,
    #[serde(default)]
    pub cadence_count: Option<i32>,
    #[serde(default)]
    pub labels: Vec<Uuid>,
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
    #[serde(default = "inbox")]
    pub status: String,
}

fn inbox() -> String {
    "inbox".into()
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
    #[serde(default)]
    pub priority: i32,
    #[serde(default)]
    pub note: String,
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

/// One journal entry per user per day (Postgres table: daily_entries).
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JournalEntry {
    pub id: Uuid,
    pub date: String,
    #[serde(default)]
    pub rough_notes: String,
    #[serde(default)]
    pub end_of_day: String,
    pub mood: Option<i32>,
    pub energy: Option<i32>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Label {
    pub id: Uuid,
    pub name: String,
    #[serde(default)]
    pub color: String,
    #[serde(default)]
    pub emoji: String,
    #[serde(default)]
    pub position: i32,
    pub created_at: i64,
}

/// What a habit means to do on one specific day (Postgres table: habit_day_notes).
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HabitDayNote {
    pub id: Uuid,
    pub item_id: Uuid,
    pub date: String,
    #[serde(default)]
    pub text: String,
    pub created_at: i64,
    pub updated_at: i64,
}

/// Manual drag order for one day's Today list (Postgres table: day_order).
/// `order` holds entry ids in display order — real action ids, or virtual
/// "habit:<itemId>:<date>" / "today-item:<itemId>" ids — so it's plain text,
/// not uuid, and one row covers the whole day.
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DayOrder {
    pub id: Uuid,
    pub date: String,
    #[serde(default)]
    pub order: Vec<String>,
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
    pub journal: Vec<JournalEntry>,
    pub labels: Vec<Label>,
    pub habit_day_notes: Vec<HabitDayNote>,
    pub day_order: Vec<DayOrder>,
}

/* ————— validation ————— */

const KINDS: &[&str] = &[
    "note", "folder", "quote", "idea", "dream", "goal", "habit", "project", "book",
    "milestone", "principle", "promise", "lesson", "memory",
];
const TRACKERS: &[&str] = &["none", "check", "counter", "percent", "money", "habit", "book"];
const STATUSES: &[&str] = &["active", "done", "someday", "archived"];
const HORIZONS: &[&str] = &["someday", "life", "year", "quarter", "month", "week", "today", "date"];
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
        if let Some(p) = &self.horizon_period {
            ck_len("horizonPeriod", p, 16)?;
        }
        if let Some(b) = &self.rich_body {
            ck_len("richBody", b, MAX_RICH_BODY)?;
        }
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
        ck_len("text", &self.text, MAX_SEED_TEXT)?;
        ck_in("status", &self.status, &["inbox", "later", "archived"])
    }
}

impl JournalEntry {
    fn validate(&self, premium: bool) -> ApiResult<()> {
        ck_date(&self.date)?;
        let (rough_max, eod_max) = if premium {
            (MAX_JOURNAL_ROUGH_PREMIUM, MAX_JOURNAL_EOD_PREMIUM)
        } else {
            (MAX_JOURNAL_ROUGH_FREE, MAX_JOURNAL_EOD_FREE)
        };
        ck_len("daily notes", &self.rough_notes, rough_max)?;
        ck_len("reflection", &self.end_of_day, eod_max)?;
        for (field, v) in [("mood", self.mood), ("energy", self.energy)] {
            if let Some(n) = v {
                if !(1..=5).contains(&n) {
                    return Err(bad(format!("{field} must be 1–5")));
                }
            }
        }
        Ok(())
    }
}

impl Label {
    fn validate(&self) -> ApiResult<()> {
        if self.name.trim().is_empty() {
            return Err(bad("label name is required"));
        }
        ck_len("name", &self.name, MAX_NAME)?;
        ck_len("emoji", &self.emoji, MAX_EMOJI)?;
        ck_len("color", &self.color, 32)
    }
}

impl ActionRow {
    fn validate(&self) -> ApiResult<()> {
        if self.title.trim().is_empty() {
            return Err(bad("action title is required"));
        }
        ck_len("title", &self.title, MAX_TITLE)?;
        ck_len("note", &self.note, MAX_NOTE)?;
        ck_date(&self.date)?;
        if !(0..=2).contains(&self.priority) {
            return Err(bad("priority is out of range"));
        }
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

impl HabitDayNote {
    fn validate(&self) -> ApiResult<()> {
        ck_date(&self.date)?;
        ck_len("text", &self.text, MAX_HABIT_DAY_NOTE)
    }
}

impl DayOrder {
    fn validate(&self) -> ApiResult<()> {
        ck_date(&self.date)?;
        if self.order.len() > MAX_DAY_ORDER_ENTRIES {
            return Err(bad(format!("order is too long (max {MAX_DAY_ORDER_ENTRIES} entries)")));
        }
        for entry_id in &self.order {
            ck_len("order entry", entry_id, MAX_TITLE)?;
        }
        Ok(())
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
               target, current, unit, horizon, horizon_period, date_repeats_yearly, rich_body, status, cadence,
               cadence_days, cadence_count, labels, pinned, position, created_at_ms, completed_at_ms)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
             on conflict (id) do update set
               area_id = excluded.area_id, parent_id = excluded.parent_id,
               kind = excluded.kind, tracker = excluded.tracker, title = excluded.title,
               note = excluded.note, target = excluded.target, current = excluded.current,
               unit = excluded.unit, horizon = excluded.horizon,
               horizon_period = excluded.horizon_period, date_repeats_yearly = excluded.date_repeats_yearly,
               rich_body = excluded.rich_body,
               status = excluded.status,
               cadence = excluded.cadence, cadence_days = excluded.cadence_days,
               cadence_count = excluded.cadence_count, labels = excluded.labels,
               pinned = excluded.pinned,
               position = excluded.position, completed_at_ms = excluded.completed_at_ms
             where items.user_id = $2",
        )
        .bind(r.id).bind(user).bind(r.area_id).bind(r.parent_id).bind(&r.kind)
        .bind(&r.tracker).bind(&r.title).bind(&r.note).bind(r.target).bind(r.current)
        .bind(&r.unit).bind(&r.horizon).bind(&r.horizon_period).bind(r.date_repeats_yearly)
        .bind(&r.rich_body).bind(&r.status)
        .bind(&r.cadence)
        .bind(&r.cadence_days).bind(r.cadence_count).bind(&r.labels).bind(r.pinned)
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
            "insert into seeds (id, user_id, text, item_id, created_at_ms, archived_at_ms, status)
             values ($1, $2, $3, $4, $5, $6, $7)
             on conflict (id) do update set
               text = excluded.text, item_id = excluded.item_id,
               archived_at_ms = excluded.archived_at_ms, status = excluded.status
             where seeds.user_id = $2",
        )
        .bind(r.id).bind(user).bind(&r.text).bind(r.item_id)
        .bind(r.created_at).bind(r.archived_at).bind(&r.status)
        .execute(&mut *conn)
        .await?;
    }
    Ok(())
}

async fn upsert_actions(conn: &mut PgConnection, user: Uuid, rows: &[ActionRow]) -> ApiResult<()> {
    for r in rows {
        r.validate()?;
        sqlx::query(
            "insert into actions (id, user_id, item_id, title, date, done, done_at_ms, amount,
               priority, note, created_at_ms)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
             on conflict (id) do update set
               item_id = excluded.item_id, title = excluded.title, date = excluded.date,
               done = excluded.done, done_at_ms = excluded.done_at_ms, amount = excluded.amount,
               priority = excluded.priority, note = excluded.note
             where actions.user_id = $2",
        )
        .bind(r.id).bind(user).bind(r.item_id).bind(&r.title).bind(&r.date)
        .bind(r.done).bind(r.done_at).bind(r.amount).bind(r.priority).bind(&r.note)
        .bind(r.created_at)
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

async fn upsert_journal(
    conn: &mut PgConnection,
    user: Uuid,
    rows: &[JournalEntry],
    premium: bool,
) -> ApiResult<()> {
    for r in rows {
        r.validate(premium)?;
        // one entry per day: a second device writing the same date merges into it
        sqlx::query(
            "insert into daily_entries (id, user_id, date, rough_notes, end_of_day, mood, energy,
               created_at_ms, updated_at_ms)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             on conflict (user_id, date) do update set
               rough_notes = excluded.rough_notes, end_of_day = excluded.end_of_day,
               mood = excluded.mood, energy = excluded.energy,
               updated_at_ms = excluded.updated_at_ms",
        )
        .bind(r.id).bind(user).bind(&r.date).bind(&r.rough_notes).bind(&r.end_of_day)
        .bind(r.mood).bind(r.energy).bind(r.created_at).bind(r.updated_at)
        .execute(&mut *conn)
        .await?;
    }
    Ok(())
}

async fn upsert_labels(conn: &mut PgConnection, user: Uuid, rows: &[Label]) -> ApiResult<()> {
    for r in rows {
        r.validate()?;
        sqlx::query(
            "insert into labels (id, user_id, name, color, emoji, position, created_at_ms)
             values ($1,$2,$3,$4,$5,$6,$7)
             on conflict (id) do update set
               name = excluded.name, color = excluded.color, emoji = excluded.emoji,
               position = excluded.position
             where labels.user_id = $2",
        )
        .bind(r.id).bind(user).bind(&r.name).bind(&r.color).bind(&r.emoji)
        .bind(r.position).bind(r.created_at)
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

async fn upsert_habit_day_notes(
    conn: &mut PgConnection,
    user: Uuid,
    rows: &[HabitDayNote],
) -> ApiResult<()> {
    for r in rows {
        r.validate()?;
        // one row per habit per day: a second device writing the same
        // item + date merges into it
        sqlx::query(
            "insert into habit_day_notes (id, user_id, item_id, date, text, created_at_ms, updated_at_ms)
             values ($1,$2,$3,$4,$5,$6,$7)
             on conflict (user_id, item_id, date) do update set
               text = excluded.text, updated_at_ms = excluded.updated_at_ms",
        )
        .bind(r.id).bind(user).bind(r.item_id).bind(&r.date).bind(&r.text)
        .bind(r.created_at).bind(r.updated_at)
        .execute(&mut *conn)
        .await?;
    }
    Ok(())
}

async fn upsert_day_order(conn: &mut PgConnection, user: Uuid, rows: &[DayOrder]) -> ApiResult<()> {
    for r in rows {
        r.validate()?;
        // one row per day: a second device dragging the same day merges into it
        sqlx::query(
            "insert into day_order (id, user_id, date, entry_order, updated_at_ms)
             values ($1,$2,$3,$4,$5)
             on conflict (user_id, date) do update set
               entry_order = excluded.entry_order, updated_at_ms = excluded.updated_at_ms",
        )
        .bind(r.id).bind(user).bind(&r.date).bind(&r.order).bind(r.updated_at)
        .execute(&mut *conn)
        .await?;
    }
    Ok(())
}

/* ————— caps enforcement (checked inside the transaction, then commit) ————— */

/// Client table name → Postgres table name.
fn sql_table(table: &str) -> &str {
    match table {
        "journal" => "daily_entries",
        "habitDayNotes" => "habit_day_notes",
        "dayOrder" => "day_order",
        other => other,
    }
}

async fn count(conn: &mut PgConnection, table: &str, user: Uuid) -> ApiResult<i64> {
    let sql = format!("select count(*) as n from {} where user_id = $1", sql_table(table));
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
            "journal" => c.journal,
            "labels" => c.labels,
            "habitDayNotes" => c.habit_day_notes,
            "dayOrder" => c.day_order,
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
            unit: r.get("unit"), horizon: r.get("horizon"),
            horizon_period: r.get("horizon_period"), date_repeats_yearly: r.get("date_repeats_yearly"),
            rich_body: r.get("rich_body"),
            status: r.get("status"),
            cadence: r.get("cadence"), cadence_days: r.get("cadence_days"),
            cadence_count: r.get("cadence_count"), labels: r.get("labels"),
            pinned: r.get("pinned"), position: r.get("position"),
            created_at: r.get("created_at_ms"), completed_at: r.get("completed_at_ms"),
        }).collect();
    let seeds = sqlx::query("select * from seeds where user_id = $1 order by created_at_ms desc")
        .bind(user).fetch_all(&state.pool).await?
        .iter().map(|r| Seed {
            id: r.get("id"), text: r.get("text"), created_at: r.get("created_at_ms"),
            item_id: r.get("item_id"), archived_at: r.get("archived_at_ms"),
            status: r.get("status"),
        }).collect();
    let actions = sqlx::query("select * from actions where user_id = $1")
        .bind(user).fetch_all(&state.pool).await?
        .iter().map(|r| ActionRow {
            id: r.get("id"), item_id: r.get("item_id"), title: r.get("title"),
            date: r.get("date"), done: r.get("done"), done_at: r.get("done_at_ms"),
            amount: r.get("amount"), priority: r.get("priority"), note: r.get("note"),
            created_at: r.get("created_at_ms"),
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
    let journal = sqlx::query("select * from daily_entries where user_id = $1 order by date")
        .bind(user).fetch_all(&state.pool).await?
        .iter().map(|r| JournalEntry {
            id: r.get("id"), date: r.get("date"), rough_notes: r.get("rough_notes"),
            end_of_day: r.get("end_of_day"), mood: r.get("mood"), energy: r.get("energy"),
            created_at: r.get("created_at_ms"), updated_at: r.get("updated_at_ms"),
        }).collect();
    let labels = sqlx::query("select * from labels where user_id = $1 order by position")
        .bind(user).fetch_all(&state.pool).await?
        .iter().map(|r| Label {
            id: r.get("id"), name: r.get("name"), color: r.get("color"), emoji: r.get("emoji"),
            position: r.get("position"), created_at: r.get("created_at_ms"),
        }).collect();
    let habit_day_notes = sqlx::query("select * from habit_day_notes where user_id = $1")
        .bind(user).fetch_all(&state.pool).await?
        .iter().map(|r| HabitDayNote {
            id: r.get("id"), item_id: r.get("item_id"), date: r.get("date"),
            text: r.get("text"), created_at: r.get("created_at_ms"), updated_at: r.get("updated_at_ms"),
        }).collect();
    let day_order = sqlx::query("select * from day_order where user_id = $1")
        .bind(user).fetch_all(&state.pool).await?
        .iter().map(|r| DayOrder {
            id: r.get("id"), date: r.get("date"), order: r.get("entry_order"),
            updated_at: r.get("updated_at_ms"),
        }).collect();

    Ok(DbPayload { areas, items, seeds, actions, logs, reflections, journal, labels, habit_day_notes, day_order })
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
        "journal" => {
            upsert_journal(tx.as_mut(), user.id, &parse::<JournalEntry>(rows)?, user.premium()).await
        }
        "labels" => upsert_labels(tx.as_mut(), user.id, &parse::<Label>(rows)?).await,
        "habitDayNotes" => {
            upsert_habit_day_notes(tx.as_mut(), user.id, &parse::<HabitDayNote>(rows)?).await
        }
        "dayOrder" => upsert_day_order(tx.as_mut(), user.id, &parse::<DayOrder>(rows)?).await,
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
    const TABLES: &[&str] = &[
        "areas", "items", "seeds", "actions", "logs", "reflections", "journal", "labels",
        "habitDayNotes", "dayOrder",
    ];
    if !TABLES.contains(&table.as_str()) {
        return Err(ApiError::NotFound);
    }
    if body.ids.len() > MAX_BATCH_ROWS {
        return Err(ApiError::BadRequest(format!("Max {MAX_BATCH_ROWS} ids per request")));
    }
    let sql = format!(
        "delete from {} where user_id = $1 and id = any($2)",
        sql_table(&table)
    );
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
        + body.actions.len() + body.logs.len() + body.reflections.len()
        + body.journal.len() + body.labels.len() + body.habit_day_notes.len()
        + body.day_order.len();
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
    upsert_journal(tx.as_mut(), user.id, &body.journal, user.premium()).await?;
    upsert_labels(tx.as_mut(), user.id, &body.labels).await?;
    upsert_habit_day_notes(tx.as_mut(), user.id, &body.habit_day_notes).await?;
    upsert_day_order(tx.as_mut(), user.id, &body.day_order).await?;
    enforce_caps(
        &mut tx,
        &user,
        &[
            "areas", "items", "seeds", "actions", "logs", "reflections", "journal", "labels",
            "habitDayNotes", "dayOrder",
        ],
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
