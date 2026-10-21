/**
 * Seeds demo inspectors + a few assigned inspection jobs so the inspector
 * portal has data during development. Idempotent-ish: skips inspectors that
 * already exist. Refuses to run in production.
 *
 *   node prisma/seed-inspectors.mjs
 */
import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";

const prisma = new PrismaClient();

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    console.log("Refusing to seed in production.");
    return;
  }

  const inspectors = [
    {
      name: "Omar Haddad Auto Inspection LLC", email: "inspector@wheelerdealers.test", phone: "0501112233",
      contactPerson: "Omar Haddad", tradeLicense: "CN-1000001", areas: "Dubai, Sharjah",
      services: "Pre-purchase inspection, diagnostics", approvalStatus: "approved",
    },
    {
      name: "Sara Khan Vehicle Checks", email: "sara@wheelerdealers.test", phone: "0504445566",
      contactPerson: "Sara Khan", tradeLicense: "CN-1000002", areas: "Dubai, Abu Dhabi",
      services: "Pre-purchase inspection", approvalStatus: "approved",
    },
    {
      name: "Pending Motors Inspection FZE", email: "pending@wheelerdealers.test", phone: "0507778899",
      contactPerson: "Bilal Riaz", tradeLicense: "CN-1000003", areas: "Ajman",
      services: "Pre-purchase inspection", approvalStatus: "pending",
    },
  ];

  const created = {};
  for (const i of inspectors) {
    const existing = await prisma.inspector.findUnique({ where: { email: i.email } });
    if (existing) {
      created[i.email] = existing;
      console.log(`Inspector exists: ${i.email}`);
      continue;
    }
    const rec = await prisma.inspector.create({
      data: { ...i, passwordHash: hashPassword("inspector1234"), active: true },
    });
    created[i.email] = rec;
    console.log(`Created inspector: ${i.email} (password: inspector1234)`);
  }

  const omar = created["inspector@wheelerdealers.test"];
  if (!omar) return;

  // Only seed demo jobs once.
  const jobCount = await prisma.inspectionJob.count({
    where: { assignedInspectorId: omar.id },
  });
  if (jobCount > 0) {
    console.log(`Omar already has ${jobCount} jobs; skipping demo jobs.`);
    return;
  }

  const today = new Date();
  const at = (dayOffset, hour) => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + dayOffset, hour, 0);
    return d;
  };

  const demo = [
    {
      status: "available", make: "Kia", model: "Sportage", year: 2022,
      customerName: "Maryam Said", customerMobile: "0553334455", customerEmail: "maryam@example.com",
      address: "Mirdif", city: "Mirdif", emirate: "Dubai",
      scheduledAt: at(1, 10), scheduledSlot: "10:00 AM",
      paymentStatus: "paid", paymentProvider: "dev-auto", paidAt: new Date(),
      unassigned: true,
    },
    {
      status: "accepted", make: "Toyota", model: "Corolla", year: 2019,
      customerName: "Ahmed Ali", customerMobile: "0559998877", customerEmail: "ahmed@example.com",
      address: "Marina Walk, Dubai Marina", city: "Dubai Marina", emirate: "Dubai",
      scheduledAt: at(0, 9), scheduledSlot: "09:00 AM",
      paymentStatus: "paid", paymentProvider: "dev-auto", paidAt: new Date(),
      acceptedAt: new Date(), partnerPayout: 200,
    },
    {
      status: "in_progress", make: "BMW", model: "X5", year: 2020,
      customerName: "John Peter", customerMobile: "0567776655", customerEmail: "john@example.com",
      address: "Business Bay", city: "Business Bay", emirate: "Dubai",
      scheduledAt: at(0, 15), scheduledSlot: "03:00 PM", startedAt: new Date(),
      paymentStatus: "paid", paymentProvider: "dev-auto", paidAt: new Date(),
      acceptedAt: new Date(), partnerPayout: 200,
    },
    {
      status: "completed", make: "Honda", model: "Civic", year: 2018,
      customerName: "Layla Hassan", customerMobile: "0552223344", customerEmail: "layla@example.com",
      address: "Sharjah Corniche", city: "Corniche", emirate: "Sharjah",
      scheduledAt: at(-2, 11), scheduledSlot: "11:00 AM", completedAt: at(-2, 12),
      paymentStatus: "paid", paymentProvider: "dev-auto", paidAt: at(-3, 10),
      acceptedAt: at(-3, 10), partnerPayout: 200,
    },
  ];

  let seq = 1;
  const stamp = `${String(today.getFullYear()).slice(2)}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
  for (const { unassigned, ...d } of demo) {
    await prisma.inspectionJob.create({
      data: {
        jobCode: `WD-${stamp}-D${String(seq++).padStart(3, "0")}`,
        ...(unassigned ? {} : { assignedInspectorId: omar.id, assignedAt: new Date() }),
        fee: 299,
        currency: "AED",
        ...d,
      },
    });
  }
  console.log(`Created ${demo.length} demo jobs for ${omar.email}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
