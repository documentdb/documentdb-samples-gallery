FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --no-audit --no-fund

COPY server.js seed.js ./
COPY public ./public

EXPOSE 3000

CMD ["node", "server.js"]
