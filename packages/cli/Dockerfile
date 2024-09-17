FROM ghcr.io/puppeteer/puppeteer:22.8.2

COPY ./dist /app

ENV NODE_OPTIONS=--enable-source-maps

WORKDIR "/content"

CMD ["node", "/app/index.js"]
