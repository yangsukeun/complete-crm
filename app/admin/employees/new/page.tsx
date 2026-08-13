import { getAppSession } from "@/auth";
import { redirect } from "next/navigation";
import { NewEmployeeForm } from "./new-employee-form";
import { PageHeadline } from "@/components/page-headline";
import { getEmployeeManagerContext } from "@/lib/employee-admin-access-db";

export default async function NewEmployeePage() {
  const session = await getAppSession();
  if (!session?.user) redirect("/login");
  const manager = await getEmployeeManagerContext(session.user.id);
  if (!manager?.ok) redirect("/dashboard");

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 max-w-3xl">
      <PageHeadline
        title="직원 계정 생성"
        description="아이디(이메일), 비밀번호와 내정보와 동일한 입력항목을 입력한 뒤 저장하세요."
      />
      <NewEmployeeForm />
    </div>
  );
}
