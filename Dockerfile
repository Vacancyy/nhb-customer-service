# 构建阶段
FROM nexus.njzhyl.cn/repository/njzhyl/base/node:20-alpine AS builder
WORKDIR /app

ARG PROFILE=stage
COPY .env.${PROFILE} .env.local

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

COPY package.json package-lock.json* ./
RUN npm config set registry https://registry.npmmirror.com && npm ci

COPY . .
RUN npm run build

# 运行阶段
FROM nexus.njzhyl.cn/repository/njzhyl/base/node:20-alpine
WORKDIR /app

ARG PROFILE=stage
# Next.js standalone 只读取 .env 文件，不是 .env.local
COPY .env.${PROFILE} .env

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs && \
    mkdir -p logs && chown nextjs:nodejs logs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/server.js ./server.js
# ws 包由 server.js 使用，但 Next.js standalone 输出不包含它，需手动复制
COPY --from=builder /app/node_modules/ws ./node_modules/ws

USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]