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

# aspect_ratio -> Yunwu API params
RATIO_MAP = {
    "16:9": {"orientation": "landscape", "size": "large"},
    "9:16": {"orientation": "portrait", "size": "large"},
    "1:1":  {"orientation": "portrait", "size": "medium"},
    "3:4":  {"orientation": "portrait", "size": "large"},
}

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
    duration: int = Form(...),
    actions: str = Form(default=""),
    aspect_ratio: str = Form("16:9"),
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

    # Build Yunwu payload
    ratio_params = RATIO_MAP.get(aspect_ratio, {"orientation": "portrait", "size": "large"})
    payload = {
        "images": [public_image_url],
        "model": "sora-2-all",
        "orientation": ratio_params["orientation"],
        "prompt": prompt,
        "size": ratio_params["size"],
        "duration": duration,
        "watermark": False,
    }
    headers = {
        "Accept": "application/json",
        "Authorization": f"Bearer {YUNWU_API_TOKEN}",
        "Content-Type": "application/json",
    }

    print(f"[API] Calling Yunwu: {payload}")

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(YUNWU_CREATE_URL, headers=headers, json=payload)
            api_data = resp.json()
            print(f"[API] Yunwu response ({resp.status_code}): {api_data}")

            if resp.status_code != 200:
                raise HTTPException(
                    status_code=502,
                    detail=f"Yunwu API Error {resp.status_code}: {api_data}",
                )

            # Extract task id (field name varies by version)
            yunwu_task_id = (
                api_data.get("taskId")
                or api_data.get("task_id")
                or api_data.get("id")
                or api_data.get("data", {}).get("taskId")
            )
            if not yunwu_task_id:
                raise HTTPException(
                    status_code=502,
                    detail=f"No task_id in Yunwu response: {api_data}",
                )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Yunwu connection error: {e}")

    # Persist task state
    tasks[file_id] = {
        "yunwu_task_id": yunwu_task_id,
        "status": "processing",
        "video_url": None,
        "error": None,
        "created_at": time.time(),
    }

    # Deduct credits asynchronously (fire-and-forget)
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
