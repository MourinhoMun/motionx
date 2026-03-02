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
from dotenv import load_dotenv

load_dotenv()

# 硅基流动 API 配置
SILICONFLOW_API_KEY = os.getenv("SILICONFLOW_API_KEY", "sk-lnfujquaezlufhnikiywgruyrphmsjhtobvrwbfzodclsofl")
SILICONFLOW_SUBMIT_URL = "https://api.siliconflow.cn/v1/video/submit"
SILICONFLOW_STATUS_URL = "https://api.siliconflow.cn/v1/video/status"  # 状态查询接口
SILICONFLOW_MODEL = "Wan-AI/Wan2.2-I2V-A14B"  # 图片生成视频模型

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
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")
app.mount("/outputs", StaticFiles(directory=OUTPUT_DIR), name="outputs")

# In-memory task store: task_id -> {siliconflow_task_id, status, video_url, error}
tasks: dict = {}


# ── License helpers ────────────────────────────────────────────────────────────

async def check_balance(token: str):
    """Raises 401/402 if token missing or insufficient balance."""
    if not token:
        raise HTTPException(status_code=401, detail="未授权，请先激活许可证")
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            f"{LICENSE_BACKEND_URL}/api/v1/user/balance",
            headers={"Authorization": token},
        )
        data = resp.json()
        balance = data.get("balance", 0)
        if balance < GENERATE_COST:
            raise HTTPException(
                status_code=402,
                detail=f"积分不足（当前余额: {balance}），请充值后再使用。如需购买充值码，请联系鹏哥",
            )


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

    # 硅基流动支持的尺寸映射（根据官方文档）
    size_map = {
        "16:9": "1280x720",
        "9:16": "720x1280",
        "1:1": "960x960",
    }
    image_size = size_map.get(aspect_ratio, "1280x720")

    payload = {
        "model": SILICONFLOW_MODEL,
        "prompt": prompt,
        "image": public_image_url,  # 根据 curl 示例，可能是 image 而不是 image_url
        "image_size": image_size,
    }
    headers = {
        "Authorization": f"Bearer {SILICONFLOW_API_KEY}",
        "Content-Type": "application/json",
    }

    print(f"[API] Calling SiliconFlow I2V: {payload}")

    async def call_siliconflow():
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(SILICONFLOW_SUBMIT_URL, headers=headers, json=payload)
            api_data = resp.json()
            print(f"[API] SiliconFlow response ({resp.status_code}): {api_data}")
            return resp.status_code, api_data

    try:
        status_code, api_data = await call_siliconflow()

        # 自动重试逻辑
        MAX_RETRIES = 3
        RETRY_INTERVAL = 10
        retry_count = 0
        while status_code >= 500 and retry_count < MAX_RETRIES:
            retry_count += 1
            print(f"[API] SiliconFlow error, retry {retry_count}/{MAX_RETRIES} in {RETRY_INTERVAL}s...")
            await asyncio.sleep(RETRY_INTERVAL)
            status_code, api_data = await call_siliconflow()

        if status_code != 200:
            err_msg = api_data.get("error", api_data.get("message", ""))
            raise HTTPException(status_code=502, detail=f"生成服务暂时不可用，请稍后重试。（{err_msg}）")

        # 提取任务 ID（硅基流动返回 requestId）
        task_id = (
            api_data.get("requestId")
            or api_data.get("id")
            or api_data.get("task_id")
            or api_data.get("data", {}).get("id")
        )
        if not task_id:
            raise HTTPException(status_code=502, detail=f"No task_id in SiliconFlow response: {api_data}")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"SiliconFlow connection error: {e}")

    # 持久化任务状态
    tasks[file_id] = {
        "siliconflow_task_id": task_id,
        "status": "processing",
        "video_url": None,
        "error": None,
        "created_at": time.time(),
    }

    asyncio.create_task(deduct_license(token))
    return {"status": "processing", "task_id": file_id}


# ── Status polling endpoint ────────────────────────────────────────────────────

@app.get("/api/status/{task_id}")
async def get_status(task_id: str):
    task = tasks.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if task["status"] == "completed":
        return {"status": "completed", "video_url": task["video_url"]}
    if task["status"] == "failed":
        return {"status": "failed", "error": task["error"]}

    # Poll SiliconFlow（使用 POST 方法）
    siliconflow_task_id = task["siliconflow_task_id"]
    headers = {
        "Authorization": f"Bearer {SILICONFLOW_API_KEY}",
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                SILICONFLOW_STATUS_URL,
                headers=headers,
                json={"requestId": siliconflow_task_id},
            )
            data = resp.json()
            print(f"[Status] SiliconFlow {siliconflow_task_id}: {data}")

            # 解析状态（硅基流动返回 'Succeed' 而不是 'succeeded'）
            raw_status = data.get("status", "").lower()

            if raw_status in ("completed", "success", "finished", "done", "succeeded", "succeed"):
                # 视频 URL 在 results.videos[0].url 中
                video_url = None
                if "results" in data and "videos" in data["results"]:
                    videos = data["results"]["videos"]
                    if videos and len(videos) > 0:
                        video_url = videos[0].get("url")

                # 兜底：尝试其他可能的字段
                if not video_url:
                    video_url = data.get("video_url") or data.get("url") or data.get("output") or data.get("videoUrl")

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
                                return {"status": "completed", "video_url": local_video_url}
                            else:
                                print(f"[Download] Failed to download video: {video_resp.status_code}")
                                # 如果下载失败，仍然返回原始 URL
                                task["status"] = "completed"
                                task["video_url"] = video_url
                                return {"status": "completed", "video_url": video_url}
                    except Exception as e:
                        print(f"[Download] Error downloading video: {e}")
                        # 下载失败，返回原始 URL
                        task["status"] = "completed"
                        task["video_url"] = video_url
                        return {"status": "completed", "video_url": video_url}
                else:
                    print(f"[Status] Video completed but no URL found: {data}")
                    return {"status": "processing"}

            elif raw_status in ("failed", "error", "cancelled"):
                err_msg = data.get("message") or data.get("error") or data.get("reason") or "Generation failed"
                task["status"] = "failed"
                task["error"] = err_msg
                return {"status": "failed", "error": err_msg}

            else:
                return {"status": "processing", "siliconflow_status": raw_status}

    except Exception as e:
        print(f"[Status] Poll error: {e}")
        return {"status": "processing"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3004)
