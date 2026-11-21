import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminEmail, getAdminUserId, isAdmin } from "@/lib/auth";

export interface AdminIdentity {
  id: string; // "admin" for the owner login, AdminUser id for staff
  name: string;
  email: string;
  staff: boolean;
}

/** Who is signed in on the admin side: the owner (shared env login) or a named staff member. */
export async function getAdminIdentity(req: NextRequest): Promise<AdminIdentity | null> {
  if (!isAdmin(req)) return null;
  const staffId = getAdminUserId(req);
  if (!staffId) return { id: "admin", name: "Super Admin", email: getAdminEmail(), staff: false };
  const u = await prisma.adminUser.findUnique({ where: { id: staffId }, select: { id: true, name: true, email: true, active: true } });
  if (!u || !u.active) return null; // deactivated staff lose access immediately
  return { id: u.id, name: u.name, email: u.email, staff: true };
}

/** Admin guard for API routes: owner login, or a staff login that is still active. */
export async function isActiveAdmin(req: NextRequest): Promise<boolean> {
  return (await getAdminIdentity(req)) !== null;
}
