const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Function to load and process the email template
const loadEmailTemplate = (templatePath, variables) => {
  try {
    
    let template = fs.readFileSync(templatePath, 'utf8');

    template = template.replace(/\$\{name\}/g, variables.name);
    template = template.replace(/\$\{trackingPixel\}/g, "");
    // template = template.replace(/\$\{trackingPixel\}/g, variables.trackingPixel);
    if (!variables.company) {
      template = template.replace(/\$\{company\}/g, "your company");
    } else {
      template = template.replace(/\$\{company\}/g, variables.company);
    }

    return template;
  } catch (error) {
    console.error('Error loading email template:', error);
    return '';
  }
};
// Delay helper
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));


// Function to send emails
const sendEmails = async (io) => {
  const dataFilePath = './data/linkedin_hiring_posts.json';
  const rawData = fs.readFileSync(dataFilePath);
  const recipients = JSON.parse(rawData);

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const delayInterval = 5000; // 5 seconds between emails

  for (const recipient of recipients) {
    const templatePath = path.join(__dirname, '../templates', 'emailTemplate.html');

    const trackerId = process.env.TRACKER_ID || 'default';
    const trackingPixel = `<img src="https://morning-queen-7f48.omkarsonawane159.workers.dev/track?trackerId=${trackerId}&email=${encodeURIComponent(recipient.email)}" width="1" height="1" style="display:none;"/>`;

    const variables = {
      name: (recipient.recruiter === "HR Team" ? recipient.recruiter : recipient.recruiter?.split(" ")[0]) || 'Recruiter',
      company: recipient.company || 'your company',
      trackingPixel: trackingPixel,
    };

    const emailContent = loadEmailTemplate(templatePath, variables);

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: recipient.email,
      replyTo: 'omkarsonawane159@gmail.com',
      subject: `Application for ${process.env.ROLE} ${recipient.company ? 'at ' + recipient.company : ''}`,
      html: emailContent,
      attachments: [
        {
          filename: 'resume.pdf',
          path: './resume.pdf',
        },
      ],
    };
    

    try {
      const info = await transporter.sendMail(mailOptions);
      console.log(`Email sent to ${recipient.email} for ${recipient.company}.`);
      io.emit('email-progress', `Email sent to ${recipient.email} for ${recipient.company}.`);

      recipient.emailLogs = recipient.emailLogs || [];
      recipient.emailLogs.push({
        type: "Initial Email",
        to: mailOptions.to,
        subject: mailOptions.subject,
        messageId: info.messageId,
        timestamp: new Date().toISOString(),
        status: "Sent",
      });

      fs.writeFileSync(dataFilePath, JSON.stringify(recipients, null, 2));
    } catch (error) {
      console.log(`Failed to send email to ${recipient.email}: ${error.message}`);
      io.emit('email-error', `Failed to send email to ${recipient.email}: ${error.message}`);

      recipient.emailLogs = recipient.emailLogs || [];
      recipient.emailLogs.push({
        type: "Initial Email",
        to: mailOptions.to,
        subject: mailOptions.subject,
        timestamp: new Date().toISOString(),
        status: "Failed",
        error: error.message,
      });

      fs.writeFileSync(dataFilePath, JSON.stringify(recipients, null, 2));
    }

    // Add delay after each email
    await delay(delayInterval);
  }
};


module.exports = { sendEmails };
