from pydantic import BaseModel


class Detection(BaseModel):
    x: float
    y: float
    width: float
    height: float
    confidence: float


class DetectResponse(BaseModel):
    count: int
    image_width: int
    image_height: int
    detections: list[Detection]


class HealthResponse(BaseModel):
    status: str
    configured: bool
    model: str
