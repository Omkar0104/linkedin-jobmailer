const fs = require('fs');
const path = require('path');

const deleteDuplicates = async (req, res, io) => {
  const sourceFile = 'linkedin_hiring_posts.json';
  const directoryPath = path.resolve(__dirname, '..'); // Set directory to parent

  try {
    if (!fs.existsSync(sourceFile)) {
      const errorMsg = 'No linkedin_hiring_posts.json found.';
      console.error(errorMsg);
      io.emit('deletion_error', errorMsg);
      return res.status(404).send(errorMsg);
    }

    // io.emit('deletion_started', { message: 'Duplicate deletion process started.' });

    // Load current extracted data
    const currentData = JSON.parse(fs.readFileSync(sourceFile, 'utf-8'));

    // Collect data from all backup files
    const backupFiles = fs.readdirSync(directoryPath).filter(file => file.startsWith('extracted_data_') && file.endsWith('.json'));
    let backupData = [];

    backupFiles.forEach((file, index) => {
      const data = JSON.parse(fs.readFileSync(path.join(directoryPath, file), 'utf-8'));
      backupData = backupData.concat(data);

      io.emit('deletion_progress', `Processed backup file ${index + 1} of ${backupFiles.length}: ${file}`);
    });

    // Create a set of unique identifiers from backup data (e.g., email)
    const backupEmails = new Set(backupData.map(item => item.email));

    // Filter out duplicates from current data
    const cleanedData = currentData.filter(item => !backupEmails.has(item.email));

    // Save cleaned data back to sourceFile
    fs.writeFileSync(sourceFile, JSON.stringify(cleanedData, null, 2));

    res.status(200).send(`Duplicates removed ${currentData.length - cleanedData.length} from linkedin_hiring_posts.json.`);
  } catch (error) {
    console.error('Error during duplicate deletion:', error);
    io.emit('deletion_error', 'An error occurred during deletion');
    res.status(500).send('Error during duplicate deletion');
  }
};

module.exports = { deleteDuplicates };
