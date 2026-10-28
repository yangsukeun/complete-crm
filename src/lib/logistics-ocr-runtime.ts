import type {OcrReviewAdapter} from './logistics-ocr';
/** No credentials, mock fallback, inferred customer mapping, or localhost ERP in production. */
export function getOcrReviewAdapter():OcrReviewAdapter|null{return null;}
