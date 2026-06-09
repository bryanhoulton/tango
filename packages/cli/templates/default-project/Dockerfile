# Build stage: install dependencies and compile TypeScript.
FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json yarn.lock* ./
RUN yarn install
COPY tsconfig.json ./
COPY src ./src
RUN yarn build

# Runtime stage: only the built app and its dependencies.
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

# `tango serve` reads HOST/PORT; 0.0.0.0 is required inside a container.
ENV HOST=0.0.0.0 PORT=8000
EXPOSE 8000
CMD ["./node_modules/.bin/tango", "serve"]
