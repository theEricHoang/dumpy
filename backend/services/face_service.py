"""Deprecated: Azure Face API integration removed.

This module is kept as a stub to avoid import errors in older code paths.
All Azure Face endpoints and helpers have been removed in favor of the local
embedding-based pipeline (facenet-pytorch).

Do not import this module. Use `backend.services.face_embedding_service` instead.
"""

raise RuntimeError(
    "Azure Face API code has been removed. Use local endpoints: /api/face/enroll_local, /api/face/identify_local, /api/face/detect_local."
)


