FROM oven/bun:1-alpine
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --production --frozen-lockfile

COPY src/ ./src/
COPY frontend/dist/ ./frontend/dist/

CMD ["bun", "run", "src/index.ts", "web"]
