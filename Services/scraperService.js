const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const fs = require("fs");
require("dotenv").config();

puppeteer.use(StealthPlugin());

const scrape = async (io) => {
  try {
    io.emit("scrape-progress", "Launching browser...");
    const browser = await puppeteer.launch({ headless: false, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    const page = await browser.newPage();

    // io.emit("scrape-progress", "Setting up page optimizations...");
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      if (["image", "stylesheet", "font"].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    );

    io.emit("scrape-progress", "Navigating to LinkedIn login...");
    await page.goto("https://www.linkedin.com/login", { waitUntil: "networkidle2" });

    await page.type("#username", process.env.LINKEDIN_EMAIL);
    await page.type("#password", process.env.LINKEDIN_PASSWORD);

    await page.evaluate(() => {
      const checkbox = document.querySelector('input[name="rememberMeOptIn"]');
      if (checkbox && checkbox.checked) checkbox.click();
    });

    await Promise.all([page.click("[type='submit']"), page.waitForNavigation({ waitUntil: "networkidle2" })]);

    io.emit("scrape-progress", "Logged in successfully. Navigating to search page...");
   
    const searchURL = `https://www.linkedin.com/search/results/content/?keywords=${encodeURIComponent(process.env.SEARCH_KEYWORD)}`;

    await page.goto(searchURL, { waitUntil: "networkidle2" });

    io.emit("scrape-progress", "Scrolling through posts...");

    let prevHeight = 0;
    const scrollLimit = parseInt(process.env.SCROLL_LIMIT) || 5;
    for (let i = 0; i < scrollLimit; i++) {
      io.emit("scrape-progress", `Scrolling: ${i + 1} / ${scrollLimit}`);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForFunction(
        `document.body.scrollHeight > ${prevHeight}`,
        { timeout: 5000 }
      ).catch(() => {}); // Prevent timeout errors

      prevHeight = await page.evaluate(() => document.body.scrollHeight);
    }

    io.emit("scrape-progress", "Extracting posts...");

    const posts = await page.$$eval(".feed-shared-update-v2", (elements) =>
      elements
        .map((post, index) => {
          let content = post.innerText;
          let emailMatch = content.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
          let hrMatch = content.match(/(HR|Hiring Manager|Recruiter|Talent Acquisition)\s\w+/i);
          let companyMatch = content.match(/at\s([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/);

          return emailMatch
            ? {
                hr_name: hrMatch ? hrMatch[0] : "HR Team",
                company: companyMatch ? companyMatch[1] : "Unknown",
                content: content.substring(0, 500),
                email: emailMatch[0],
              }
            : null;
        })
        .filter(Boolean)
    );

    io.emit("scrape-complete", `Extracted ${posts.length} posts.`);

    fs.writeFileSync("./data/linkedin_hiring_posts.json", JSON.stringify(posts, null, 2));

    await browser.close();
  } catch (error) {
    io.emit("scrape-error", `Error during scraping: ${error.message}`);
  }
};

module.exports = { scrape };
