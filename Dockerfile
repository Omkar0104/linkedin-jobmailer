# ✅ Use the latest official Playwright image with all deps
FROM mcr.microsoft.com/playwright:v1.51.1-jammy

# ✅ Set working dir
WORKDIR /app

# ✅ Copy dependency files
COPY package*.json ./

# ✅ Install node packages
RUN npm install

# ✅ Copy rest of the app
COPY . .

# ✅ Install browsers locally (respects PLAYWRIGHT_BROWSERS_PATH=0)
RUN PLAYWRIGHT_BROWSERS_PATH=0 npx playwright install --with-deps

# ✅ Run the app
CMD ["node", "index.js"]
