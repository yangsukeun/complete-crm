import { it,expect,vi,beforeEach } from "vitest";
import { SalesError } from "../src/lib/logistics-sales";
const f=vi.hoisted(()=>({actor:null as string|null,read:vi.fn(),execute:vi.fn()}));
vi.mock("@/auth",()=>({getAppSession:async()=>f.actor?{user:{id:f.actor,department:"forged-session-dept"}}:null}));
vi.mock("@/lib/prisma",()=>({default:{}}));
vi.mock("@/lib/logistics-sales-store",()=>({LogisticsSalesStore:class {read=f.read;execute=f.execute;}}));
import { GET,POST } from "../app/api/logistics-sales/route";
beforeEach(()=>{f.actor=null;f.read.mockReset();f.execute.mockReset();});
it("GET passes only authenticated ID to current-db authorization and never writes",async()=>{
 f.actor="staff";f.read.mockResolvedValue([]);const response=await GET();expect(response.status).toBe(200);expect(f.read).toHaveBeenCalledWith("staff");expect(f.execute).not.toHaveBeenCalled();expect(response.headers.get("cache-control")).toBe("private, no-store");
});
it("preserves denial and storage failure; blocks cross-origin requests",async()=>{
 f.read.mockRejectedValue(new SalesError(403,"forbidden"));expect((await GET()).status).toBe(403);
 f.read.mockRejectedValue(new Error("sensitive database diagnostic"));const r=await GET();expect(r.status).toBe(503);expect(await r.text()).not.toContain("sensitive");
 expect((await POST(new Request("https://crm.example/api/logistics-sales",{method:"POST",headers:{origin:"https://other.example"},body:"{}"}))).status).toBe(403);expect(f.execute).not.toHaveBeenCalled();
});
