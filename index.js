// Backend: Express server setup with scraping, deduplication, extraction, and email services

const express = require('express');
// const mongoose = require('mongoose');
const http = require('http');
const socketIo = require('socket.io');
const bodyParser = require('body-parser');
const scraperService = require('./services/scraperService');
const dedupService = require('./services/dedupService');
const { deleteDuplicates } = require('./services/deleteDuplicates');
const { extractService } = require('./services/extractService');
const emailService = require('./services/emailService');
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
    const rawData = fs.readFileSync('linkedin_hiring_posts.json');
const data = JSON.parse(rawData);
    const { uniqueData, duplicatesCount } = await dedupService.deduplicateJobs(data);

    fs.writeFileSync('linkedin_hiring_posts.json', JSON.stringify(uniqueData, null, 2));

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
    res.status(200).send('Emails sent');
  } catch (err) {
    console.error('Email sending error:', err);
    res.status(500).send('Error sending emails');
  }
});

// Save extracted data to a new file
app.post('/save-extracted-data', (req, res) => {
  const sourceFile = 'linkedin_hiring_posts.json';

  if (!fs.existsSync(sourceFile)) {
    return res.status(404).send('No extracted data found.');
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const newFileName = `extracted_data_${timestamp}.json`;
  const destination = path.join(__dirname, newFileName);

  fs.copyFile(sourceFile, destination, (err) => {
    if (err) {
      console.error("Error saving extracted data:", err);
      return res.status(500).send('Failed to save extracted data.');
    }

    console.log(`Extracted data saved to ${newFileName}`);
    res.send(`✅ Extracted data saved as ${newFileName}`);
  });
});

app.post('/delete-duplicates', (req, res) => {
  deleteDuplicates(req, res, io);
});
 
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
