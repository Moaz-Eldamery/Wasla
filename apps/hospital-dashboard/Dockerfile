FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/hospital-dashboard/package.json apps/hospital-dashboard/package.json
COPY apps/hospital-dashboard apps/hospital-dashboard
RUN pnpm install --frozen-lockfile --filter @wasla/hospital-dashboard
ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}
RUN pnpm --filter @wasla/hospital-dashboard build

FROM nginxinc/nginx-unprivileged:1.28-alpine
COPY apps/hospital-dashboard/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/hospital-dashboard/dist /usr/share/nginx/html
EXPOSE 8080
