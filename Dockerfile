FROM node:24-alpine AS build
WORKDIR /workspace
RUN npm install --global pnpm@10.34.3
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/app/package.json packages/app/package.json
RUN pnpm install --frozen-lockfile --filter @baited/app...
COPY packages/app packages/app
RUN pnpm --filter @baited/app build
# pnpm deploy creates portable production dependencies from the workspace.
# Keep the final image independent of the landing package and build tools.
RUN pnpm --filter @baited/app deploy --prod --legacy /runtime

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DATA_DIR=/app/data ENABLE_DEMO=false
COPY --from=build /workspace/packages/app/dist ./dist
COPY --from=build /runtime/node_modules ./node_modules
COPY --from=build /workspace/packages/app/package.json ./package.json
COPY --from=build /workspace/packages/app/LICENSE /workspace/packages/app/THIRD_PARTY_NOTICES.md ./
COPY --from=build /workspace/packages/app/licenses ./licenses
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node
VOLUME ["/app/data"]
EXPOSE 3000
CMD ["node", "dist/server/index.js"]
