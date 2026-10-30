# Build context: repository root (needs the workspace lockfile).
FROM node:24-alpine AS build
RUN npm install -g pnpm@10.33.2
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY server/package.json server/
RUN pnpm install --frozen-lockfile --filter server
COPY server server
RUN pnpm --filter server build \
 && pnpm --filter server deploy --prod --legacy /out

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /out/package.json ./
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /repo/server/dist ./dist
COPY --from=build /repo/server/migrations ./migrations
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
