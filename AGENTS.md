# LLM Model Benchmark Studio · AGENTS.md

## 项目概述

专业的大语言模型性能测试、能力评估与智能推荐平台。核心闭环：模型注册 → 性能基准 → 能力评估 → 智能评分 → 任务推荐。真实采集 TTFT（首字延迟）、TPS（吞吐量）、Total Latency。

域名：benchmark.hush7.online

## 技术栈

| 层 | 技术 |
|---|---|
| 后端 | Python 3.12 + FastAPI + SQLAlchemy 2.0 + Pydantic v2 + httpx（asyncio） |
| 前端 | React 18 + TypeScript + Vite 6 + lucide-react（无路由库，自管视图切换） |
| 数据库 | SQLite（benchmark.db，Docker volume 持久化） |
| 部署 | Docker Compose 双容器 |
| Provider | OpenRouter、SiliconFlow、Google Gemini、NVIDIA NIM、腾讯混元 + 自定义扩展 |

## 目录结构

```
benchmark/
├── docker-compose.yml        ← 生产编排（backend :8001 + frontend :18080）
├── docker-compose.dev.yml    ← 开发编排（热重载）
├── config/                   ← scoring.yaml（评分权重，被 config_loader 读取）
├── deploy/ nginx/            ← 部署辅助
├── backend/
│   ├── Dockerfile            ← 多阶段（python:3.12-slim）
│   ├── requirements.txt      ← fastapi/uvicorn/sqlalchemy/pydantic/httpx/pytest
│   ├── .env                  ← Provider API Key + ADMIN_TOKEN
│   ├── app/
│   │   ├── main.py           ← FastAPI 入口
│   │   ├── config.py / config_loader.py   ← 环境变量 + YAML 评分配置
│   │   ├── providers/        ← 各 LLM 适配（openrouter, siliconflow, google, nvidia, tencentcloud）
│   │   ├── capabilities/     ← 能力评测（evaluator, runner, tasks）
│   │   ├── scoring/          ← 评分算法（calculator, metrics）
│   │   └── score.py / intelligence.py / security.py / services.py
│   ├── scripts/              ← backup_db, restore_db, smoke benchmark/capability
│   └── tests/                ← 10 个 pytest 文件
└── frontend/
    ├── Dockerfile            ← 多阶段（node:22 构建 → nginx:1.27 托管）
    ├── nginx.conf            ← 容器内 nginx（/api/ → backend:8000）
    └── src/
        ├── App.tsx           ← 自管视图切换（无 react-router）
        ├── components/views/ ← 20+ 视图（Home, Explorer, Leaderboard, PerfLab, CapLab 等）
        └── lib/              ← api.ts, types.ts, providers.ts
```

## 常用命令

```bash
# Docker 生产部署
cp backend/.env.example backend/.env   # 编辑配置
docker compose up -d --build
docker compose logs -f backend

# Docker 开发（热重载）
docker compose -f docker-compose.dev.yml up

# 本地开发（后端）
cd backend && pip install -r requirements.txt
uvicorn app.main:app --reload

# 本地开发（前端）
cd frontend && npm install && npm run dev

# 后端测试
cd backend && pytest

# 数据库备份
python backend/scripts/backup_db.py
```

## 部署方式

- **Docker Compose 双容器**，仅暴露 loopback：
  - `benchmark-studio-backend-1`：8000 端口（容器内），映射 127.0.0.1:8001。SQLite 持久化到 `benchmark_data` volume。
  - `benchmark-studio-frontend-1`：nginx:1.27，映射 127.0.0.1:18080。
- **容器内链路**：frontend nginx `/api/` → `backend:8000`（Docker 内部 DNS）。
- **系统 nginx**：benchmark.hush7.online → frontend :18080，`proxy_buffering off` + `proxy_read_timeout 300s`。
- TLS 由 xray 在 443 终止后转发到 nginx:80。
- 无 CI/CD，手动 `docker compose up -d --build`。

## 安全红线

- **管理接口需 X-Admin-Token**：`/api/models/sync`、`/api/benchmark/run`、`/api/capabilities/benchmark`。ADMIN_TOKEN 在 `backend/.env`。
- 公开接口（`/api/leaderboard`、`/api/recommend`）无需认证。
- **`.env` 含多个 Provider API Key**，绝不提交。`.env.example` 有完整模板。
- **免费模型白名单机制**：每个 Provider 有 `*_FREE_MODELS` 环境变量，测试默认只针对标记为 free 的模型，避免意外扣费。

## 关键约束

- **config_loader.py 路径耦合**：用 `parents[2]` 定位项目根来找 `config/scoring.yaml`。Dockerfile 目录结构特意镜像仓库布局保证路径正确——改目录结构或 Dockerfile 时必须保持 `/app/backend/app/config_loader.py → parents[2] = /app` 的对应关系。
- **自定义 Provider 扩展**：通过 `CUSTOM_PROVIDERS` 环境变量动态添加 OpenAI 兼容服务商（配置 `{ID}_API_KEY/_BASE_URL/_FREE_MODELS/_LABEL/_COLOR`），重启生效，不需要改代码。
- **流式输出**：nginx `proxy_buffering off` 是必须的，LLM 流式响应依赖。
- **评分配置**：改评分逻辑先看 `config/scoring.yaml` 和 `scoring/` 模块。
- **前端无路由库**：视图切换自管（App.tsx），不依赖 react-router。

## 当前状态

- Docker 容器运行中：backend + frontend 均 Up。
- V1.0 Core + V1.1 Intelligence 已完成；V1.2 Expansion 和 V2.0 Ecosystem 未开始。
- Git 分支 master，3 个提交（无 CI workflow）。
