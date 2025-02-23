const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const fs = require("fs");
require("dotenv").config();

puppeteer.use(StealthPlugin());

const scrape = async (io) => {
  try {
    const browser = await puppeteer.launch({ headless: false, args: ["--no-sandbox"] });
    const page = await browser.newPage();

    // Set User-Agent
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    );

    io.emit('scrape-progress', 'Logging into LinkedIn...');

    // Login to LinkedIn
    await page.goto("https://www.linkedin.com/login", { waitUntil: "networkidle2" });
    await page.type("#username", process.env.LINKEDIN_EMAIL, { delay: 100 });
    await page.type("#password", process.env.LINKEDIN_PASSWORD, { delay: 100 });
    await page.evaluate(() => {
    const checkbox = document.querySelector('input[name="rememberMeOptIn"]');
      if (checkbox && checkbox.checked) {
        checkbox.click();
      }
    });
    
    await page.click("[type='submit']");
    await page.waitForNavigation();

    io.emit('scrape-progress', 'Logged in. Starting search...');

    const searchKeyword = process.env.SEARCH_KEYWORD;

    const encodedKeyword = encodeURIComponent(searchKeyword);

    // Search URL
    const searchURL = `https://www.linkedin.com/search/results/content/?keywords=${encodedKeyword}`;

    await page.goto(searchURL, { waitUntil: "networkidle2" });

    io.emit('scrape-progress', 'Scrolling through posts...');

    // Scroll and load more posts
    let previousHeight;
    for (let i = 0; i < process.env.SCROLL_LIMIT; i++) 
      {
      previousHeight = await page.evaluate(() => document.body.scrollHeight);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const randomDelay = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
      await new Promise(resolve => setTimeout(resolve, randomDelay(3000, 7000)));
      let newHeight = await page.evaluate(() => document.body.scrollHeight);
      if (newHeight === previousHeight) break;
    }

    io.emit('scrape-progress', 'Extracting posts...');

    // Extract posts
    const posts = await page.evaluate(() => {
      return Array.from(document.querySelectorAll(".feed-shared-update-v2"))
        .map(post => {
          let content = post.innerText;
          let emailMatch = content.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
          let hrMatch = content.match(/(HR|Hiring Manager|Recruiter|Talent Acquisition)\s\w+/i);
          let companyMatch = content.match(/at\s([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/);

          return {
            hr_name: hrMatch ? hrMatch[0] : "HR Team",
            name: "HR Team",
            company: companyMatch ? companyMatch[1] : null,
            content: content.substring(0, 500),
            email: emailMatch ? emailMatch[0] : null
          };
        })
        .filter(post => post.email !== null);
    });

    io.emit('scrape-progress', `Extracted ${posts.length} posts.`);

    // Save data
    fs.writeFileSync("./data/linkedin_hiring_posts.json", JSON.stringify(posts, null, 2));

    io.emit('scrape-complete', 'Scraping completed and data saved.');
    await browser.close();
  } catch (error) {
    io.emit('scrape-error', `Error during scraping: ${error.message}`);
  }
};

module.exports = { scrape };
