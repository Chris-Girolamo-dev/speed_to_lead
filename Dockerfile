# Optional deploy path for clients with their own infrastructure.
# Primary path is Render (see render.yaml).
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY client.config.json ./

RUN mkdir -p data && chown -R node:node /app
USER node

EXPOSE 3000
CMD ["node", "src/server.js"]
