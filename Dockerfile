FROM node:24.19.0-bookworm-slim AS build

WORKDIR /app

RUN npm install --global pnpm@11.20.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
RUN pnpm install --frozen-lockfile

COPY src ./src
RUN pnpm run build

RUN pnpm prune --prod

FROM node:24.19.0-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV PORT=3007

WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

RUN mkdir -p /app/data && chown -R node:node /app

VOLUME ["/app/data"]
EXPOSE 3007

USER node
WORKDIR /app/data

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3007) + '/').then((response) => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1))"

CMD ["node", "/app/dist/index.js"]
