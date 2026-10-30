# Build context: repository root (needs the workspace lockfile).
FROM node:24-alpine AS build
RUN npm install -g pnpm@10.33.2
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY web/package.json web/
RUN pnpm install --frozen-lockfile --filter web
COPY web web
RUN pnpm --filter web build

FROM nginx:1.29-alpine
COPY web/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /repo/web/dist /usr/share/nginx/html
