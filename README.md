

# LinkedIn JobMailer

Automates the process of scraping LinkedIn for job postings and sending personalized emails to recruiters.

## Features

- Scrapes LinkedIn for job posts based on configurable keywords.

- Extracts recruiter details and emails.

- Sends personalized emails with an attached resume.

## Setup Instructions

### Prerequisites

- Node.js (v14+)

- npm

- Gmail account for sending emails (App Password recommended)

## Installation

1. Clone the Repository:

```bash
git clone https://github.com/Omkar0104/linkedin-jobmailer.git
cd linkedin-jobmailer
```

2. Install Dependencies:

```bash
npm install
```

3. Environment Variables: Create a .env file in the root directory and update as per your profile and req:
```bash
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
OPENAI_API_KEY=your-openai-api-key
SEARCH_KEYWORD=node.js developer
LINKEDIN_EMAIL=your_linkedin_email
LINKEDIN_PASSWORD=your_linkedin_password
ROLE=Node.js Developer
```
#### ⚠️ Note: OpenAI no longer offers a free tier. To get your free OpenAI API Key, check out this [Video](https://www.youtube.com/watch?v=YP8mV_2RDLc&t=21s)

4. Email Template:
Place your HTML email template in
```bash
templates/emailTemplate.html.
```

Resume Attachment:
Add your resume as resume.pdf in the root directory.

Run the Project:
```bash
node index.js
```

## Usage

The scraper extracts job posts based on SEARCH_KEYWORD.

Sends personalized emails using the template with recruiter and company names.

## Contributing

Feel free to fork and submit pull requests!

## License

MIT