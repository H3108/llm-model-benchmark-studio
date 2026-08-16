# Build context = project root (set in docker-compose.yml via context: .)
FROM python:3.12-slim AS builder
WORKDIR /app
COPY backend/requirements.txt /app/requirements.txt
RUN pip install --user -r /app/requirements.txt

# Runtime stage — structure mirrors the repo layout so config_loader's
# _project_root() (parents[2] from app/config_loader.py) resolves correctly:
#   /app/backend/app/config_loader.py → parents[2] = /app
#   scoring.yaml at /app/config/scoring.yaml
FROM python:3.12-slim
WORKDIR /app
COPY --from=builder /root/.local /root/.local
COPY backend/app ./backend/app
COPY config ./config
ENV PATH=/root/.local/bin:$PATH
ENV PYTHONUNBUFFERED=1
WORKDIR /app/backend
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
