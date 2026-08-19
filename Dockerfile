# GitPit - Production Container
FROM node:20-alpine

# Set working directory
WORKDIR /usr/src/app

# Copy package manifests
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production

# Copy application source
COPY . .

# Expose server port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3001/api/news || exit 1

# Environment
ENV NODE_ENV=production
ENV PORT=3001

# Start Server
CMD ["node", "server.js"]
