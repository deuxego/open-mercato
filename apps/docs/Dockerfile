# Stage 1: Build the Next.js app
FROM node:20-alpine AS builder

WORKDIR /app

# Enable corepack for Yarn
RUN corepack enable

# Copy workspace configuration files from root
COPY package.json yarn.lock .yarnrc.yml ./

# Copy the docs app package.json
COPY apps/docs/package.json ./apps/docs/

# Install dependencies
RUN yarn workspaces focus open-mercato-docs

# Copy docs source files
COPY apps/docs ./apps/docs

# Build the Next.js standalone app
WORKDIR /app/apps/docs
RUN yarn build

# Stage 2: Run with minimal Node.js
FROM node:20-alpine AS runner

# Create non-root user
RUN addgroup -g 1001 -S docuser && \
    adduser -S -D -H -u 1001 -s /sbin/nologin -G docuser docuser

WORKDIR /app

# Copy standalone output
COPY --from=builder /app/apps/docs/.next/standalone ./
COPY --from=builder /app/apps/docs/.next/static ./apps/docs/.next/static
COPY --from=builder /app/apps/docs/public ./apps/docs/public

# Set ownership
RUN chown -R docuser:docuser /app

USER docuser

ENV PORT=4000
ENV HOSTNAME=0.0.0.0
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:4000/ || exit 1

CMD ["node", "apps/docs/server.js"]
