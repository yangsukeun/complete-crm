import Link from "next/link";
import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { getAppSession } from "@/auth";
import { QuotationEditForm } from "./quotation-edit-form";

export default async function QuotationEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getAppSession();
  if (!session?.user?.id) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-muted-foreground">로그인이 필요합니다.</p>
      </div>
    );
  }

  const { id } = await params;
  const quotation = await prisma.quotation.findUnique({
    where: { id },
    include: {
      items: { orderBy: { sortOrder: "asc" } },
    },
  });

  if (!quotation) notFound();
  if (quotation.issuedById !== session.user.id) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-4">
        <p className="text-muted-foreground">견적서 발행자만 수정할 수 있습니다.</p>
        <Link href={`/quotations/${id}`} prefetch={true} className="text-primary text-sm font-medium hover:underline">
          견적서 보기로 돌아가기
        </Link>
      </div>
    );
  }

  const initial = {
    quotationNumber: quotation.quotationNumber,
    title: quotation.title,
    clientName: quotation.clientName,
    issuedAt: quotation.issuedAt.toISOString().slice(0, 10),
    validUntil: quotation.validUntil.toISOString().slice(0, 10),
    remarks: quotation.remarks,
    projectId: quotation.projectId,
    items: quotation.items.map((i: any) => ({
      description: i.description,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      amount: i.amount,
    })),
  };

  return <QuotationEditForm quotationId={id} initial={initial} />;
}
