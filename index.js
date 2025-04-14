// Backend: Express server setup with scraping, deduplication, extraction, and email services

const express = require('express');
const nodemailer = require("nodemailer");
const axios = require("axios");
// const mongoose = require('mongoose');
// const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const bodyParser = require('body-parser');
const { safeRequire } = require('./Services/checkModule');
const scraperService = safeRequire('./scraperService');
const dedupService = safeRequire('./dedupService');
const { deleteDuplicates } = safeRequire('./deleteDuplicates') || {};
const { extractService } = safeRequire('./extractService') || {};
const emailService = safeRequire('./emailService');
const fs = require('fs');
require('dotenv').config();


const path = require('path');


const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// MongoDB Connection
// mongoose.connect(process.env.MONGO_URI, { })
//   .then(() => console.log('MongoDB connected'))
//   .catch(err => console.error('MongoDB connection error:', err));

// WebSocket connection for real-time updates
io.on('connection', (socket) => {
  console.log('New client connected');

  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

// API Endpoints

// Trigger LinkedIn scraping

app.post('/scrape', async (req, res) => {
  try {
    await scraperService.scrape(io);
    res.status(200).send('Scraping Completed');
  } catch (err) {
    console.error('Scraping error:', err);
    res.status(500).send('Error during scraping');
  }
}); 

// Deduplicate data
app.post('/deduplicate', async (req, res) => {
  try {
    const rawData = fs.readFileSync('./data/linkedin_hiring_posts.json');
    const data = JSON.parse(rawData);
    const { uniqueData, duplicatesCount } = await dedupService.deduplicateJobs(data);

    fs.writeFileSync('./data/linkedin_hiring_posts.json', JSON.stringify(uniqueData, null, 2));

    res.status(200).send(`Number of deleted entries: ${duplicatesCount}`);
  } catch (err) {
    console.error('Deduplication error:', err);
    res.status(500).send('Error during deduplication');
  }
});

// Extract emails and details
app.post('/extract', async (req, res) => {
  try {
    
    await extractService(io);  // Pass io to the service
    res.status(200).send('📧 Extracted Recruiter & Company Details...');
  } catch (err) {
    console.error('Extraction error:', err);
    res.status(500).send('Error during extraction');
  }
});

// Send emails to extracted contacts
app.post('/send-emails', async (req, res) => {
  try {
    await emailService.sendEmails(io);
    const sourceFile = './data/linkedin_hiring_posts.json';
    const destinationFile = './data/extracted_data.json';
  
    if (!fs.existsSync(sourceFile)) {
      return res.status(404).send('No extracted data found.');
    }
  
    try {
      // Read existing extracted data (persistent storage)
      let existingData = fs.existsSync(destinationFile) 
        ? JSON.parse(fs.readFileSync(destinationFile, 'utf8')) 
        : [];
  
      // Ensure existingData is an array
      if (!Array.isArray(existingData)) {
        existingData = [];
      }
  
      // Read new extracted data from the temporary file
      const newData = JSON.parse(fs.readFileSync(sourceFile, 'utf8'));
  
      // Use a Set to track unique emails and prevent duplicate entries
      const existingEmails = new Set(existingData.map(job => job.email));
  
      // Filter only new unique records
      const uniqueNewData = newData.filter(job => !existingEmails.has(job.email));
  
      if (uniqueNewData.length === 0) {
        return res.send('⚠️ No new unique data to save.');
      }
  
      // Merge new data into the persistent storage
      const updatedData = [...existingData, ...uniqueNewData];
  
      // Write back to extracted_data.json (Permanent Storage)
      fs.writeFileSync(destinationFile, JSON.stringify(updatedData, null, 2), 'utf8');
  
      res.send(`${uniqueNewData.length} new records saved for future use`);
    } catch (error) {
      console.error('Error saving extracted data:', error);
      res.status(500).send('Failed to save extracted data.');
    }
    // res.status(200).send('Emails sent');
  } catch (err) {
    console.error('Email sending error:', err);
    res.status(500).send('Error sending emails');
  }
});

app.post('/delete-duplicates', (req, res) => {
  deleteDuplicates(req, res, io);
});

// Save extracted data to a new file

app.post('/save-extracted-data', (req, res) => {
  const sourceFile = './data/linkedin_hiring_posts.json';
  const destinationFile = './data/extracted_data.json';

  if (!fs.existsSync(sourceFile)) {
    return res.status(404).send('No extracted data found.');
  }

  try {
    // Read existing extracted data (persistent storage)
    let existingData = fs.existsSync(destinationFile) 
      ? JSON.parse(fs.readFileSync(destinationFile, 'utf8')) 
      : [];

    // Ensure existingData is an array
    if (!Array.isArray(existingData)) {
      existingData = [];
    }

    // Read new extracted data from the temporary file
    const newData = JSON.parse(fs.readFileSync(sourceFile, 'utf8'));

    // Use a Set to track unique emails and prevent duplicate entries
    const existingEmails = new Set(existingData.map(job => job.email));

    // Filter only new unique records
    const uniqueNewData = newData.filter(job => !existingEmails.has(job.email));

    if (uniqueNewData.length === 0) {
      return res.send('⚠️ No new unique data to save.');
    }

    // Merge new data into the persistent storage
    const updatedData = [...existingData, ...uniqueNewData];

    // Write back to extracted_data.json (Permanent Storage)
    fs.writeFileSync(destinationFile, JSON.stringify(updatedData, null, 2), 'utf8');

    res.send(`✅ ${uniqueNewData.length} new records added to extracted_data.json`);
  } catch (error) {
    console.error('Error saving extracted data:', error);
    res.status(500).send('Failed to save extracted data.');
  }
});
 

const EMAIL_LOG_FILE = path.join(__dirname, "data", "extracted_data.json");
// Load email logs
const loadEmailLogs = () => {
  if (fs.existsSync(EMAIL_LOG_FILE)) {
    return JSON.parse(fs.readFileSync(EMAIL_LOG_FILE, "utf-8"));
  }
  return [];
};

// Save email logs under the correct recruiter's emailLogs array
const saveEmailLog = (log) => {
  let logs = loadEmailLogs();

  // Find recruiter by email
  const recruiterIndex = logs.findIndex((r) => r.email === log.to);

  if (recruiterIndex !== -1) {
    // Recruiter exists, append log to emailLogs array
    logs[recruiterIndex].emailLogs.push(log);
  } else {
    // Recruiter not found, create new entry
    logs.push({
      recruiter: "Unknown", // You might need to handle the recruiter name properly
      company: "Unknown",
      email: log.to,
      emailLogs: [log], // Initialize with the new log
    });
  }

  fs.writeFileSync(EMAIL_LOG_FILE, JSON.stringify(logs, null, 2));
};



app.post("/send-follow-up", async (req, res) => {
  const { email, messageId, subject } = req.body;

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER, // Your Gmail email
      pass: process.env.EMAIL_PASS, // App password
    },
  });

  if (!email || !messageId || !subject) {
    return res.status(400).json({ error: "Missing email, messageId, or subject" });
  }

  const mailOptions = {
    from: process.env.EMAIL,
    to: email,
    subject: `Re: ${subject}`, // Use original subject
    text: "Just following up on my previous email.",
    inReplyTo: messageId,
    references: [messageId],
  };

  try {
    const followUpInfo = await transporter.sendMail(mailOptions);
    console.log("✅ Follow-up email sent:", followUpInfo.response);

    const logEntry = {
      type: "Follow-up Email",
      to: email,
      subject: mailOptions.subject,
      messageId: followUpInfo.messageId,
      inReplyTo: messageId,
      timestamp: new Date().toISOString(),
      status: "Sent",
    };

    saveEmailLog(logEntry);
    res.json({ success: true, log: logEntry });
  } catch (error) {
    console.error("❌ Error sending follow-up:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/send-bulk-follow-up", async (req, res) => {
  const recruiters = req.body.recruiters;

  if (!Array.isArray(recruiters) || recruiters.length === 0) {
    return res.status(400).json({ error: "No valid recruiter data provided" });
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER, // Your Gmail email
      pass: process.env.EMAIL_PASS, // App password
    },
  });

  const followUpPromises = recruiters.map(async (recruiter) => {
    const { email, messageId, subject } = recruiter;

    if (!email || !messageId || !subject) {
      return { email, success: false, error: "Missing email, messageId, or subject" };
    }

    const mailOptions = {
      from: process.env.EMAIL,
      to: email,
      subject: `Re: ${subject}`, // Use original subject
      text: "Just following up on my previous email.",
      inReplyTo: messageId,
      references: [messageId],
    };

    try {
      const followUpInfo = await transporter.sendMail(mailOptions);
      console.log(`✅ Follow-up sent to ${email}:`, followUpInfo.response);

      const logEntry = {
        type: "Follow-up Email",
        to: email,
        subject: mailOptions.subject,
        messageId: followUpInfo.messageId,
        inReplyTo: messageId,
        timestamp: new Date().toISOString(),
        status: "Sent",
      };

      saveEmailLog(logEntry);

      return { email, success: true, log: logEntry };
    } catch (error) {
      console.error(`❌ Error sending follow-up to ${email}:`, error);
      return { email, success: false, error: error.message };
    }
  });

  // Execute all email sends concurrently
  const results = await Promise.all(followUpPromises);

  res.json({ success: true, results });
});



app.get("/recruiters", (req, res) => {
  const filePath = path.join(__dirname, "data", "extracted_data.json");

  fs.readFile(filePath, "utf8", (err, data) => {
    if (err) {
      if (err.code === "ENOENT") {
        // File does not exist, return empty array
        return res.json([]);
      }
      console.error("❌ Error reading extracted_data.json:", err);
      return res.status(500).json([]);
    }

    try {
      const recruiters = JSON.parse(data);
      res.json(recruiters);
    } catch (parseError) {
      console.error("❌ Error parsing JSON:", parseError);
      res.status(500).json([]);
    }
  });
});


app.get("/get-email-tracking", async (req, res) => {
  try {
      const response = await axios.get(`${process.env.TRACKING_SERVER_URL}/get-tracking`);
      res.json(response.data);
  } catch (error) {
      console.error("Error in /tracking route:", error.message);
      res.status(500).json({ error: "Failed to fetch tracking data" });
  }
});



const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));