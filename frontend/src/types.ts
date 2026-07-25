export type MarkerSource = 'ai' | 'manual';

export interface Marker {
  ix: number;
  iy: number;
  source: MarkerSource;
  confidence?: number;
}

export interface DetectionDTO {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
}

export interface DetectResponse {
  count: number;
  image_width: number;
  image_height: number;
  detections: DetectionDTO[];
}

export interface HealthResponse {
  status: string;
  configured: boolean;
  model: string;
}
