import prisma from "@/lib/prisma";

export async function loadLeaveLaborConfig() {
  const row = await prisma.companyInfo.findFirst({
    orderBy: { updatedAt: "desc" },
    select: {
      attendanceThreshold: true,
      annualLeaveDaysAfterFirstFullYear: true,
      annualLeaveMonthlyMaxUnderOneYear: true,
    },
  });
  const threshold =
    typeof row?.attendanceThreshold === "number" && Number.isFinite(row.attendanceThreshold)
      ? row.attendanceThreshold
      : 0.8;
  const annualDays =
    typeof row?.annualLeaveDaysAfterFirstFullYear === "number" &&
    Number.isFinite(row.annualLeaveDaysAfterFirstFullYear)
      ? row.annualLeaveDaysAfterFirstFullYear
      : 15;
  const monthlyCap =
    typeof row?.annualLeaveMonthlyMaxUnderOneYear === "number" &&
    Number.isFinite(row.annualLeaveMonthlyMaxUnderOneYear)
      ? row.annualLeaveMonthlyMaxUnderOneYear
      : 11;
  return { threshold, annualDays, monthlyCap };
}
