import { beforeEach,it,expect,vi } from "vitest";
const f=vi.hoisted(()=>({session:vi.fn(),user:vi.fn()}));
vi.mock("@/auth",()=>({getAppSession:f.session}));
vi.mock("@/lib/prisma",()=>({default:{user:{findUnique:f.user}}}));
vi.mock("next/navigation",()=>({redirect:(p:string)=>{throw new Error(`redirect:${p}`);},notFound:()=>{throw new Error("NOT_FOUND");}}));
vi.mock("@/components/workspace-home",()=>({WorkspaceHome:()=>null}));
import Page from "../app/workspaces/[area]/page";
beforeEach(()=>{vi.resetAllMocks();f.session.mockResolvedValue({user:{id:"staff",role:"ADMIN",department:"물류"}});f.user.mockResolvedValue({id:"staff",department:"마케팅"});});
it("uses current database department instead of stale ADMIN/logistics session claims",async()=>{await expect(Page({params:Promise.resolve({area:"logistics"})})).rejects.toThrow("NOT_FOUND");expect(f.user).toHaveBeenCalledWith({where:{id:"staff"},select:{id:true,department:true,accountDisabled:true}});});
it("redirects anonymous users without querying data",async()=>{f.session.mockResolvedValue(null);await expect(Page({params:Promise.resolve({area:"logistics"})})).rejects.toThrow("redirect:/login");expect(f.user).not.toHaveBeenCalled();});
it("rejects removed users and arbitrary area routes",async()=>{f.user.mockResolvedValueOnce(null);await expect(Page({params:Promise.resolve({area:"logistics"})})).rejects.toThrow("NOT_FOUND");await expect(Page({params:Promise.resolve({area:"payroll"})})).rejects.toThrow("NOT_FOUND");});

it("allows management home without changing business API rights",async()=>{f.user.mockResolvedValue({id:"support",department:"경영지원",accountDisabled:false});await expect(Page({params:Promise.resolve({area:"logistics"})})).resolves.toBeDefined();await expect(Page({params:Promise.resolve({area:"cs"})})).rejects.toThrow("redirect:/cs-tools");});
it("rejects disabled management and CS users",async()=>{for(const department of ["경영지원","CS팀"]){f.user.mockResolvedValue({id:"disabled",department,accountDisabled:true});await expect(Page({params:Promise.resolve({area:"cs"})})).rejects.toThrow("NOT_FOUND");}});
