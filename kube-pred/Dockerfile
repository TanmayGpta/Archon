FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY kube_pred/ kube_pred/
COPY config/ config/

USER 65534
EXPOSE 9105
ENTRYPOINT ["python", "-m", "kube_pred"]
