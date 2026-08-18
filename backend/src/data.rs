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
    /// What this area of life actually is, in the user's own words — so an
    /// exported area score means more than "the lowest completion rate".
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub why_it_matters: String,
    /// Share of attention this area is meant to get, 0..1. Optional: an
    /// unweighted life is a valid life.
    #[serde(default)]
    pub target_share: Option<f64>,
}

/// One step of a routine's script: "face wash — 5 minutes".
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoutineStep {
    pub id: String,
    pub title: String,
    pub minutes: Option<f64>,
    /// The life node this step stands for, when it is not merely a line of
    /// text: "Duolingo" inside the morning routine and the Duolingo habit on
    /// the day's list are one act, so ticking either has to tick both.
    #[serde(default)]
    pub item_id: Option<String>,
    /// A step the routine can finish without. Skipping it still counts the
    /// day as done, so a script can hold the nice-to-haves without the whole
    /// routine failing on the morning you leave one out.
    #[serde(default)]
    pub optional: bool,
}

/// One line of a list: "milk — 2 l". Ticked in place, not per day.
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListEntry {
    pub id: String,
    pub text: String,
    pub amount: Option<f64>,
    pub unit: Option<String>,
    #[serde(default)]
    pub done: bool,
    /// Epoch ms this entry became the thing being tried, so a list of things
    /// to try ("learn pottery", "visit Hampi") can hold a middle state
    /// between untouched and done. None means waiting, or already finished.
    /// A timestamp rather than a flag: how long something has been in
    /// progress is the useful part.
    #[serde(default)]
    pub picked_at: Option<i64>,
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
    /// routine kind only: the ordered script of the routine, each step
    /// optionally timed in minutes — stored as jsonb, travels as JSON
    #[serde(default)]
    pub steps: Option<sqlx::types::Json<Vec<RoutineStep>>>,
    /// list kind only: the checkable contents — stored as jsonb
    #[serde(default)]
    pub entries: Option<sqlx::types::Json<Vec<ListEntry>>>,
    /// routine kind only: visible hours on the Today list, "HH:MM" local.
    /// End earlier than start wraps past midnight. Both null = all day.
    #[serde(default)]
    pub window_start: Option<String>,
    #[serde(default)]
    pub window_end: Option<String>,
    /// pulled onto Today from a week/month/quarter/year list — a
    /// non-destructive overlay that leaves `horizon` untouched
    #[serde(default)]
    pub pulled_today: bool,
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
    /// set when moved to Trash; retention/purge is enforced client-side
    #[serde(default)]
    pub deleted_at: Option<i64>,
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
    /// How this value got here: a manual tick, a focus-timer completion, a
    /// routine auto-log, a cascade from a child. Rows written before this
    /// existed carry "unknown" rather than claiming to be manual.
    #[serde(default = "unknown_source")]
    pub source: String,
    /// The specific control that did it, free text ("today_checkbox",
    /// "step_meter"), for when the source alone is too coarse.
    #[serde(default)]
    pub via: String,
}

fn unknown_source() -> String {
    "unknown".into()
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
    /// overall / energy / progress, 1-5, as {"overall":4,...}
    #[serde(default)]
    pub ratings: Option<sqlx::types::JsonValue>,
    /// per areaId: {"rating":4,"note":"..."}
    #[serde(default)]
    pub area_notes: Option<sqlx::types::JsonValue>,
    #[serde(default)]
    pub wins: Vec<String>,
    #[serde(default)]
    pub lessons: Vec<String>,
    #[serde(default)]
    pub blockers: Vec<String>,
    /// Commitments for the NEXT period, each optionally naming an item and a
    /// number to reach. The following period scores these by counting, which
    /// is the only reason a reflection can ever be measured against anything.
    #[serde(default)]
    pub intentions: Option<sqlx::types::JsonValue>,
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
    /// The quiet, optional half of a day. All nullable: the daily flow must
    /// not get longer for anyone who does not want these.
    #[serde(default)]
    pub sleep_hours: Option<f64>,
    #[serde(default)]
    pub sleep_quality: Option<i32>,
    #[serde(default)]
    pub stress: Option<i32>,
    #[serde(default)]
    pub focus: Option<i32>,
    #[serde(default)]
    pub gratitude: String,
    /// "one thing that would make today good"
    #[serde(default)]
    pub intention: String,
    #[serde(default)]
    pub tags: Vec<String>,
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
    /// routines only: ids of the steps done on this day
    #[serde(default)]
    pub done_steps: Option<Vec<String>>,
    /// stepId -> epoch ms, so the order and time of day a script was actually
    /// walked survives. done_steps stays exactly as it was beside it.
    #[serde(default)]
    pub done_steps_at: Option<sqlx::types::JsonValue>,
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

/// One timer attempt, written when it ENDS for any reason — completed, closed,
/// skipped or left running past its deadline. Abandonment data is the half the
/// app used to throw away, so it is recorded exactly like success.
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FocusSession {
    pub id: Uuid,
    pub item_id: Option<Uuid>,
    /// the Today row it started from — a real action id, or a virtual
    /// "habit:<itemId>:<date>" id, so it is text rather than uuid
    #[serde(default)]
    pub entry_id: String,
    pub day: String,
    /// focus | routine_step | routine_run | day_run | rest
    pub kind: String,
    pub step_id: Option<String>,
    pub started_at: i64,
    pub ended_at: i64,
    /// what was asked for; null means untimed (counted up instead)
    pub planned_seconds: Option<i32>,
    #[serde(default)]
    pub actual_seconds: i32,
    #[serde(default)]
    pub paused_seconds: i32,
    #[serde(default)]
    pub pause_count: i32,
    pub outcome: String,
    #[serde(default)]
    pub tz: String,
    #[serde(default)]
    pub utc_offset_minutes: i32,
    pub created_at: i64,
}

/// One behavioural fact. Append-only: events are never updated or deleted,
/// because the record of what happened includes what did not work out.
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventRow {
    pub id: Uuid,
    pub at: i64,
    pub day: String,
    #[serde(default)]
    pub tz: String,
    #[serde(default)]
    pub utc_offset_minutes: i32,
    #[serde(rename = "type")]
    pub kind: String,
    pub item_id: Option<Uuid>,
    #[serde(default)]
    pub payload: Option<sqlx::types::JsonValue>,
    pub created_at: i64,
}

/// Server-owned preferences and context (Postgres table: user_settings).
/// Everything is optional: a user who fills in nothing sees today's app.
#[derive(Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct UserSettings {
    pub theme: Option<String>,
    pub font: Option<String>,
    pub simple: Option<bool>,
    pub rest_seconds: Option<i32>,
    pub timezone: Option<String>,
    pub week_start: Option<i32>,
    pub day_rollover_hour: Option<i32>,
    pub wake_time: Option<String>,
    pub sleep_time: Option<String>,
    pub season_of_life: Option<String>,
    pub occupation: Option<String>,
    pub becoming: Option<String>,
    pub constraints: Option<String>,
    pub focus_minutes_target: Option<i32>,
    pub habit_days_target: Option<i32>,
    pub deep_work_days_target: Option<i32>,
    pub created_at: Option<i64>,
    pub updated_at: Option<i64>,
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
    pub focus_sessions: Vec<FocusSession>,
    pub events: Vec<EventRow>,
}

/* ————— validation ————— */

const KINDS: &[&str] = &[
    "note", "folder", "quote", "idea", "dream", "goal", "habit", "routine", "list", "project", "book",
    "milestone", "principle", "promise", "lesson", "memory",
];
const MAX_ROUTINE_STEPS: usize = 50;
// shopping lists outgrow routine scripts
const MAX_LIST_ENTRIES: usize = 200;
const TRACKERS: &[&str] = &["none", "check", "counter", "percent", "money", "habit", "book"];
const STATUSES: &[&str] = &["active", "done", "someday", "archived"];
const HORIZONS: &[&str] = &["someday", "life", "year", "quarter", "month", "week", "today", "date"];
const CADENCES: &[&str] = &["daily", "weekdays", "days", "weekly", "monthly"];
const PERIODS: &[&str] = &["week", "month", "quarter", "year"];
const LOG_SOURCES: &[&str] = &[
    "manual", "today_check", "item_page", "focus_timer", "routine_run", "parent_cascade",
    "import", "unknown",
];
const FOCUS_KINDS: &[&str] = &["focus", "routine_step", "routine_run", "day_run", "rest"];
const FOCUS_OUTCOMES: &[&str] = &["completed", "abandoned", "skipped", "interrupted", "expired"];

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

/// "HH:MM" (or "H:MM") on a 24-hour clock.
fn is_hm(s: &str) -> bool {
    let Some((h, m)) = s.split_once(':') else { return false };
    let hours_ok = matches!(h.len(), 1 | 2) && h.chars().all(|c| c.is_ascii_digit());
    let mins_ok = m.len() == 2 && m.chars().all(|c| c.is_ascii_digit());
    hours_ok && mins_ok && h.parse::<u32>().is_ok_and(|v| v <= 23) && m.parse::<u32>().is_ok_and(|v| v <= 59)
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
        ck_len("color", &self.color, 32)?;
        ck_len("description", &self.description, MAX_AREA_TEXT)?;
        ck_len("why it matters", &self.why_it_matters, MAX_AREA_TEXT)?;
        if let Some(share) = self.target_share {
            if !share.is_finite() || !(0.0..=1.0).contains(&share) {
                return Err(bad("target share must be between 0 and 1"));
            }
        }
        Ok(())
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
        if let Some(steps) = &self.steps {
            if steps.0.len() > MAX_ROUTINE_STEPS {
                return Err(bad("too many routine steps"));
            }
            for s in &steps.0 {
                if s.title.trim().is_empty() {
                    return Err(bad("every routine step needs a title"));
                }
                ck_len("step title", &s.title, MAX_TITLE)?;
                ck_len("step id", &s.id, 64)?;
                if let Some(m) = s.minutes {
                    if !m.is_finite() || !(0.0..=1440.0).contains(&m) {
                        return Err(bad("step minutes must be between 0 and 1440"));
                    }
                }
                // a link is an item id, and a malformed one would only ever
                // dangle: refuse it here rather than store a step pointing nowhere
                if let Some(id) = &s.item_id {
                    if Uuid::parse_str(id).is_err() {
                        return Err(bad("step link must be an item id"));
                    }
                }
            }
        }
        for (field, v) in [("windowStart", &self.window_start), ("windowEnd", &self.window_end)] {
            if let Some(s) = v {
                if !is_hm(s) {
                    return Err(bad(format!("{field} must be HH:MM")));
                }
            }
        }
        if let Some(entries) = &self.entries {
            if entries.0.len() > MAX_LIST_ENTRIES {
                return Err(bad("too many list entries"));
            }
            for e in &entries.0 {
                if e.text.trim().is_empty() {
                    return Err(bad("every list entry needs text"));
                }
                ck_len("entry text", &e.text, MAX_TITLE)?;
                ck_len("entry id", &e.id, 64)?;
                if let Some(u) = &e.unit {
                    ck_len("entry unit", u, MAX_UNIT)?;
                }
                if let Some(a) = e.amount {
                    ck_num("entry amount", a)?;
                }
            }
        }
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
        for (field, v) in [
            ("mood", self.mood),
            ("energy", self.energy),
            ("sleep quality", self.sleep_quality),
            ("stress", self.stress),
            ("focus", self.focus),
        ] {
            if let Some(n) = v {
                if !(1..=5).contains(&n) {
                    return Err(bad(format!("{field} must be 1–5")));
                }
            }
        }
        if let Some(h) = self.sleep_hours {
            if !h.is_finite() || !(0.0..=24.0).contains(&h) {
                return Err(bad("sleep hours must be between 0 and 24"));
            }
        }
        ck_len("gratitude", &self.gratitude, MAX_DAILY_EXTRA)?;
        ck_len("intention", &self.intention, MAX_DAILY_EXTRA)?;
        if self.tags.len() > MAX_DAY_TAGS {
            return Err(bad(format!("a day can carry at most {MAX_DAY_TAGS} tags")));
        }
        for t in &self.tags {
            ck_len("tag", t, MAX_NAME)?;
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
        ck_in("source", &self.source, LOG_SOURCES)?;
        ck_len("via", &self.via, 64)?;
        ck_date(&self.date)?;
        ck_num("value", self.value)
    }
}

impl Reflection {
    fn validate(&self) -> ApiResult<()> {
        ck_in("period", &self.period, PERIODS)?;
        ck_len("periodKey", &self.period_key, 16)?;
        ck_len("text", &self.text, MAX_REFLECTION_TEXT)?;
        for (field, list) in [("wins", &self.wins), ("lessons", &self.lessons), ("blockers", &self.blockers)] {
            if list.len() > MAX_REFLECTION_LINES {
                return Err(bad(format!("too many {field} (max {MAX_REFLECTION_LINES})")));
            }
            for line in list {
                ck_len(field, line, MAX_REFLECTION_LINE)?;
            }
        }
        for (field, v) in [("ratings", &self.ratings), ("areaNotes", &self.area_notes), ("intentions", &self.intentions)] {
            if let Some(json) = v {
                ck_json_size(field, json, MAX_REFLECTION_TEXT)?;
            }
        }
        Ok(())
    }
}

impl FocusSession {
    fn validate(&self) -> ApiResult<()> {
        ck_date(&self.day)?;
        ck_in("kind", &self.kind, FOCUS_KINDS)?;
        ck_in("outcome", &self.outcome, FOCUS_OUTCOMES)?;
        ck_len("entryId", &self.entry_id, MAX_TITLE)?;
        if let Some(id) = &self.step_id {
            ck_len("stepId", id, 64)?;
        }
        ck_len("tz", &self.tz, 64)?;
        if !(-1080..=1080).contains(&self.utc_offset_minutes) {
            return Err(bad("utcOffsetMinutes is out of range"));
        }
        // a day of wall clock is the generous ceiling; anything past it is a
        // stuck tab, not a session, and storing it would poison every average
        for (field, v) in [
            ("plannedSeconds", self.planned_seconds.unwrap_or(0)),
            ("actualSeconds", self.actual_seconds),
            ("pausedSeconds", self.paused_seconds),
        ] {
            if !(0..=MAX_SESSION_SECONDS).contains(&v) {
                return Err(bad(format!("{field} is out of range")));
            }
        }
        if !(0..=10_000).contains(&self.pause_count) {
            return Err(bad("pauseCount is out of range"));
        }
        Ok(())
    }
}

impl EventRow {
    fn validate(&self) -> ApiResult<()> {
        ck_date(&self.day)?;
        ck_len("type", &self.kind, 64)?;
        if self.kind.trim().is_empty() {
            return Err(bad("event type is required"));
        }
        ck_len("tz", &self.tz, 64)?;
        if !(-1080..=1080).contains(&self.utc_offset_minutes) {
            return Err(bad("utcOffsetMinutes is out of range"));
        }
        if let Some(payload) = &self.payload {
            ck_json_size("payload", payload, MAX_EVENT_PAYLOAD)?;
        }
        Ok(())
    }
}

/// A jsonb blob still has to fit in a human-sized wall — validating the shape
/// of every payload would defeat the point of a free-form column, but its
/// serialized size is a fair thing to hold a line on.
fn ck_json_size(field: &str, v: &sqlx::types::JsonValue, max: usize) -> ApiResult<()> {
    if v.to_string().len() > max {
        return Err(bad(format!("{field} is too large (max {max} bytes)")));
    }
    Ok(())
}

impl HabitDayNote {
    fn validate(&self) -> ApiResult<()> {
        ck_date(&self.date)?;
        ck_len("text", &self.text, MAX_HABIT_DAY_NOTE)?;
        if let Some(steps) = &self.done_steps {
            if steps.len() > MAX_ROUTINE_STEPS {
                return Err(bad("too many done steps"));
            }
            for id in steps {
                ck_len("done step id", id, 64)?;
            }
        }
        if let Some(at) = &self.done_steps_at {
            ck_json_size("doneStepsAt", at, 8_000)?;
        }
        Ok(())
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
            "insert into areas (id, user_id, name, emoji, color, position, created_at_ms,
               description, why_it_matters, target_share)
             values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             on conflict (id) do update set
               name = excluded.name, emoji = excluded.emoji, color = excluded.color,
               position = excluded.position, description = excluded.description,
               why_it_matters = excluded.why_it_matters, target_share = excluded.target_share
             where areas.user_id = $2",
        )
        .bind(r.id).bind(user).bind(&r.name).bind(&r.emoji).bind(&r.color)
        .bind(r.position).bind(r.created_at)
        .bind(&r.description).bind(&r.why_it_matters).bind(r.target_share)
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
               steps, entries, window_start, window_end, pulled_today, cadence_days, cadence_count, labels, pinned, position, created_at_ms, completed_at_ms, deleted_at_ms)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30)
             on conflict (id) do update set
               area_id = excluded.area_id, parent_id = excluded.parent_id,
               kind = excluded.kind, tracker = excluded.tracker, title = excluded.title,
               note = excluded.note, target = excluded.target, current = excluded.current,
               unit = excluded.unit, horizon = excluded.horizon,
               horizon_period = excluded.horizon_period, date_repeats_yearly = excluded.date_repeats_yearly,
               rich_body = excluded.rich_body,
               status = excluded.status,
               cadence = excluded.cadence, steps = excluded.steps, entries = excluded.entries,
               window_start = excluded.window_start, window_end = excluded.window_end,
               pulled_today = excluded.pulled_today,
               cadence_days = excluded.cadence_days,
               cadence_count = excluded.cadence_count, labels = excluded.labels,
               pinned = excluded.pinned,
               position = excluded.position, completed_at_ms = excluded.completed_at_ms,
               deleted_at_ms = excluded.deleted_at_ms
             where items.user_id = $2",
        )
        .bind(r.id).bind(user).bind(r.area_id).bind(r.parent_id).bind(&r.kind)
        .bind(&r.tracker).bind(&r.title).bind(&r.note).bind(r.target).bind(r.current)
        .bind(&r.unit).bind(&r.horizon).bind(&r.horizon_period).bind(r.date_repeats_yearly)
        .bind(&r.rich_body).bind(&r.status)
        .bind(&r.cadence).bind(&r.steps).bind(&r.entries).bind(&r.window_start).bind(&r.window_end)
        .bind(r.pulled_today).bind(&r.cadence_days).bind(r.cadence_count).bind(&r.labels).bind(r.pinned)
        .bind(r.position).bind(r.created_at).bind(r.completed_at).bind(r.deleted_at)
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
            "insert into logs (id, user_id, item_id, date, op, value, created_at_ms, source, via)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             on conflict (id) do update set
               date = excluded.date, op = excluded.op, value = excluded.value,
               source = excluded.source, via = excluded.via
             where logs.user_id = $2",
        )
        .bind(r.id).bind(user).bind(r.item_id).bind(&r.date).bind(&r.op)
        .bind(r.value).bind(r.created_at).bind(&r.source).bind(&r.via)
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
               created_at_ms, updated_at_ms, sleep_hours, sleep_quality, stress, focus,
               gratitude, intention, tags)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
             on conflict (user_id, date) do update set
               rough_notes = excluded.rough_notes, end_of_day = excluded.end_of_day,
               mood = excluded.mood, energy = excluded.energy,
               sleep_hours = excluded.sleep_hours, sleep_quality = excluded.sleep_quality,
               stress = excluded.stress, focus = excluded.focus,
               gratitude = excluded.gratitude, intention = excluded.intention,
               tags = excluded.tags,
               updated_at_ms = excluded.updated_at_ms",
        )
        .bind(r.id).bind(user).bind(&r.date).bind(&r.rough_notes).bind(&r.end_of_day)
        .bind(r.mood).bind(r.energy).bind(r.created_at).bind(r.updated_at)
        .bind(r.sleep_hours).bind(r.sleep_quality).bind(r.stress).bind(r.focus)
        .bind(&r.gratitude).bind(&r.intention).bind(&r.tags)
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
            "insert into reflections (id, user_id, period, period_key, text, created_at_ms, updated_at_ms,
               ratings, area_notes, wins, lessons, blockers, intentions)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
             on conflict (id) do update set
               period = excluded.period, period_key = excluded.period_key,
               text = excluded.text, updated_at_ms = excluded.updated_at_ms,
               ratings = excluded.ratings, area_notes = excluded.area_notes,
               wins = excluded.wins, lessons = excluded.lessons,
               blockers = excluded.blockers, intentions = excluded.intentions
             where reflections.user_id = $2",
        )
        .bind(r.id).bind(user).bind(&r.period).bind(&r.period_key).bind(&r.text)
        .bind(r.created_at).bind(r.updated_at)
        .bind(&r.ratings).bind(&r.area_notes).bind(&r.wins).bind(&r.lessons)
        .bind(&r.blockers).bind(&r.intentions)
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
            "insert into habit_day_notes (id, user_id, item_id, date, text, done_steps,
               done_steps_at, created_at_ms, updated_at_ms)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             on conflict (user_id, item_id, date) do update set
               text = excluded.text, done_steps = excluded.done_steps,
               done_steps_at = excluded.done_steps_at,
               updated_at_ms = excluded.updated_at_ms",
        )
        .bind(r.id).bind(user).bind(r.item_id).bind(&r.date).bind(&r.text)
        .bind(&r.done_steps).bind(&r.done_steps_at).bind(r.created_at).bind(r.updated_at)
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

/// Append-only: a session that already exists is never rewritten. A retry
/// after a flaky flush must not be able to change what happened.
async fn upsert_focus_sessions(conn: &mut PgConnection, user: Uuid, rows: &[FocusSession]) -> ApiResult<()> {
    for r in rows {
        r.validate()?;
        sqlx::query(
            "insert into focus_sessions (id, user_id, item_id, entry_id, day, kind, step_id,
               started_at_ms, ended_at_ms, planned_seconds, actual_seconds, paused_seconds,
               pause_count, outcome, tz, utc_offset_minutes, created_at_ms)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
             on conflict (id) do nothing",
        )
        .bind(r.id).bind(user).bind(r.item_id).bind(&r.entry_id).bind(&r.day).bind(&r.kind)
        .bind(&r.step_id).bind(r.started_at).bind(r.ended_at).bind(r.planned_seconds)
        .bind(r.actual_seconds).bind(r.paused_seconds).bind(r.pause_count).bind(&r.outcome)
        .bind(&r.tz).bind(r.utc_offset_minutes).bind(r.created_at)
        .execute(&mut *conn)
        .await?;
    }
    Ok(())
}

/// Append-only, same reasoning: an event is a record of a moment, and a
/// re-delivered batch must be a no-op rather than a rewrite of history.
async fn upsert_events(conn: &mut PgConnection, user: Uuid, rows: &[EventRow]) -> ApiResult<()> {
    for r in rows {
        r.validate()?;
        sqlx::query(
            "insert into events (id, user_id, at_ms, day, tz, utc_offset_minutes, type, item_id,
               payload, created_at_ms)
             values ($1,$2,$3,$4,$5,$6,$7,$8,coalesce($9, '{}'::jsonb),$10)
             on conflict (id) do nothing",
        )
        .bind(r.id).bind(user).bind(r.at).bind(&r.day).bind(&r.tz).bind(r.utc_offset_minutes)
        .bind(&r.kind).bind(r.item_id).bind(&r.payload).bind(r.created_at)
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
        "focusSessions" => "focus_sessions",
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
            "focusSessions" => c.focus_sessions,
            "events" => c.events,
            _ => i64::MAX,
        };
        if n > cap {
            return Err(ApiError::Limit(limit_message(t, user.premium())));
        }
    }
    if tables.contains(&"items") {
        let row = sqlx::query(
            "select count(*) as n from items where user_id = $1 and status = 'active' and deleted_at_ms is null",
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
            description: r.get("description"), why_it_matters: r.get("why_it_matters"),
            target_share: r.get("target_share"),
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
            cadence: r.get("cadence"), steps: r.get("steps"), entries: r.get("entries"),
            window_start: r.get("window_start"), window_end: r.get("window_end"),
            pulled_today: r.get("pulled_today"),
            cadence_days: r.get("cadence_days"),
            cadence_count: r.get("cadence_count"), labels: r.get("labels"),
            pinned: r.get("pinned"), position: r.get("position"),
            created_at: r.get("created_at_ms"), completed_at: r.get("completed_at_ms"),
            deleted_at: r.get("deleted_at_ms"),
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
            source: r.get("source"), via: r.get("via"),
        }).collect();
    let reflections = sqlx::query("select * from reflections where user_id = $1")
        .bind(user).fetch_all(&state.pool).await?
        .iter().map(|r| Reflection {
            id: r.get("id"), period: r.get("period"), period_key: r.get("period_key"),
            text: r.get("text"), created_at: r.get("created_at_ms"), updated_at: r.get("updated_at_ms"),
            ratings: r.get("ratings"), area_notes: r.get("area_notes"),
            wins: r.get("wins"), lessons: r.get("lessons"), blockers: r.get("blockers"),
            intentions: r.get("intentions"),
        }).collect();
    let journal = sqlx::query("select * from daily_entries where user_id = $1 order by date")
        .bind(user).fetch_all(&state.pool).await?
        .iter().map(|r| JournalEntry {
            id: r.get("id"), date: r.get("date"), rough_notes: r.get("rough_notes"),
            end_of_day: r.get("end_of_day"), mood: r.get("mood"), energy: r.get("energy"),
            created_at: r.get("created_at_ms"), updated_at: r.get("updated_at_ms"),
            sleep_hours: r.get("sleep_hours"), sleep_quality: r.get("sleep_quality"),
            stress: r.get("stress"), focus: r.get("focus"),
            gratitude: r.get("gratitude"), intention: r.get("intention"), tags: r.get("tags"),
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
            text: r.get("text"), done_steps: r.get("done_steps"),
            done_steps_at: r.get("done_steps_at"),
            created_at: r.get("created_at_ms"), updated_at: r.get("updated_at_ms"),
        }).collect();
    let day_order = sqlx::query("select * from day_order where user_id = $1")
        .bind(user).fetch_all(&state.pool).await?
        .iter().map(|r| DayOrder {
            id: r.get("id"), date: r.get("date"), order: r.get("entry_order"),
            updated_at: r.get("updated_at_ms"),
        }).collect();

    // The two append-only streams are deliberately NOT part of the app
    // payload: nothing on screen reads them, and shipping a year of events
    // down the wire on every page load would be a real cost for no gain.
    // The export path calls load_everything instead.
    Ok(DbPayload {
        areas, items, seeds, actions, logs, reflections, journal, labels, habit_day_notes,
        day_order, focus_sessions: Vec::new(), events: Vec::new(),
    })
}

/// Everything, streams included — what the export bundle is built from.
pub async fn load_everything(state: &AppState, user: Uuid) -> ApiResult<DbPayload> {
    let mut data = load_all(state, user).await?;
    data.focus_sessions = sqlx::query(
        "select * from focus_sessions where user_id = $1 order by started_at_ms",
    )
        .bind(user).fetch_all(&state.pool).await?
        .iter().map(|r| FocusSession {
            id: r.get("id"), item_id: r.get("item_id"), entry_id: r.get("entry_id"),
            day: r.get("day"), kind: r.get("kind"), step_id: r.get("step_id"),
            started_at: r.get("started_at_ms"), ended_at: r.get("ended_at_ms"),
            planned_seconds: r.get("planned_seconds"), actual_seconds: r.get("actual_seconds"),
            paused_seconds: r.get("paused_seconds"), pause_count: r.get("pause_count"),
            outcome: r.get("outcome"), tz: r.get("tz"),
            utc_offset_minutes: r.get("utc_offset_minutes"), created_at: r.get("created_at_ms"),
        }).collect();
    data.events = sqlx::query("select * from events where user_id = $1 order by at_ms")
        .bind(user).fetch_all(&state.pool).await?
        .iter().map(|r| EventRow {
            id: r.get("id"), at: r.get("at_ms"), day: r.get("day"), tz: r.get("tz"),
            utc_offset_minutes: r.get("utc_offset_minutes"), kind: r.get("type"),
            item_id: r.get("item_id"), payload: r.get("payload"),
            created_at: r.get("created_at_ms"),
        }).collect();
    Ok(data)
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
        "focusSessions" => {
            upsert_focus_sessions(tx.as_mut(), user.id, &parse::<FocusSession>(rows)?).await
        }
        "events" => upsert_events(tx.as_mut(), user.id, &parse::<EventRow>(rows)?).await,
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
    // focusSessions and events are deliberately absent: both are append-only
    // logs of what happened, and the whole point of them is that a later
    // change of heart cannot edit the record.
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
        + body.day_order.len() + body.focus_sessions.len() + body.events.len();
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
    upsert_focus_sessions(tx.as_mut(), user.id, &body.focus_sessions).await?;
    upsert_events(tx.as_mut(), user.id, &body.events).await?;
    enforce_caps(
        &mut tx,
        &user,
        &[
            "areas", "items", "seeds", "actions", "logs", "reflections", "journal", "labels",
            "habitDayNotes", "dayOrder", "focusSessions", "events",
        ],
    )
    .await?;
    tx.commit().await?;
    Ok(Json(json!({ "ok": true, "imported": total })))
}

/// Everything this account holds, in one JSON document: the app tables, both
/// append-only streams, and the settings that say how to read them. This is
/// the source the export bundle is built from — the bundle itself is
/// assembled on the client so that a signed-out user, whose data never leaves
/// their device, gets a byte-for-byte identical set of files.
pub async fn export(State(state): State<AppState>, user: AuthUser) -> ApiResult<Json<Value>> {
    let data = load_everything(&state, user.id).await?;
    let settings = read_settings(&state, user.id).await?;
    Ok(Json(json!({
        "app": "LoopUpward",
        "exportedAt": chrono::Utc::now().to_rfc3339(),
        "account": { "email": user.email },
        "settings": settings,
        "data": data,
    })))
}

/* ————— settings ————— */

async fn read_settings(state: &AppState, user: Uuid) -> ApiResult<UserSettings> {
    let row = sqlx::query("select * from user_settings where user_id = $1")
        .bind(user)
        .fetch_optional(&state.pool)
        .await?;
    Ok(match row {
        None => UserSettings::default(),
        Some(r) => UserSettings {
            theme: r.get("theme"),
            font: r.get("font"),
            simple: r.get("simple"),
            rest_seconds: r.get("rest_seconds"),
            timezone: r.get("timezone"),
            week_start: r.get("week_start"),
            day_rollover_hour: r.get("day_rollover_hour"),
            wake_time: r.get("wake_time"),
            sleep_time: r.get("sleep_time"),
            season_of_life: r.get("season_of_life"),
            occupation: r.get("occupation"),
            becoming: r.get("becoming"),
            constraints: r.get("constraints"),
            focus_minutes_target: r.get("focus_minutes_target"),
            habit_days_target: r.get("habit_days_target"),
            deep_work_days_target: r.get("deep_work_days_target"),
            created_at: r.get("created_at_ms"),
            updated_at: r.get("updated_at_ms"),
        },
    })
}

impl UserSettings {
    fn validate(&self) -> ApiResult<()> {
        for (field, v) in [
            ("seasonOfLife", &self.season_of_life),
            ("occupation", &self.occupation),
            ("becoming", &self.becoming),
            ("constraints", &self.constraints),
        ] {
            if let Some(text) = v {
                ck_len(field, text, MAX_CONTEXT_TEXT)?;
            }
        }
        if let Some(tz) = &self.timezone {
            ck_len("timezone", tz, 64)?;
        }
        for (field, v) in [("wakeTime", &self.wake_time), ("sleepTime", &self.sleep_time)] {
            if let Some(t) = v {
                if !t.is_empty() && !is_hm(t) {
                    return Err(bad(format!("{field} must be HH:MM")));
                }
            }
        }
        if let Some(w) = self.week_start {
            if !(0..=6).contains(&w) {
                return Err(bad("weekStart must be a weekday number 0–6"));
            }
        }
        if let Some(h) = self.day_rollover_hour {
            if !(0..=12).contains(&h) {
                return Err(bad("dayRolloverHour must be between 0 and 12"));
            }
        }
        if let Some(r) = self.rest_seconds {
            if !(0..=600).contains(&r) {
                return Err(bad("restSeconds is out of range"));
            }
        }
        for (field, v) in [
            ("focusMinutesTarget", self.focus_minutes_target),
            ("habitDaysTarget", self.habit_days_target),
            ("deepWorkDaysTarget", self.deep_work_days_target),
        ] {
            if let Some(n) = v {
                if !(0..=10_000).contains(&n) {
                    return Err(bad(format!("{field} is out of range")));
                }
            }
        }
        Ok(())
    }
}

pub async fn get_settings(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<UserSettings>> {
    Ok(Json(read_settings(&state, user.id).await?))
}

/// Whole-document replace. Settings are a single small row edited by one
/// person on one screen; a patch protocol would buy nothing and would make
/// "clear this field" ambiguous.
pub async fn put_settings(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<UserSettings>,
) -> ApiResult<Json<UserSettings>> {
    body.validate()?;
    let now = chrono::Utc::now().timestamp_millis();
    sqlx::query(
        "insert into user_settings (user_id, theme, font, simple, rest_seconds, timezone,
           week_start, day_rollover_hour, wake_time, sleep_time, season_of_life, occupation,
           becoming, constraints, focus_minutes_target, habit_days_target,
           deep_work_days_target, created_at_ms, updated_at_ms)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$18)
         on conflict (user_id) do update set
           theme = excluded.theme, font = excluded.font, simple = excluded.simple,
           rest_seconds = excluded.rest_seconds, timezone = excluded.timezone,
           week_start = excluded.week_start, day_rollover_hour = excluded.day_rollover_hour,
           wake_time = excluded.wake_time, sleep_time = excluded.sleep_time,
           season_of_life = excluded.season_of_life, occupation = excluded.occupation,
           becoming = excluded.becoming, constraints = excluded.constraints,
           focus_minutes_target = excluded.focus_minutes_target,
           habit_days_target = excluded.habit_days_target,
           deep_work_days_target = excluded.deep_work_days_target,
           updated_at_ms = excluded.updated_at_ms",
    )
    .bind(user.id).bind(&body.theme).bind(&body.font).bind(body.simple).bind(body.rest_seconds)
    .bind(&body.timezone).bind(body.week_start).bind(body.day_rollover_hour)
    .bind(&body.wake_time).bind(&body.sleep_time).bind(&body.season_of_life)
    .bind(&body.occupation).bind(&body.becoming).bind(&body.constraints)
    .bind(body.focus_minutes_target).bind(body.habit_days_target)
    .bind(body.deep_work_days_target).bind(now)
    .execute(&state.pool)
    .await?;
    Ok(Json(read_settings(&state, user.id).await?))
}
