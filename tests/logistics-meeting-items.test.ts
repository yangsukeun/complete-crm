import { it,expect } from "vitest";
import { logisticsMeetingItems } from "../src/lib/logistics-meeting-items";
it("keeps meeting goals and unresolved operations as non-executable planning cards",()=>{
 expect(logisticsMeetingItems).toHaveLength(4);
 for(const item of logisticsMeetingItems){expect(item).not.toHaveProperty("href");expect(item.status).not.toMatch(/완료|연결됨/);}
 expect(logisticsMeetingItems[0].description).toContain("구현 검토안");
 expect(logisticsMeetingItems[3].status).toBe("운영 방식 미확정");
});
