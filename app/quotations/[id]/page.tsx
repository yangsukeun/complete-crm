import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { getAppSession } from "@/auth";
import { QuotationView } from "./quotation-view";

/** 로그인·견적별 데이터이므로 generateStaticParams 미적용 (항상 동적). */
export const dynamic = "force-dynamic";

export default async function QuotationPage({
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
  const [quotation, company] = await Promise.all([
    prisma.quotation.findUnique({
      where: { id },
      include: {
        issuedBy: { select: { name: true } },
        project: { select: { id: true, name: true } },
        items: {
          orderBy: { sortOrder: "asc" },
          select: {
            description: true,
            quantity: true,
            unitPrice: true,
            amount: true,
            sortOrder: true,
          },
        },
      },
    }),
    prisma.companyInfo.findFirst({
      orderBy: { updatedAt: "desc" },
      select: {
        name: true,
        businessNumber: true,
        representative: true,
        address: true,
        phone: true,
        email: true,
        fax: true,
        stampImageUrl: true,
      },
    }),
  ]);

  if (!quotation) notFound();

  const data = {
    id: quotation.id,
    quotationNumber: quotation.quotationNumber,
    title: quotation.title,
    clientName: quotation.clientName,
    validUntil: quotation.validUntil.toISOString(),
    totalAmount: quotation.totalAmount,
    vatAmount: quotation.vatAmount,
    finalAmount: quotation.finalAmount,
    status: quotation.status,
    issuedAt: quotation.issuedAt.toISOString(),
    updatedAt: quotation.updatedAt.toISOString(),
    remarks: quotation.remarks,
    issuedBy: quotation.issuedBy,
    issuedById: quotation.issuedById,
    items: quotation.items.map((i: any) => ({
      description: i.description,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      amount: i.amount,
    })),
  };
  const canEdit = session.user.id === quotation.issuedById;

  const companyData = company;

  return (
    <QuotationView
      quotation={data}
      company={companyData}
      canEdit={canEdit}
      linkedProject={quotation.project}
    />
  );
}
