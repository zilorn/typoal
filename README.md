# typoal

一个安静、轻盈的个人博客。使用 **SolidStart 2 + TypeScript + pnpm + Go + SQLite**，支持在网页中创建、编辑和删除 Markdown 文章，并通过 Docker Compose 部署。

## 功能

- 中文首页、精选文章、分类筛选、关键词 / 标签搜索、文章归档和关于页面。
- 服务端渲染的文章阅读页、基础 SEO 元信息、RSS 订阅、浅色 / 深色模式。
- 管理密码登录，创建、编辑、删除文章，保存草稿、发布、撤回到草稿。
- 在管理页修改管理密码；密码以加盐哈希保存在 SQLite，修改后其他设备需重新登录。
- Markdown 格式按钮和安全预览：标题、列表、引用、链接、图片链接、代码块、表格。
- 自定义分类、标签、摘要、精选状态及四种内置封面；文章地址固定为 `/post/<文章ID>`，修改标题不会改变链接。
- 手机端支持：首页、导航、阅读、登录、管理、编辑和确认弹窗；375px / 390px 窄屏布局和触控按钮。
- 未保存修改提醒；保存失败和会话过期时保留当前输入，支持原地重新登录。
- SQLite 持久化；Docker 数据卷、健康检查、非 root 运行及优雅退出。

## 一键开发

需要 Node.js **24+**、pnpm **11**、Go **1.26+**。在项目根目录执行：

```sh
./dev.sh
```

脚本会检查环境、安装依赖、首次创建 `.env` 并生成随机管理密码，随后启动前端和后端。请保存终端显示的密码，也可以在 `.env` 的 `ADMIN_PASSWORD` 中查看。已有 `.env` 不会被覆盖。使用 `Ctrl+C` 同时停止两个服务。

- 前端：`http://localhost:3000`，监听 `0.0.0.0:3000`。
- 管理：`http://localhost:3000/admin`。
- 开发 API：`http://localhost:8080/api/health`，监听 `0.0.0.0:8080`。
- 手机预览：将 `localhost` 换成电脑的局域网 IP，手机连接同一网络。

依赖安装后也可以运行 `pnpm dev`。初次启动 Go 编译可能需要一些时间。

## Docker 生产部署

生产与开发使用不同端口：**网页 42731，容器内 API 42732**，均监听 `0.0.0.0`。只有网页的 42731 端口映射到宿主机。

先创建配置。已准备 Node / pnpm 时可以执行 `pnpm setup`；仅有 Docker 时：

```sh
cp .env.example .env
# 编辑 .env，设置至少 12 个字符的 ADMIN_PASSWORD。
./deploy.sh
```

`./deploy.sh` 先校验 `.env` 中的 `ADMIN_PASSWORD`（12–512 字节），通过后再执行 `docker compose up --build -d`；配置有误时会在开始构建前立即报错，不会等到构建结束才显示 unhealthy。

访问 `http://服务器IP:42731`，通过 `/admin` 登录管理文章。

```sh
docker compose logs -f
docker compose down
```

`docker compose down` 保留 `typoal_blog-data` 数据卷。**不要使用 `down -v`，除非明确要删除所有文章。** 更新代码后重新运行 `./deploy.sh` 即可保留数据并重建服务。

对外提供 HTTPS 时，在反向代理中转发到 42731，保留原始 `Host`，并在 `.env` 设置 `COOKIE_SECURE=true` 后重启 API。首次部署没有任何文章，也不会自动插入示例内容。访问 `/admin` 登录后，点击“新建文章”开始写作。作者信息在 `.env` 中配置，修改后重建 API 服务。

### 备份与恢复

一致的离线备份（复制 SQLite 文件前停止 API，包含 WAL 文件）：

```sh
docker compose stop api
docker run --rm -v typoal_blog-data:/data:ro -v "$PWD":/backup alpine:3.23 tar czf /backup/typoal-backup.tar.gz -C /data .
docker compose start api
```

恢复前停止 API，将备份解压到相同数据卷，保留原有文件权限，再启动服务。

## 配置

| 变量                         | 用途                                                                                      |
| ---------------------------- | ----------------------------------------------------------------------------------------- |
| `ADMIN_PASSWORD`             | 初始管理密码，12–512 字节；首次启动写入数据库，之后可在管理页修改；不提交到 Git           |
| `ADMIN_PASSWORD_RESET`       | 设为 true 时用 `ADMIN_PASSWORD` 覆盖数据库中的密码并让所有登录失效；恢复后请改回 false    |
| `SITE_NAME`                  | 博客名称，默认 typoal                                                                     |
| `AUTHOR_NAME` / `AUTHOR_BIO` | 作者名称 / 简介                                                                           |
| `COOKIE_SECURE`              | HTTPS 生产环境设为 true；本地 HTTP 为 false                                               |
| `DATABASE_PATH`              | 本地默认 `backend/data/blog.db`；Docker 固定 `/data/blog.db`                              |
| `API_ADDR` / `API_URL`       | 本地 Go 监听地址 / 前端服务端连接地址；Docker 固定为 `0.0.0.0:42732` / `http://api:42732` |
| `HOST` / `PORT`              | Node 生产服务器监听地址 / 端口，默认 `0.0.0.0` / `42731`                                  |

管理密码和 API 地址不会发送到浏览器。浏览器经同源 `/api/*` 代理调用 Go，使用 HttpOnly、SameSite 会话 Cookie；修改接口校验请求来源，登录有失败次数限制。公开接口始终过滤草稿。

### 修改与重置密码

登录 `/admin` 后点击「修改密码」，输入当前密码和至少 12 个字符的新密码即可。密码以加盐 PBKDF2 哈希保存在 SQLite 中，修改后会注销其他设备上的登录，当前设备保持登录。`ADMIN_PASSWORD` 只在数据库还没有密码时作为初始值，之后修改 `.env` 不会覆盖已修改的密码。

若忘记密码，在 `.env` 中设置一个新的 `ADMIN_PASSWORD`，并临时设置 `ADMIN_PASSWORD_RESET=true`，重启 API 后用新密码登录，最后将 `ADMIN_PASSWORD_RESET` 改回 `false`（或删除该行）并再次重启。

## 常用命令

```sh
pnpm check
pnpm test
pnpm build
cd backend
go test -race ./...
go vet ./...
```

浏览器端集成测试会自动启动独立数据库的前后端服务（端口 3100 / 8180），不会修改开发数据：

```sh
pnpm exec playwright install chromium
pnpm test:e2e
```

## 项目结构

```text
src/
  components/          公共 UI 组件
  lib/                 API、查询、Markdown 渲染和数据类型
  routes/              首页、阅读、归档、关于、管理和 API 代理
backend/
  cmd/blog/            Go 服务入口
  internal/blog/       SQLite 存储、认证、接口和测试
scripts/               初始化及开发启动脚本
tests/                 Markdown 和浏览器集成测试
Dockerfile             前端 / 后端多阶段镜像
compose.yaml           生产服务与数据卷
AGENTS.md              英文项目说明、开发注意事项和 Git 约定
```
