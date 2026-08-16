# Build context = project root (set in docker-compose.yml via context: .)
FROM node:22-alpine AS builder
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
# Production build: API requests use same-origin relative URLs (proxied by nginx).
ENV VITE_API_URL=""
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
