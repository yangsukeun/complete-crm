/**
 * BlockNote 고급 표 옵션 (기본은 단순 그리드만).
 * - splitCells: 셀 병합·분할(colspan/rowspan) 및 UI
 * - headers: 첫 행·첫 열 헤더
 * - cellBackgroundColor / cellTextColor: 셀 단위 색
 * @see https://www.blocknotejs.org/docs/advanced/tables
 */
export const BLOCKNOTE_TABLES_OPTIONS = {
  splitCells: true,
  headers: true,
  cellBackgroundColor: true,
  cellTextColor: true,
} as const;
