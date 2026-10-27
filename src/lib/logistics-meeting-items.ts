/** UI planning items only; no inventory, matching, OCR or printing commands. */
export const logisticsMeetingItems = [
  { title: "송장 재매칭 결과·오류", status: "기존 프로그램 확인 필요", description: "원본주문 → 합포장 분리 → 송장 출력 → 송장번호 재대입 뒤 결과가 사라진다는 현장 보고가 있습니다. 전체·성공·실패 건수와 주문별 사유·재시도는 구현 검토안입니다. 혼합주문의 수동 보정·확정 경로를 유지합니다." },
  { title: "거래처별 재고·유통기한", status: "조회 연결 준비 중", description: "거래처별 재고와 유통기한을 원격으로 확인하고 필요한 자료를 출력하는 흐름을 준비합니다. 실제 재고 조회와 출력은 아직 연결되지 않았습니다." },
  { title: "박스 원본사진·입고 검토", status: "OCR 연결 준비 중", description: "명세서에 없는 유통기한을 박스 원본사진과 대조할 예정입니다. 상품 바코드/SKU·입고 로트·유통기한을 분리하며, 바코드로 기한이나 수량을 추정하지 않습니다. OCR 결과는 사람이 검토한 뒤 입고에 연결합니다." },
  { title: "출고 스캔검수 방식", status: "운영 방식 미확정", description: "처리 속도 영향을 확인한 뒤 검수 방식을 결정합니다. 무검수 출고·송장 자동 출력·기존 재고 초기화는 활성화하지 않습니다." },
];
