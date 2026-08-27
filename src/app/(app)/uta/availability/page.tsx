import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app-shell/app-shell";
import { InlineLoading } from "@/components/app-shell/inline-loading";
import { AvailabilityGrid } from "./availability-grid";
import type { AvailabilityCell } from "./actions";

export default async function AvailabilityPage() {
  const user = await requireUser();
  if (user.role === "PROFESSOR") redirect("/professor"); // professors don't work office hours, nothing to submit here

  return (
    <>
      <PageHeader title="Your Availability" />
      <Suspense fallback={<InlineLoading />}>
        <AvailabilityContent userId={user.id} />
      </Suspense>
    </>
  );
}

async function AvailabilityContent({ userId }: { userId: string }) {
  const rows = await prisma.availability.findMany({ where: { userId } });

  const cells: AvailabilityCell[] = rows.flatMap((row) => {
    const start = Number(row.startTime.split(":")[0]);
    const end = Number(row.endTime.split(":")[0]);
    const hours: AvailabilityCell[] = [];
    for (let hour = start; hour < end; hour++) hours.push({ day: row.dayOfWeek, hour });
    return hours;
  });

  return <AvailabilityGrid initialCells={cells} />;
}
