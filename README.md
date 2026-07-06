# LoopUpward

Turn intentions into progress.

LoopUpward is a personal growth operating system that connects your thoughts, goals, habits, and reflections into one continuous improvement loop.

Most productivity tools start with tasks.

Humans don't.

We start with:
- "I want to learn a language."
- "I want to become healthier."
- "I should read this book."
- "I don't want another year to disappear."

LoopUpward captures those thoughts, helps turn them into systems, connects them to daily actions, and shows whether life is actually moving forward.

---

## The Loop

```
Capture
   ↓
Organize
   ↓
Act
   ↓
Reflect
   ↺
Improve
```

---

## Features

### Mind — Capture without friction

A blank space for thoughts, goals, ideas, quotes, dreams, and plans.

No forced folders.
No complicated setup.

Capture first. Structure later.

---

### Life — Build your own system

Create your own areas:

- Health
- Career
- Money
- Learning
- Relationships
- Anything else

Everything is flexible.

A goal can contain goals.

Example:

```
Learn French
 └── Reach B2
      └── Finish grammar book
           └── Chapter 5 today
```

Progress flows upward automatically.

---

### Today — Execution layer

Daily actions are connected to larger goals.

Completing:

```
Practice French today
```

updates:

```
French habit
→ monthly goal
→ yearly progress
```

No disconnected todo lists.

---

### Reflect — See your progress

Understand:

- Am I more consistent than last month?
- Which promises did I keep?
- What areas need attention?

Supports:

- weekly reviews
- monthly reviews
- quarterly/yearly reflection
- habit history
- progress trends

---

## Tech Stack

### Frontend

- Next.js
- TypeScript
- Tailwind CSS

### Backend

- Rust
- Axum
- Tokio
- SQLx
- PostgreSQL

### Infrastructure

- Railway
- Cloudflare
- Docker

---

## Backend Architecture

```
Frontend
    |
    |
Rust API
    |
    |
PostgreSQL
```

LoopUpward uses an event-based model.

Actions create history events.

Reports, streaks, progress, and reflections are generated from real history instead of mutable counters.

---

## Core Concepts

### Life Items

A universal object.

Can represent:

- goal
- habit
- book
- quote
- project
- dream
- financial target

---

### Events

Immutable history:

Examples:

- completed workout
- finished chapter
- practiced language
- reached milestone

Your progress is calculated from what actually happened.

---

## Authentication

- Google Sign-In
- Custom Rust session system
- Hashed session tokens
- Private user data isolation

---

## Monetization Support

Includes:

- subscription system
- premium access
- admin grants
- payment webhook architecture

---

## Data Ownership

Your life data belongs to you.

LoopUpward supports full JSON export.

---

## Status

Early development.

Currently focused on:

- reliability
- personal use
- improving the daily growth loop

---

## Philosophy

Notes remember who you wanted to become.

Tasks remember what you had to do.

LoopUpward remembers the journey between them.
