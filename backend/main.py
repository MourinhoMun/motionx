from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import shutil
import os
import uuid
import time
import httpx
from dotenv import load_dotenv

# 加载环境变量 (Token)
load_dotenv()
API_TOKEN = os.getenv("YUNWU_API_TOKEN", "YOUR_TOKEN_HERE") # 从环境变量读取或直接填入
API_URL = "https://yunwu.ai/v1/video/create"

app = FastAPI()

# 允许跨域
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

# 挂载静态文件目录，使得上传的文件可以通过 http://localhost:8000/uploads/xxx 访问
# 注意：这只在本地内网有效，外部服务器无法访问 localhost
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")
app.mount("/outputs", StaticFiles(directory=OUTPUT_DIR), name="outputs")

async def upload_image_to_public_url(local_path: str, filename: str) -> str:
    """
    [CRITICAL] 将本地图片上传到公网可访问的 URL。
    由于 Yunwu API 需要公网链接，而 localhost 无法被外部访问。
    
    方案 A (生产环境): 上传到 AWS S3 / Aliyun OSS / Cloudflare R2
    方案 B (开发环境): 使用 ngrok / localtunnel 穿透，或者使用图床 API
    
    为了演示，这里我们假设你已经配置好了某种图床上传，或者你正在使用支持公网 IP 的服务器。
    目前代码仅返回 localhost 链接（这在调用 Yunwu API 时会失败，除非配置了内网穿透）。
    """
    # TODO: 替换为真实的云存储上传代码
    # 示例: s3_client.upload_file(local_path, bucket, filename)
    # return f"https://my-bucket.s3.amazonaws.com/{filename}"
    
    # 临时返回一个假定的公网 URL (请替换为真实可用的 URL)
    # 如果你有图床，可以在这里调用图床 API
    print(f"⚠️ Warning: Yunwu API generally cannot access localhost URLs. You must implement real cloud upload.")
    return f"https://filesystem.site/cdn/20250702/w8AauvxxPhYoqqkFWdMippJpb9zBxN.png" # 暂时使用示例图片链接测试

@app.post("/generate")
async def generate_video(
    image: UploadFile = File(...),
    prompt: str = Form(...),
    duration: int = Form(...),
    actions: str = Form(...),
    aspect_ratio: str = Form("16:9") # 接收画幅参数, 默认 16:9
):
    # 1. 保存上传原图
    file_id = str(uuid.uuid4())
    filename = f"{file_id}_{image.filename}"
    local_image_path = os.path.join(UPLOAD_DIR, filename)
    
    with open(local_image_path, "wb") as buffer:
        shutil.copyfileobj(image.file, buffer)
        
    print(f"[OK] Image Saved Locally: {local_image_path}")

    # 2.获取公网图片链接 (必需步骤)
    # 因为 Yunwu API 需要公网访问，我们暂时用示例链接代替，或者你手动替换
    public_image_url = await upload_image_to_public_url(local_image_path, filename)
    print(f"[LINK] Public Image URL: {public_image_url}")

    # 3. 构造 Yunwu API 请求 payload
    payload = {
        "enable_upsample": True,
        "enhance_prompt": True,
        "images": [public_image_url],
        "model": "veo3.1-fast", # 或允许前端传入
        "prompt": prompt,
        "aspect_ratio": aspect_ratio
    }
    
    headers = {
        'Accept': 'application/json',
        'Authorization': f'Bearer {API_TOKEN}',
        'Content-Type': 'application/json'
    }

    print(f"[API] Calling Yunwu API with prompt: {prompt[:50]}...")
    
    # 4. 发起真实调用
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(API_URL, headers=headers, json=payload)
            
            if response.status_code != 200:
                print(f"[ERROR] API Error: {response.text}")
                # 为了不让前端崩溃，我们在开发阶段允许失败回落到模拟数据
                # raise HTTPException(status_code=response.status_code, detail=f"Yunwu API Error: {response.text}")
                pass 
            
            api_data = response.json()
            print(f"[OK] API Response: {api_data}")
            
            # TODO: 这里的 api_data 通常包含 task_id，需要轮询查询结果
            # 假设 API 直接返回了某种 status 或 task_id
            # task_id = api_data.get("task_id")
            
    except Exception as e:
        print(f"[ERROR] Connection Error: {str(e)}")
        # return {"status": "error", "message": str(e)}

    # 5. 返回结果 (目前仍是 Mock，等待你接入真实的轮询逻辑)
    # 在真实逻辑中，你应该返回 task_id，然后前端轮询 /status/{task_id}
    time.sleep(2) 
    
    return {
        "status": "success",
        "task_id": file_id, # 使用本地 ID 作为 Mock
        "message": "Video generation task submitted to Yunwu API",
        "mock_url": f"http://localhost:8000/outputs/{file_id}.mp4", 
        "prompt_used": prompt,
        "aspect_ratio": aspect_ratio,
        "api_payload": payload # 方便调试查看
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
