const fs = require('fs');
const { OpenAI } = require('openai');
require('dotenv').config();

const openai = new OpenAI({
  baseURL: "https://models.inference.ai.azure.com",
  apiKey: process.env.OPENAI_API_KEY,
});

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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

    return { ...JSON.parse(result), email: job.email };
  } catch (error) {
    if (error?.error?.code === 'RateLimitReached') {
      const waitTime = parseInt(error.error.message.match(/wait (\d+) seconds/)[1]) * 1000;
      throw { type: 'rate_limit', waitTime };
    }

    console.error("Error extracting info:", error);
    return { recruiter: "HR Team", company: job.company, email: job.email };
  }
};

const extractService = async (io) => {
  let extractedData = [];

  try {

    const jsonData = JSON.parse(fs.readFileSync('./data/linkedin_hiring_posts.json', 'utf8'));
    console.log(jsonData.length);
    io.emit('extract-progress', `📤 AI Agent activated: Extracting details from ${jsonData.length} job posts... 🔍`);

    for (let i = 0; i < jsonData.length; i++) {
      const job = jsonData[i];

      try {
        const extractedInfo = await extractInfo(job);
        extractedData.push({
          recruiter: extractedInfo.recruiter || "HR Team",
          company: extractedInfo.company !== undefined ? extractedInfo.company : null,
          email: extractedInfo.email || "Not provided",
        });

        io.emit('extract-progress', `✅ Processed ${i + 1}/${jsonData.length}: ${extractedInfo.recruiter || "HR Team"} at ${extractedInfo.company || "Unknown Company"}`);
      } catch (err) {

        if (err.type == 'rate_limit') {
          const waitInMinutes = Math.ceil(err.waitTime / 60000);
        
          io.emit('extract-progress', `⏳ GPT rate limit reached. Pausing for ${waitInMinutes} minutes before retrying...`);

break;

        } else {
          io.emit('extract-progress', `⚠️ Skipping job due to an error: ${err.message}`);
        }
      }
    }

    fs.writeFileSync('./data/linkedin_hiring_posts.json', JSON.stringify(extractedData, null, 2), 'utf8');
    io.emit('extract-complete', '🎉 Extraction completed! Data saved to linkedin_hiring_posts.json. You can now review and update it as needed.');

  } catch (error) {
    console.error("Extraction error:", error);
    io.emit('extract-error', `❗ Extraction failed: ${error.message}`);

    // Save partial data even on error
    fs.writeFileSync('./data/linkedin_hiring_posts.json', JSON.stringify(extractedData, null, 2), 'utf8');
    io.emit('extract-complete', '⚠️ Partial data saved due to an error.');
  }
};


module.exports = { extractService };