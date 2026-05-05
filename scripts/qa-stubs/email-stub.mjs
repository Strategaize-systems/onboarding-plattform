// Stub fuer @/lib/email — verhindert dass nodemailer im qa-smoke-Bundle landet.
export async function sendMail() {
  return { ok: true };
}
const emailStub = { sendMail };
export default emailStub;
