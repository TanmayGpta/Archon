FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssh-client \
    && rm -rf /var/lib/apt/lists/*
COPY agent.py /app/agent.py
CMD ["python", "-u", "/app/agent.py"]
