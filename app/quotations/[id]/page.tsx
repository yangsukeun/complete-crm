import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { auth } from "@/auth";
import { QuotationView } from "./quotation-view";

export default async function QuotationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
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
      issuedBy: { select: { name: true } },
      items: { orderBy: { sortOrder: "asc" } },
    },
  });

  if (!quotation) notFound();

  const company = await prisma.companyInfo.findFirst({
    orderBy: { updatedAt: "desc" },
  });

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
    items: quotation.items.map((i) => ({
      description: i.description,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      amount: i.amount,
    })),
  };
  const canEdit = session.user.id === quotation.issuedById;

  const companyData = company
    ? {
        name: company.name,
        businessNumber: company.businessNumber,
        representative: company.representative,
        address: company.address,
        phone: company.phone,
        email: company.email,
        fax: company.fax,
        stampImageUrl: company.stampImageUrl,
      }
    : null;

  return <QuotationView quotation={data} company={companyData} canEdit={canEdit} />;
}
