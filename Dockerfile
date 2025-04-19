FROM mcr.microsoft.com/playwright:v1.51.1-jammy

WORKDIR /app

COPY package*.json ./

ENV PLAYWRIGHT_BROWSERS_PATH=0

RUN npm install

COPY . .

RUN npx playwright install chromium

CMD ["node", "index.js"]
