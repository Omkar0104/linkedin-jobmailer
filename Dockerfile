# Use the official Playwright base image (latest version)
FROM mcr.microsoft.com/playwright:v1.51.1-jammy

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of your app code
COPY . .

# Install browsers and dependencies
RUN npx playwright install --with-deps

# Start your app
CMD ["node", "index.js"]
