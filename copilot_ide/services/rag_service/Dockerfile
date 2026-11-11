FROM python:3.12-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

COPY requirements.txt .
# CPU-only torch first, so sentence-transformers doesn't pull the ~6 GB CUDA build
RUN pip install --no-cache-dir --retries 10 --timeout 60 torch --index-url https://download.pytorch.org/whl/cpu \
 && pip install --no-cache-dir --retries 10 --timeout 60 -r requirements.txt

COPY app/ ./app/

EXPOSE 8001

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
