# Contador de Ganado

App para contar vacas en fotos. Subís una o varias imágenes, se mandan a un modelo
de [Roboflow](https://roboflow.com) que detecta el ganado y marca cada animal con
un círculo numerado. Podés borrar detecciones erróneas con un click, o agregar las
que falten clickeando en un lugar vacío. Si subís varias fotos, podés ir pasando
entre ellas (miniaturas o flechas) y cada una guarda sus propios marcadores.

## Requisitos

- Python 3.10+
- Node.js 20+ y npm
- Cuenta gratis en [Roboflow](https://roboflow.com) con API key y un modelo de
  detección de ganado (buscá "cattle" o "cow detection" en Roboflow Universe).

## Cómo correrlo en local

**Backend:**

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env   # completá ROBOFLOW_API_KEY y ROBOFLOW_MODEL
uvicorn app.main:app --port 8080 --reload
```

**Frontend** (en otra terminal):

```bash
cd frontend
npm install
npm run dev
```

Abrí `http://localhost:5173`. El backend queda en `http://127.0.0.1:8080`.

