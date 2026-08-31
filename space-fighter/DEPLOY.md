# 太空战机（space-fighter）部署文档

纯静态 HTML5 Canvas 游戏，无后端。生产环境通过 Nginx + Let's Encrypt HTTPS 部署，一键脚本见 [scripts/deploy.sh](scripts/deploy.sh)。

- **线上地址**：https://zj.games.jcc666.top
- **技术栈**：原生 HTML/CSS/JS（Canvas 2D），无构建步骤、无依赖

## 目录结构

```
space-fighter/
├── index.html        # 入口页面（脚本带 ?v=N 缓存版本参数）
├── css/style.css
├── js/
│   ├── input.js      # 键盘 / 触屏 / PS5 手柄输入
│   ├── audio.js      # WebAudio 音效
│   ├── entities.js   # 玩家 / 敌机 / BOSS / 武器 / 子弹逻辑
│   ├── render.js     # Canvas 渲染
│   └── game.js       # 主循环 / 状态切换 / HUD
└── scripts/
    └── deploy.sh     # 服务器一键部署脚本
```

## 本地开发

任意静态服务器指向项目目录即可（file:// 协议部分功能受限）：

```bash
cd space-fighter
python -m http.server 8080
# 打开 http://localhost:8080
```

## 生产部署

### 前提条件

- 域名 `zj.games.jcc666.top` 已解析到目标服务器
- 服务器开放 80 / 443 端口
- 具备 root 或 sudo 权限（脚本自动检测）
- 服务器为 Debian/Ubuntu（apt）或 RHEL 系（dnf/yum）

### 首次部署

1. 将整个 `space-fighter/` 目录同步到服务器（scp / rsync / git 均可）：

   ```bash
   rsync -av ./space-fighter/ user@server:/opt/space-fighter/
   ```

2. 在服务器上执行部署脚本（自动安装 nginx/certbot/rsync → 同步文件 → 签发证书 → 启用 HTTPS）：

   ```bash
   cd /opt/space-fighter
   sudo bash scripts/deploy.sh
   ```

3. 完成后访问 `https://zj.games.jcc666.top` 验证。

### 后续更新

代码改动后重新同步目录到服务器，再执行一次脚本即可。脚本幂等：

- `rsync -a --delete` 增量同步静态文件（排除 `.git`、`scripts`）
- 证书已存在时跳过签发
- 仅重写 Nginx 配置并 reload

### 每 5 分钟自动部署

使用 Git 克隆到 `/var/www/games` 后，可为 root 安装每 5 分钟执行一次的自动部署任务：

```bash
cd /var/www/games
sudo /usr/bin/bash space-fighter/scripts/install_cron.sh
sudo /usr/bin/bash space-fighter/scripts/auto_deploy.sh
sudo crontab -l
```

cron 使用 `# BEGIN SPACE FIGHTER AUTO DEPLOY CRON` 标记块，只替换本项目自己的任务，不影响同一用户下的其他定时任务。重复运行安装脚本不会产生重复任务；标记残缺或重复时会拒绝修改 crontab。

`auto_deploy.sh` 默认跟踪 `origin/main`，执行流程如下：

1. 使用非阻塞文件锁避免多个部署任务重叠。
2. 拒绝已跟踪文件存在本地改动、分支不为 `main` 或无法快进的仓库。
3. 拉取远端更新，仅对尚未成功部署的提交执行 `deploy.sh`。
4. 部署成功后记录提交；部署失败时保留旧状态，下个周期自动重试。

自动部署日志按天写入仓库根目录下的 `.deploy/logs/space-fighter-auto-deploy-YYYYMMDD.log`，避免日志落入 Nginx 站点根目录；脚本会清理 3 天前的日志：

```bash
cd /var/www/games
tail -f ".deploy/logs/space-fighter-auto-deploy-$(TZ=Asia/Shanghai date +%Y%m%d).log"
```

可通过环境变量覆盖仓库目录、分支和执行周期：

```bash
sudo env REPO_DIR=/var/www/games SCHEDULE='*/10 * * * *' \
  /usr/bin/bash /var/www/games/space-fighter/scripts/install_cron.sh
```

### 可配置环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `DOMAIN` | `zj.games.jcc666.top` | 绑定域名 |
| `LETSENCRYPT_EMAIL` | `admin@jcc666.top` | 证书通知邮箱 |
| `WEB_DIR` | `/var/www/games/space-fighter` | 站点根目录 |
| `CERTBOT_WAIT_SECONDS` | `180` | Certbot 被其他进程占用时的最长等待秒数，设为 `0` 可关闭等待 |
| `CERTBOT_RETRY_INTERVAL` | `5` | Certbot 被占用时的重试间隔秒数 |

示例：

```bash
sudo DOMAIN=games.example.com LETSENCRYPT_EMAIL=me@example.com bash scripts/deploy.sh
```

## 缓存与版本策略

Nginx 对 `js/css/png/svg/...` 静态资源下发 **7 天**强缓存。发布新代码时必须同步升级 [index.html](index.html) 中的脚本版本参数，否则客户端会命中旧缓存：

```html
<script src="js/entities.js?v=1.4"></script>
```

**每次改动 JS/CSS 后：将所有 `?v=N` 递增**（当前 v=1.7）。

## 证书续期

部署脚本已启用 `certbot.timer` 自动续期，续期由 webroot 模式完成，无需人工干预。手动检查：

```bash
sudo certbot renew --dry-run
```

## 常见问题

| 现象 | 处理 |
|------|------|
| 证书签发失败 | 检查域名解析是否生效、80 端口是否可从公网访问 |
| `Another instance of Certbot is already running` | 脚本默认自动等待最多 180 秒；超时后用 `systemctl status certbot.service` 检查占用进程 |
| 改了代码线上没变化 | 升级 index.html 中的 `?v=N` 版本参数后强刷（Ctrl+F5） |
| 502 / 403 | `nginx -t` 检查配置；确认 `${WEB_DIR}` 下存在 index.html |
| 手柄无响应 | 页面需先获得焦点；按一次手柄任意键唤醒连接 |
