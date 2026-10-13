FROM python:3.13-slim
WORKDIR /app
COPY server.py news.py ./
COPY public ./public
USER 10001:10001
EXPOSE 8080
CMD ["python", "server.py", "--host", "0.0.0.0"]
