# syntax=docker/dockerfile:1
FROM debian:bookworm-slim AS engine-builder
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential clang git ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /src
RUN git clone --depth 1 https://github.com/yaneurao/YaneuraOu.git
WORKDIR /src/YaneuraOu/source
RUN make clean YANEURAOU_EDITION=YANEURAOU_ENGINE_NNUE \
    && make -j2 tournament COMPILER=clang++ \
       YANEURAOU_EDITION=YANEURAOU_ENGINE_NNUE TARGET_CPU=AVX2 \
    && install -m 755 "$(ls YaneuraOu-by-* | head -1)" /tmp/YaneuraOu

FROM debian:bookworm-slim AS eval-fetch
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget ca-certificates p7zip-full findutils \
    && rm -rf /var/lib/apt/lists/*
RUN mkdir -p /eval \
    && wget -q -O /tmp/Suisho5.7z \
       "https://github.com/yaneurao/YaneuraOu/releases/download/suisho5/Suisho5.7z" \
    && 7z x /tmp/Suisho5.7z -o/eval -y \
    && test -f /eval/nn.bin \
    && printf 'FV_SCALE = 24\n' > /eval/eval_options.txt \
    && ls -la /eval/

FROM python:3.12-slim-bookworm AS runtime
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    libstdc++6 ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend ./backend

RUN mkdir -p /app/engine/eval
COPY --from=engine-builder /tmp/YaneuraOu /app/engine/YaneuraOu
COPY --from=eval-fetch /eval/nn.bin /app/engine/eval/nn.bin
COPY --from=eval-fetch /eval/eval_options.txt /app/engine/eval/eval_options.txt

ENV YANEURAOU_PATH=/app/engine/YaneuraOu
ENV YANEURAOU_CWD=/app/engine
ENV PYTHONUNBUFFERED=1

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/aisyougi/health')"

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
