/**
 * One-time multi-tenant migration: every legacy standalone Inspector row
 * (which semantically was an inspection COMPANY before the parent/child split)
 * gets a real InspectionCompany created from its profile. The inspector row
 * is kept as the company's first inspector (same login keeps working), and
 * that inspector's jobs are linked to the new company via acceptedByCompanyId.
 *
 * Idempotent: skips inspectors that already have a companyId.
 *
 *   node prisma/migrate-companies.mjs
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const legacy = await prisma.inspector.findMany({ where: { companyId: null } });
  if (legacy.length === 0) {
    console.log("Nothing to migrate — all inspectors already belong to a company.");
    return;
  }

  for (const insp of legacy) {
    const company = await prisma.inspectionCompany.create({
      data: {
        name: insp.name,
        email: insp.email, // separate table, so same email is fine
        passwordHash: insp.passwordHash, // existing login becomes the company login
        phone: insp.phone,
        active: insp.active,
        pocName: insp.contactPerson ?? insp.name,
        pocMobile: insp.phone,
        pocEmail: insp.email,
        tradeLicense: insp.tradeLicense,
        areas: insp.areas,
        services: insp.services,
        bankName: insp.bankName,
        bankIban: insp.bankIban,
        approvalStatus: insp.approvalStatus,
        createdAt: insp.createdAt,
      },
    });

    await prisma.inspector.update({
      where: { id: insp.id },
      data: { companyId: company.id },
    });

    const linked = await prisma.inspectionJob.updateMany({
      where: { assignedInspectorId: insp.id, acceptedByCompanyId: null },
      data: { acceptedByCompanyId: company.id },
    });

    console.log(`✓ ${insp.email} → company "${company.name}" (${company.id}), ${linked.count} jobs linked`);
  }

  console.log(`Migrated ${legacy.length} inspector(s) into companies.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
