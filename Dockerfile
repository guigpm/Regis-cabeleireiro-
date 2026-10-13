FROM node:24-bookworm-slim AS base
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DB_PATH=/data/barbearia.sqlite

# O volume recebe esta pasta com permissão para o usuário sem privilégios.
RUN mkdir -p /data && chown node:node /data
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node server ./server
COPY --chown=node:node public ./public
USER node

FROM base AS test
COPY --chown=node:node test ./test
RUN npm test

FROM base AS runtime
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/catalog', {signal: AbortSignal.timeout(4000)}).then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "server/index.js"]
