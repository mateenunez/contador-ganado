import type { DetectResponse, HealthResponse } from './types';

const DEFAULT_MAX_UPLOAD_MB = 5;
const MAX_UPLOAD_BYTES = Math.max(
  1,
  Number(import.meta.env.VITE_MAX_UPLOAD_MB ?? DEFAULT_MAX_UPLOAD_MB) * 1024 * 1024,
);

async function compressImageForUpload(file: File, maxBytes = MAX_UPLOAD_BYTES): Promise<File> {
  if (file.size <= maxBytes || !file.type.startsWith('image/')) {
    return file;
  }

  const imageUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('No se pudo leer la imagen para comprimirla.'));
      img.src = imageUrl;
    });

    const canvas = document.createElement('canvas');
    let bestBlob: Blob | null = null;

    for (let scale = 1; scale >= 0.2; scale -= 0.1) {
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) break;

      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(image, 0, 0, width, height);

      for (let quality = 0.9; quality >= 0.2; quality -= 0.1) {
        const blob = await new Promise<Blob | null>((resolve) => {
          canvas.toBlob((candidate) => resolve(candidate), 'image/jpeg', quality);
        });

        if (!blob) continue;

        if (blob.size <= maxBytes) {
          return new File([blob], file.name.replace(/\.[^/.]+$/, '') + '.jpg', {
            type: 'image/jpeg',
            lastModified: Date.now(),
          });
        }

        if (!bestBlob || blob.size < bestBlob.size) {
          bestBlob = blob;
        }
      }
    }

    if (bestBlob) {
      return new File([bestBlob], file.name.replace(/\.[^/.]+$/, '') + '.jpg', {
        type: 'image/jpeg',
        lastModified: Date.now(),
      });
    }

    return file;
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch('/api/health');
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return res.json();
}

export async function detectCows(file: File): Promise<DetectResponse> {
  const uploadFile = await compressImageForUpload(file, MAX_UPLOAD_BYTES);
  const formData = new FormData();
  formData.append('file', uploadFile);

  const res = await fetch('/api/detect', { method: 'POST', body: formData });
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.detail || `Error ${res.status}`);
  }
  return data as DetectResponse;
}
