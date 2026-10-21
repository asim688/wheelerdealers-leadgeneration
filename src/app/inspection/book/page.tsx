import type { Metadata } from "next";
import Link from "next/link";
import InspectionBooking from "@/components/InspectionBooking";
import { absoluteUrl } from "@/lib/seo";
import { prisma } from "@/lib/prisma";
import { retrieveCheckoutSession } from "@/lib/payments";
import { releasePaidJob } from "@/lib/inspection";

export const metadata: Metadata = {
  title: "Book a Car Inspection Online — Mobile Vehicle Inspection UAE",
  description:
    "Book your professional mobile car inspection online in minutes. 300+ point check with a full digital report, across Dubai, Abu Dhabi, Sharjah and the UAE.",
  keywords: [
    "book car inspection",
    "car inspection appointment",
    "mobile car inspection UAE",
    "vehicle inspection booking",
  ],
  alternates: { canonical: "/inspection/book" },
  openGraph: {
    title: "Book a Car Inspection Online — Mobile Vehicle Inspection UAE",
    description:
      "Book your professional mobile car inspection in minutes — we come to you anywhere in the UAE.",
    url: absoluteUrl("/inspection/book"),
    type: "website",
  },
};

export default async function InspectionBookPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; paid?: string; cancelled?: string; job?: string; session_id?: string }>;
}) {
  const { mode, paid, cancelled, job, session_id } = await searchParams;

  // Back from Stripe Checkout: show a payment result screen instead of a
  // fresh booking. Status is read from the DB (webhook-driven), not the URL.
  if ((paid === "1" || cancelled === "1") && job) {
    let record = await prisma.inspectionJob.findUnique({
      where: { jobCode: job },
      select: { id: true, jobCode: true, paymentStatus: true, customerEmail: true },
    });

    // Webhook race fallback: the customer often lands here before Stripe's
    // webhook arrives. Verify the session directly with Stripe and release
    // the job ourselves — releasePaidJob is atomic, so if the webhook wins
    // (or lands mid-flight) nothing double-fires.
    if (record && paid === "1" && record.paymentStatus === "pending" && session_id) {
      const session = await retrieveCheckoutSession(session_id);
      if (session && session.payment_status === "paid" && session.metadata?.jobId === record.id) {
        await releasePaidJob(record.id, session.id);
        record = { ...record, paymentStatus: "paid" };
      }
    }

    if (record) {
      const isPaid = record.paymentStatus === "paid" || record.paymentStatus === "waived";
      return <PaymentResult paid={isPaid} jobCode={record.jobCode} email={record.customerEmail} />;
    }
  }

  return <InspectionBooking initialMode={mode === "form" ? "form" : "chat"} />;
}

function PaymentResult({ paid, jobCode, email }: { paid: boolean; jobCode: string; email: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-5">
      <div className="mx-auto w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
        {paid ? (
          <>
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-600 text-white">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-neutral-900">Payment Successful!</h1>
            <p className="mt-1 text-sm text-neutral-600">Your inspection is booked and confirmed.</p>
            <div className="mt-5 rounded-xl bg-neutral-50 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Your Job ID</p>
              <p className="mt-1 text-2xl font-bold tracking-wider text-red-700">{jobCode}</p>
            </div>
            <p className="mt-4 text-sm text-neutral-600">
              A confirmation has been sent to <span className="font-medium">{email}</span>. Our
              inspection partner will contact you to finalise the appointment.
            </p>
          </>
        ) : (
          <>
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500 text-white">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 8v4m0 4h.01" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-neutral-900">Payment Not Completed</h1>
            <p className="mt-1 text-sm text-neutral-600">
              Your booking <span className="font-semibold">{jobCode}</span> is saved but not yet
              confirmed — it will only go ahead once payment is completed.
            </p>
            <p className="mt-4 text-sm text-neutral-600">
              You can try again, or contact us if you had trouble paying.
            </p>
          </>
        )}
        <div className="mt-6 flex gap-3">
          <Link
            href="/inspection"
            className="flex-1 rounded-md border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
          >
            Done
          </Link>
          <Link
            href="/inspection/book"
            className="flex-1 rounded-md bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700"
          >
            {paid ? "Book another" : "Try again"}
          </Link>
        </div>
      </div>
    </div>
  );
}
