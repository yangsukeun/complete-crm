import { workspaceAreas, workspaceLabels, type WorkspaceArea } from "./workspace-areas";

export function isWorkspaceHelpArea(area: string): area is WorkspaceArea {
  return Object.hasOwn(workspaceLabels, area);
}

export function canViewWorkspaceHelp(user: { id: string; department?: string | null; accountDisabled?: boolean } | null | undefined, area: string): boolean {
  return Boolean(user?.id && user.accountDisabled === false && isWorkspaceHelpArea(area) && workspaceAreas(user).includes(area));
}

type Workflow = {
  title: string;
  steps: string[];
  href: string;
  linkLabel: string;
  access?: string;
  related?: { href: string; label: string }[];
};
export const workspaceHelp: Record<WorkspaceArea, { intro: string; workflows: Workflow[] }> = {
  management: {
    intro: "담당 프로젝트와 업무일지를 확인하고, 자료와 구매·지급 메뉴를 찾는 순서입니다.",
    workflows: [
      { title: "담당 프로젝트 확인", href: "/tasks", linkLabel: "프로젝트",
        steps: ["경영지원 홈에서 프로젝트를 열어 담당하거나 공유된 업무를 확인하세요.", "업무 상세에서 담당자와 마감일, 상태를 확인할 수 있어요."] },
      { title: "업무일지 확인", href: "/admin/logs", linkLabel: "업무일지 조회", access: "조회 권한이 있는 경우",
        steps: ["업무일지 조회에서 직원과 날짜를 선택하세요.", "목록에 보이는 저장된 일지만 조회할 수 있어요. 조회하는 것만으로 새 일지가 만들어지지 않습니다."] },
      { title: "자료와 일정 찾기", href: "/drive", linkLabel: "Google Drive 자료함",
        related: [{ href: "/nas-drive", label: "NAS 문서함" }, { href: "/schedule", label: "일정" }],
        steps: ["Google Drive 자료함에서 읽기 권한이 있는 폴더를 고르세요.", "NAS 자료는 홈의 NAS 문서함에서 찾고, 실제 파일을 열 때는 기존 NAS 로그인을 사용하세요. 팀 일정은 홈의 일정 메뉴에서 확인하세요."] },
      { title: "구매·지급 요청 확인", href: "/finance/requests", linkLabel: "구매·지급 요청", access: "요청·승인 권한이 있는 경우",
        steps: ["권한 범위 안에서 요청과 상태를 확인하세요.", "CRM의 승인 여부와 실제 은행 지급은 별개예요. 지급 여부는 기존 절차에 따라 따로 확인하세요."] },
    ],
  },
  marketing: {
    intro: "담당 프로젝트와 팀 자료를 찾고, 협업 내용을 남기는 순서입니다.",
    workflows: [
      { title: "오늘 맡은 프로젝트 확인", href: "/tasks", linkLabel: "프로젝트",
        steps: ["홈에서 프로젝트를 열고 담당하거나 공유된 업무를 선택하세요.", "업무 상세에서 담당자, 마감일, 진행 상태를 확인하세요. 업무일지가 필요하면 프로젝트 화면의 Daily Report 탭을 이용하세요."] },
      { title: "작업 파일 찾기", href: "/drive", linkLabel: "Google Drive 자료함",
        related: [{ href: "/nas-drive", label: "NAS 문서함" }],
        steps: ["Google Drive 자료함에서 권한이 있는 폴더를 열어 최신 자료를 확인하세요.", "NAS 공유 파일이 필요한 경우 홈의 NAS 문서함을 열고 기존 NAS 계정으로 로그인하세요."] },
      { title: "진행 내용 공유", href: "/chat", linkLabel: "참여 중인 대화",
        steps: ["대화에서 기존에 참여 중인 방을 고르세요. 여러 사람이 다시 봐야 할 참고 자료는 홈의 자료 게시판에서 확인할 수 있어요.", "공유할 때는 관련 프로젝트 이름과 확인이 필요한 내용을 함께 적으면 찾기 쉬워요."] },
    ],
  },
  cs: {
    intro: "CS 링크 허브의 근태, 담당 거래처, 연차 메뉴를 안내합니다.",
    workflows: [
      { title: "출근·퇴근 기록", href: "/cs-tools", linkLabel: "CS 링크 허브",
        steps: ["CS 홈의 근태 카드에서 출근·퇴근을 기록하고 시각을 확인하세요.", "자리비움 메뉴가 보이는 계정은 실제 시작·종료 시각에 맞춰 기록하세요. 기록이 다르면 팀 담당자에게 알려 주세요."] },
      { title: "담당 거래처와 공지 확인", href: "/cs-clients", linkLabel: "CS 거래처",
        steps: ["거래처 메뉴에서 권한 범위 안의 업체를 확인하세요.", "업무 공지는 CS 홈의 라운지에서 확인하세요. 조직도와 관리 메뉴는 부여된 역할에 따라 달라요."] },
      { title: "연차 신청과 승인 상태", href: "/cs-tools/leave", linkLabel: "CS 연차 신청·관리",
        steps: ["CS 홈에 표시된 연차 메뉴에서 내 잔여일수와 신청 내역을 확인하세요.", "신청 내역에서 승인 상태를 확인하세요. 승인 권한과 절차는 현재 계정의 기존 규칙을 따릅니다."] },
    ],
  },
  logistics: {
    intro: "3PL 담당 프로젝트, 거래처·정산, 작업 자료를 어디서 확인하는지 안내합니다.",
    workflows: [
      { title: "담당 프로젝트와 단계 확인", href: "/logistics/projects", linkLabel: "3PL 담당 프로젝트",
        steps: ["3PL 홈 상단의 프로젝트를 여세요.", "참여자로 연결됐거나 내가 맡은 단계가 있는 프로젝트만 보입니다. 단계의 상태와 진행률을 확인하세요."] },
      { title: "문의부터 월 정산까지", href: "/logistics/sales?view=inquiry", linkLabel: "3PL 문의 접수", access: "영업·정산 권한이 있는 경우",
        steps: ["문의는 받은 내용과 견적 금액·근거를 CRM에 직접 기록하세요. 확인된 계약만 거래처로 연결하세요.", "월 정산은 공급가·부가세·청구·수금·미수를 구분해 기록하세요. 청구일과 실제 수금일은 같다고 가정하지 마세요.", "서영이앤티 정산은 홈의 별도 메뉴에서 월별 Excel 초안을 검토하세요. 초안 저장이나 내려받기는 청구·발송이 아니에요."] },
      { title: "작업 자료 찾기", href: "/drive", linkLabel: "Google Drive 자료함",
        related: [{ href: "/nas-drive", label: "NAS 문서함" }],
        steps: ["Google Drive 자료함에서 권한이 있는 폴더나 문서를 확인하세요.", "NAS 문서는 홈의 NAS 문서함을 이용하세요. 실제 파일을 열 때는 기존 NAS 로그인이 필요해요."] },
    ],
  },
};
