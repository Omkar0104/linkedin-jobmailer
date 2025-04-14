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

    // Optimize page requests
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const url = req.url();
      const resourceType = req.resourceType();
    
      // Block unnecessary requests (images, fonts, etc.)
      if (["image", "stylesheet", "font"].includes(resourceType)) {
        req.abort();
      } 
      // Allow LinkedIn scripts & necessary external scripts
      else if (resourceType === "script" && !url.includes("linkedin.com") && !url.includes("cdn.")) {
        req.abort();
      } 
      else {
        req.continue();
      }
    });
    

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    );

    io.emit("scrape-progress", "Navigating to LinkedIn login...");
    await page.goto("https://www.linkedin.com/login", { waitUntil: "domcontentloaded", timeout: 60000 });

    await page.type("#username", process.env.LINKEDIN_EMAIL);
    await page.type("#password", process.env.LINKEDIN_PASSWORD);

    await page.evaluate(() => {
      const checkbox = document.querySelector('input[name="rememberMeOptIn"]');
      if (checkbox && checkbox.checked) checkbox.click();
    });

    await Promise.all([page.click("[type='submit']"), page.waitForNavigation({ waitUntil: "domcontentloaded" })]);

    io.emit("scrape-progress", "Logged in successfully. Navigating to search page...");
    const searchURL = `https://www.linkedin.com/search/results/content/?keywords=${encodeURIComponent(process.env.SEARCH_KEYWORD)}`;
    await page.goto(searchURL, { waitUntil: "domcontentloaded", timeout: 60000 });

    io.emit("scrape-progress", "Scrolling through posts...");
    let prevHeight = await page.evaluate(() => document.body.scrollHeight);

    const scrollLimit = parseInt(process.env.SCROLL_LIMIT) || 5;

    for (let i = 0; i < scrollLimit; i++) {
      io.emit("scrape-progress", `Scrolling: ${i + 1} / ${scrollLimit}`);
      console.log(`Scrolling: ${i + 1} / ${scrollLimit}`);
    
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await new Promise(resolve => setTimeout(resolve, 18000)); // Wait for content to load
    
      let newHeight = await page.evaluate(() => document.body.scrollHeight);
      console.log(`prevHeight: ${prevHeight}, newHeight: ${newHeight}`);
    
      if (newHeight === prevHeight) {
        console.log("No new content loaded. Stopping scrolling.");
        io.emit("scrape-progress", "No new content loaded. Stopping scrolling.");
        break;
      }
    
      prevHeight = newHeight;
    }
    

    io.emit("scrape-progress", "Extracting posts...");
    console.log("Extracting posts...");

    const posts = await page.$$eval(".feed-shared-update-v2", (elements) =>
      elements
        .map((post) => {
          console.log(post);
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
    console.log(posts);

    io.emit("scrape-complete", `Extracted ${posts.length} posts.`);
    console.log(`Extracted ${posts.length} posts.`);
    
    fs.writeFileSync("./data/linkedin_hiring_posts.json", JSON.stringify(posts, null, 2));

    await browser.close();
    console.log("Browser closed.");
  } catch (error) {
    io.emit("scrape-error", `Error during scraping: ${error.message}`);
    console.error("Scraping error:", error);
  }
};

module.exports = { scrape };
