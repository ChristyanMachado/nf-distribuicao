FROM mcr.microsoft.com/playwright/python:v1.48.0-noble

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HOME=/tmp

WORKDIR /app

COPY requirements-prod.txt ./
RUN pip install --no-cache-dir --requirement requirements-prod.txt

COPY main.py ./
COPY src ./src
COPY scripts ./scripts
RUN mkdir -p /app/downloads /app/logs

# O portal acessado é uma origem fiscal fixa e validada. Para o primeiro piloto
# usamos o modo root suportado pela imagem oficial; o Compose remove capabilities,
# bloqueia elevação de privilégio e deixa o filesystem somente leitura.

HEALTHCHECK --interval=60s --timeout=10s --start-period=90s --retries=3 \
    CMD ["python", "-m", "scripts.verificar_saude_servico"]

CMD ["python", "-m", "src.servico"]
