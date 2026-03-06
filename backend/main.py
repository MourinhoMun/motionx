from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
import shutil
import os
import uuid
import asyncio
import time
import httpx
import base64
import json
from dotenv import load_dotenv

load_dotenv()

# Sora-2 API 配置
SORA2_API_KEY = os.getenv("SORA2_API_KEY", "sk-m7A6Fj53NSSiJTyAUKc3THjw716nDcaa0wCypPHS4orweCnt")
SORA2_BASE_URL = "https://api.bltcy.ai"
SORA2_SUBMIT_URL = f"{SORA2_BASE_URL}/v2/videos/generations"
SORA2_MODEL = "sora-2"  # 图片生成视频模型

LICENSE_BACKEND_URL = os.getenv("LICENSE_BACKEND_URL", "https://pengip.com")
SERVER_BASE_URL = os.getenv("SERVER_BASE_URL", "https://pengip.com")
GENERATE_COST = 50  # 保持 50 积分

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = "uploads"
OUTPUT_DIR = "outputs"
TASKS_DIR = "tasks"
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(TASKS_DIR, exist_ok=True)

app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")
app.mount("/outputs", StaticFiles(directory=OUTPUT_DIR), name="outputs")

# In-memory task store: task_id -> {sora2_task_id, status, video_url, error}
tasks: dict = {}

def save_task(task_id: str, task_data: dict):
    """保存任务到文件"""
    try:
        with open(os.path.join(TASKS_DIR, f"{task_id}.json"), "w") as f:
            json.dump(task_data, f)
    except Exception as e:
        print(f"[Task] Failed to save task {task_id}: {e}")

def load_task(task_id: str) -> dict:
    """从文件加载任务"""
    try:
        path = os.path.join(TASKS_DIR, f"{task_id}.json")
        if os.path.exists(path):
            with open(path, "r") as f:
                return json.load(f)
    except Exception as e:
        print(f"[Task] Failed to load task {task_id}: {e}")
    return None

def cleanup_old_files():
    """清理7天前的文件"""
    try:
        now = time.time()
        seven_days = 7 * 24 * 60 * 60

        for directory in [UPLOAD_DIR, OUTPUT_DIR, TASKS_DIR]:
            for filename in os.listdir(directory):
                filepath = os.path.join(directory, filename)
                if os.path.isfile(filepath):
                    if now - os.path.getmtime(filepath) > seven_days:
                        os.remove(filepath)
                        print(f"[Cleanup] Deleted old file: {filepath}")
    except Exception as e:
        print(f"[Cleanup] Error: {e}")

@app.on_event("startup")
async def startup_event():
    """启动时清理旧文件"""
    cleanup_old_files()


# ── License helpers ────────────────────────────────────────────────────────────

async def check_balance(token: str):
    """Raises 401/402 if token missing or insufficient balance."""
    if not token:
        raise HTTPException(status_code=401, detail="未授权，请先激活许可证")
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{LICENSE_BACKEND_URL}/api/v1/user/balance",
                headers={"Authorization": token},
            )
            if resp.status_code != 200:
                data = resp.json()
                error_msg = data.get("error", "无法验证账户")
                raise HTTPException(status_code=resp.status_code, detail=error_msg)

            data = resp.json()
            balance = data.get("balance", 0)
            if balance < GENERATE_COST:
                raise HTTPException(
                    status_code=402,
                    detail=f"积分不足（当前余额: {balance}），请充值后再使用。如需购买充值码，请联系鹏哥",
                )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"验证账户失败：{str(e)}")


async def deduct_license(token: str):
    """Fire-and-forget credit deduction."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.post(
                f"{LICENSE_BACKEND_URL}/api/v1/proxy/use",
                headers={"Authorization": token, "Content-Type": "application/json"},
                json={"software": "motionx_generate_video"},
            )
    except Exception as e:
        print(f"[LicenseDeduct] Failed: {e}")


# ── License proxy endpoints ────────────────────────────────────────────────────

@app.post("/api/license/activate")
async def license_activate(request: Request):
    body = await request.json()
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            f"{LICENSE_BACKEND_URL}/api/v1/user/activate",
            json=body,
        )
        return JSONResponse(content=resp.json(), status_code=resp.status_code)


@app.get("/api/license/balance")
async def license_balance(request: Request):
    token = request.headers.get("Authorization")
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = token
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            f"{LICENSE_BACKEND_URL}/api/v1/user/balance",
            headers=headers,
        )
        return JSONResponse(content=resp.json(), status_code=resp.status_code)


# ── Generate endpoint ──────────────────────────────────────────────────────────

@app.post("/api/generate")
async def generate_video(
    request: Request,
    image: UploadFile = File(...),
    prompt: str = Form(...),
    aspect_ratio: str = Form("16:9"),
    actions: str = Form(default=""),
):
    token = request.headers.get("Authorization")
    await check_balance(token)

    # Save image locally
    file_id = str(uuid.uuid4())
    ext = os.path.splitext(image.filename)[1] if image.filename else ".jpg"
    filename = f"{file_id}{ext}"
    local_path = os.path.join(UPLOAD_DIR, filename)
    with open(local_path, "wb") as f:
        shutil.copyfileobj(image.file, f)

    public_image_url = f"{SERVER_BASE_URL}/motionx-uploads/{filename}"
    print(f"[OK] Image saved → {public_image_url}")

    # Sora-2 API payload（使用图片 URL）
    payload = {
        "model": SORA2_MODEL,
        "prompt": prompt,
        "images": [public_image_url],
        "aspect_ratio": aspect_ratio,
        "duration": "10",
        "hd": False,
        "watermark": False,
        "private": True,
    }
    headers = {
        "Authorization": f"Bearer {SORA2_API_KEY}",
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json",
        "Accept-Language": "en-US,en;q=0.9",
    }

    print(f"[API] Calling Sora-2 I2V: {payload}")

    async def call_sora2():
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(SORA2_SUBMIT_URL, headers=headers, json=payload)
            api_data = resp.json()
            print(f"[API] Sora-2 response ({resp.status_code}): {api_data}")
            return resp.status_code, api_data

    try:
        status_code, api_data = await call_sora2()

        # 自动重试逻辑
        MAX_RETRIES = 3
        RETRY_INTERVAL = 10
        retry_count = 0
        while status_code >= 500 and retry_count < MAX_RETRIES:
            retry_count += 1
            print(f"[API] Sora-2 error, retry {retry_count}/{MAX_RETRIES} in {RETRY_INTERVAL}s...")
            await asyncio.sleep(RETRY_INTERVAL)
            status_code, api_data = await call_sora2()

        if status_code != 200:
            err_msg = api_data.get("error", api_data.get("message", ""))
            # 针对 400 错误提供更友好的提示
            if status_code == 400:
                raise HTTPException(
                    status_code=400, 
                    detail=f"请求参数有误，请检查上传的图片格式和大小。建议：使用清晰的人物正面照，文件大小不超过 10MB。（{err_msg}）"
                )
            raise HTTPException(status_code=502, detail=f"生成服务暂时不可用，请稍后重试。（{err_msg}）")

        # 提取任务 ID（Sora-2 返回 task_id）
        task_id = api_data.get("task_id")
        if not task_id:
            raise HTTPException(status_code=502, detail=f"No task_id in Sora-2 response: {api_data}")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Sora-2 connection error: {e}")

    # 持久化任务状态（保存 token 用于成功后扣费）
    tasks[file_id] = {
        "sora2_task_id": task_id,
        "status": "processing",
        "video_url": None,
        "error": None,
        "created_at": time.time(),
        "token": token,  # 保存 token，成功后才扣费
        "credits_deducted": False,  # 标记是否已扣费
    }
    save_task(file_id, tasks[file_id])

    # 不再立即扣费，改为成功后才扣
    return {"status": "processing", "task_id": file_id}


# ── Status polling endpoint ────────────────────────────────────────────────────

@app.get("/api/status/{task_id}")
async def get_status(task_id: str):
    task = tasks.get(task_id)
    if not task:
        # 尝试从文件加载
        task = load_task(task_id)
        if task:
            tasks[task_id] = task
        else:
            raise HTTPException(status_code=404, detail="Task not found")

    if task["status"] == "completed":
        return {"status": "completed", "video_url": task["video_url"]}
    if task["status"] == "failed":
        return {"status": "failed", "error": task["error"]}

    # Poll Sora-2（使用 GET 方法）
    sora2_task_id = task["sora2_task_id"]
    status_url = f"{SORA2_BASE_URL}/v2/videos/generations/{sora2_task_id}"
    headers = {
        "Authorization": f"Bearer {SORA2_API_KEY}",
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(status_url, headers=headers)
            data = resp.json()
            print(f"[Status] Sora-2 {sora2_task_id}: {data}")

            # 解析状态（Sora-2 返回 NOT_START, IN_PROGRESS, SUCCESS, FAILURE）
            raw_status = data.get("status", "").upper()

            if raw_status == "SUCCESS":
                # 视频 URL 在 data.output 中
                video_url = data.get("data", {}).get("output")

                if video_url:
                    # 下载视频到本地（硅基流动的 URL 会过期）
                    try:
                        print(f"[Download] Downloading video from: {video_url[:100]}...")
                        async with httpx.AsyncClient(timeout=60.0) as client:
                            video_resp = await client.get(video_url)
                            if video_resp.status_code == 200:
                                # 保存到 outputs 目录
                                output_filename = f"{task_id}.mp4"
                                output_path = os.path.join(OUTPUT_DIR, output_filename)
                                with open(output_path, "wb") as f:
                                    f.write(video_resp.content)

                                # 返回我们服务器上的 URL（注意是 motionx-outputs 不是 motionx/outputs）
                                local_video_url = f"{SERVER_BASE_URL}/motionx-outputs/{output_filename}"
                                print(f"[Download] Video saved to: {local_video_url}")

                                task["status"] = "completed"
                                task["video_url"] = local_video_url
                                save_task(task_id, task)

                                # 视频生成成功且下载成功，扣除积分（只扣一次）
                                if not task.get("credits_deducted", False):
                                    token = task.get("token")
                                    if token:
                                        asyncio.create_task(deduct_license(token))
                                        task["credits_deducted"] = True
                                        print(f"[Credits] Deducting 50 credits for successful video generation")

                                return {"status": "completed", "video_url": local_video_url}
                            else:
                                print(f"[Download] Failed to download video: {video_resp.status_code}")
                                # 下载失败，标记为失败状态，不扣费
                                task["status"] = "failed"
                                task["error"] = f"视频下载失败（HTTP {video_resp.status_code}），请重试"
                                save_task(task_id, task)
                                return {"status": "failed", "error": task["error"]}
                    except Exception as e:
                        print(f"[Download] Error downloading video: {e}")
                        # 下载失败，标记为失败状态，不扣费
                        task["status"] = "failed"
                        task["error"] = f"视频下载异常：{str(e)}"
                        save_task(task_id, task)
                        return {"status": "failed", "error": task["error"]}
                else:
                    print(f"[Status] Video completed but no URL found: {data}")
                    return {"status": "processing"}

            elif raw_status == "FAILURE":
                err_msg = data.get("fail_reason") or data.get("message") or data.get("error") or "Generation failed"
                task["status"] = "failed"
                task["error"] = err_msg
                save_task(task_id, task)
                return {"status": "failed", "error": err_msg}

            else:
                # NOT_START 或 IN_PROGRESS
                return {"status": "processing", "sora2_status": raw_status}

    except Exception as e:
        print(f"[Status] Poll error: {e}")
        return {"status": "processing"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3004)
