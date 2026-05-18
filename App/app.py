import os
import sys

# PyInstaller --noconsole fix for Uvicorn
if sys.stdout is None:
    sys.stdout = open(os.devnull, "w")
if sys.stderr is None:
    sys.stderr = open(os.devnull, "w")

import uuid
import urllib.parse
from typing import Optional, List
import asyncio
import time
import shutil
import pathlib
import logging
from logging.handlers import RotatingFileHandler
from httpx import AsyncClient
from fastapi import FastAPI, HTTPException, WebSocket, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import sqlite3
import io
from PIL import Image, ImageFilter
import json
from colorthief import ColorThief
import threading
import pystray
import webbrowser
import socket
# =====================
# PATH HELPERS
# =====================
def resource_path(relative_path):
    """ Get absolute path to resource, works for dev and for PyInstaller """
    try:
        # PyInstaller creates a temp folder and stores path in _MEIPASS
        base_path = sys._MEIPASS
    except Exception:
        base_path = os.path.dirname(os.path.abspath(__file__))

    return os.path.join(base_path, relative_path)

# APP SETUP
# =====================
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DOWNLOADS_PATH = str(os.path.join(pathlib.Path.home(), "Downloads"))

# 🛡️ CROSS-PLATFORM (Windows / Mac / Linux Uyumlu)
if os.name == 'nt': # Windows
    base_dir = os.getenv('APPDATA')
else: # Mac/Linux
    base_dir = os.path.join(pathlib.Path.home(), '.config')

MORGI_DIR = os.path.join(base_dir, 'MorgiFile')

SAFE_STORAGE = os.path.join(MORGI_DIR, 'Safe')
THUMB_STORAGE = os.path.join(MORGI_DIR, 'Thumb')
DB_DIR = os.path.join(MORGI_DIR, 'Database')
LOGS_DIR = os.path.join(MORGI_DIR, 'Logs')

os.makedirs(SAFE_STORAGE, exist_ok=True)
os.makedirs(THUMB_STORAGE, exist_ok=True)
os.makedirs(DB_DIR, exist_ok=True)
os.makedirs(LOGS_DIR, exist_ok=True)

DB_FILE = os.path.join(DB_DIR, "morgifile.db")

# =====================
# LOGGING SETUP
# =====================
LOG_FILE = os.path.join(LOGS_DIR, "morgifile.log")
PORT_CONFIG_FILE = os.path.join(MORGI_DIR, "port_config.json")

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        RotatingFileHandler(LOG_FILE, maxBytes=5*1024*1024, backupCount=5, encoding='utf-8'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("MorgiFile")

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Global error on {request.url.path}: {exc}", exc_info=True)
    return Response(content=json.dumps({"detail": str(exc)}), status_code=500, media_type="application/json")

@app.get("/api/ping")
async def ping():
    return {"status": "morgifile_online"}

# Lock mechanism
db_lock = asyncio.Lock()

# =====================
# SQLITE HELPERS
# =====================
def get_db_connection():
    conn = sqlite3.connect(DB_FILE, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()

    # ✨ isCORS ve ProxyUrl çöpe atıldı!
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS images (
            id TEXT PRIMARY KEY,
            site TEXT,
            originalUrl TEXT,
            sourceUrl TEXT,
            SafePath TEXT,
            category TEXT,
            width INTEGER,
            height INTEGER,
            isFavorite BOOLEAN,
            isDeleted BOOLEAN,
            isDead BOOLEAN,
            isSafe BOOLEAN
        )
    ''')

    try:
        cursor.execute("ALTER TABLE images ADD COLUMN sourceUrl TEXT")
        logger.info("sourceUrl sütunu başarıyla eklendi!")
    except sqlite3.OperationalError:
        pass

    try:
        cursor.execute("ALTER TABLE images ADD COLUMN mainColor TEXT")
        logger.info("mainColor sütunu eklendi!")
    except sqlite3.OperationalError:
        pass

    try:
        cursor.execute("ALTER TABLE images ADD COLUMN colors TEXT")
        logger.info("colors sütunu eklendi!")
    except sqlite3.OperationalError:
        pass

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS categories (
            name TEXT PRIMARY KEY,
            isSystem BOOLEAN DEFAULT 0
        )
    ''')

    # Önceden tanımlı kategoriler listesi
    # Buraya istediğin kategorileri ekleyebilirsin
    default_categories = [
        ("Uncategorized Favorites", 1),
        ("Inspiration", 0),
        ("Advertisements", 0),
        ("Social Media", 0)
    ]

    for cat_name, is_sys in default_categories:
        cursor.execute('''
            INSERT OR IGNORE INTO categories (name, isSystem) 
            VALUES (?, ?)
        ''', (cat_name, is_sys))

    conn.commit()
    conn.close()
    logger.info("Database engine ready (SQLite)!")

init_db()

# =====================
# SCHEMAS (PYDANTIC - BURASI 422 HATASINI ÇÖZEN YER!)
# =====================
class ImageSaveSchema(BaseModel):
    site: str
    url: str  # JS'den gelen 'url' ismiyle eşleşti
    category: str
    sourceUrl: Optional[str] = None # JS'den gelen asıl post linki
    width: int = 0
    height: int = 0
    aspectRatio: Optional[str] = None

class CategoryCreateSchema(BaseModel):
    name: str

class CategoryRenameSchema(BaseModel):
    oldName: str
    newName: str
    merge: bool = False

class CategoryDeleteSchema(BaseModel):
    name: str
    action: Optional[str] = None
    moveTo: Optional[str] = None

# =====================
# WEBSOCKET MANAGER
# =====================
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        dead_connections = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                dead_connections.append(connection)

        for dc in dead_connections:
            self.disconnect(dc)

manager = ConnectionManager()

# =====================
# ENDPOINTS
# =====================
@app.post("/images/{img_id}/verify-and-shield")
async def verify_shield(img_id: str):
    try:
        files = [os.path.join(DOWNLOADS_PATH, f) for f in os.listdir(DOWNLOADS_PATH)]
    except Exception:
        raise HTTPException(status_code=500, detail="Cannot access downloads folder.")

    if not files:
        raise HTTPException(status_code=404, detail="Downloads folder appears to be empty.")

    files.sort(key=os.path.getmtime, reverse=True)
    target_file = None
    now = time.time()
    for f in files:
        if os.path.isfile(f) and (now - os.path.getmtime(f) < 60):
            if f.lower().endswith(('.png', '.jpg', '.jpeg', '.webp')):
                target_file = f
                break

    if target_file:
        ext = os.path.splitext(target_file)[1]
        new_name = f"{img_id}{ext}"
        final_path = os.path.join(SAFE_STORAGE, new_name)
        
        await asyncio.to_thread(shutil.move, target_file, final_path)
        
        conn = get_db_connection()
        cursor = conn.execute("UPDATE images SET isSafe = 1, SafePath = ? WHERE id = ?", (final_path, img_id))
        conn.commit()
        updated = cursor.rowcount > 0
        conn.close()

        if updated:
            await manager.broadcast({"type": "RELOAD_DATA", "message": "Image successfully shielded!"})
            return {"status": "success", "safe_path": final_path}
        else:
            raise HTTPException(status_code=404, detail="Image not found in database.")
    
    raise HTTPException(status_code=404, detail="No new image file found.")

@app.post("/add-image")
async def add_image(data: ImageSaveSchema):
    conn = get_db_connection()
    try:
        base_part = data.url.split('?')[0]
        if "image" in base_part.lower():
            search_url = data.url
        else:
            search_url = base_part
            
        existing = conn.execute(
            "SELECT id FROM images WHERE originalUrl LIKE ?", 
            (f"{search_url}%",)
        ).fetchone()
        
        if existing:
            conn.close()
            return {"status": "already_exists", "message": "This image is already saved."}

        new_id = str(uuid.uuid4())
        
        # ✨ isCORS ve ProxyUrl veri tabanına YAZILMIYOR
        conn.execute('''
            INSERT INTO images (
                id, site, originalUrl, sourceUrl, SafePath, category, 
                width, height, isFavorite, isDeleted, isDead, isSafe
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            new_id, data.site, data.url, data.sourceUrl, "", data.category,
            data.width, data.height, False, False, False, False
        ))
        conn.commit()

        new_entry = dict(conn.execute("SELECT * FROM images WHERE id = ?", (new_id,)).fetchone())
        conn.close()
        
        # 🚀 Arkaplanda thumbnail oluştur (Görsel ölü ise hazır olmak için)
        asyncio.create_task(create_thumbnail(data.url, new_id))

        await manager.broadcast({"type": "NEW_IMAGE", "payload": new_entry})
        return {"status": "success", "id": new_id}
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=500, detail=f"Server save error: {str(e)}")

@app.get("/images")
async def get_images():
    try:
        conn = get_db_connection()
        rows = conn.execute("SELECT * FROM images").fetchall()
        conn.close()
        return [dict(row) for row in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not read data: {str(e)}")

@app.get("/categories")
async def get_categories():
    conn = get_db_connection()
    rows = conn.execute("SELECT name, isSystem FROM categories").fetchall()
    conn.close()
    return {
        "categories": [
            {"name": row["name"], "isSystem": bool(row["isSystem"])} 
            for row in rows
        ]
    }

@app.post("/categories")
async def add_category(data: CategoryCreateSchema):
    name = data.name.strip()
    if not name:
        raise HTTPException(400, "Category name cannot be empty")

    conn = get_db_connection()
    try:
        conn.execute("INSERT INTO categories (name) VALUES (?)", (name,))
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        raise HTTPException(409, "Category already exists")

    rows = conn.execute("SELECT name FROM categories").fetchall()
    conn.close()
    categories = [{"name": row["name"]} for row in rows]

    await manager.broadcast({"type": "CATEGORIES_UPDATED", "payload": categories})
    return {"name": name}

@app.delete("/categories")
async def delete_category(data: CategoryDeleteSchema):
    conn = get_db_connection()
    name = data.name

    cat = conn.execute("SELECT isSystem FROM categories WHERE name = ?", (name,)).fetchone()
    
    if not cat:
        conn.close()
        raise HTTPException(404, "Category not found")
        
    if cat["isSystem"]:
        conn.close()
        raise HTTPException(400, "System categories cannot be deleted")

    related_count = conn.execute("SELECT count(*) FROM images WHERE category = ? AND isDeleted = 0", (name,)).fetchone()[0]

    if related_count > 0 and not data.action:
        conn.close()
        return {"status": "has_images", "count": related_count}

    conn.execute("UPDATE images SET category = 'Uncategorized Favorites' WHERE category = ? AND isDeleted = 0 AND isFavorite = 1", (name,))

    if data.action == "delete_images":
        conn.execute("UPDATE images SET isDeleted = 1 WHERE category = ? AND isDeleted = 0 AND isFavorite = 0", (name,))
    elif data.action == "move_images":
        if not data.moveTo:
            conn.close()
            raise HTTPException(400, "moveTo parameter is required")
        conn.execute("UPDATE images SET category = ? WHERE category = ? AND isDeleted = 0 AND isFavorite = 0", (data.moveTo, name))

    conn.execute("DELETE FROM categories WHERE name = ?", (name,))
    conn.commit()
    
    categories = [{"name": row["name"]} for row in conn.execute("SELECT name FROM categories").fetchall()]
    conn.close()

    await manager.broadcast({"type": "CATEGORIES_UPDATED", "payload": categories})
    await manager.broadcast({"type": "RELOAD_DATA"})
    return {"status": "deleted", "affected": related_count}

@app.patch("/categories/rename")
async def rename_category(data: CategoryRenameSchema):
    old = data.oldName.strip()
    new = data.newName.strip()
    if not old or not new:
        raise HTTPException(400, "Category name cannot be empty")

    conn = get_db_connection()
    
    cat_to_rename = conn.execute("SELECT isSystem FROM categories WHERE name = ?", (old,)).fetchone()
    if cat_to_rename and cat_to_rename["isSystem"]:
        conn.close()
        raise HTTPException(400, "System categories cannot be renamed")

    exists_old = conn.execute("SELECT name FROM categories WHERE name = ?", (old,)).fetchone()
    exists_new = conn.execute("SELECT name FROM categories WHERE name = ?", (new,)).fetchone()

    if not exists_old:
        conn.close()
        raise HTTPException(404, "Old category not found")

    if exists_new and not data.merge:
        conn.close()
        return {"status": "conflict", "message": "Category already exists", "canMerge": True}

    if exists_new and data.merge:
        conn.execute("DELETE FROM categories WHERE name = ?", (old,))
        conn.execute("UPDATE images SET category = ? WHERE category = ?", (new, old))
    else:
        conn.execute("UPDATE categories SET name = ? WHERE name = ?", (new, old))
        conn.execute("UPDATE images SET category = ? WHERE category = ?", (new, old))

    conn.commit()
    categories = [{"name": row["name"]} for row in conn.execute("SELECT name FROM categories").fetchall()]
    conn.close()

    await manager.broadcast({"type": "CATEGORIES_UPDATED", "payload": categories})
    await manager.broadcast({"type": "RELOAD_DATA"})

    return {"status": "merged" if exists_new else "renamed", "old": old, "new": new}

@app.patch("/images/change-category")
async def change_category(payload: dict):
    img_id = payload["id"]
    category = payload["category"]
    restore = payload.get("restore", False)

    conn = get_db_connection()
    if restore:
        cursor = conn.execute("UPDATE images SET category = ?, isDeleted = 0 WHERE id = ?", (category, img_id))
    else:
        cursor = conn.execute("UPDATE images SET category = ? WHERE id = ?", (category, img_id))

    if cursor.rowcount == 0:
        conn.close()
        raise HTTPException(404, "Image not found")

    conn.commit()
    conn.close()

    await manager.broadcast({
        "type": "IMAGE_UPDATED",
        "payload": { "id": img_id, "category": category, "isDeleted": False if restore else None }
    })
    return {"status": "ok"}

@app.patch("/images/toggle-favorite/{image_id}")
async def toggle_favorite(image_id: str):
    conn = get_db_connection()
    img = conn.execute("SELECT isFavorite, isDeleted FROM images WHERE id = ?", (image_id,)).fetchone()
    
    if not img:
        conn.close()
        raise HTTPException(404, "Image not found")
    if img["isDeleted"]:
        conn.close()
        raise HTTPException(400, "Deleted image cannot be favorited")

    new_fav_status = not img["isFavorite"]
    conn.execute("UPDATE images SET isFavorite = ? WHERE id = ?", (1 if new_fav_status else 0, image_id))
    conn.commit()
    conn.close()

    await manager.broadcast({
        "type": "FAVORITE_TOGGLED",
        "payload": { "id": image_id, "isFavorite": new_fav_status }
    })
    return {"status": "success", "id": image_id, "isFavorite": new_fav_status}

@app.post("/images/{img_id}/proxy-enable")
async def enable_proxy(img_id: str):
    conn = get_db_connection()
    img = conn.execute("SELECT originalUrl FROM images WHERE id = ?", (img_id,)).fetchone()
    
    if not img:
        conn.close()
        raise HTTPException(status_code=404, detail="Image not found")

    encoded_url = urllib.parse.quote(img["originalUrl"], safe='')
    proxy_url = f"http://127.0.0.1:8000/proxy/image?url={encoded_url}"

    conn.execute("UPDATE images SET isCORS = 1, ProxyUrl = ? WHERE id = ?", (proxy_url, img_id))
    conn.commit()
    
    updated_img = dict(conn.execute("SELECT * FROM images WHERE id = ?", (img_id,)).fetchone())
    conn.close()
    
    return updated_img
    
@app.delete("/empty-trash")
async def empty_trash():
    conn = get_db_connection()
    
    safe_images = conn.execute("SELECT SafePath FROM images WHERE isDeleted = 1 AND isSafe = 1").fetchall()
    for img in safe_images:
        safe_path = os.path.normpath(img["SafePath"])
        try:
            if os.path.exists(safe_path):
                os.remove(safe_path)
                logger.info(f"🗑️ Deleted from disk: {safe_path}")
        except Exception as e:
            logger.error(f"⚠️ Error deleting file ( {safe_path} ): {e}")

    conn.execute("DELETE FROM images WHERE isDeleted = 1")
    conn.commit()
    conn.close()

    await manager.broadcast({"type": "TRASH_EMPTIED"})
    return {"message": "Trash emptied and physical files deleted"}

@app.delete("/images/permanent-delete/{img_id}")
async def permanent_delete(img_id: str):
    conn = get_db_connection()
    img = conn.execute("SELECT isSafe, SafePath FROM images WHERE id = ?", (img_id,)).fetchone()
    
    if not img:
        conn.close()
        raise HTTPException(status_code=404, detail="Image not found")

    if img["isSafe"] and img["SafePath"]:
        safe_path = os.path.normpath(img["SafePath"])
        try:
            if os.path.exists(safe_path):
                os.remove(safe_path)
                logger.info(f"🗑️ File deleted from disk: {safe_path}")
        except Exception as e:
            logger.error(f"⚠️ Error deleting file: {e}")

    conn.execute("DELETE FROM images WHERE id = ?", (img_id,))
    conn.commit()
    conn.close()
    
    await manager.broadcast({
        "type": "IMAGE_PERMANENTLY_DELETED",
        "payload": { "id": img_id }
    })
    
    return {"status": "success", "message": "Image and local file deleted"}

@app.patch("/images/{image_id}/trash")
async def move_image_to_trash(image_id: str):
    conn = get_db_connection()
    img = conn.execute("SELECT isFavorite FROM images WHERE id = ?", (image_id,)).fetchone()
    
    if not img:
        conn.close()
        raise HTTPException(404, "Image not found")
    if img["isFavorite"]:
        conn.close()
        raise HTTPException(400, "Favorites cannot be deleted")

    conn.execute("UPDATE images SET isDeleted = 1 WHERE id = ?", (image_id,))
    conn.commit()
    conn.close()

    await manager.broadcast({
        "type": "IMAGE_TRASHED",
        "payload": { "id": image_id }
    })
    return { "status": "trashed" }

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    logger.info("✅ WS connected")
    try:
        while True:
            msg = await websocket.receive_text()
    except Exception as e:
        logger.info(f"❌ WS disconnected: {e}")
        manager.disconnect(websocket)

@app.get("/safe-file")
async def get_safe_file(path: str):
    safe_path = os.path.normpath(path)
    if os.path.exists(safe_path):
        return FileResponse(safe_path)
    return {"error": "File not found"}

@app.get("/proxy/image")
async def proxy_image(url: str):
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        "Referer": "https://www.instagram.com/",
        "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    }
    try:
        async with AsyncClient(follow_redirects=True, timeout=20) as client:
            resp = await client.get(url, headers=headers)
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail="Image fetch failed")
        content_type = resp.headers.get("content-type", "image/jpeg")
        return Response(content=resp.content, media_type=content_type, headers={"Cache-Control": "public, max-age=86400"})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.patch("/images/{image_id}/mark-dead")
async def mark_image_dead(image_id: str):
    conn = get_db_connection()
    conn.execute("UPDATE images SET isDead = 1, isFavorite = 0 WHERE id = ?", (image_id,))
    conn.commit()
    conn.close()

    await manager.broadcast({
        "type": "IMAGE_UPDATED",
        "payload": { "id": image_id, "isDead": True, "isFavorite": False }
    })
    return {"status": "marked_dead"}

@app.get("/check-image")
async def check_image(url: str):
    conn = get_db_connection()
    
    base_part = url.split('?')[0]
    
    if "image" in base_part.lower():
        search_url = url
    else:
        search_url = base_part
        
    row = conn.execute("SELECT id FROM images WHERE originalUrl LIKE ?", (f"{search_url}%",)).fetchone()
    conn.close()
    
    if row:
        return {"exists": True}
    return {"exists": False}

async def create_thumbnail(url: str, img_id: str):
    logger.info(f"🔄 Arkaplanda thumbnail indirmesi başladı: {img_id}")
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": "https://www.instagram.com/",
            "Sec-Fetch-Dest": "image",
            "Sec-Fetch-Mode": "no-cors",
            "Sec-Fetch-Site": "cross-site",
        }
        async with AsyncClient(follow_redirects=True, timeout=20) as client:
            resp = await client.get(url, headers=headers)
            
        logger.debug(f"📥 Thumbnail GET isteği sonucu: {resp.status_code}")
        if resp.status_code == 200:
            def process_image(data):
                # 1. Main Color Extraction
                main_color_hex = None
                try:
                    ct = ColorThief(io.BytesIO(data))
                    main_color_rgb = ct.get_color(quality=1)
                    main_color_hex = '#%02x%02x%02x' % main_color_rgb
                    
                    conn = get_db_connection()
                    conn.execute("UPDATE images SET mainColor = ? WHERE id = ?", (main_color_hex, img_id))
                    conn.commit()
                    conn.close()
                except Exception as ce:
                    logger.warning(f"⚠️ Main color could not be extracted: {ce}")

                img = Image.open(io.BytesIO(data))
                if img.mode != 'RGB':
                    img = img.convert('RGB')
                
                # Uzun kenarı 300 yap, diğerini oranla
                max_size = 300
                width, height = img.size
                if width > height:
                    new_width = max_size
                    new_height = int((max_size / width) * height)
                else:
                    new_height = max_size
                    new_width = int((max_size / height) * width)
                    
                if new_width == 0: new_width = 1
                if new_height == 0: new_height = 1
                    
                img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
                
                # 5px Blur uygula
                img = img.filter(ImageFilter.GaussianBlur(5))
                
                save_path = os.path.join(THUMB_STORAGE, f"{img_id}.jpg")
                img.save(save_path, "JPEG", quality=85)
                logger.info(f"💾 Thumbnail başarıyla dosyaya yazıldı: {save_path}")
                return main_color_hex

            extracted_color = await asyncio.to_thread(process_image, resp.content)
            if extracted_color:
                await manager.broadcast({
                    "type": "IMAGE_UPDATED",
                    "payload": { "id": img_id, "mainColor": extracted_color }
                })
            logger.info(f"✅ Thumbnail created for {img_id}")
        else:
            logger.warning(f"⚠️ Thumbnail indirilemedi! Durum Kodu: {resp.status_code} - Link: {url}")
    except Exception as e:
        logger.error(f"❌ Failed to create thumbnail for {img_id}: {e}")

@app.get("/thumbnail/{img_id}")
async def get_thumbnail(img_id: str):
    thumb_path = os.path.join(THUMB_STORAGE, f"{img_id}.jpg")
    if os.path.exists(thumb_path):
        return FileResponse(thumb_path)
    return {"error": "Thumbnail not found"}

@app.post("/images/{img_id}/extract-colors")
async def extract_colors(img_id: str):
    conn = get_db_connection()
    img = conn.execute("SELECT originalUrl, colors FROM images WHERE id = ?", (img_id,)).fetchone()
    if not img:
        conn.close()
        raise HTTPException(404, "Image not found")
        
    if img["colors"]:
        conn.close()
        return {"colors": json.loads(img["colors"])}
        
    url = img["originalUrl"]
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        "Referer": "https://www.instagram.com/",
    }
    try:
        async with AsyncClient(follow_redirects=True, timeout=20) as client:
            resp = await client.get(url, headers=headers)
            
        if resp.status_code == 200:
            def get_palette(data):
                ct = ColorThief(io.BytesIO(data))
                palette_rgb = ct.get_palette(color_count=6, quality=1)
                return ['#%02x%02x%02x' % c for c in palette_rgb[:5]]
                
            hex_colors = await asyncio.to_thread(get_palette, resp.content)
            colors_json = json.dumps(hex_colors)
            
            conn.execute("UPDATE images SET colors = ? WHERE id = ?", (colors_json, img_id))
            conn.commit()
            conn.close()
            
            await manager.broadcast({
                "type": "IMAGE_UPDATED",
                "payload": { "id": img_id, "colors": colors_json }
            })
            return {"colors": hex_colors}
        else:
            conn.close()
            raise HTTPException(500, "Image fetch failed")
    except Exception as e:
        conn.close()
        raise HTTPException(500, f"Color extraction failed: {str(e)}")

# =====================
# SYSTEM TRAY LOGIC
# =====================
def run_tray(port):
    icon_path = resource_path("icon.png")
    if not os.path.exists(icon_path):
        # Fallback if icon is missing
        image = Image.new('RGB', (64, 64), color = (37, 99, 235))
    else:
        image = Image.open(icon_path)

    def on_quit(icon, item):
        icon.stop()
        os._exit(0)

    def on_open_dashboard(icon, item):
        webbrowser.open(f"http://127.0.0.1:{port}")

    menu = pystray.Menu(
        pystray.MenuItem("Open Dashboard", on_open_dashboard),
        pystray.MenuItem("Quit", on_quit)
    )
    
    icon = pystray.Icon("MorgiFile", image, "MorgiFile Server", menu)
    icon.run()

# Mount Static Files (Dashboard)
@app.get("/")
async def read_index():
    index_path = os.path.join(resource_path("dist"), "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"error": "Dashboard index.html not found", "path": index_path}

dist_path = resource_path("dist")
print(f"DEBUG: Dist yolu araniyor: {dist_path}")
if os.path.exists(dist_path):
    app.mount("/", StaticFiles(directory=dist_path, html=True), name="static")
    print(f"DEBUG: Dashboard basariyla yuklendi.")
else:
    print(f"DEBUG ERROR: Dashboard klasoru BULUNAMADI!")

def find_available_port(start_port=8000, max_port=8050):
    last_port = start_port
    
    # Try reading from config
    if os.path.exists(PORT_CONFIG_FILE):
        try:
            with open(PORT_CONFIG_FILE, "r") as f:
                data = json.load(f)
                last_port = data.get("last_port", start_port)
        except Exception:
            pass
            
    # Function to check if a port is open
    def is_port_open(port):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            return s.connect_ex(('127.0.0.1', port)) != 0
            
    # Try the last successful port first
    if is_port_open(last_port):
        return last_port
        
    # Scan range
    for port in range(start_port, max_port + 1):
        if is_port_open(port):
            return port
            
    # Fallback to random OS port
    return 0

if __name__ == "__main__":
    import uvicorn
    
    actual_port = find_available_port()
    
    if actual_port != 0:
        try:
            with open(PORT_CONFIG_FILE, "w") as f:
                json.dump({"last_port": actual_port}, f)
        except Exception:
            pass
    
    def start_server():
        uvicorn.run(app, host="127.0.0.1", port=actual_port, log_level="info")

    server_thread = threading.Thread(target=start_server, daemon=True)
    server_thread.start()
    
    # Wait slightly to ensure server thread starts before getting actual port if it was 0 (though uvicorn handles 0 internally, we won't know it easily. In our case it rarely reaches 0).
    time.sleep(0.5)
    
    # Run tray in the main thread (required for Windows)
    run_tray(actual_port)
