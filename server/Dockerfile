FROM node:20-slim

# Install build tools for native modules (better-sqlite3)
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies first (cache layer)
COPY package.json package-lock.json* ./
RUN npm install --production && npm cache clean --force

# Copy application code
COPY . .

# Create data directories
RUN mkdir -p /app/data/uploads

EXPOSE 3001

# Migrations run automatically in index.js on startup
CMD ["node", "src/index.js"]
