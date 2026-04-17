# Use official Node.js image
FROM node:20-slim

# Install dependencies for native modules (sqlite3, bcrypt) if necessary
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./
# Force build sqlite3 from source against container's GLIBC version
RUN npm install --omit=dev --build-from-source=sqlite3

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
