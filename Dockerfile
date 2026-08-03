FROM node:24-alpine

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN npm install -g corepack@latest
RUN corepack enable

WORKDIR /app

# package.json comes in with the lockfile so corepack honours the pinned
# packageManager. With only the lockfile present it silently uses whatever pnpm
# is newest, whose supply-chain policies differ from the one we develop against.
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

COPY . .

# There is no build step: Node runs the TypeScript directly.
ENV PORT=80
ENV CACHE_DIR=/app/.cache
EXPOSE 80

CMD [ "node", "--disable-warning=ExperimentalWarning", "src/server.ts" ]
