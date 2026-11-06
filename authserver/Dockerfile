FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN npm install --global npm@12.1.0 --ignore-scripts
COPY package.json package-lock.json .npmrc ./
RUN npm ci --ignore-scripts
COPY . .
RUN AUTH_DATABASE_URL=postgresql://build:build@localhost:5432/tala_authserver npm run db:generate && npm run build
RUN npm prune --omit=dev --ignore-scripts

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 AUTH_PORT=4000
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/package.json ./package.json
USER node
EXPOSE 4000
CMD ["node", "dist/main.js"]
