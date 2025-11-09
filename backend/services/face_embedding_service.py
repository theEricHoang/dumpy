"""Local face embedding and identification fallback.

This module provides a minimal pipeline using facenet-pytorch (MTCNN + InceptionResnetV1)
to compute 512-D face embeddings and perform cosine-similarity-based identification.

Storage options:
- If SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set, embeddings are stored in a
    Supabase table `face_embeddings` with columns:
        - id: uuid (default gen_random_uuid())
        - user_id: integer (FK → users.id)
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
_HEIF_AVAILABLE = False
FACE_DEBUG = os.getenv("FACE_DEBUG", "").lower() in ("1", "true", "yes")


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
    # Register HEIC/HEIF opener if pillow-heif is available, so PIL.Image.open works for HEIC
    global _HEIF_AVAILABLE
    try:
        import pillow_heif  # type: ignore
        pillow_heif.register_heif_opener()
        _HEIF_AVAILABLE = True
    except Exception:
        _HEIF_AVAILABLE = False
    _lazy_deps_loaded = True


def _open_image_bytes_rgb(image_bytes: bytes):
    """Open image bytes into a PIL RGB image with HEIC/HEIF fallback if available."""
    _load_deps()
    # Quick sniff: HEIF files often contain 'ftypheic'/'ftypheif'/'ftypheix' in header
    header = image_bytes[:64]
    looks_heif = any(sig in header for sig in (b"ftypheic", b"ftypheif", b"ftypheix", b"ftypmif1", b"ftypmsf1"))
    if _HEIF_AVAILABLE and looks_heif:
        try:
            import pillow_heif  # type: ignore
            heif_file = pillow_heif.read_heif(image_bytes)
            from PIL import Image as _PILImage  # type: ignore
            img = _PILImage.frombytes(
                heif_file.mode,
                heif_file.size,
                heif_file.data,
                "raw",
                heif_file.mode,
                heif_file.stride,
            )
            try:
                # Apply EXIF orientation if present
                from PIL import ImageOps as _ImageOps  # type: ignore
                img = _ImageOps.exif_transpose(img)
            except Exception:
                pass
            return img.convert("RGB")
        except Exception as inner:
            # Fall back to PIL open if HEIF decode unexpectedly fails
            print(f"[WARN] HEIF sniff matched but decode failed: {inner}")
    try:
        img = _Image.open(io.BytesIO(image_bytes))
        try:
            from PIL import ImageOps as _ImageOps  # type: ignore
            img = _ImageOps.exif_transpose(img)
        except Exception:
            pass
        return img.convert("RGB")
    except Exception as e:
        # Try pillow-heif manual decode if registered opener didn't handle it
        if _HEIF_AVAILABLE:
            try:
                import pillow_heif  # type: ignore
                heif_file = pillow_heif.read_heif(image_bytes)
                from PIL import Image as _PILImage  # type: ignore
                img = _PILImage.frombytes(
                    heif_file.mode,
                    heif_file.size,
                    heif_file.data,
                    "raw",
                    heif_file.mode,
                    heif_file.stride,
                )
                try:
                    from PIL import ImageOps as _ImageOps  # type: ignore
                    img = _ImageOps.exif_transpose(img)
                except Exception:
                    pass
                return img.convert("RGB")
            except Exception as inner:
                raise RuntimeError(
                    f"Unsupported or corrupted image format (HEIF decode failed: {inner})"
                ) from e
        # No HEIF available, surface a clear error
        raise RuntimeError(f"Unsupported or corrupted image format: {str(e)}") from e


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
        img = _open_image_bytes_rgb(image_bytes)
        boxes, probs = self.mtcnn.detect(img)
        if (boxes is None or len(boxes) == 0) and max(img.size) > 2000:
            # Downscale very large images to improve MTCNN detection reliability
            scale = 1600.0 / float(max(img.size))
            new_wh = (max(1, int(img.size[0] * scale)), max(1, int(img.size[1] * scale)))
            if FACE_DEBUG:
                print(f"[FACE_DEBUG] embed_image: initial detect failed on {img.size}, retrying at {new_wh}")
            img_small = img.resize(new_wh)
            boxes, probs = self.mtcnn.detect(img_small)
            if boxes is not None and len(boxes) > 0:
                img = img_small
        if (boxes is None or len(boxes) == 0):
            # Contrast boost fallback for low-light / low-contrast images
            try:
                from PIL import ImageEnhance as _ImageEnhance  # type: ignore
                enhancer = _ImageEnhance.Contrast(img)
                img_boost = enhancer.enhance(1.6)
                boxes, probs = self.mtcnn.detect(img_boost)
                if boxes is not None and len(boxes) > 0:
                    img = img_boost
                    if FACE_DEBUG:
                        print("[FACE_DEBUG] embed_image: contrast boost succeeded")
            except Exception:
                pass
        if FACE_DEBUG:
            try:
                print(f"[FACE_DEBUG] embed_image: boxes={0 if boxes is None else len(boxes)}, probs={[] if probs is None else [round(float(p),4) for p in probs]}")
            except Exception:
                pass
        if boxes is None or len(boxes) == 0:
            return None
        # Pick largest box
        areas = [max(0.0, float((x2 - x1) * (y2 - y1))) for (x1, y1, x2, y2) in boxes]
        idx = int(max(range(len(areas)), key=lambda i: areas[i]))
        # Extract aligned face from the chosen box to guarantee index alignment
        faces = self.mtcnn.extract(img, boxes, save_path=None)
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

    def embed_all_faces(self, image_bytes: bytes) -> List[Dict[str, Any]]:
        """
        Return embeddings for all detected faces with their boxes and probs.
        Output: [{"box": [x1,y1,x2,y2], "prob": float, "embedding": [512 floats]}]
        """
        img = _open_image_bytes_rgb(image_bytes)
        boxes, probs = self.mtcnn.detect(img)
        if (boxes is None or len(boxes) == 0) and max(img.size) > 2000:
            scale = 1600.0 / float(max(img.size))
            new_wh = (max(1, int(img.size[0] * scale)), max(1, int(img.size[1] * scale)))
            if FACE_DEBUG:
                print(f"[FACE_DEBUG] embed_all_faces: initial detect failed on {img.size}, retrying at {new_wh}")
            img_small = img.resize(new_wh)
            boxes, probs = self.mtcnn.detect(img_small)
            if boxes is not None and len(boxes) > 0:
                img = img_small
        if (boxes is None or len(boxes) == 0):
            # Contrast boost fallback
            try:
                from PIL import ImageEnhance as _ImageEnhance  # type: ignore
                enhancer = _ImageEnhance.Contrast(img)
                img_boost = enhancer.enhance(1.6)
                boxes, probs = self.mtcnn.detect(img_boost)
                if boxes is not None and len(boxes) > 0:
                    img = img_boost
                    if FACE_DEBUG:
                        print("[FACE_DEBUG] embed_all_faces: contrast boost succeeded")
            except Exception:
                pass
        if FACE_DEBUG:
            try:
                print(f"[FACE_DEBUG] embed_all_faces: boxes={0 if boxes is None else len(boxes)}, probs={[] if probs is None else [round(float(p),4) for p in probs]}")
            except Exception:
                pass
        if boxes is None or len(boxes) == 0:
            return []
        # Extract aligned faces using the same detected boxes to keep order consistent
        faces = self.mtcnn.extract(img, boxes, save_path=None)
        if faces is None or faces.shape[0] == 0:
            return []
        faces = faces.to(self.device)
        with _torch.no_grad():
            embs = self.model(faces).cpu().numpy()
        # Normalize each
        results: List[Dict[str, Any]] = []
        for i in range(embs.shape[0]):
            vec = embs[i]
            norm = float(_np.linalg.norm(vec))
            if norm != 0.0:
                vec = (vec / norm)
            b = boxes[i]
            p = probs[i] if probs is not None and i < len(probs) else None
            x1, y1, x2, y2 = [float(v) for v in b]
            results.append({
                "box": [x1, y1, x2, y2],
                "prob": float(p) if p is not None else None,
                "embedding": vec.astype(float).tolist(),
            })
        return results


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


async def save_embedding(user_id: int, embedding: List[float]) -> Dict[str, Any]:
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


async def enroll_local(user_id: int, image_bytes: bytes) -> Dict[str, Any]:
    embedder = FaceEmbedder()
    emb = embedder.embed_image(image_bytes)
    if emb is None:
        return {"ok": False, "reason": "no_face_detected"}
    store = await save_embedding(user_id, emb)
    return {"ok": True, "dim": len(emb), "storage": store}


async def enroll_local_batch(user_id: int, images: List[bytes]) -> Dict[str, Any]:
    """Enroll multiple images for a user. Skips images with no detectable face."""
    embedder = FaceEmbedder()
    success = 0
    failures: int = 0
    reasons: List[str] = []
    for img in images:
        emb = embedder.embed_image(img)
        if emb is None:
            failures += 1
            reasons.append("no_face_detected")
            continue
        _ = await save_embedding(user_id, emb)
        success += 1
    return {"ok": True, "enrolled": success, "skipped": failures}


async def identify_local(
    image_bytes: bytes,
    top_k: int = 3,
    threshold: float = 0.6,
    filter_matches: bool = False,
    auto_enroll_on_identify: bool = False,
    auto_enroll_min_similarity: float = 0.85,
) -> Dict[str, Any]:
    embedder = FaceEmbedder()
    query = embedder.embed_image(image_bytes)
    if query is None:
        return {"ok": False, "reason": "no_face_detected"}
    items = await load_all_embeddings()
    scored: List[Tuple[int, float]] = []
    for it in items:
        uid = it.get("user_id")
        vec = it.get("embedding")
        if uid is None or not isinstance(vec, list):
            continue
        sim = cosine_similarity(query, vec)
        scored.append((uid, sim))
    scored.sort(key=lambda x: x[1], reverse=True)
    top = scored[: max(1, top_k)]
    results = [
        {"user_id": uid, "similarity": round(float(sim), 4), "match": bool(sim >= threshold)} for uid, sim in top
    ]
    if filter_matches:
        results = [r for r in results if r["match"]]

    auto_enrolled: Optional[int] = None
    if auto_enroll_on_identify and results:
        # Take top-1 before filtering (already sorted) and enroll if similarity meets criterion
        best = results[0]
        if best["similarity"] >= auto_enroll_min_similarity:
            # Reuse the query embedding; store another copy for that user
            await save_embedding(best["user_id"], query)
            auto_enrolled = best["user_id"]
    return {"ok": True, "results": results, "threshold": threshold, "auto_enrolled_user_id": auto_enrolled}


def _group_by_user_max(scored: List[Tuple[int, float]]) -> List[Tuple[int, float]]:
    """Aggregate multiple embeddings per user by max similarity."""
    best: Dict[int, float] = {}
    for uid, sim in scored:
        if uid not in best or sim > best[uid]:
            best[uid] = sim
    return sorted(best.items(), key=lambda x: x[1], reverse=True)


async def identify_local_grouped(
    image_bytes: bytes,
    top_k: int = 3,
    threshold: float = 0.6,
    filter_matches: bool = False,
    auto_enroll_on_identify: bool = False,
    auto_enroll_min_similarity: float = 0.85,
) -> Dict[str, Any]:
    embedder = FaceEmbedder()
    query = embedder.embed_image(image_bytes)
    if query is None:
        return {"ok": False, "reason": "no_face_detected"}
    items = await load_all_embeddings()
    scored: List[Tuple[int, float]] = []
    for it in items:
        uid = it.get("user_id")
        vec = it.get("embedding")
        if uid is None or not isinstance(vec, list):
            continue
        sim = cosine_similarity(query, vec)
        scored.append((uid, sim))
    grouped = _group_by_user_max(scored)
    top = grouped[: max(1, top_k)]
    results = [
        {"user_id": uid, "similarity": round(float(sim), 4), "match": bool(sim >= threshold)} for uid, sim in top
    ]
    if filter_matches:
        results = [r for r in results if r["match"]]

    auto_enrolled: Optional[int] = None
    if auto_enroll_on_identify and results:
        best = results[0]
        if best["similarity"] >= auto_enroll_min_similarity:
            await save_embedding(best["user_id"], query)
            auto_enrolled = best["user_id"]
    return {"ok": True, "results": results, "threshold": threshold, "auto_enrolled_user_id": auto_enrolled}

async def identify_multi_local(
    image_bytes: bytes,
    top_k_per_face: int = 3,
    threshold: float = 0.6,
    filter_matches: bool = False,
    min_prob: float = 0.0,
    auto_enroll_on_identify: bool = False,
    auto_enroll_min_similarity: float = 0.85,
    exclusive_assignment: bool = False,
) -> Dict[str, Any]:
    """
    Identify all faces in the image against stored embeddings.
    Returns one result block per detected face with its box, prob, and top_k matches.
    If exclusive_assignment=True, ensures that each user_id is assigned to at most one face
    (greedy by descending best similarity). Adds primary_user_id per face.
    """
    embedder = FaceEmbedder()
    faces = embedder.embed_all_faces(image_bytes)
    if min_prob > 0.0:
        faces = [f for f in faces if float(f.get("prob") or 0.0) >= float(min_prob)]
    if not faces:
        return {"ok": False, "reason": "no_face_detected", "faces": []}
    items = await load_all_embeddings()
    # First pass: collect matches per face without enrollment decisions
    interim: List[Dict[str, Any]] = []
    for f in faces:
        query_emb = f["embedding"]
        scored: List[Tuple[int, float]] = []
        for it in items:
            uid = it.get("user_id")
            vec = it.get("embedding")
            if uid is None or not isinstance(vec, list):
                continue
            sim = cosine_similarity(query_emb, vec)
            scored.append((uid, sim))
        scored.sort(key=lambda x: x[1], reverse=True)
        top = scored[: max(1, top_k_per_face)]
        matches = [
            {"user_id": uid, "similarity": round(float(sim), 4), "match": bool(sim >= threshold)}
            for uid, sim in top
        ]
        if filter_matches:
            matches = [m for m in matches if m["match"]]
        interim.append({
            "box": f.get("box"),
            "prob": f.get("prob"),
            "results": matches,
            "query_emb": query_emb,
        })

    # Exclusive assignment: ensure unique user assignment across faces.
    assigned: set[int] = set()
    # Order faces by highest similarity of first candidate (if any) for greedy assignment
    order = list(range(len(interim)))
    order.sort(key=lambda i: (interim[i]["results"][0]["similarity"] if interim[i]["results"] else -1.0), reverse=True)
    for idx in order:
        face_entry = interim[idx]
        primary_user_id: Optional[int] = None
        primary_similarity: Optional[float] = None
        if exclusive_assignment:
            # pick first candidate not already assigned (and matching threshold if filter_matches used)
            for cand in face_entry["results"]:
                uid = cand["user_id"]
                if uid in assigned:
                    continue
                # If filter_matches is False we still may want to require cand['match'] for assignment clarity
                if cand.get("match") or not filter_matches:
                    primary_user_id = uid
                    primary_similarity = cand["similarity"]
                    assigned.add(uid)
                    break
        else:
            # Non-exclusive: choose first matching candidate above threshold else first candidate
            for cand in face_entry["results"]:
                if cand.get("match"):
                    primary_user_id = cand["user_id"]
                    primary_similarity = cand["similarity"]
                    break
            if primary_user_id is None and face_entry["results"]:
                cand = face_entry["results"][0]
                primary_user_id = cand["user_id"]
                primary_similarity = cand["similarity"]
        face_entry["primary_user_id"] = primary_user_id
        face_entry["primary_similarity"] = primary_similarity

    # Second pass: apply auto-enroll decisions based on primary assignment
    final_results: List[Dict[str, Any]] = []
    for face_entry in interim:
        auto_enrolled: Optional[int] = None
        if auto_enroll_on_identify and face_entry.get("primary_user_id") is not None:
            sim_val = face_entry.get("primary_similarity") or 0.0
            if sim_val >= auto_enroll_min_similarity:
                await save_embedding(face_entry["primary_user_id"], face_entry["query_emb"])
                auto_enrolled = face_entry["primary_user_id"]
        final_results.append({
            "box": face_entry.get("box"),
            "prob": face_entry.get("prob"),
            "results": face_entry.get("results"),
            "primary_user_id": face_entry.get("primary_user_id"),
            "auto_enrolled_user_id": auto_enrolled,
        })
    return {"ok": True, "faces": final_results, "threshold": threshold, "exclusive_assignment": exclusive_assignment}


async def identify_multi_local_grouped(
    image_bytes: bytes,
    top_k_per_face: int = 3,
    threshold: float = 0.6,
    filter_matches: bool = False,
    min_prob: float = 0.0,
    auto_enroll_on_identify: bool = False,
    auto_enroll_min_similarity: float = 0.85,
    exclusive_assignment: bool = False,
) -> Dict[str, Any]:
    """Like identify_multi_local but groups multiple embeddings per user (max similarity).
    If exclusive_assignment=True, assigns each user_id to at most one face (greedy) and adds primary_user_id.
    """
    embedder = FaceEmbedder()
    faces = embedder.embed_all_faces(image_bytes)
    if min_prob > 0.0:
        faces = [f for f in faces if float(f.get("prob") or 0.0) >= float(min_prob)]
    if not faces:
        return {"ok": False, "reason": "no_face_detected", "faces": []}
    items = await load_all_embeddings()
    # First pass: collect matches per face without enrollment decisions
    interim: List[Dict[str, Any]] = []
    for f in faces:
        query_emb = f["embedding"]
        scored: List[Tuple[int, float]] = []
        for it in items:
            uid = it.get("user_id")
            vec = it.get("embedding")
            if uid is None or not isinstance(vec, list):
                continue
            sim = cosine_similarity(query_emb, vec)
            scored.append((uid, sim))
        grouped = _group_by_user_max(scored)
        top = grouped[: max(1, top_k_per_face)]
        matches = [
            {"user_id": uid, "similarity": round(float(sim), 4), "match": bool(sim >= threshold)}
            for uid, sim in top
        ]
        if filter_matches:
            matches = [m for m in matches if m["match"]]
        interim.append({
            "box": f.get("box"),
            "prob": f.get("prob"),
            "results": matches,
            "query_emb": query_emb,
        })

    assigned: set[int] = set()
    order = list(range(len(interim)))
    order.sort(key=lambda i: (interim[i]["results"][0]["similarity"] if interim[i]["results"] else -1.0), reverse=True)
    for idx in order:
        face_entry = interim[idx]
        primary_user_id: Optional[int] = None
        primary_similarity: Optional[float] = None
        if exclusive_assignment:
            for cand in face_entry["results"]:
                uid = cand["user_id"]
                if uid in assigned:
                    continue
                if cand.get("match") or not filter_matches:
                    primary_user_id = uid
                    primary_similarity = cand["similarity"]
                    assigned.add(uid)
                    break
        else:
            for cand in face_entry["results"]:
                if cand.get("match"):
                    primary_user_id = cand["user_id"]
                    primary_similarity = cand["similarity"]
                    break
            if primary_user_id is None and face_entry["results"]:
                cand = face_entry["results"][0]
                primary_user_id = cand["user_id"]
                primary_similarity = cand["similarity"]
        face_entry["primary_user_id"] = primary_user_id
        face_entry["primary_similarity"] = primary_similarity

    final_results: List[Dict[str, Any]] = []
    for face_entry in interim:
        auto_enrolled: Optional[int] = None
        if auto_enroll_on_identify and face_entry.get("primary_user_id") is not None:
            sim_val = face_entry.get("primary_similarity") or 0.0
            if sim_val >= auto_enroll_min_similarity:
                await save_embedding(face_entry["primary_user_id"], face_entry["query_emb"])
                auto_enrolled = face_entry["primary_user_id"]
        final_results.append({
            "box": face_entry.get("box"),
            "prob": face_entry.get("prob"),
            "results": face_entry.get("results"),
            "primary_user_id": face_entry.get("primary_user_id"),
            "auto_enrolled_user_id": auto_enrolled,
        })
    return {"ok": True, "faces": final_results, "threshold": threshold, "exclusive_assignment": exclusive_assignment}


async def auto_enroll_if_confident(image_bytes: bytes, min_similarity: float = 0.8, min_prob: float = 0.0) -> Dict[str, Any]:
    """If exactly one face is detected and the best grouped match >= min_similarity, enroll it."""
    embedder = FaceEmbedder()
    faces = embedder.embed_all_faces(image_bytes)
    # Apply probability filter if requested
    if min_prob > 0.0:
        faces = [f for f in faces if (f.get("prob") or 0.0) >= min_prob]
    if len(faces) != 1:
        return {"ok": False, "reason": "multiple_or_zero_faces", "count": len(faces)}
    query = faces[0]["embedding"]
    items = await load_all_embeddings()
    scored: List[Tuple[int, float]] = []
    for it in items:
        uid = it.get("user_id")
        vec = it.get("embedding")
        if uid is None or not isinstance(vec, list):
            continue
        sim = cosine_similarity(query, vec)
        scored.append((uid, sim))
    grouped = _group_by_user_max(scored)
    if not grouped:
        return {"ok": False, "reason": "no_reference_embeddings"}
    best_user, best_sim = grouped[0]
    if best_sim >= min_similarity:
        store = await save_embedding(best_user, query)
        return {"ok": True, "enrolled_user_id": best_user, "similarity": round(float(best_sim), 4), "storage": store}
    return {"ok": False, "reason": "low_similarity", "similarity": round(float(best_sim), 4)}

async def detect_faces_local(image_bytes: bytes) -> Dict[str, Any]:
    """Return bounding boxes (x1,y1,x2,y2) and probabilities using MTCNN only."""
    embedder = FaceEmbedder()
    img = _open_image_bytes_rgb(image_bytes)
    boxes, probs = embedder.mtcnn.detect(img)
    if (boxes is None or len(boxes) == 0) and max(img.size) > 2000:
        scale = 1600.0 / float(max(img.size))
        new_wh = (max(1, int(img.size[0] * scale)), max(1, int(img.size[1] * scale)))
        if FACE_DEBUG:
            print(f"[FACE_DEBUG] detect_faces_local: initial detect failed on {img.size}, retrying at {new_wh}")
        img_small = img.resize(new_wh)
        boxes, probs = embedder.mtcnn.detect(img_small)
        if boxes is not None and len(boxes) > 0:
            img = img_small
    if (boxes is None or len(boxes) == 0):
        try:
            from PIL import ImageEnhance as _ImageEnhance  # type: ignore
            enhancer = _ImageEnhance.Contrast(img)
            img_boost = enhancer.enhance(1.6)
            boxes, probs = embedder.mtcnn.detect(img_boost)
            if boxes is not None and len(boxes) > 0:
                img = img_boost
                if FACE_DEBUG:
                    print("[FACE_DEBUG] detect_faces_local: contrast boost succeeded")
        except Exception:
            pass
    if FACE_DEBUG:
        try:
            print(f"[FACE_DEBUG] detect_faces_local: boxes={0 if boxes is None else len(boxes)}, probs={[] if probs is None else [round(float(p),4) for p in probs]}")
        except Exception:
            pass
    results = []
    if boxes is not None and probs is not None:
        for b, p in zip(boxes, probs):
            if b is None:
                continue
            x1, y1, x2, y2 = [float(v) for v in b]
            results.append({"box": [x1, y1, x2, y2], "prob": float(p) if p is not None else None})
    return {"ok": True, "count": len(results), "faces": results}
