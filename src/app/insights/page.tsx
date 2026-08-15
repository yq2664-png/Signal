import { Suspense } from "react";
import { InsightsPage } from "@/components/insights/InsightsPage";

export default function Page() {
  return (
    <Suspense>
      <InsightsPage />
    </Suspense>
  );
}
