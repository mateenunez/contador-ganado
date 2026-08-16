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

  console.info('[compressImageForUpload] original', {
    name: file.name,
    sizeBytes: file.size,
    maxBytes,
  });

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
    let bestSize = Number.POSITIVE_INFINITY;

    const scales = [1, 0.85, 0.7, 0.55, 0.4, 0.28, 0.18, 0.12];
    const qualities = [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.15, 0.1];

    for (const scale of scales) {
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

      for (const quality of qualities) {
        const blob = await new Promise<Blob | null>((resolve) => {
          canvas.toBlob((candidate) => resolve(candidate), 'image/jpeg', quality);
        });

        if (!blob) continue;

        if (blob.size <= maxBytes) {
          const compressed = new File([blob], file.name.replace(/\.[^/.]+$/, '') + '.jpg', {
            type: 'image/jpeg',
            lastModified: Date.now(),
          });

          console.info('[compressImageForUpload] success', {
            finalSize: blob.size,
            scale,
            quality,
          });

          return compressed;
        }

        if (blob.size < bestSize) {
          bestSize = blob.size;
          bestBlob = blob;
        }
      }
    }

    if (bestBlob) {
      const compressed = new File([bestBlob], file.name.replace(/\.[^/.]+$/, '') + '.jpg', {
        type: 'image/jpeg',
        lastModified: Date.now(),
      });

      console.warn('[compressImageForUpload] fallback used', {
        finalSize: bestBlob.size,
        maxBytes,
      });

      return compressed;
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

  console.info('[detectCows] sending upload', {
    original: file.size,
    final: uploadFile.size,
    name: uploadFile.name,
  });

  const formData = new FormData();
  formData.append('file', uploadFile);

  const res = await fetch('/api/detect', { method: 'POST', body: formData });
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.detail || `Error ${res.status}`);
  }
  return data as DetectResponse;
}
