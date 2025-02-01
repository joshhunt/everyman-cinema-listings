FROM node:23.6.0-alpine

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app
COPY . .

RUN pnpm install

ENV PORT=80
EXPOSE 80

CMD ["node", "server.ts"]
