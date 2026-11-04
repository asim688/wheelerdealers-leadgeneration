import { prisma } from "./prisma";
import { getBaseUrl, sendEmail } from "./inspection";
import { brandEmail, esc } from "./emailTemplates";

/**
 * Company registration requirements shared by registration, admin approval,
 * job acceptance and the company / admin portals.
 */

export const REQUIRED_DOC_KINDS = ["trade_license", "vat_certificate", "iban_letter"] as const;

export const DOC_KIND_LABEL: Record<string, string> = {
  trade_license: "Company Trade License",
  vat_certificate: "VAT Certificate",
  iban_letter: "Bank IBAN Letter",
};

interface BankFields {
  bankAccountTitle: string | null;
  bankAccountNumber: string | null;
  bankIban: string | null;
  bankName: string | null;
  bankBranch: string | null;
}

/** Human-readable list of what is still missing for payouts (bank fields + IBAN letter). */
export function payoutGaps(c: BankFields, docKinds: string[]): string[] {
  const gaps: string[] = [];
  if (!c.bankAccountTitle) gaps.push("account title");
  if (!c.bankAccountNumber) gaps.push("account number");
  if (!c.bankIban) gaps.push("IBAN");
  if (!c.bankName) gaps.push("bank name");
  if (!c.bankBranch) gaps.push("bank branch");
  if (!docKinds.includes("iban_letter")) gaps.push("Bank IBAN Letter");
  return gaps;
}

export function missingDocs(docKinds: string[]): string[] {
  return REQUIRED_DOC_KINDS.filter((k) => !docKinds.includes(k)).map((k) => DOC_KIND_LABEL[k]);
}

/** Loads a company's payout gaps (empty array = complete). */
export async function companyPayoutGaps(companyId: string): Promise<string[] | null> {
  const c = await prisma.inspectionCompany.findUnique({
    where: { id: companyId },
    select: {
      bankAccountTitle: true,
      bankAccountNumber: true,
      bankIban: true,
      bankName: true,
      bankBranch: true,
      documents: { select: { kind: true } },
    },
  });
  if (!c) return null;
  return payoutGaps(c, c.documents.map((d) => d.kind));
}

export const PAYOUT_BLOCK_MESSAGE =
  "Add your bank details and Bank IBAN Letter (Payout details on your dashboard) before accepting new jobs.";

/** Distinct, non-empty recipients (company email + PoC email). */
export function companyRecipients(email: string, pocEmail: string | null | undefined): string[] {
  return Array.from(new Set([email, pocEmail].filter((e): e is string => !!e).map((e) => e.toLowerCase())));
}

/** Sent right after a company submits its registration. */
export async function sendApplicationReceivedEmail(c: { name: string; email: string; pocName: string | null; pocEmail: string | null }) {
  const html = brandEmail({
    heading: "We've received your application",
    bodyHtml: `<p style="margin:0 0 12px">Salaam ${esc(c.pocName || c.name)},</p>
<p style="margin:0 0 12px">Thank you for registering <b>${esc(c.name)}</b> as an inspection company on The Wheeler Dealers. Your email address and mobile numbers have been verified.</p>
<p style="margin:0 0 12px">Our team will now review your company details and documents. We'll email you as soon as your account is approved — usually within 1–2 business days.</p>`,
  });
  const text = `Thank you for registering ${c.name} on The Wheeler Dealers. Our team will review your details and email you once your account is approved.`;
  await Promise.allSettled(
    companyRecipients(c.email, c.pocEmail).map((to) => sendEmail(to, "Application received — The Wheeler Dealers", html, text)),
  );
}

/** Sent when the admin approves a company: "successfully registered". */
export async function sendCompanyWelcomeEmail(c: {
  name: string;
  email: string;
  pocName: string | null;
  pocEmail: string | null;
  pocMobile: string | null;
  phone: string | null;
}) {
  const url = `${getBaseUrl()}/company`;
  const html = brandEmail({
    heading: `Welcome to The Wheeler Dealers, ${c.name}!`,
    bodyHtml: `<p style="margin:0 0 12px">Salaam ${esc(c.pocName || c.name)},</p>
<p style="margin:0 0 12px">Congratulations — your company <b>${esc(c.name)}</b> has been <b>successfully registered</b> and approved on The Wheeler Dealers inspection marketplace.</p>
<p style="margin:0 0 6px"><b>Next steps</b></p>
<ol style="margin:0 0 12px;padding-left:20px">
<li>Sign in to your company portal with <b>${esc(c.email)}</b>.</li>
<li>Add your inspectors under <b>My Inspectors</b> — each one verifies their own email and mobile at first sign-in.</li>
<li>Accept live inspection jobs. Your Point of Contact (${esc(c.pocMobile || c.phone || "")}) receives an alert whenever a new job goes live.</li>
</ol>`,
    cta: { label: "Open company portal", url },
  });
  const text = `Welcome to The Wheeler Dealers! Your company ${c.name} has been successfully registered and approved. Sign in at ${url} with ${c.email}, add your inspectors and start accepting jobs.`;
  await Promise.allSettled(
    companyRecipients(c.email, c.pocEmail).map((to) =>
      sendEmail(to, "Welcome to The Wheeler Dealers — your company is registered", html, text),
    ),
  );
}

/** Sent to a newly added inspector (no password — the company shares it). */
export async function sendInspectorAddedEmail(i: { name: string; email: string; companyName: string | null }) {
  const url = `${getBaseUrl()}/inspector`;
  const who = i.companyName ? `<b>${esc(i.companyName)}</b> has added you` : "You have been added";
  const html = brandEmail({
    heading: "You've been added as an inspector",
    bodyHtml: `<p style="margin:0 0 12px">Hi ${esc(i.name)},</p>
<p style="margin:0 0 12px">${who} as an inspector on The Wheeler Dealers.</p>
<p style="margin:0 0 12px">Sign in with <b>${esc(i.email)}</b> and the password your company gave you. The first time you sign in you'll verify your email and mobile number with 6-digit codes — after that your assigned jobs appear in the portal.</p>`,
    cta: { label: "Sign in to the inspector portal", url },
  });
  const text = `${i.companyName ?? "Your company"} has added you as an inspector on The Wheeler Dealers. Sign in at ${url} with ${i.email} and the password your company gave you, then verify your email and mobile.`;
  await sendEmail(i.email, "You've been added as an inspector — The Wheeler Dealers", html, text);
}

/** Sent to a new Account Manager (no password — the super admin shares it). */
export async function sendManagerAddedEmail(m: { name: string; email: string }) {
  const url = `${getBaseUrl()}/manager`;
  const html = brandEmail({
    heading: "You've been added as an Account Manager",
    bodyHtml: `<p style="margin:0 0 12px">Hi ${esc(m.name)},</p>
<p style="margin:0 0 12px">You've been added as an <b>Account Manager</b> on The Wheeler Dealers. You'll verify the inspection reports of the companies assigned to you before they are sent to customers.</p>
<p style="margin:0 0 12px">Sign in with <b>${esc(m.email)}</b> and the password you were given. The first time, you'll verify your email and mobile number with 6-digit codes.</p>`,
    cta: { label: "Open Account Manager portal", url },
  });
  await sendEmail(m.email, "You've been added as an Account Manager — The Wheeler Dealers", html,
    `You've been added as an Account Manager on The Wheeler Dealers. Sign in at ${url} with ${m.email}.`);
}
