from app.routers.detect import compress_image_bytes
from PIL import Image
import io

# Generate a large test image (6000x4000)
img = Image.new('RGB', (6000, 4000), (120, 130, 140))
buf = io.BytesIO()
img.save(buf, format='JPEG', quality=95)
orig = buf.getvalue()
print(f"Original size: {len(orig) / (1024*1024):.2f} MB")

compressed = compress_image_bytes(orig, 15 * 1024 * 1024)
print(f"Compressed size: {len(compressed) / (1024*1024):.2f} MB")

with open('compressed_test.jpg', 'wb') as f:
    f.write(compressed)
print('Wrote compressed_test.jpg')
