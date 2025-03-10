const fs = require("fs");
const { OpenAI } = require("openai");
require("dotenv").config();

const openai = new OpenAI({
  baseURL: "https://models.inference.ai.azure.com",
  apiKey: process.env.OPENAI_API_KEY,
});

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const extractInfo = async (job) => {
  const { content, email } = job;

  const prompt = `Extract the recruiter name and company name from the following job post content: 

"${content}"

Return a JSON object in the following format:
{
  "recruiter": "Recruiter's Name",
  "company": "Company Name"
}

Rules:
- If the recruiter’s name is missing, set "recruiter": "HR Team".
- If the company name is missing in the job post content, derive it from the provided email: "${email}"  
  - If the email follows the format "name@companydomain.com", extract the company name from the domain.  
  - Example: If email is "simarpreet.kaur@thewitslab.com", set "company": "The Wits Lab".  
  - If "${email}" is a generic email (e.g., "omkar@gmail.com"), set "company": null.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "system", content: prompt }],
      temperature: 0.2,
    });

    let result = response.choices[0].message.content.trim();
    result = result.replace(/```json/g, "").replace(/```/g, "").trim();

    return { ...JSON.parse(result), email };
  } catch (error) {
    if (error?.error?.code === "RateLimitReached") {
      const waitTime = parseInt(error.error.message.match(/wait (\d+) seconds/)?.[1]) * 1000 || 15 * 60 * 1000;
      throw { type: "rate_limit", waitTime };
    }

    console.error("Error extracting info:", error);
    return { recruiter: "HR Team", company: null, email };
  }
};

const readJsonFile = (filePath) => {
  try {
    return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : [];
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error);
    return [];
  }
};

const writeJsonFile = (filePath, data) => {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
  } catch (error) {
    console.error(`Error writing to ${filePath}:`, error);
  }
};

const processJobs = async (io, jobs) => {
  let extractedData = [];
  let unprocessedJobs = [];

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];

    try {
      const extractedInfo = await extractInfo(job);
      extractedData.push({
        recruiter: extractedInfo.recruiter || "HR Team",
        company: extractedInfo.company !== undefined ? extractedInfo.company : null,
        email: extractedInfo.email || "Not provided",
      });

      io.emit(
        "extract-progress",
        `✅ Processed ${i + 1}/${jobs.length}: ${extractedInfo.recruiter || "HR Team"} at ${extractedInfo.company || "Unknown Company"}`
      );
    } catch (err) {
      if (err.type === "rate_limit") {
        const waitInMinutes = Math.ceil(err.waitTime / 60000);
        io.emit(
          "extract-progress",
          `⏳ GPT rate limit reached. Pausing for ${waitInMinutes} minutes before retrying...`
        );

        unprocessedJobs = jobs.slice(i);
        break;
      } else {
        io.emit("extract-progress", `⚠️ Skipping job due to an error: ${err.message}`);
      }
    }
  }

  return { extractedData, unprocessedJobs };
};

const extractService = async (io) => {
  try {
    let jsonData = readJsonFile("./data/linkedin_hiring_posts.json");
    let unprocessedData = readJsonFile("./data/not_processed_data.json");

    if (!jsonData.length && !unprocessedData.length) {
      io.emit("extract-progress", "⚠️ No job posts found to process.");
      return;
    }

    io.emit("extract-progress", `📤 AI Agent activated: Extracting details from ${jsonData.length} job posts... 🔍`);

    let { extractedData, unprocessedJobs } = await processJobs(io, jsonData);

    // If rate limit was hit, save unprocessed jobs
    if (unprocessedJobs.length > 0) {
      writeJsonFile("./data/not_processed_data.json", unprocessedJobs);
      io.emit("extract-progress", `⚠️ ${unprocessedJobs.length} job posts saved for later processing.`);
    }

    // Retry any previously unprocessed jobs
    if (unprocessedData.length > 0) {
      io.emit("extract-progress", `🔄 Retrying ${unprocessedData.length} previously unprocessed job posts...`);

      let retryResult = await processJobs(io, unprocessedData);
      extractedData = extractedData.concat(retryResult.extractedData);
      writeJsonFile("./data/not_processed_data.json", retryResult.unprocessedJobs);

      if (retryResult.unprocessedJobs.length === 0) {
        fs.unlinkSync("./data/not_processed_data.json"); // Delete the file if all jobs are processed
      }
    }

    // Save final extracted data
    writeJsonFile("./data/linkedin_hiring_posts.json", extractedData);
    io.emit("extract-complete", "🎉 Extraction completed! Data saved to linkedin_hiring_posts.json.");
  } catch (error) {
    console.error("Extraction error:", error);
    io.emit("extract-error", `❗ Extraction failed: ${error.message}`);
  }
};

module.exports = { extractService };
