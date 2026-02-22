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

YUNWU_API_TOKEN = os.getenv("YUNWU_API_TOKEN", "")
YUNWU_CREATE_URL = "https://yunwu.ai/v1/video/create"
YUNWU_QUERY_URL = "https://yunwu.ai/v1/video/query"
LICENSE_BACKEND_URL = os.getenv("LICENSE_BACKEND_URL", "https://pengip.com")
SERVER_BASE_URL = os.getenv("SERVER_BASE_URL", "https://pengip.com")
GENERATE_COST = 50

VEO3_MODEL = "veo3-fast"
# veo3 只支持 16:9 和 9:16，其他比例降回 16:9
VEO3_SUPPORTED_RATIOS = {"16:9", "9:16"}

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

# In-memory task store: task_id -> {yunwu_task_id, status, video_url, error}
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

    # veo3 只支持 16:9 / 9:16
    safe_ratio = aspect_ratio if aspect_ratio in VEO3_SUPPORTED_RATIOS else "16:9"

    payload = {
        "model": VEO3_MODEL,
        "prompt": prompt,
        "images": [public_image_url],
        "enhance_prompt": True,
        "enable_upsample": True,
        "aspect_ratio": safe_ratio,
    }
    headers = {
        "Accept": "application/json",
        "Authorization": f"Bearer {YUNWU_API_TOKEN}",
        "Content-Type": "application/json",
    }

    print(f"[API] Calling Yunwu Veo3: {payload}")

    async def call_yunwu():
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(YUNWU_CREATE_URL, headers=headers, json=payload)
            api_data = resp.json()
            print(f"[API] Yunwu response ({resp.status_code}): {api_data}")
            return resp.status_code, api_data

    try:
        status_code, api_data = await call_yunwu()

        # 上游过载时自动重试一次
        if status_code == 500 and "饱和" in str(api_data.get("error", "")):
            print("[API] Yunwu upstream saturated, retrying in 4s...")
            await asyncio.sleep(4)
            status_code, api_data = await call_yunwu()

        if status_code != 200:
            err_msg = api_data.get("error", "")
            if "饱和" in err_msg or "负载" in err_msg:
                raise HTTPException(status_code=503, detail="AI 服务器当前请求繁忙，请稍等片刻后重试。")
            raise HTTPException(status_code=502, detail=f"生成服务暂时不可用，请稍后重试。（{err_msg}）")

        # 提取任务 ID
        yunwu_task_id = (
            api_data.get("id")
            or api_data.get("taskId")
            or api_data.get("task_id")
            or api_data.get("data", {}).get("taskId")
        )
        if not yunwu_task_id:
            raise HTTPException(status_code=502, detail=f"No task_id in Yunwu response: {api_data}")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Yunwu connection error: {e}")

    # 持久化任务状态
    tasks[file_id] = {
        "yunwu_task_id": yunwu_task_id,
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

    # Poll Yunwu
    yunwu_task_id = task["yunwu_task_id"]
    headers = {
        "Accept": "application/json",
        "Authorization": f"Bearer {YUNWU_API_TOKEN}",
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                YUNWU_QUERY_URL,
                params={"taskId": yunwu_task_id},
                headers=headers,
            )
            data = resp.json()
            print(f"[Status] Yunwu {yunwu_task_id}: {data}")

            # Normalise status string
            raw_status = (
                data.get("status")
                or data.get("data", {}).get("status")
                or ""
            ).lower()

            if raw_status in ("completed", "success", "finished", "done", "succeeded"):
                video_url = (
                    data.get("videoUrl")
                    or data.get("video_url")
                    or data.get("url")
                    or data.get("output")
                    or data.get("data", {}).get("videoUrl")
                    or data.get("data", {}).get("url")
                )
                task["status"] = "completed"
                task["video_url"] = video_url
                return {"status": "completed", "video_url": video_url}

            elif raw_status in ("failed", "error", "cancelled"):
                err_msg = data.get("message") or data.get("error") or "Generation failed"
                task["status"] = "failed"
                task["error"] = err_msg
                return {"status": "failed", "error": err_msg}

            else:
                return {"status": "processing", "yunwu_status": raw_status}

    except Exception as e:
        print(f"[Status] Poll error: {e}")
        return {"status": "processing"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3004)
