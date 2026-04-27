// Stub fuer @/lib/email — verhindert dass nodemailer im qa-smoke-Bundle landet.
export async function sendMail() {
  return { ok: true };
}
export default { sendMail };
