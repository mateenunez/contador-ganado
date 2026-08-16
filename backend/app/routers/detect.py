import base64
import io

import httpx
from PIL import Image
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app.config import Settings, get_settings
from app.schemas import DetectResponse, Detection, HealthResponse

router = APIRouter(prefix="/api", tags=["detect"])

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}


def compress_image_bytes(image_bytes: bytes, max_bytes: int) -> bytes:
    """Compress image bytes to be under max_bytes. Returns compressed bytes or original if already small enough.

    Strategy: try reducing JPEG quality and downscaling until size is under limit.
    """
    if len(image_bytes) <= max_bytes:
        return image_bytes

    try:
        img = Image.open(io.BytesIO(image_bytes))
    except Exception:
        return image_bytes

    # Convert to RGB for formats like PNG/WEBP that may have alpha
    if img.mode in ("RGBA", "LA"):
        bg = Image.new("RGB", img.size, (255, 255, 255))
        bg.paste(img, mask=img.split()[-1])
        img = bg
    else:
        img = img.convert("RGB")

    # Try progressively lower quality and resizing
    quality_values = [95, 85, 75, 65, 55, 45, 35]
    scale_factors = [1.0, 0.9, 0.8, 0.7, 0.6, 0.5]

    for scale in scale_factors:
        if scale < 1.0:
            new_size = (max(1, int(img.width * scale)), max(1, int(img.height * scale)))
            working = img.resize(new_size, Image.LANCZOS)
        else:
            working = img

        for q in quality_values:
            buf = io.BytesIO()
            try:
                working.save(buf, format="JPEG", quality=q, optimize=True)
            except Exception:
                try:
                    working.save(buf, format="JPEG", quality=q)
                except Exception:
                    continue

            data = buf.getvalue()
            if len(data) <= max_bytes:
                return data

    # If we couldn't get below the threshold, return the smallest we produced
    # (last attempt)
    return data


@router.get("/health", response_model=HealthResponse)
async def health(settings: Settings = Depends(get_settings)):
    return HealthResponse(
        status="ok",
        configured=settings.is_configured,
        model=settings.roboflow_model or "no configurado",
    )


@router.post("/detect", response_model=DetectResponse)
async def detect(
    file: UploadFile = File(...),
    settings: Settings = Depends(get_settings),
):
    if not settings.is_configured:
        raise HTTPException(500, "Falta configurar ROBOFLOW_API_KEY / ROBOFLOW_MODEL en el .env del backend")

    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(415, f"Tipo de archivo no soportado: {file.content_type}")

    image_bytes = await file.read()
    max_bytes = settings.max_upload_mb * 1024 * 1024
    if len(image_bytes) > max_bytes:
        raise HTTPException(413, f"La imagen supera el limite de {settings.max_upload_mb}MB")

    # Roboflow serverless endpoints can be sensitive to very large payloads.
    # Compress images larger than a safe threshold before sending. We target
    # at most 15 MB for the payload (or the configured max if lower).
    rf_target_mb = min(settings.max_upload_mb, 15)
    rf_target_bytes = int(rf_target_mb * 1024 * 1024)

    if len(image_bytes) > rf_target_bytes:
        compressed = compress_image_bytes(image_bytes, rf_target_bytes)
        if len(compressed) > rf_target_bytes:
            raise HTTPException(413, f"No se pudo comprimir la imagen por debajo de {rf_target_mb}MB")
        image_bytes = compressed

    b64 = base64.b64encode(image_bytes).decode()
    url = f"https://detect.roboflow.com/{settings.roboflow_model}"

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                url,
                params={
                    "api_key": settings.roboflow_api_key,
                    "confidence": settings.confidence,
                    "overlap": settings.overlap,
                },
                content=b64,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
    except httpx.RequestError as exc:
        raise HTTPException(502, f"No se pudo contactar a Roboflow: {exc}") from exc

    if response.status_code != 200:
        raise HTTPException(response.status_code, f"Error de Roboflow: {response.text}")

    rf = response.json()
    predictions = rf.get("predictions", [])
    image_info = rf.get("image", {})

    detections = [
        Detection(
            x=pred["x"],
            y=pred["y"],
            width=pred["width"],
            height=pred["height"],
            confidence=round(pred["confidence"], 2),
        )
        for pred in predictions
    ]

    return DetectResponse(
        count=len(detections),
        image_width=int(image_info.get("width", 0)),
        image_height=int(image_info.get("height", 0)),
        detections=detections,
    )
