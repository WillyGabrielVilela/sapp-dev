# Build:  docker build -t sapp .
# Rodar:  docker run -p 3000:3000 --env-file .env sapp
# Migrar: docker run --rm --env-file .env sapp node scripts/migrar.mjs
# (NÃO testado neste repositório; ajuste ao padrão de contêineres da ATI-PE/AWS.)
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/.output ./.output
COPY --from=build /app/db ./db
COPY --from=build /app/scripts ./scripts
# scripts/migrar.mjs usa o pacote pg (o servidor já o leva embutido em .output)
COPY --from=build /app/package.json ./package.json
RUN npm install pg --omit=dev --no-audit --no-fund --legacy-peer-deps
EXPOSE 3000
USER node
CMD ["node", ".output/server/index.mjs"]
