import type { SalesRecord } from './logistics-sales';
export const salesViews = { inquiry: '문의', quote: '견적', contract: '계약', client: '거래처', invoice: '월 청구·수금' } as const;
export type SalesView = keyof typeof salesViews;
export function salesView(value: unknown): SalesView { return typeof value === 'string' && Object.hasOwn(salesViews,value) ? value as SalesView : 'inquiry'; }
export const sourceKind: Partial<Record<SalesView, SalesRecord['kind']>> = { quote:'inquiry', contract:'quote', client:'contract', invoice:'client' };
export function viewRecords(rows:SalesRecord[],view:SalesView){return rows.filter(r=>r.kind===view || (view==='invoice'&&r.kind==='receipt'));}
export function sourceRecords(rows:SalesRecord[],view:SalesView){return rows.filter(r=>r.kind===sourceKind[view]&&r.data.status==='active'&&(view==='invoice'||!rows.some(child=>child.parentId===r.id&&child.kind===view&&(view!=='quote'||child.data.status==='active'))));}
