import type { DetectResponse, HealthResponse } from './types';

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch('/api/health');
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return res.json();
}

export async function detectCows(file: File): Promise<DetectResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch('/api/detect', { method: 'POST', body: formData });
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.detail || `Error ${res.status}`);
  }
  return data as DetectResponse;
}
