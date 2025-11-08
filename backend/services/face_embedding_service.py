"""Local face embedding and identification fallback.

This module provides a minimal pipeline using facenet-pytorch (MTCNN + InceptionResnetV1)
to compute 512-D face embeddings and perform cosine-similarity-based identification.

Storage options:
- If SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set, embeddings are stored in a
  Supabase table `face_embeddings` with columns:
    - id: uuid (default gen_random_uuid())
    - user_id: text
    - embedding: jsonb (array of floats)
    - created_at: timestamptz default now()
- Otherwise, embeddings are stored in backend/data/embeddings.json as a simple list.

This keeps the app runnable even without Azure PersonGroup recognition access.
"""

from __future__ import annotations
from typing import Any, Dict, List, Optional, Tuple
import io
import json
import math
import os
from pathlib import Path

import httpx

# Lazy imports for heavy deps so the app can start without them
_lazy_deps_loaded = False
_torch = None
_np = None
_Image = None
_MTCNN = None
_InceptionResnetV1 = None


def _load_deps():
    global _lazy_deps_loaded, _torch, _np, _Image, _MTCNN, _InceptionResnetV1
    if _lazy_deps_loaded:
        return
    try:
        import torch as _torch_mod  # type: ignore
        import numpy as _np_mod  # type: ignore
        from PIL import Image as _Image_mod  # type: ignore
        from facenet_pytorch import MTCNN as _MTCNN_mod, InceptionResnetV1 as _IR_mod  # type: ignore
    except Exception as e:
        raise RuntimeError(
            "Local embedding dependencies missing. Install: pip install torch torchvision facenet-pytorch pillow numpy"
        ) from e
    _torch = _torch_mod
    _np = _np_mod
    _Image = _Image_mod
    _MTCNN = _MTCNN_mod
    _InceptionResnetV1 = _IR_mod
    _lazy_deps_loaded = True


class FaceEmbedder:
    def __init__(self, device: Optional[str] = None) -> None:
        _load_deps()
        if device is None:
            device = "cuda" if _torch.cuda.is_available() else "cpu"
        self.device = device
        self.mtcnn = _MTCNN(keep_all=True, device=self.device)
        self.model = _InceptionResnetV1(pretrained='vggface2').eval().to(self.device)

    def embed_image(self, image_bytes: bytes) -> Optional[List[float]]:
        """Return a 512-D embedding for the largest detected face, or None if no face."""
        img = _Image.open(io.BytesIO(image_bytes)).convert("RGB")
        boxes, probs = self.mtcnn.detect(img)
        if boxes is None or len(boxes) == 0:
            return None
        # Pick largest box
        areas = [max(0.0, float((x2 - x1) * (y2 - y1))) for (x1, y1, x2, y2) in boxes]
        idx = int(max(range(len(areas)), key=lambda i: areas[i]))
        # Extract aligned face using MTCNN forward to get exact cropped tensor
        faces = self.mtcnn(img)
        if faces is None or faces.shape[0] == 0:
            return None
        face_tensor = faces[idx].unsqueeze(0).to(self.device)
        with _torch.no_grad():
            emb = self.model(face_tensor).cpu().numpy()[0]
        # Normalize to unit length
        norm = float(_np.linalg.norm(emb))
        if norm == 0.0:
            return emb.astype(float).tolist()
        return (emb / norm).astype(float).tolist()


def cosine_similarity(a: List[float], b: List[float]) -> float:
    _load_deps()
    va = _np.asarray(a, dtype=_np.float32)
    vb = _np.asarray(b, dtype=_np.float32)
    denom = (float(_np.linalg.norm(va)) * float(_np.linalg.norm(vb)))
    if denom == 0.0:
        return 0.0
    return float(va.dot(vb) / denom)


# Storage helpers
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
LOCAL_EMB_PATH = Path(__file__).resolve().parent.parent / "data" / "embeddings.json"
LOCAL_EMB_PATH.parent.mkdir(parents=True, exist_ok=True)


async def save_embedding(user_id: str, embedding: List[float]) -> Dict[str, Any]:
    if SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY:
        async with httpx.AsyncClient(timeout=20.0) as c:
            url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/face_embeddings"
            headers = {
                "apikey": SUPABASE_SERVICE_ROLE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
                "Content-Type": "application/json",
                "Prefer": "return=representation",
            }
            payload = {"user_id": user_id, "embedding": embedding}
            r = await c.post(url, json=payload, headers=headers)
            if r.status_code < 400:
                return {"status_code": r.status_code, "body": _safe_json(r.text)}
            # Fallback to local on RLS/authorization or any error
            supabase_error = {"status_code": r.status_code, "body": _safe_json(r.text)}
            items = _read_local()
            items.append({"user_id": user_id, "embedding": embedding})
            _write_local(items)
            return {"status_code": 200, "body": {"stored": "local", "supabase_error": supabase_error}}
    # Local fallback
    items = _read_local()
    items.append({"user_id": user_id, "embedding": embedding})
    _write_local(items)
    return {"status_code": 200, "body": {"stored": "local"}}


async def load_all_embeddings() -> List[Dict[str, Any]]:
    if SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY:
        async with httpx.AsyncClient(timeout=20.0) as c:
            url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/face_embeddings?select=user_id,embedding,created_at"
            headers = {
                "apikey": SUPABASE_SERVICE_ROLE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
            }
            r = await c.get(url, headers=headers)
            # On any Supabase error, fallback to local
            if r.status_code >= 400:
                local_items = _read_local()
                return local_items
            data = _safe_json(r.text)
            if isinstance(data, list) and len(data) > 0:
                return data
            # If Supabase returns empty, try local fallback (e.g., previous local enrolls)
            local_items = _read_local()
            return local_items
    # No Supabase configured: use local
    return _read_local()


def _safe_json(text: str) -> Any:
    try:
        return json.loads(text)
    except Exception:
        return text


def _read_local() -> List[Dict[str, Any]]:
    if not LOCAL_EMB_PATH.exists():
        return []
    try:
        return json.loads(LOCAL_EMB_PATH.read_text(encoding="utf-8"))
    except Exception:
        return []


def _write_local(items: List[Dict[str, Any]]) -> None:
    try:
        LOCAL_EMB_PATH.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception:
        pass


async def enroll_local(user_id: str, image_bytes: bytes) -> Dict[str, Any]:
    embedder = FaceEmbedder()
    emb = embedder.embed_image(image_bytes)
    if emb is None:
        return {"ok": False, "reason": "no_face_detected"}
    store = await save_embedding(user_id, emb)
    return {"ok": True, "dim": len(emb), "storage": store}


async def identify_local(image_bytes: bytes, top_k: int = 3, threshold: float = 0.6) -> Dict[str, Any]:
    embedder = FaceEmbedder()
    query = embedder.embed_image(image_bytes)
    if query is None:
        return {"ok": False, "reason": "no_face_detected"}
    items = await load_all_embeddings()
    scored: List[Tuple[str, float]] = []
    for it in items:
        uid = it.get("user_id")
        vec = it.get("embedding")
        if not uid or not isinstance(vec, list):
            continue
        sim = cosine_similarity(query, vec)
        scored.append((uid, sim))
    scored.sort(key=lambda x: x[1], reverse=True)
    top = scored[: max(1, top_k)]
    results = [
        {"user_id": uid, "similarity": round(float(sim), 4), "match": bool(sim >= threshold)} for uid, sim in top
    ]
    return {"ok": True, "results": results, "threshold": threshold}

async def detect_faces_local(image_bytes: bytes) -> Dict[str, Any]:
    """Return bounding boxes (x1,y1,x2,y2) and probabilities using MTCNN only."""
    embedder = FaceEmbedder()
    img = _Image.open(io.BytesIO(image_bytes)).convert("RGB")
    boxes, probs = embedder.mtcnn.detect(img)
    results = []
    if boxes is not None and probs is not None:
        for b, p in zip(boxes, probs):
            if b is None:
                continue
            x1, y1, x2, y2 = [float(v) for v in b]
            results.append({"box": [x1, y1, x2, y2], "prob": float(p) if p is not None else None})
    return {"ok": True, "count": len(results), "faces": results}
