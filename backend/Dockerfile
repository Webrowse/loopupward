# ---- build ----
FROM rust:1-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y pkg-config && rm -rf /var/lib/apt/lists/*
COPY Cargo.toml Cargo.lock* ./
# cache dependency compilation
RUN mkdir src && echo "fn main() {}" > src/main.rs && cargo build --release && rm -rf src
COPY src ./src
COPY migrations ./migrations
RUN touch src/main.rs && cargo build --release

# ---- run ----
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/lifeos-api /usr/local/bin/lifeos-api
ENV PORT=8080
EXPOSE 8080
CMD ["lifeos-api"]
