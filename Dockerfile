FROM node:18-alpine

# Install compatibility libraries for older OpenSSL targets
RUN apk add --no-cache libc6-compat openssl

# Set working directory
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy the rest of your application code (including .env if present)
COPY . .

# --- ADD THESE TWO LINES HERE TO BIND THE ENVIRONMENT VARIABLE ---
ARG DATABASE_URL
ENV DATABASE_URL=$DATABASE_URL
# ----------------------------------------------------------------

# Generate Prisma files and build the NestJS application
RUN npx prisma generate
RUN npm run build

EXPOSE 4000

# Apply migrations, then start the API
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main.js"]
