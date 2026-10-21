import DealerPortal from "@/components/DealerPortal";

export const metadata = {
  title: "Dealer Core — The Wheeler Dealers",
  description:
    "Dealer auction portal: view live seller leads and bid to win deals.",
  robots: { index: false, follow: false },
};

export default function DealerPage() {
  return <DealerPortal />;
}
