# syntax=docker/dockerfile:1

FROM oven/bun:1.3.11 AS build
WORKDIR /app

COPY package.json bun.lock tsconfig.json ./
COPY src ./src

RUN bun install --frozen-lockfile --ignore-scripts --production
RUN bun build --compile --outfile /out/tornjak src/index.ts

FROM gcr.io/distroless/base-debian12:nonroot AS runtime
WORKDIR /app

COPY --from=build /out/tornjak /app/tornjak

ENV PORT=3000
EXPOSE 3000

ENTRYPOINT ["/app/tornjak"]
