const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Function to load and process the email template
const loadEmailTemplate = (templatePath, variables) => {
  try {
    let template = fs.readFileSync(templatePath, 'utf8');

    // Replace placeholders with actual data
    // Object.keys(variables).forEach((key) => {
    //   const regex = new RegExp(`\$\{${key}\}`, 'g');
    //   template = template.replace(regex, variables[key]);
    // });
    template = template.replace(/\$\{name\}/g, variables.name);
    template = template.replace(/\$\{company\}/g, variables.company);

    return template;
  } catch (error) {
    console.error('Error loading email template:', error);
    return '';
  }
};

const sendEmails = async (io) => {
  const rawData = fs.readFileSync('./data/linkedin_hiring_posts.json');
  const recipients = JSON.parse(rawData);

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  for (const recipient of recipients) {
    const templatePath = path.join(__dirname, '../templates', 'emailTemplate.html');

    // Variables to replace in the template
    const variables = {
      name: (recipient.recruiter == "HR Team"?recipient.recruiter:recipient.recruiter.split(" ")[0]) || 'Recruiter',
      company: "at "+recipient.company || '',
    };

    const emailContent = loadEmailTemplate(templatePath, variables);

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: recipient.email,
      subject: `Application for ${process.env.ROLE} ${recipient.company ? 'at ' + recipient.company : ''}`,
      html: emailContent, // Only HTML content from the template
      attachments: [
        {
          filename: 'resume.pdf',
          path: './resume.pdf',
        },
      ],
    };

    try {
      await transporter.sendMail(mailOptions);

      console.log(`Email sent to ${recipient.email} for ${recipient.company}.`);
      io.emit('email-progress', `Email sent to ${recipient.email} for ${recipient.company}.`);

    } catch (error) {
      console.log(`Failed to send email to ${recipient.email}: ${error.message}`);
      io.emit('email-error', `Failed to send email to ${recipient.email}: ${error.message}`);
    }
  }
};

module.exports = { sendEmails };
