# LLM Model Benchmark Studio

模型信息管理、Operational Benchmark、Capability Benchmark、评分与智能分析的工程工具。

> **文档与当前状态**：本仓库 `docs/` 下文档较多，部分为 V1 阶段历史快照，可能与当前代码不一致。权威的实时状态、已修复问题与待办排期见 [`outputs/PROJECT_AUDIT_REPORT.md`](outputs/PROJECT_AUDIT_REPORT.md)。安全相关以 `X-Admin-Token` 全局中间件 + `/api/admin/verify` 端点为准（高耗接口均已鉴权）。

## 架构

- **后端**：FastAPI + SQLAlchemy + SQLite (`backend/app/`)
- **前端**：React + TypeScript + Vite（`frontend/src/`，原生 CSS，`tailwindcss` 已移除）
- **6 个 LLM 服务商**，137+ 免费模型

| 服务商 | 命名空间 | 免费判定方式 |
|---|---|---|
| OpenRouter | 原始 ID | `:free` 后缀 |
| SiliconFlow | `siliconflow::` | 官方 $0 定价 + 操作员白名单 |
| OpenCode | `opencode::` | `-free` 后缀 + 操作员白名单 |
| 腾讯云混元 | `tencentcloud::` | 操作员白名单（额度制免费） |
| NVIDIA NIM | `nvidia::` | 操作员白名单（积分制免费） |
| Google Gemini | `google::` | 操作员白名单（免费 tier） |

## 启动

### 后端

```bash
cd backend
cp .env.example .env
# 在 .env 中填写 ADMIN_TOKEN 和需要的 Provider API Key
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### 前端

```bash
cd frontend
npm install
npm run dev
```

前端默认连接 `http://localhost:8000`，可通过 `VITE_API_URL` 环境变量调整。

### Docker Compose

```bash
cp backend/.env.example backend/.env
# 编辑 backend/.env
docker compose up --build
```

修改 `backend/.env` 后需重建容器：

```bash
docker compose up -d --force-recreate backend
```

## 安全策略

系统只测试明确标记为免费的模型。OpenRouter 通过 `:free` 后缀或 `openrouter/free` 路由判定；其余服务商（SiliconFlow、OpenCode、腾讯云混元、NVIDIA NIM、Google Gemini）均通过操作员白名单确认，且后端在发起 Provider 请求前会二次校验数据库免费白名单。非聊天模型（embedding、parser、safety 等）自动过滤，不进入测试列表。

腾讯云和 NVIDIA 的免费额度是按月/按账号发放的，额度用尽后 adapter 会检测到 `quota_exhausted` 信号并自动排除该模型。

## Backend API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/health` | 健康检查 |
| GET | `/api/models` | 本地免费模型列表 |
| GET | `/api/models/sync?provider=<p>` | 同步指定服务商模型目录 |
| GET | `/api/models/sync/runs` | 同步历史记录 |
| POST | `/api/benchmark/run` | 运行性能 Benchmark |
| GET | `/api/benchmark/results` | 历史 Benchmark 结果 |
| GET | `/api/benchmark/runs` | Benchmark 批次记录 |
| POST | `/api/capabilities/benchmark` | 运行能力 Benchmark |
| GET | `/api/capabilities/tasks` | 能力任务列表 |
| GET | `/api/leaderboard` | 模型评分排行榜 |
| GET | `/api/leaderboard/capability` | 能力维度排行榜 |
| GET | `/api/recommend?task=coding` | 任务推荐模型 |
| GET | `/api/models/{model_id}/intelligence` | 模型智能分析 |
| GET | `/docs` | OpenAPI 文档 |

所有写操作和管理接口需要 `X-Admin-Token` 请求头，值须与 `ADMIN_TOKEN` 一致。

## 前端页面

- **首页** — 概览仪表盘、快速入口
- **模型目录** — 按服务商筛选、搜索免费模型
- **测试实验室** — 选择模型运行 Benchmark / Capability 测试
- **测试结果** — 历史结果表格、分页、排序
- **排行榜** — 综合评分排行，按服务商下拉筛选
- **智能分析** — 单模型深度评分报告
- **管理控制台** — 同步模型目录、查看运行状态、Token 配置

## 项目结构

```
backend/app/
  main.py          # FastAPI 入口、路由
  config.py        # Pydantic 配置 (.env)
  registry.py      # Model Registry、同步逻辑、免费判定
  services.py      # Benchmark 执行、Provider 路由
  score.py         # 评分引擎
  intelligence.py  # 智能分析
  providers/       # 6 个 Provider 适配器
  capabilities/    # 能力测试框架
  scoring/         # 评分算法组件

frontend/src/
  App.tsx          # 主应用、所有页面组件
  lib/api.ts       # API 客户端
  components/      # UI 组件、管理控制台
  styles.css       # 全局样式
```

## 文档

详细文档位于 `docs/` 目录，包括架构设计、评分规则、API 契约等。
