FROM mcr.microsoft.com/playwright:v1.64.0-jammy

WORKDIR /app

# Copy package configuration and install dependencies
COPY package*.json ./
RUN npm install --legacy-peer-deps

# Copy application source files
COPY . .

# Build frontend production assets
RUN npm run build

# Configure default port for Cloud Run / server environment
ENV PORT=3000
ENV NODE_ENV=production

EXPOSE 3000

CMD ["npx", "tsx", "server.ts"]
