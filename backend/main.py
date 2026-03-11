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

# Video generation provider configuration
# Primary: Yunwu (Sora-2 I2V)
# Fallback: SiliconFlow (Wan2.2 I2V) when the primary request fails.
def _parse_key_list(env_value: str) -> list[str]:
    return [k.strip() for k in (env_value or "").split(",") if k.strip()]

# Primary provider keys (comma-separated). Example:
# SORA2_API_KEYS=sk1,sk2,sk3
SORA2_API_KEYS = _parse_key_list(os.getenv("SORA2_API_KEYS", ""))
if not SORA2_API_KEYS:
    # Back-compat: allow single key env var
    single = os.getenv("SORA2_API_KEY", "").strip()
    if single:
        SORA2_API_KEYS = [single]

if not SORA2_API_KEYS:
    raise RuntimeError("SORA2_API_KEYS (or SORA2_API_KEY) is required")

SORA2_BASE_URL = os.getenv("SORA2_BASE_URL", "https://api.bltcy.ai")
SORA2_SUBMIT_URL = f"{SORA2_BASE_URL}/v2/videos/generations"
SORA2_MODEL = os.getenv("SORA2_MODEL", "sora-2")  # primary image-to-video model

# SiliconFlow fallback (keep secrets in env vars, not in code)
SILICONFLOW_BASE_URL = os.getenv("SILICONFLOW_BASE_URL", "https://api.siliconflow.cn")
SILICONFLOW_API_KEY = os.getenv("SILICONFLOW_API_KEY", "")
SILICONFLOW_MODEL = os.getenv("SILICONFLOW_MODEL", "Wan-AI/Wan2.2-I2V-A14B")

_key_index = 0

def get_next_key() -> str:
    """Round-robin next primary API key."""
    global _key_index
    key = SORA2_API_KEYS[_key_index % len(SORA2_API_KEYS)]
    _key_index += 1
    return key

LICENSE_BACKEND_URL = os.getenv("LICENSE_BACKEND_URL", "https://pengip.com")
SERVER_BASE_URL = os.getenv("SERVER_BASE_URL", "https://pengip.com")
GENERATE_COST = 50  # 保持 50 积分

# Concurrency limit: avoid stampeding upstream during peak load.
MAX_CONCURRENT_GENERATIONS = int(os.getenv("MAX_CONCURRENT_GENERATIONS", "3"))
GENERATE_SEMAPHORE = asyncio.Semaphore(MAX_CONCURRENT_GENERATIONS)

app = FastAPI()

ALLOWED_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()]
if not ALLOWED_ORIGINS:
    # Dev-friendly default; production should set ALLOWED_ORIGINS explicitly.
    ALLOWED_ORIGINS = ["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

UPLOAD_DIR = "uploads"
OUTPUT_DIR = "outputs"
TASKS_DIR = "tasks"
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(TASKS_DIR, exist_ok=True)

# Do not expose uploads/outputs as unauthenticated static directories in SaaS mode.
# Serve files via authenticated endpoints instead.

# In-memory task store (also persisted to disk for restart recovery).
# NOTE: Do not persist user bearer tokens to disk.
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

    # Concurrency guard: queue locally instead of stampeding upstream
    async with GENERATE_SEMAPHORE:


        # Save image locally
        file_id = str(uuid.uuid4())
        ext = os.path.splitext(image.filename)[1] if image.filename else ".jpg"
        filename = f"{file_id}{ext}"
        local_path = os.path.join(UPLOAD_DIR, filename)
        with open(local_path, "wb") as f:
            shutil.copyfileobj(image.file, f)

        public_image_url = f"{SERVER_BASE_URL}/motionx-uploads/{filename}"
        print(f"[OK] Image saved → {public_image_url}")

        # Primary provider payload (Yunwu / Sora-2) uses image URL
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
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "application/json",
            "Accept-Language": "en-US,en;q=0.9",
        }

        api_key = get_next_key()
        print(f"[API] Calling Sora-2 I2V with key ...{api_key[-6:]}: {payload}")

        async def call_sora2(key: str):
            hdrs = {**headers, "Authorization": f"Bearer {key}"}
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(SORA2_SUBMIT_URL, headers=hdrs, json=payload)
                api_data = resp.json()
                print(f"[API] Sora-2 response ({resp.status_code}): {api_data}")
                return resp.status_code, api_data

        async def call_siliconflow():
            """Fallback provider: SiliconFlow Wan2.2 I2V.

            Note: request/response schema may differ from Yunwu; this function keeps the
            integration isolated so we can adjust in one place if SiliconFlow changes.
            """
            if not SILICONFLOW_API_KEY:
                return 0, {"error": "SILICONFLOW_API_KEY not configured"}

            submit_url = SILICONFLOW_BASE_URL.rstrip("/") + "/v1/video/submit"

            # SiliconFlow I2V requires `image` (URL or base64). We prefer URL to keep payload small.
            sf_payload = {
                "model": SILICONFLOW_MODEL,
                "prompt": prompt,
                "image_size": "1280x720" if aspect_ratio == "16:9" else "720x1280" if aspect_ratio == "9:16" else "960x960",
                "image": public_image_url,
            }

            sf_headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {SILICONFLOW_API_KEY}",
                "Accept": "application/json",
            }

            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(submit_url, headers=sf_headers, json=sf_payload)
                try:
                    data = resp.json()
                except Exception:
                    data = {"error": resp.text[:2000]}
                print(f"[API] SiliconFlow response ({resp.status_code}): {data}")
                return resp.status_code, data

        try:
            status_code, api_data = await call_sora2(api_key)

            # Automatic retry (HTTP 5xx) by rotating primary keys
            MAX_RETRIES = 3
            RETRY_INTERVAL = 10
            retry_count = 0
            while status_code >= 500 and retry_count < MAX_RETRIES:
                retry_count += 1
                api_key = get_next_key()
                print(f"[API] Sora-2 error, retry {retry_count}/{MAX_RETRIES} with key ...{api_key[-6:]}...")
                await asyncio.sleep(RETRY_INTERVAL)
                status_code, api_data = await call_sora2(api_key)

            # If primary fails, fallback to SiliconFlow
            provider = "sora2"
            if status_code != 200:
                print(f"[Fallback] Primary failed (HTTP {status_code}), trying SiliconFlow...")
                sf_status, sf_data = await call_siliconflow()
                provider = "siliconflow"

                if sf_status != 200:
                    err_msg = api_data.get("error", api_data.get("message", ""))
                    sf_err = sf_data.get("error", sf_data.get("message", "")) if isinstance(sf_data, dict) else str(sf_data)
                    if status_code == 400:
                        raise HTTPException(
                            status_code=400,
                            detail=f"请求参数有误，请检查上传的图片格式和大小。建议：使用清晰的人物正面照，文件大小不超过 10MB。（{err_msg}）",
                        )
                    raise HTTPException(
                        status_code=502,
                        detail=f"生成服务暂时不可用，请稍后重试。（primary: {err_msg}；fallback: {sf_err}）",
                    )

                api_data = sf_data

            if provider == "sora2":
                # Sora-2 returns task_id and needs polling
                task_id = api_data.get("task_id")
                if not task_id:
                    raise HTTPException(status_code=502, detail=f"No task_id in Sora-2 response: {api_data}")
            else:
                # SiliconFlow returns requestId
                if not isinstance(api_data, dict):
                    raise HTTPException(status_code=502, detail=f"Unexpected SiliconFlow response: {api_data}")
                task_id = api_data.get("requestId")
                if not task_id:
                    raise HTTPException(status_code=502, detail=f"No requestId in SiliconFlow response: {api_data}")

        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Video provider connection error: {e}")

        # 持久化任务状态（保存 token 用于成功后扣费，保存 payload 用于 FAILURE 重试）
        # Persist task state
        tasks[file_id] = {
            "provider": provider,
            "provider_task_id": task_id,
            "status": "processing",
            "video_url": None,
            "error": None,
            "created_at": time.time(),
            # Do NOT persist bearer token. Keep it only in-memory for best-effort charging.
            "token_in_memory": token,
            "credits_deducted": False,
            "retry_count": 0,       # primary FAILURE retries
            "payload": payload,     # original request body for re-submit (primary)
        }

        # Persist a redacted version (no bearer tokens)
        to_save = dict(tasks[file_id])
        to_save.pop("token_in_memory", None)
        save_task(file_id, to_save)

        # Charge only after successful download in status polling.
        return {"status": tasks[file_id]["status"], "task_id": file_id}


    # ── Authenticated file endpoints ───────────────────────────────────────────────

    @app.get("/api/outputs/{filename}")
    async def download_output(filename: str, request: Request):
        token = request.headers.get("Authorization")
        await check_balance(token)  # basic auth gate; does not deduct

        file_path = os.path.join(OUTPUT_DIR, filename)
        if not os.path.isfile(file_path):
            raise HTTPException(status_code=404, detail="File not found")

        # Stream file
        from fastapi.responses import FileResponse
        return FileResponse(file_path, media_type="video/mp4")


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

    provider = task.get("provider", "sora2")

    if provider != "sora2":
        # SiliconFlow polling
        request_id = task.get("provider_task_id")
        if not request_id:
            return {"status": "failed", "error": "Missing provider_task_id"}

        status_url = SILICONFLOW_BASE_URL.rstrip("/") + "/v1/video/status"
        sf_headers = {
            "Authorization": f"Bearer {SILICONFLOW_API_KEY}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(status_url, headers=sf_headers, json={"requestId": request_id})
                data = resp.json()
                print(f"[Status] SiliconFlow {request_id}: {data}")

                raw_status = (data.get("status") or "").upper()
                if raw_status == "SUCCEED":
                    videos = ((data.get("results") or {}).get("videos") or [])
                    video_url = (videos[0] or {}).get("url") if videos else None
                    if not video_url:
                        return {"status": "processing"}

                    # Download to local for stable URL
                    try:
                        print(f"[Download] Downloading video from: {video_url[:100]}...")
                        async with httpx.AsyncClient(timeout=60.0) as dl:
                            v = await dl.get(video_url)
                            if v.status_code != 200:
                                task["status"] = "failed"
                                task["error"] = f"视频下载失败（HTTP {v.status_code}），请重试"
                                save_task(task_id, task)
                                return {"status": "failed", "error": task["error"]}

                            output_filename = f"{task_id}.mp4"
                            output_path = os.path.join(OUTPUT_DIR, output_filename)
                            with open(output_path, "wb") as f:
                                f.write(v.content)

                        local_video_url = f"{SERVER_BASE_URL}/motionx/api/outputs/{output_filename}"
                        task["status"] = "completed"
                        task["video_url"] = local_video_url
                        save_task(task_id, task)

                        if not task.get("credits_deducted", False):
                            token = task.get("token_in_memory")
                            if token:
                                asyncio.create_task(deduct_license(token))
                                task["credits_deducted"] = True
                                print("[Credits] Deducting 50 credits for successful video generation")

                        return {"status": "completed", "video_url": local_video_url}
                    except Exception as e:
                        task["status"] = "failed"
                        task["error"] = f"视频下载异常：{str(e)}"
                        save_task(task_id, task)
                        return {"status": "failed", "error": task["error"]}

                if raw_status in {"FAILED", "FAIL", "ERROR"}:
                    reason = data.get("reason") or "Generation failed"
                    task["status"] = "failed"
                    task["error"] = reason
                    save_task(task_id, task)
                    return {"status": "failed", "error": reason}

                return {"status": "processing", "provider_status": raw_status}
        except Exception as e:
            print(f"[Status] SiliconFlow poll error: {e}")
            return {"status": "processing"}

    # Poll Sora-2 (GET)
    sora2_task_id = task.get("provider_task_id") or task.get("sora2_task_id")
    status_url = f"{SORA2_BASE_URL}/v2/videos/generations/{sora2_task_id}"
    # Status query uses any primary key
    status_key = get_next_key()
    headers = {
        "Authorization": f"Bearer {status_key}",
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
                                local_video_url = f"{SERVER_BASE_URL}/motionx/api/outputs/{output_filename}"
                                print(f"[Download] Video saved to: {local_video_url}")

                                task["status"] = "completed"
                                task["video_url"] = local_video_url
                                save_task(task_id, task)

                                # 视频生成成功且下载成功，扣除积分（只扣一次）
                                if not task.get("credits_deducted", False):
                                    token = task.get("token_in_memory")
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
                retry_count = task.get("retry_count", 0)
                stored_payload = task.get("payload")

                # 还有 key 可以换，自动重试
                if stored_payload and retry_count < len(SORA2_API_KEYS) - 1:
                    new_key = get_next_key()
                    print(f"[Retry] FAILURE, retry {retry_count + 1}/{len(SORA2_API_KEYS) - 1} with key ...{new_key[-6:]}")
                    try:
                        retry_headers = {
                            "Authorization": f"Bearer {new_key}",
                            "Content-Type": "application/json",
                            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                            "Accept": "application/json",
                        }
                        async with httpx.AsyncClient(timeout=30.0) as retry_client:
                            retry_resp = await retry_client.post(SORA2_SUBMIT_URL, headers=retry_headers, json=stored_payload)
                            retry_data = retry_resp.json()
                            print(f"[Retry] Sora-2 re-submit response ({retry_resp.status_code}): {retry_data}")
                            new_task_id = retry_data.get("task_id")
                        if new_task_id:
                            task["sora2_task_id"] = new_task_id
                            task["retry_count"] = retry_count + 1
                            save_task(task_id, task)
                            return {"status": "processing"}
                    except Exception as re:
                        print(f"[Retry] Re-submit failed: {re}")

                # 重试全部耗尽，标记失败
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
