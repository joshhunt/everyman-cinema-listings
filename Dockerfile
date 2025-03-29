FROM node:23.6.0-alpine

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN npm install -g corepack@latest
RUN corepack enable

WORKDIR /app

COPY pnpm-lock.yaml /app
RUN pnpm fetch --prod

COPY package.json .
RUN pnpm install

COPY . .

ENV PORT=80
EXPOSE 80

CMD [ "node", "server.ts" ]
