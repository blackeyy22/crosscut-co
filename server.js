import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import PDFDocument from 'pdfkit';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import rateLimit from 'express-rate-limit';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// ─────────────────────────────────────────
// SECURITY: CORS Configuration
// ─────────────────────────────────────────
const corsOptions = {
  origin: process.env.CORS_ORIGIN || ['http://localhost:3000', 'http://localhost:5173'],
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

// ─────────────────────────────────────────
// SECURITY: Rate Limiting
// ─────────────────────────────────────────
const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  message: 'Too many submissions from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // Admin operations get more requests
  skip: (req) => process.env.NODE_ENV !== 'production'
});

// ─────────────────────────────────────────
// MIDDLEWARE
// ─────────────────────────────────────────
app.use(cors(corsOptions));
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(__dirname));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ─────────────────────────────────────────
// FILE PATHS
// ─────────────────────────────────────────
const submissionsFile = path.join(__dirname, 'submissions.json');
const adminKeyFile = path.join(__dirname, 'admin-key.json');
const configFile = path.join(__dirname, 'config.json');

// ─────────────────────────────────────────
// INITIALIZATION
// ─────────────────────────────────────────
async function initializeFiles() {
  try {
    await fs.access(submissionsFile);
  } catch {
    await fs.writeFile(submissionsFile, JSON.stringify([], null, 2));
  }

  try {
    await fs.access(adminKeyFile);
  } catch {
    // Create admin key with hashed password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'admin123', saltRounds);
    const defaultKey = {
      passwordHash: hashedPassword,
      createdAt: new Date().toISOString(),
      updatedAt: null
    };
    await fs.writeFile(adminKeyFile, JSON.stringify(defaultKey, null, 2));
    console.log('⚠️  Admin password initialized. Change it immediately!');
  }

  try {
    await fs.access(configFile);
  } catch {
    const defaultConfig = {
      pdfColors: {
        headerBg: '#8b0000',
        accentBg: '#f5d780',
        textPrimary: '#000000',
        textSecondary: '#666666'
      },
      discordWebhook: process.env.DISCORD_WEBHOOK_URL || null,
      emailConfig: {
        from: process.env.EMAIL_USER || 'noreply@crosscut.portfolio',
        name: 'CROSSCUT Portfolio'
      }
    };
    await fs.writeFile(configFile, JSON.stringify(defaultConfig, null, 2));
  }
}

initializeFiles().catch(console.error);

// ─────────────────────────────────────────
// VALIDATION FUNCTIONS
// ─────────────────────────────────────────

function validateEmail(email) {
  const emailRegex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
  return emailRegex.test(email);
}

function sanitizeInput(input) {
  if (typeof input !== 'string') return input;
  return input
    .replace(/[<>]/g, '') // Remove angle brackets
    .substring(0, 5000) // Limit length
    .trim();
}

// MINIMAL VALIDATION - Only check non-empty fields (1+ character)
// All other constraints removed - users can submit anything except empty
function validateSubmission(submission) {
  const errors = [];
  
  // Only check if fields are non-empty (at least 1 character)
  if (!submission.name || submission.name.trim().length < 1) {
    errors.push('Name is required');
  }
  
  if (!submission.email || submission.email.trim().length < 1) {
    errors.push('Email is required');
  }
  
  if (!submission.projectType || submission.projectType.trim().length < 1) {
    errors.push('Project type is required');
  }
  
  if (!submission.message || submission.message.trim().length < 1) {
    errors.push('Message is required');
  }
  
  return { isValid: errors.length === 0, errors };
}

// ─────────────────────────────────────────
// DISCORD WEBHOOK NOTIFICATION
// ─────────────────────────────────────────
async function sendDiscordNotification(type, data) {
  try {
    const config = JSON.parse(await fs.readFile(configFile, 'utf-8'));
    const webhookUrl = config.discordWebhook || process.env.DISCORD_WEBHOOK_URL;
    
    if (!webhookUrl) {
      console.log('⚠️  Discord webhook not configured');
      return;
    }

    let embed = {};
    
    if (type === 'new_submission') {
      embed = {
        title: 'New Portfolio Submission',
  description: 'New client inquiry received.\n\n -> Reply from: https://crosscut.rf.gd/admin.html',
  color: 0x8b0000,
  fields: [
    { name: 'Name', value: data.name, inline: true },
    { name: 'Email', value: data.email, inline: true },
    { name: 'Project Type', value: data.projectType, inline: false },
    {
      name: 'Message',
      value: data.message.length > 100
        ? data.message.substring(0, 100) + '...'
        : data.message,
      inline: false
    },
    { name: 'Amount', value: data.amount || 'Contact for quote', inline: true },
    { name: 'Submission ID', value: data.id, inline: true }
  ],
  footer: {
    text: 'CROSSCUT Portfolio System'
  },
  timestamp: new Date().toISOString()
};
    } else if (type === 'reply_sent') {
      embed = {
        title: 'Reply Sent to Client',
        color: 0x00ff00,
        fields: [
          { name: 'Client', value: data.clientName, inline: true },
          { name: 'Email', value: data.clientEmail, inline: true },
          { name: 'ID', value: data.submissionId, inline: false }
        ],
        timestamp: new Date().toISOString()
      };
    } else if (type === 'security_alert') {
      embed = {
        title: '⚠️ Security Alert',
        color: 0xff0000,
        fields: [
          { name: 'Alert', value: data.message, inline: false },
          { name: 'IP/Details', value: data.details || 'N/A', inline: false }
        ],
        timestamp: new Date().toISOString()
      };
    } else if (type === 'login') {
      embed = {
        title: 'LOgin',
        color: 0x00ff00,
        fields: [
          { name: 'Alert', value: data.message, inline: false },
          { name: 'IP/Details', value: data.details || 'N/A', inline: false }
        ],
        timestamp: new Date().toISOString()
      };
    }

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [embed],
        username: 'CROSSCUT Admin Bot',
        avatar_url: 'https://raw.githubusercontent.com/your-repo/logo.png'
      })
    });

    console.log(`✅ Discord notification sent: ${type}`);
  } catch (error) {
    console.error('Discord notification error:', error);
  }
}

// ─────────────────────────────────────────
// PDF GENERATION with Customizable Colors
// ─────────────────────────────────────────
async function generatePDF(submission, customColors = {}) {
  return new Promise(async (resolve, reject) => {
    try {
      const config = JSON.parse(
        await fs.readFile(configFile, 'utf-8')
      );

      const colors = {
        ...config.pdfColors,
        ...customColors
      };

      const doc = new PDFDocument({
        margin: 50,
        size: 'A4'
      });

      const chunks = [];

      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const logoPath = path.join(__dirname, 'logo.png');

      // ==========================
      // HEADER
      // ==========================

      doc.rect(0, 0, doc.page.width, 100)
         .fill('#111827');

      try {
        await fs.access(logoPath);

        doc.image(
          logoPath,
          40,
          15,
          {
            fit: [140, 70],
            align: 'left'
          }
        );
      } catch (err) {
        console.log('Logo not found');
      }

      doc.fillColor('white')
         .fontSize(24)
         .font('Helvetica-Bold')
         .text(
           'PROJECT QUOTATION',
           320,
           30
         );

      doc.fillColor('#d1d5db')
         .fontSize(10)
         .font('Helvetica')
         .text(
           `Quote ID: ${submission.id}`,
           320,
           60
         );

      doc.moveTo(40, 110)
         .lineTo(555, 110)
         .strokeColor('#d4af37')
         .lineWidth(2)
         .stroke();

      // ==========================
      // CLIENT INFO CARD
      // ==========================

      doc.roundedRect(
        40,
        130,
        515,
        90,
        8
      )
      .fillAndStroke(
        '#f8fafc',
        '#e5e7eb'
      );

      doc.fillColor('#111827')
         .fontSize(14)
         .font('Helvetica-Bold')
         .text(
           'CLIENT INFORMATION',
           55,
           145
         );

      doc.fillColor('#374151')
         .fontSize(11)
         .font('Helvetica');

      doc.text(
        `Name: ${sanitizeInput(submission.name)}`,
        55,
        170
      );

      doc.text(
        `Email: ${sanitizeInput(submission.email)}`,
        55,
        188
      );

      doc.text(
        `Date: ${new Date(
          submission.timestamp
        ).toLocaleDateString()}`,
        320,
        170
      );

      doc.text(
        `Status: ${submission.status || 'Pending Review'}`,
        320,
        188
      );

      // ==========================
      // PROJECT DETAILS
      // ==========================

      doc.fillColor('#111827')
         .fontSize(14)
         .font('Helvetica-Bold')
         .text(
           'PROJECT DETAILS',
           50,
           250
         );

      doc.fillColor('#374151')
         .fontSize(11)
         .font('Helvetica')
         .text(
           `Project Type: ${sanitizeInput(
             submission.projectType
           )}`,
           50,
           275
         );

      // ==========================
      // DESCRIPTION CARD
      // ==========================

      doc.roundedRect(
        40,
        300,
        515,
        120,
        8
      )
      .fillAndStroke(
        '#ffffff',
        '#e5e7eb'
      );

      doc.fillColor('#111827')
         .fontSize(12)
         .font('Helvetica-Bold')
         .text(
           'PROJECT DESCRIPTION',
           55,
           315
         );

      doc.fillColor('#4b5563')
         .fontSize(10)
         .font('Helvetica')
         .text(
           sanitizeInput(submission.message),
           55,
           340,
           {
             width: 480,
             height: 70,
             align: 'left'
           }
         );

      // ==========================
      // QUOTE BOX
      // ==========================

      doc.roundedRect(
        40,
        450,
        515,
        70,
        10
      )
      .fill('#d4af37');

      doc.fillColor('#111827')
         .fontSize(14)
         .font('Helvetica-Bold')
         .text(
           'PROJECT QUOTE',
           60,
           470
         );

      doc.fontSize(24)
         .text(
           `$${submission.amount || 'TBD'}`,
           370,
           463,
           {
             width: 150,
             align: 'right'
           }
         );

      // ==========================
      // FOOTER
      // ==========================

      doc.fillColor('#6b7280')
         .fontSize(9)
         .font('Helvetica');

      doc.text(
        'Thank you for choosing CROSSCUT.',
        50,
        650,
        {
          width: 500,
          align: 'center'
        }
      );

      doc.text(
        'Please reply to this email with the attached PDF to begin the verification process.',
        50,
        665,
        {
          width: 500,
          align: 'center'
        }
      );

      doc.text(
        'crosscut.rf.gd',
        50,
        685,
        {
          width: 500,
          align: 'center'
        }
      );

      doc.end();

    } catch (error) {
      reject(error);
    }
  });
}

// ─────────────────────────────────────────
// EMAIL SENDING with Environment Variables
// ─────────────────────────────────────────

transporter.verify(function(error, success) {
  if (error) {
    console.error("SMTP Verify Error:", error);
  } else {
    console.log("SMTP Server Ready");
  }
});

async function sendEmail(to, subject, htmlContent, pdfBuffer) {
  try {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.error('❌ Email credentials not configured');
      console.error('   Set EMAIL_USER and EMAIL_PASS in .env file');
      console.error('   Run: node EMAIL-DIAGNOSTIC.js to verify setup');
      return false;
    }

    const transporter = nodemailer.createTransport({
      service: process.env.EMAIL_SERVICE || 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    // ONLY PDF attachment - NO LOGO
    const attachments = pdfBuffer ? [
      {
        filename: 'project-quote.pdf',
        content: Buffer.from(pdfBuffer),
        contentType: 'application/pdf'
      }
    ] : [];

    // Email configuration to avoid spam folder
    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || 'CROSSCUT'}" <${process.env.EMAIL_USER}>`,
      replyTo: process.env.EMAIL_USER,
      to: sanitizeInput(to),
      subject: subject,
      html: htmlContent,
      // Add headers to improve deliverability
      headers: {
        'X-Mailer': 'CROSSCUT Portfolio System',
        'X-Priority': '3',
        'Importance': 'normal',
        'X-MSMail-Priority': 'Normal'
      },
      // Only PDF attachment - NO LOGO
      attachments: attachments,
      // Plain text version for better deliverability
      text: htmlContent.replace(/<[^>]*>/g, '').trim()
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Email sent to: ${to}`);
    return true;
  } catch (error) {
    console.error('❌ Email error:', error.message);
    console.error('   Service:', process.env.EMAIL_SERVICE || 'gmail');
    console.error('   From:', process.env.EMAIL_USER);
    console.error('');
    console.error('   TROUBLESHOOT:');
    console.error('   1. Run: node EMAIL-DIAGNOSTIC.js');
    console.error('   2. Check .env file exists and is readable');
    if ((process.env.EMAIL_SERVICE || 'gmail') === 'gmail') {
      console.error('   3. For Gmail: Use App Password from');
      console.error('      https://myaccount.google.com/apppasswords');
    }
    return false;
  }
}

// ─────────────────────────────────────────
// ROUTES: PUBLIC - Submit Request
// ─────────────────────────────────────────
app.post('/api/submit-request', submitLimiter, async (req, res) => {
  try {
    const { name, email, projectType, message, amount } = req.body;

    // Validate input
    const validationResult = validateSubmission({ name, email, projectType, message });
    if (!validationResult.isValid) {
      return res.status(400).json({
        success: false,
        error: validationResult.errors.join('. '),
        errors: validationResult.errors
      });
    }

    const submission = {
      id: uuidv4().substring(0, 8),
      name: sanitizeInput(name),
      email: sanitizeInput(email),
      projectType: sanitizeInput(projectType),
      message: sanitizeInput(message),
      amount: amount ? sanitizeInput(amount) : 'Contact for quote',
      status: 'pending',
      timestamp: new Date().toISOString(),
      repliedAt: null
    };

    // Read existing submissions
    let submissions = [];
    try {
      const data = await fs.readFile(submissionsFile, 'utf-8');
      submissions = JSON.parse(data);
    } catch {
      submissions = [];
    }

    submissions.push(submission);
    await fs.writeFile(submissionsFile, JSON.stringify(submissions, null, 2));

    // Send Discord notification
    await sendDiscordNotification('new_submission', submission);

    res.json({
      success: true,
      message: 'Request submitted successfully',
      submission: {
        id: submission.id,
        timestamp: submission.timestamp
      }
    });
  } catch (error) {
    console.error('❌ Submission error:', error);
    res.status(500).json({ success: false, error: 'Failed to process submission' });
  }
});

// ─────────────────────────────────────────
// ROUTES: ADMIN - Authentication Helper
// ─────────────────────────────────────────
async function verifyAdminPassword(providedPassword) {
  try {
    const keyData = await fs.readFile(adminKeyFile, 'utf-8');
    const { passwordHash } = JSON.parse(keyData);
    return await bcrypt.compare(providedPassword, passwordHash);
  } catch (error) {
    console.error('❌ Admin verification error:', error);
    return false;
  }
}

// ─────────────────────────────────────────
// ROUTES: ADMIN - Get Submissions
// ─────────────────────────────────────────
app.post('/api/admin/get-submissions', adminLimiter, async (req, res) => {
  try {
    const { adminPassword } = req.body;

    if (!adminPassword) {
      await sendDiscordNotification('security_alert', {
        message: 'Admin endpoint accessed without password',
        details: req.ip
      });
      return res.status(401).json({ success: false, error: 'Password required' });
    }

    const isValid = await verifyAdminPassword(adminPassword);
    if (!isValid) {
      await sendDiscordNotification('security_alert', {
        message: 'Failed admin authentication attempt',
        details: req.ip
      });
      return res.status(401).json({ success: false, error: 'Invalid admin password' });
    }
    else{
      await sendDiscordNotification('login', {
        message: 'login successfull',
        details: req.ip
      });
    }
    const data = await fs.readFile(submissionsFile, 'utf-8');
    const submissions = JSON.parse(data);

    res.json({ success: true, submissions });
  } catch (error) {
    console.error('❌ Get submissions error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch submissions' });
  }
});

// ─────────────────────────────────────────
// ROUTES: ADMIN - Get Submission PDF
// ─────────────────────────────────────────
app.post('/api/admin/get-submission-pdf', adminLimiter, async (req, res) => {
  try {
    const { submissionId, adminPassword } = req.body;

    const isValid = await verifyAdminPassword(adminPassword);
    if (!isValid) {
      return res.status(401).json({ success: false, error: 'Invalid admin password' });
    }

    const data = await fs.readFile(submissionsFile, 'utf-8');
    const submissions = JSON.parse(data);
    const submission = submissions.find(s => s.id === submissionId);

    if (!submission) {
      return res.status(404).json({ success: false, error: 'Submission not found' });
    }

    const pdfBuffer = await generatePDF(submission);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="quote-${submission.id}.pdf"`);
    res.send(Buffer.from(pdfBuffer));
  } catch (error) {
    console.error('❌ PDF generation error:', error);
    res.status(500).json({ success: false, error: 'Failed to generate PDF' });
  }
});

// ─────────────────────────────────────────
// ROUTES: ADMIN - Send Reply
// ─────────────────────────────────────────
app.post('/api/admin/send-reply', adminLimiter, async (req, res) => {
  try {
    const { submissionId, adminPassword, message, includeQuote } = req.body;

    const isValid = await verifyAdminPassword(adminPassword);
    if (!isValid) {
      return res.status(401).json({ success: false, error: 'Invalid admin password' });
    }

    let data = await fs.readFile(submissionsFile, 'utf-8');
    let submissions = JSON.parse(data);
    let submission = submissions.find(s => s.id === submissionId);

    if (!submission) {
      return res.status(404).json({ success: false, error: 'Submission not found' });
    }

    // Update submission
    submission.status = 'replied';
    submission.repliedAt = new Date().toISOString();
    await fs.writeFile(submissionsFile, JSON.stringify(submissions, null, 2));

    // Generate PDF if needed
    let pdfBuffer = null;
    if (includeQuote) {
      pdfBuffer = await generatePDF(submission);
    }

    // Send email
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <h2 style="color: #8b0000;">Hello ${sanitizeInput(submission.name)},</h2>
        <p>Thank you for reaching out to CROSSCUT! We've received your project inquiry.</p>
        <div style="background: #f5d780; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p><strong>Project:</strong> ${sanitizeInput(submission.projectType)}</p>
          <p><strong>Our Response:</strong></p>
          <p>${sanitizeInput(message).replace(/\\n/g, '<br>')}</p>
        </div>
        <p>We're excited to discuss your project further. Please feel free to reply with any questions.</p>
        <p style="color: #666; font-size: 12px; margin-top: 30px;">
          CROSSCUT | Visual Storyteller<br>
          ${process.env.EMAIL_FROM_NAME || 'CROSSCUT'}
        </p>
      </div>
    `;

    const emailSent = await sendEmail(submission.email, 'CROSSCUT - Project Inquiry Response', htmlContent, pdfBuffer);

    if (emailSent) {
      await sendDiscordNotification('reply_sent', {
        clientName: submission.name,
        clientEmail: submission.email,
        submissionId: submission.id
      });
    }

    res.json({
      success: emailSent,
      message: emailSent ? 'Reply sent successfully' : 'Email failed to send',
      submission
    });
  } catch (error) {
    console.error('❌ Send reply error:', error);
    res.status(500).json({ success: false, error: 'Failed to send reply' });
  }
});

// ─────────────────────────────────────────
// ROUTES: ADMIN - Update Password
// ─────────────────────────────────────────
app.post('/api/admin/update-password', adminLimiter, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, error: 'Both passwords required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
    }

    const isValid = await verifyAdminPassword(currentPassword);
    if (!isValid) {
      await sendDiscordNotification('security_alert', {
        message: 'Failed password change attempt',
        details: req.ip
      });
      return res.status(401).json({ success: false, error: 'Current password is incorrect' });
    }

    // Hash new password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    const keyData = await fs.readFile(adminKeyFile, 'utf-8');
    const keyInfo = JSON.parse(keyData);
    keyInfo.passwordHash = hashedPassword;
    keyInfo.updatedAt = new Date().toISOString();

    await fs.writeFile(adminKeyFile, JSON.stringify(keyInfo, null, 2));

    await sendDiscordNotification('security_alert', {
      message: 'Admin password was updated',
      details: req.ip
    });

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    console.error('❌ Update password error:', error);
    res.status(500).json({ success: false, error: 'Failed to update password' });
  }
});

// ─────────────────────────────────────────
// ROUTES: ADMIN - Delete Submission
// ─────────────────────────────────────────
app.post('/api/admin/delete-submission', adminLimiter, async (req, res) => {
  try {
    const { submissionId, adminPassword } = req.body;

    const isValid = await verifyAdminPassword(adminPassword);
    if (!isValid) {
      return res.status(401).json({ success: false, error: 'Invalid admin password' });
    }

    let data = await fs.readFile(submissionsFile, 'utf-8');
    let submissions = JSON.parse(data);
    const originalLength = submissions.length;
    
    submissions = submissions.filter(s => s.id !== submissionId);

    if (submissions.length === originalLength) {
      return res.status(404).json({ success: false, error: 'Submission not found' });
    }

    await fs.writeFile(submissionsFile, JSON.stringify(submissions, null, 2));

    await sendDiscordNotification('security_alert', {
      message: `Submission deleted: ${submissionId}`,
      details: req.ip
    });

    res.json({ success: true, message: 'Submission deleted' });
  } catch (error) {
    console.error('❌ Delete error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete submission' });
  }
});

// ─────────────────────────────────────────
// ROUTES: ADMIN - Get Config
// ─────────────────────────────────────────
app.get('/api/admin/config', async (req, res) => {
  try {
    const config = JSON.parse(await fs.readFile(configFile, 'utf-8'));
    // Don't send sensitive data
    res.json({
      success: true,
      colors: config.pdfColors,
      discordConnected: !!config.discordWebhook
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─────────────────────────────────────────
// SERVER START
// ─────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\\n╔══════════════════════════════════════╗`);
  console.log(`║  🎬 CROSSCUT Admin Server Running    ║`);
  console.log(`╚══════════════════════════════════════╝`);
  console.log(`📍 Port: ${PORT}`);
  console.log(`🌐 Admin: http://localhost:${PORT}/admin.html`);
  console.log(`🔐 Security: ${process.env.NODE_ENV === 'production' ? 'PRODUCTION MODE ✅' : 'DEVELOPMENT MODE ⚠️'}`);
  console.log(`\\n⚙️  Configuration:`);
  console.log(`   - Rate Limiting: Enabled`);
  console.log(`   - Password Hashing: BCrypt (${process.env.NODE_ENV !== 'development' ? 'Production' : 'Development'})`);
  console.log(`   - Discord Webhook: ${process.env.DISCORD_WEBHOOK_URL ? '✅ Connected' : '❌ Not configured'}`);
  console.log(`   - Email Service: ${process.env.EMAIL_SERVICE || 'Gmail'}`);
  console.log(`\\n⚠️  SECURITY REMINDERS:`);
  console.log(`   - Change admin password immediately!`);
  console.log(`   - Configure .env with your credentials`);
  console.log(`   - Use HTTPS in production`);
  console.log(`   - Set CORS_ORIGIN to your domain`);
  console.log(`\\n`);
});
