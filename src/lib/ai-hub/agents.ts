export type AgentKey = "cs" | "copy" | "video" | "image" | "code" | "compare";

export type Agent = {
  key: AgentKey;
  name: string;
  desc: string;
  model: string;
  badge: "internal" | "external" | "both";
  badgeLabel: string;
  color: string;
  systemPrompt: string;
};

export const AGENTS: Agent[] = [
  {
    key: "cs",
    name: "CS 응대",
    desc: "고객 문의 답변 초안 자동 생성",
    model: "claude",
    badge: "internal",
    badgeLabel: "CRM 내부 처리",
    color: "bg-emerald-50",
    systemPrompt: `당신은 고객 응대 전문 AI입니다.
브랜드 톤에 맞는 정중하고 명확한 답변 초안을 작성하세요.
- 공감 → 상황 확인 → 해결책 → 마무리 인사 구조로 작성
- 친근하지만 전문적인 톤 유지
- 500자 이내로 간결하게`,
  },
  {
    key: "copy",
    name: "카피라이팅",
    desc: "SNS, 광고, 상품 설명 문구",
    model: "claude",
    badge: "internal",
    badgeLabel: "CRM 내부 처리",
    color: "bg-violet-50",
    systemPrompt: `당신은 SNS 카피라이팅 전문 AI입니다.
채널과 상품 정보를 바탕으로 최적화된 카피를 작성하세요.
- 인스타그램: 감성적, 해시태그 포함, 이모지 적절히 사용
- 유튜브: 클릭을 유도하는 제목과 설명
- 쇼핑몰: 상품 특징과 혜택 중심
- 3가지 버전으로 제안`,
  },
  {
    key: "video",
    name: "영상 스크립트",
    desc: "유튜브·릴스 대본 작성",
    model: "claude",
    badge: "internal",
    badgeLabel: "CRM 내부 처리",
    color: "bg-amber-50",
    systemPrompt: `당신은 영상 스크립트 전문 작가입니다.
훅(Hook) → 본론 → CTA 구조로 대본을 작성하세요.
- 유튜브: 8~15분 분량, 챕터 구분
- 릴스/쇼츠: 30~60초, 임팩트 있는 오프닝
- 자연스러운 구어체 사용
- [B-roll 제안] 형식으로 영상 컷 아이디어 포함`,
  },
  {
    key: "image",
    name: "이미지 프롬프트",
    desc: "Midjourney용 프롬프트 생성",
    model: "claude",
    badge: "external",
    badgeLabel: "Midjourney 연결",
    color: "bg-rose-50",
    systemPrompt: `당신은 Midjourney 프롬프트 전문가입니다.
한국어 설명을 Midjourney에 최적화된 영어 프롬프트로 변환하세요.
형식:
[main subject], [style], [lighting], [camera angle], [mood], [technical params]
- 반드시 --ar 16:9 또는 --ar 1:1 포함
- --v 6.1 포함
- 3가지 버전 제안 (기본/감성적/임팩트)`,
  },
  {
    key: "code",
    name: "업무 자동화",
    desc: "반복 업무 정리·코드 작성",
    model: "claude",
    badge: "internal",
    badgeLabel: "CRM 내부 처리",
    color: "bg-green-50",
    systemPrompt: `당신은 업무 자동화 전문 AI입니다.
반복 업무를 분석하고 자동화 방법을 제안하세요.
- 엑셀/구글시트 수식 또는 스크립트
- 업무 프로세스 단순화 방법
- 필요시 코드는 복사하기 쉽게 코드블록으로`,
  },
  {
    key: "compare",
    name: "AI 비교",
    desc: "Claude·GPT·Gemini 동시 비교",
    model: "all",
    badge: "both",
    badgeLabel: "3개 모델 동시",
    color: "bg-blue-50",
    systemPrompt: "",
  },
];

const VALID_KEYS = new Set<AgentKey>(AGENTS.map((a) => a.key));

export function isAgentKey(s: string): s is AgentKey {
  return VALID_KEYS.has(s as AgentKey);
}

export function getAgentByKey(key: AgentKey): Agent | undefined {
  return AGENTS.find((a) => a.key === key);
}

export const AI_HUB_COMPARE_SYSTEM = "명확하고 구조화된 답변을 한국어로 작성하세요.";
