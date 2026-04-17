# Use official Node.js image based on Debian Bookworm for better GLIBC compat
FROM node:20-bookworm-slim

# Install build tools for native modules (sqlite3, bcrypt)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies and rebuild native modules from source
COPY package*.json ./
RUN npm install --omit=dev --build-from-source

# Bundle app source
COPY . .

# Ensure the data directory exists
RUN mkdir -p /data

# Default environment variables
ENV NODE_ENV=production
ENV PORT=80
ENV DB_PATH=/data/daycost.db
ENV JWT_SECRET=change_this_to_something_secure_in_azure_portal

# Expose port 80
EXPOSE 80

# Start the application
CMD [ "npm", "start" ]
