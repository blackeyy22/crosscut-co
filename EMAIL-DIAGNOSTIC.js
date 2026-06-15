#!/usr/bin/env node
/**
 * CROSSCUT EMAIL DIAGNOSTIC TOOL
 * Checks if your email configuration is correct
 */

import dotenv from 'dotenv';
import nodemailer from 'nodemailer';
import fs from 'fs/promises';

dotenv.config();

const issues = [];
const warnings = [];
const passes = [];

console.log('\n🔍 CROSSCUT EMAIL DIAGNOSTIC TOOL\n');
console.log('='.repeat(50));

// ─────────────────────────────────────────
// CHECK 1: .env FILE EXISTS
// ─────────────────────────────────────────
console.log('\n✓ CHECK 1: Environment Variables');

try {
  const envContent = await fs.readFile('.env', 'utf-8');
  console.log('  ✅ .env file found');
  passes.push('ENV file exists');
} catch {
  issues.push('❌ .env file NOT found - Create it from .env.example');
  console.log('  ❌ .env file missing');
}

// ─────────────────────────────────────────
// CHECK 2: EMAIL CREDENTIALS
// ─────────────────────────────────────────
console.log('\n✓ CHECK 2: Email Credentials');

const emailUser = process.env.EMAIL_USER;
const emailPass = process.env.EMAIL_PASS;
const emailService = process.env.EMAIL_SERVICE || 'gmail';

if (!emailUser) {
  issues.push('❌ EMAIL_USER not set in .env');
  console.log('  ❌ EMAIL_USER missing');
} else {
  console.log(`  ✅ EMAIL_USER: ${emailUser}`);
  passes.push('EMAIL_USER configured');
}

if (!emailPass) {
  issues.push('❌ EMAIL_PASS not set in .env');
  console.log('  ❌ EMAIL_PASS missing');
} else {
  console.log(`  ✅ EMAIL_PASS: ${emailPass.substring(0, 3)}***`);
  passes.push('EMAIL_PASS configured');
}

console.log(`  ℹ️  EMAIL_SERVICE: ${emailService}`);

// ─────────────────────────────────────────
// CHECK 3: GMAIL APP PASSWORD
// ─────────────────────────────────────────
console.log('\n✓ CHECK 3: Gmail Configuration');

if (emailService === 'gmail') {
  if (emailPass && emailPass.length < 16) {
    warnings.push('⚠️  EMAIL_PASS looks too short for Gmail app password (should be ~16 chars)');
    console.log('  ⚠️  Password seems too short (Gmail app password is ~16 chars)');
    console.log('     Are you using a Google App Password?');
    console.log('     Get one: https://myaccount.google.com/apppasswords');
  } else if (emailPass) {
    console.log('  ✅ Password length looks correct for Gmail app password');
    passes.push('Gmail password format OK');
  }

  if (emailUser && emailUser.includes('@gmail.com')) {
    console.log('  ✅ Using Gmail address');
    passes.push('Gmail email address');
  } else if (emailUser) {
    warnings.push('⚠️  EMAIL_USER is not a @gmail.com address but EMAIL_SERVICE is gmail');
    console.log('  ⚠️  Email address is not @gmail.com');
  }
}

// ─────────────────────────────────────────
// CHECK 4: TEST CONNECTION
// ─────────────────────────────────────────
console.log('\n✓ CHECK 4: Test Email Connection');

if (emailUser && emailPass) {
  try {
    console.log('  ⏳ Attempting to connect to email service...');
    
    const transporter = nodemailer.createTransport({
      service: emailService,
      auth: {
        user: emailUser,
        pass: emailPass
      }
    });

    await transporter.verify();
    console.log('  ✅ Email service connection successful!');
    passes.push('Email connection verified');
  } catch (error) {
    issues.push(`❌ Email connection failed: ${error.message}`);
    console.log(`  ❌ Connection failed: ${error.message}`);
    console.log('\n  COMMON CAUSES:');
    console.log('  1. Gmail: Not using App Password (use myaccount.google.com/apppasswords)');
    console.log('  2. Wrong password or typo');
    console.log('  3. Email account has 2FA enabled (must use App Password for Gmail)');
    console.log('  4. Service is blocked by firewall');
  }
} else {
  console.log('  ⏭️  Skipped (missing credentials)');
}

// ─────────────────────────────────────────
// CHECK 5: SEND TEST EMAIL
// ─────────────────────────────────────────
console.log('\n✓ CHECK 5: Send Test Email');

if (emailUser && emailPass) {
  try {
    console.log('  ⏳ Sending test email to: ' + emailUser);
    
    const transporter = nodemailer.createTransport({
      service: emailService,
      auth: {
        user: emailUser,
        pass: emailPass
      }
    });

    const testEmail = await transporter.sendMail({
      from: `"CROSSCUT Diagnostic" <${emailUser}>`,
      to: emailUser,
      subject: '✅ CROSSCUT Email Configuration Test',
      html: `
        <div style="font-family: Arial; line-height: 1.6;">
          <h2 style="color: #8b0000;">✅ Email Configuration Works!</h2>
          <p>If you received this email, your CROSSCUT email system is properly configured.</p>
          <p><strong>Configuration:</strong></p>
          <ul>
            <li>Service: ${emailService}</li>
            <li>From: ${emailUser}</li>
            <li>Timestamp: ${new Date().toISOString()}</li>
          </ul>
          <p style="color: #666; margin-top: 30px; font-size: 12px;">
            You can now send replies to customers!
          </p>
        </div>
      `
    });

    console.log('  ✅ Test email sent successfully!');
    console.log(`  📧 Check your inbox: ${emailUser}`);
    passes.push('Test email sent');
  } catch (error) {
    issues.push(`❌ Failed to send test email: ${error.message}`);
    console.log(`  ❌ Failed to send: ${error.message}`);
  }
} else {
  console.log('  ⏭️  Skipped (missing credentials)');
}

// ─────────────────────────────────────────
// SUMMARY
// ─────────────────────────────────────────
console.log('\n' + '='.repeat(50));
console.log('\n📋 SUMMARY\n');

if (passes.length > 0) {
  console.log(`✅ Passed (${passes.length}):`);
  passes.forEach(p => console.log(`   • ${p}`));
}

if (warnings.length > 0) {
  console.log(`\n⚠️  Warnings (${warnings.length}):`);
  warnings.forEach(w => console.log(`   • ${w}`));
}

if (issues.length > 0) {
  console.log(`\n❌ Issues (${issues.length}):`);
  issues.forEach(i => console.log(`   • ${i}`));
}

console.log('\n' + '='.repeat(50) + '\n');

// ─────────────────────────────────────────
// RECOMMENDATIONS
// ─────────────────────────────────────────
if (issues.length === 0 && warnings.length === 0) {
  console.log('🎉 ALL CHECKS PASSED! Your email is ready to go.\n');
  process.exit(0);
} else if (issues.length === 0) {
  console.log('⚠️  CHECK WARNINGS ABOVE\n');
  process.exit(0);
} else {
  console.log('🔧 FIX THE ISSUES ABOVE\n');
  console.log('QUICK FIX GUIDE:');
  console.log('─────────────────────────────────────────\n');

  if (issues.some(i => i.includes('EMAIL_USER'))) {
    console.log('1️⃣  ADD EMAIL_USER TO .env:');
    console.log('   EMAIL_USER=your-email@gmail.com\n');
  }

  if (issues.some(i => i.includes('EMAIL_PASS'))) {
    console.log('2️⃣  ADD EMAIL_PASS TO .env:');
    console.log('   For Gmail: Use App Password from');
    console.log('   https://myaccount.google.com/apppasswords\n');
  }

  if (issues.some(i => i.includes('connection failed'))) {
    console.log('3️⃣  GMAIL WITH 2FA?');
    console.log('   ✓ Go to https://myaccount.google.com/apppasswords');
    console.log('   ✓ Select "Mail" and "Windows"');
    console.log('   ✓ Copy the 16-character password');
    console.log('   ✓ Use it as EMAIL_PASS in .env\n');
  }

  console.log('Then run this diagnostic again:\n');
  console.log('   node EMAIL-DIAGNOSTIC.js\n');

  process.exit(1);
}
