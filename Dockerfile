FROM node:24-alpine

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN npm install -g corepack@latest
RUN corepack enable

WORKDIR /app

COPY pnpm-lock.yaml /app
RUN pnpm fetch --prod

COPY package.json .
RUN pnpm install --prod

COPY . .

ENV PORT=80
ENV CACHE_DIR=/app/.cache
EXPOSE 80

CMD [ "node", "--disable-warning=ExperimentalWarning", "src/server.ts" ]
