FROM python:3.13-slim
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY server.py news.py sources.py ./
COPY public ./public
USER 10001:10001
EXPOSE 8080
CMD ["python", "server.py", "--host", "0.0.0.0"]
