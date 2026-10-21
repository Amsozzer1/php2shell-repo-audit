FROM debian:bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends php8.2-cli php8.2-mbstring \
 && rm -rf /var/lib/apt/lists/*
CMD ["php", "/srv/worker.php"]
