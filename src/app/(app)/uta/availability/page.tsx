import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app-shell/app-shell";
import { AvailabilityGrid } from "./availability-grid";
import type { AvailabilityCell } from "./actions";

export default async function AvailabilityPage() {
  const user = await requireUser();
  if (user.role === "PROFESSOR") redirect("/professor"); // professors don't work office hours, nothing to submit here

  const rows = await prisma.availability.findMany({ where: { userId: user.id } });

  const cells: AvailabilityCell[] = rows.flatMap((row) => {
    const start = Number(row.startTime.split(":")[0]);
    const end = Number(row.endTime.split(":")[0]);
    const hours: AvailabilityCell[] = [];
    for (let hour = start; hour < end; hour++) hours.push({ day: row.dayOfWeek, hour });
    return hours;
  });

  return (
    <>
      <PageHeader title="Your Availability" />
      <AvailabilityGrid initialCells={cells} />
    </>
  );
}
