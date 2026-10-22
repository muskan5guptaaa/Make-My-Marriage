import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import { env } from '../config/env.js';

// Which way email goes out, picked from .env:
//   smtp    — SMTP_HOST/SMTP_USER/SMTP_PASS set (e.g. Gmail with an app password; free, reaches anyone)
//   resend  — RESEND_API_KEY set (free plan reaches only your own address until a domain is verified)
//   console — neither set: the email is printed in the terminal and NOT delivered
const smtpReady = Boolean(env.smtp.host && env.smtp.user && env.smtp.pass);
export const emailMode = env.isTest ? 'test' : smtpReady ? 'smtp' : env.resendApiKey ? 'resend' : 'console';

let transport;
let resend;

// Returns { delivered }: false means nobody received it, so callers can tell the user.
export async function sendEmail({ to, subject, text }) {
  if (emailMode === 'test') {
    sentEmails.push({ to, subject, text });
    return { delivered: true };
  }
  if (emailMode === 'console') {
    console.log(`\n--- email NOT sent (no email provider in .env) ---\nTo: ${to}\nSubject: ${subject}\n\n${text}\n---\n`);
    return { delivered: false };
  }
  if (emailMode === 'smtp') {
    transport ??= nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.port === 465,
      auth: { user: env.smtp.user, pass: env.smtp.pass },
    });
    await transport.sendMail({ from: env.emailFrom || env.smtp.user, to, subject, text });
    return { delivered: true };
  }
  resend ??= new Resend(env.resendApiKey);
  const from = env.emailFrom || 'Make My Marriage <onboarding@resend.dev>';
  const { error } = await resend.emails.send({ from, to, subject, text });
  if (error) throw new Error(`Resend: ${error.message}`);
  return { delivered: true };
}

export const sentEmails = [];
