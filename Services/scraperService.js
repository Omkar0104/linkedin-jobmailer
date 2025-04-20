const fs = require("fs");
const { chromium } = require("playwright");
require("dotenv").config();
    
const scrape = async (io) => {
  const emit = (msg) => io.emit("scrape-progress", msg);
  const storagePath = './auth.json';
  let context, page;
  const browser = await chromium.launch({
    headless: true,
    slowMo: 50,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  let triedManualLogin = false;

  
  try {
    const createContext = async (useSavedStorage = true) => {
      return await browser.newContext({
        ...(useSavedStorage && fs.existsSync(storagePath) ? { storageState: storagePath } : {}),
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115 Safari/537.36",
        viewport: { width: 1366, height: 768 },
        locale: "en-US"
      });
    };
  
    context = await createContext();
    page = await context.newPage();
  
    if (fs.existsSync(storagePath)) {
      emit("🔐 Using saved login session...");
      await page.goto("https://www.linkedin.com/feed", { waitUntil: "domcontentloaded", timeout: 60000 });
  
      const url = page.url();
      if (url.includes("/checkpoint/challenge") || url.includes("/login")) {
        emit("⚠️ Saved session is invalid. Deleting and retrying login...");
        fs.unlinkSync(storagePath);
        await context.close();
  
        // Retry with manual login
        context = await createContext(false);
        page = await context.newPage();
        triedManualLogin = true;
      }
    }
  
    // Manual login if storage not exists or after invalid session
    if (!fs.existsSync(storagePath) || triedManualLogin) {
      emit("🔐 Logging in manually...");
      await page.goto("https://www.linkedin.com/login", { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.type("#username", process.env.LINKEDIN_EMAIL);
      await page.type("#password", process.env.LINKEDIN_PASSWORD);
  
      await Promise.all([
        page.$eval("form.login__form", (form) => form.submit()),
        page.waitForNavigation({ waitUntil: "networkidle", timeout: 60000 }),
      ]);
  
      const loginUrl = page.url();
      if (loginUrl.includes("/checkpoint/challenge")) {
        throw new Error("⚠️ Challenge page triggered. Manual login required.");
      }
      if (!loginUrl.includes("/feed")) {
        throw new Error("❌ Login failed. Not redirected to feed.");
      }
  
      emit("✅ Login successful. Saving session...");
      await context.storageState({ path: storagePath });
    }
  
    const keyword = encodeURIComponent(process.env[`SEARCH_KEYWORD`] || "hiring");
    await page.goto(`https://www.linkedin.com/search/results/content/?keywords=${keyword}`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    const scrollLimit = parseInt(process.env.SCROLL_LIMIT) || 5;
    let prevHeight = 0;

    for (let i = 0; i < scrollLimit; i++) {
      emit(`🔄 Scrolling (${i + 1}/${scrollLimit})...`);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(3000 + Math.floor(Math.random() * 2000)); 
      const newHeight = await page.evaluate(() => document.body.scrollHeight);
      if (newHeight === prevHeight) {
        emit("📉 No more new posts loaded.");
        break;
      }
      prevHeight = newHeight;
    }

    // const userEnv = process.env.USER;

    const posts = await page.$$eval(".feed-shared-update-v2", (elements) =>
      elements.map((el) => {
        const text = el.innerText || "";
        const email = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/g);
        const hrMatch = text.match(/(HR|Hiring Manager|Recruiter|Talent Acquisition)\s\w+/i);
        const companyMatch = text.match(/at\s([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/);

        return email
          ? {
              hr_name: hrMatch ? hrMatch[0] : "HR Team",
              company: companyMatch ? companyMatch[1] : "Unknown",
              content: text.substring(0, 1000),
              email: email[0],
              // user: userEnv,
            }
          : null;
      }).filter(Boolean)
    );

    emit(`📦 Extracted ${posts.length} posts.`);
    const filename = `./data/linkedin_hiring_posts.json`;
    fs.writeFileSync(filename, JSON.stringify(posts, null, 2));
    emit(`✅ Saved to ${filename}`);
  } catch (err) {
    emit(`❌ Error: ${err.message}`);
  } finally {
    await browser.close();
    emit("🚪 Browser closed.");
  }
};

module.exports = { scrape };



