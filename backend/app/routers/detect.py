import base64

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app.config import Settings, get_settings
from app.schemas import DetectResponse, Detection, HealthResponse

router = APIRouter(prefix="/api", tags=["detect"])

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}


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
