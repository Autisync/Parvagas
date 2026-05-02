import nodemailer from "nodemailer";
import NotificationLog from "../models/notificationLog.js";

const hasEmailConfig = Boolean(process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS);

const emailPort = Number(process.env.EMAIL_PORT || 587);
const emailSecure = process.env.EMAIL_SECURE === "true";
const emailRequireTls = process.env.EMAIL_REQUIRE_TLS
  ? process.env.EMAIL_REQUIRE_TLS === "true"
  : !emailSecure && emailPort === 587;

let transporter = null;
if (hasEmailConfig) {
  transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: emailPort,
    secure: emailSecure,
    requireTLS: emailRequireTls,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
}

export const sendEmailNotification = async ({ userId, to, toEmail, subject, body, html }) => {
  const recipient = to || toEmail;
  const log = await NotificationLog.create({
    userId,
    channel: "email",
    to: recipient,
    subject,
    body,
    status: transporter && recipient ? "queued" : "skipped",
    error: transporter ? (recipient ? "" : "Email recipient not provided") : "EMAIL provider not configured",
  });

  if (!transporter || !recipient) return log;

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || "no-reply@parvagas.local",
      to: recipient,
      subject,
      text: body,
      html,
    });

    log.status = "sent";
    await log.save();
    return log;
  } catch (error) {
    log.status = "failed";
    log.error = error.message;
    await log.save();
    return log;
  }
};

export const sendSmsNotification = async ({ userId, body }) => {
  return NotificationLog.create({
    userId,
    channel: "sms",
    body,
    status: "skipped",
    error: "SMS provider adapter not configured",
  });
};

export const sendWhatsappNotification = async ({ userId, body }) => {
  return NotificationLog.create({
    userId,
    channel: "whatsapp",
    body,
    status: "skipped",
    error: "WhatsApp provider adapter not configured",
  });
};
