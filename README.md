# MicroMotion / 微动

> 让照片呼吸起来 — AI 驱动的肖像动态化工具

MicroMotion 是一款专注于**肖像动态化**的 AI 工具。只需上传一张静态照片，选择预设微动作，即可生成类似 iPhone Live Photo 风格的高保真动态视频。

## 核心特性

- **极致保真**：严格锁定原图的背景、发型、服装纹理，不进行重绘或风格迁移
- **30+ 微动作预设**：头部姿态、面部表情、环境氛围、复合动作
- **多画幅支持**：16:9 / 9:16 / 1:1 / 4:3
- **时长可选**：5s / 10s / 15s

## 使用方法

1. 克隆项目并进入目录
2. 安装依赖：`npm install`
3. 启动开发服务器：`npm run dev`
4. 打开浏览器访问 localhost 地址

## 技术栈

- **前端**：React + Vite + Tailwind CSS + Framer Motion
- **后端**：Python (FastAPI)
- **AI 模型**：Stable Video Diffusion / Kling AI
