import { z } from 'zod';

const receipt = z.object({
  schema_version: z.literal('1'), mode: z.literal('production'),
  request_id: z.string().uuid(), inquiry_id: z.string().uuid(),
  persisted: z.literal(true), duplicate: z.boolean(),
  notification_status: z.enum(['queued', 'not_configured']),
}).strict();

/** Website BFF must use a bounded response body. HTTP 200 alone is never success. */
export function confirmedInquiryReceipt(status: number, body: unknown, requestId: string) {
  const parsed = receipt.safeParse(body);
  if (!parsed.success || parsed.data.request_id !== requestId ||
    (status !== 200 && status !== 201) || parsed.data.duplicate !== (status === 200)) return null;
  return parsed.data;
}
