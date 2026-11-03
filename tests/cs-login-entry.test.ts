import { beforeEach, expect, it, vi } from "vitest";
const f=vi.hoisted(()=>({session:vi.fn(),user:vi.fn()}));
vi.mock("@/auth",()=>({getAppSession:f.session}));
vi.mock("@/lib/prisma",()=>({default:{user:{findUnique:f.user}}}));
vi.mock("next/navigation",()=>({redirect:(path:string)=>{throw new Error(`redirect:${path}`);}}));
vi.mock("../app/choose-mode/choose-mode-client",()=>({ChooseModeClient:()=>null}));
import Page from "../app/choose-mode/page";
beforeEach(()=>{vi.resetAllMocks();f.session.mockResolvedValue({user:{id:"synthetic",role:"USER",department:"마케팅"}});});
it.each(["USER","TEAM_LEAD","CENTER_CHIEF"])("uses fresh CS department for %s login",async role=>{
 f.user.mockResolvedValue({role,department:"CS팀",accountDisabled:false});
 await expect(Page()).rejects.toThrow("redirect:/cs-tools");
});
it("keeps HQ/executive mode selection",async()=>{
 f.user.mockResolvedValue({role:"EXECUTIVE",department:"경영지원",accountDisabled:false});
 await expect(Page()).resolves.toBeDefined();
});
it("does not route a deleted or disabled account into CS",async()=>{
 f.user.mockResolvedValueOnce(null).mockResolvedValueOnce({role:"USER",department:"CS팀",accountDisabled:true});
 await expect(Page()).rejects.toThrow("redirect:/login");
 await expect(Page()).rejects.toThrow("redirect:/login");
});
it("does not query staff data for anonymous access",async()=>{
 f.session.mockResolvedValue(null);await expect(Page()).rejects.toThrow("redirect:/login");expect(f.user).not.toHaveBeenCalled();
});
