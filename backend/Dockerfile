FROM node:18-alpine

WORKDIR /app

# Copy package.json and install dependencies
COPY package*.json ./
RUN npm install

# Copy application source
COPY . .

# Expose port
EXPOSE 3001

# Start command
CMD ["node", "index.js"]
