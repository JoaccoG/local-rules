# syntax=docker/dockerfile:1

# ---- build the static site ----
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- serve dist/ on the port Railway injects ----
FROM node:20-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
RUN npm i -g serve@14
COPY --from=build /app/dist ./dist
ENV PORT=8080
EXPOSE 8080
CMD ["sh", "-c", "serve -s dist -l ${PORT:-8080}"]
