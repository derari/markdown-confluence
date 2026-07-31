FROM ghcr.io/puppeteer/puppeteer:25.0.2@sha256:7bc4cb82bdf758ef742ca059415447a48ae835dc0e7498ce411bc91f57ea70e4

USER 10042

COPY ./dist /app

ENV NODE_OPTIONS=--enable-source-maps PUPPETEER_CACHE_DIR="/home/pptruser/.cache/puppeteer"

WORKDIR "/content"

CMD ["node", "/app/index.js"]
