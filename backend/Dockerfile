# Backend container — FastAPI on uvicorn.
# Build:  docker build -t ai-cost-backend ./backend
# Run:    docker run -p 8000:8000 --env-file ./backend/.env ai-cost-backend

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# System deps — tiktoken needs a C build toolchain on some platforms.
RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential \
 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Persistent directory for the SQLite cache — mount a volume here in prod.
RUN mkdir -p /app/data
ENV CACHE_DB_PATH=/app/data/cache.db

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
