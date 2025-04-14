const fs = require('fs');
const path = require('path');

const deleteDuplicates = async (req, res, io) => {
  const directoryPath = path.resolve(__dirname, '../data'); // Data directory
  const sourceFile = `${directoryPath}/linkedin_hiring_posts.json`;
  const persistentFile = `${directoryPath}/extracted_data.json`; // Single storage file

  try {
    if (!fs.existsSync(sourceFile)) {
      const errorMsg = 'No linkedin_hiring_posts.json found.';
      console.error(errorMsg);
      io.emit('deletion_error', errorMsg);
      return res.status(404).send(errorMsg);
    }

    // Load current extracted data
    const currentData = JSON.parse(fs.readFileSync(sourceFile, 'utf-8'));

    // Load existing persistent extracted data
    let backupData = [];
    if (fs.existsSync(persistentFile)) {
      backupData = JSON.parse(fs.readFileSync(persistentFile, 'utf-8'));
    }

    // Create a set of emails from backupData where status is "Sent"
    const sentEmails = new Set(
      backupData
        .filter(item => item.emailLogs) // Ensure emailLogs exist
        .flatMap(item =>
          item.emailLogs
            .filter(log => log.status === "Sent")
            .map(log => item.email) // Collect emails with "Sent" status
        )
    );

    // Filter out elements from currentData that have matching emails in sentEmails
    const cleanedData = currentData.filter(item => !sentEmails.has(item.email));

    // Save cleaned data back to sourceFile
    fs.writeFileSync(sourceFile, JSON.stringify(cleanedData, null, 2), 'utf-8');

    res.status(200).send(`✅ Removed ${currentData.length - cleanedData.length} duplicates from linkedin_hiring_posts.json.`);
  } catch (error) {
    console.error('Error during duplicate deletion:', error);
    io.emit('deletion_error', 'An error occurred during deletion');
    res.status(500).send('Error during duplicate deletion');
  }
};

module.exports = { deleteDuplicates };
