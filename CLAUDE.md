# CLAUDE.md - Claude Code 工作规范

## 环境说明
这是**生产服务器**，域名 pengip.com，所有改动直接影响线上用户。

## 核心原则
1. **安全第一** — 改动前想清楚影响范围，不确定就停下来
2. **每天提交一个 commit** — 记录当天所有改动，commit message 要清晰
3. **不要重启服务** — 除非 Adrian 明确要求，不要自行 `pm2 restart` 或重启 nginx
4. **数据库谨慎** — 不要随意跑 migrate，生产数据库改动需确认

## Commit 规范
每天工作结束前执行：
```bash
git add -A
git commit -m "daily: YYYY-MM-DD 简述今天做了什么"
git push
```

## 技术栈
- 主站：Next.js 15 + Prisma + SQLite，端口 3000
- 后端 API：Node.js，端口 3001
- HealVision：Node.js monorepo，端口 3002
- StarFace：Node.js Express，端口 3003
- MotionX：Python FastAPI，端口 3004
- Web 服务器：Nginx（反向代理）
