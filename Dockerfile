# Berlin Rent Hunter AI — one image, two processes: web (Next.js) and worker (background jobs)
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 APP_ENV=production
RUN useradd --system --uid 1001 app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/package.json /app/next.config.ts /app/tsconfig.json ./
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/data ./data
COPY --from=build /app/lib ./lib
COPY --from=build /app/features ./features
COPY --from=build /app/integrations ./integrations
COPY --from=build /app/jobs ./jobs
COPY --from=build /app/worker ./worker
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/messages ./messages
USER app
EXPOSE 3000
# Override CMD with "npm run worker" for the worker service.
CMD ["sh", "-c", "npm run db:migrate && npm run db:seed && npm run start -- -p ${PORT:-3000}"]
