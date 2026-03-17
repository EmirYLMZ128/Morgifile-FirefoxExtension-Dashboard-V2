import os
import uuid
import urllib.parse
from typing import Optional, List
import asyncio
import time
import shutil
import pathlib
import requests
from httpx import AsyncClient
from fastapi import FastAPI, HTTPException, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, FileResponse
from pydantic import BaseModel
import sqlite3

# =====================
# APP SETUP
# =====================
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_FILE = os.path.join(os.path.dirname(__file__), "morgifile.db")
DOWNLOADS_PATH = str(os.path.join(pathlib.Path.home(), "Downloads"))
SAFE_STORAGE = os.path.join(os.getenv('APPDATA'), 'MorgiFile', 'Safe')
os.makedirs(SAFE_STORAGE, exist_ok=True)

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

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS images (
            id TEXT PRIMARY KEY,
            site TEXT,
            originalUrl TEXT,
            ProxyUrl TEXT,
            SafePath TEXT,
            category TEXT,
            width INTEGER,
            height INTEGER,
            isFavorite BOOLEAN,
            isDeleted BOOLEAN,
            isDead BOOLEAN,
            isCORS BOOLEAN,
            isSafe BOOLEAN
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS categories (
            name TEXT PRIMARY KEY,
            isSystem BOOLEAN DEFAULT 0
        )
    ''')

    cursor.execute('''
        INSERT OR IGNORE INTO categories (name, isSystem) 
        VALUES ('Uncategorized Favorites', 1)
    ''')

    cursor.execute('''
        INSERT OR IGNORE INTO categories (name, isSystem) 
        VALUES ('Empty Cat1', 0)
    ''')

    conn.commit()
    conn.close()
    print("✅ Database engine ready (SQLite)!")

init_db()

# =====================
# SCHEMAS
# =====================
class ImageSaveSchema(BaseModel):
    site: str
    originalUrl: str
    category: str
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
        
        # Move file (Using await to_thread prevents blocking the server)
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
        # 1. AKILLI DUPLICATE CHECK (Sadece ? işaretinden önceki saf linki ara)
        base_url = data.originalUrl.split('?')[0]
        
        # SQL'de LIKE kullanarak "Bu saf linkle başlayan herhangi bir kayıt var mı?" diyoruz
        existing = conn.execute(
            "SELECT id FROM images WHERE originalUrl LIKE ?", 
            (f"{base_url}%",)
        ).fetchone()
        
        if existing:
            conn.close()
            return {"status": "already_exists", "message": "This image is already saved."}

        new_id = str(uuid.uuid4())
        conn.execute('''
            INSERT INTO images (
                id, site, originalUrl, ProxyUrl, SafePath, category, 
                width, height, isFavorite, isDeleted, isDead, isCORS, isSafe
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            new_id, data.site, data.originalUrl, "", "", data.category,
            data.width, data.height, False, False, False, False, False
        ))
        conn.commit()

        new_entry = dict(conn.execute("SELECT * FROM images WHERE id = ?", (new_id,)).fetchone())
        conn.close()

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
        # Convert all rows to dict and send to frontend
        return [dict(row) for row in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not read data: {str(e)}")

@app.get("/categories")
async def get_categories():
    conn = get_db_connection()
    # Now fetching the isSystem flag as well
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
    return {"status": "deleted", "affected": related_count}

@app.patch("/categories/rename")
async def rename_category(data: CategoryRenameSchema):
    old = data.oldName.strip()
    new = data.newName.strip()
    if not old or not new:
        raise HTTPException(400, "Category name cannot be empty")

    conn = get_db_connection()
    
    # 🛡️ GÜVENLİK DUVARI BURAYA GELDİ: Sistem kategorisi adı değiştirilemez!
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
    conn.close()

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

    # 🚀 DIŞ SERVİSİ (weserv.nl) SİLDİK, KENDİ LOKAL PROXY'MİZİ YAZIYORUZ
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
                print(f"🗑️ Deleted from disk: {safe_path}")
        except Exception as e:
            print(f"⚠️ Error deleting file ( {safe_path} ): {e}")

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
                print(f"🗑️ File deleted from disk: {safe_path}")
        except Exception as e:
            print(f"⚠️ Error deleting file: {e}")

    conn.execute("DELETE FROM images WHERE id = ?", (img_id,))
    conn.commit()
    conn.close()
    
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
    print("✅ WS connected")
    try:
        while True:
            msg = await websocket.receive_text()
    except Exception as e:
        print("❌ WS disconnected:", e)
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
    # Görseli ölü (isDead=1) olarak işaretle
    conn.execute("UPDATE images SET isDead = 1 WHERE id = ?", (image_id,))
    conn.commit()
    conn.close()

    # Tüm ekranlara "Görsel öldü, onu mezarlığa taşıyın" mesajı yolla
    await manager.broadcast({
        "type": "IMAGE_UPDATED",
        "payload": { "id": image_id, "isDead": True }
    })
    return {"status": "marked_dead"}

@app.get("/check-image")
async def check_image(url: str):
    conn = get_db_connection()
    
    # Eklentiden gelen sorgularda da sadece saf linki (Base URL) arıyoruz
    base_url = url.split('?')[0]
    row = conn.execute("SELECT id FROM images WHERE originalUrl LIKE ?", (f"{base_url}%",)).fetchone()
    
    conn.close()
    if row:
        return {"exists": True}
    return {"exists": False}

# =====================
# DEV ENTRY
# =====================
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
