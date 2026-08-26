import "server-only";
import { Resend } from "resend";

/**
 * Optional email layer on top of in-app notifications. No-ops entirely
 * until both RESEND_API_KEY and RESEND_FROM_EMAIL are set — this repo
 * works fully without them, since every notification already exists
 * in-app regardless.
 */
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export async function sendNotificationEmail(to: string, subject: string, text: string) {
  if (!resend || !process.env.RESEND_FROM_EMAIL) return;

  try {
    await resend.emails.send({ from: process.env.RESEND_FROM_EMAIL, to, subject, text });
  } catch (err) {
    // Email is a nice-to-have layered on top of the in-app notification,
    // which already landed — never let delivery trouble surface to the
    // caller (a swap accept, a generation run, etc).
    console.error("Failed to send notification email:", err);
  }
}
