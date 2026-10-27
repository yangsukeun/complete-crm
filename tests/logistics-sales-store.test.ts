import { it,expect } from "vitest";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { LogisticsSalesStore } from "../src/lib/logistics-sales-store";
import type { SalesRecord,SalesUser } from "../src/lib/logistics-sales";

// Models PostgreSQL transaction commit/rollback + lock serialization. Does not claim PostgreSQL E2E.
function fakeDatabase(){
 let rows:SalesRecord[]=[],events:Array<{actor:string;key:string;hash:string;result:SalesRecord[];before:SalesRecord[]}>=[];
 let queue=Promise.resolve();let fail=false;
 let user:SalesUser|null={id:"staff",department:"물류",accountDisabled:false};
 const db={$transaction:async(fn:(tx:unknown)=>Promise<unknown>)=>{
  const previous=queue;let unlock!:()=>void;queue=new Promise<void>(r=>{unlock=r;});await previous;
  const oldRows=structuredClone(rows),oldEvents=structuredClone(events);
  try{return await fn({
   user:{findUnique:async()=>user},
   $queryRaw:async(sql:TemplateStringsArray,...v:unknown[])=>{
    const q=sql.join("?");
    if(q.includes("pg_advisory"))return [];
    if(q.includes("FROM logistics_sales_commands"))return events.filter(e=>e.actor===v[0]&&e.key===v[1]);
    if(q.includes("FROM logistics_sales_records"))return structuredClone(rows);
    throw new Error("Unexpected SQL");
   },
   $executeRaw:async(sql:TemplateStringsArray,...v:unknown[])=>{
    if(sql.join("").includes("INSERT INTO logistics_sales_records")){
     const row={id:v[0],kind:v[1],parentId:v[2],version:v[3],data:JSON.parse(v[4] as string)} as SalesRecord;
     rows=rows.filter(r=>r.id!==row.id);rows.push(row);
    }else{
     if(fail)throw new Error("Synthetic audit insert failure");
     events.push({actor:v[1] as string,key:v[2] as string,hash:v[3] as string,before:JSON.parse(v[5] as string),result:JSON.parse(v[6] as string)});
    }return 1;
   },
  });}catch(e){rows=oldRows;events=oldEvents;throw e;}finally{unlock();}
 }};
 return {store:new LogisticsSalesStore(db as unknown as Pick<PrismaClient,"$transaction">),get rows(){return rows;},get events(){return events;},set fail(value:boolean){fail=value;},set user(value:SalesUser|null){user=value;}};
}
const inquiry=()=>({key:randomUUID(),action:"inquiry",customerKey:"1234567890",name:"합성 고객",original:"원문 보존"});
it("commits once across concurrent retry, rejects reused key with changed payload",async()=>{
 const f=fakeDatabase(),c=inquiry();const [a,b]=await Promise.all([f.store.execute("staff",c),f.store.execute("staff",c)]);
 expect(a).toEqual(b);expect(f.rows).toHaveLength(1);expect(f.events).toHaveLength(1);
 await expect(f.store.execute("staff",{...c,name:"changed"})).rejects.toThrow();expect(f.rows[0].data.name).toBe("합성 고객");
});
it("rolls records back if audit fails; retry succeeds and concurrent conversion preserves audit",async()=>{
 const f=fakeDatabase(),c=inquiry();f.fail=true;await expect(f.store.execute("staff",c)).rejects.toThrow();
 expect(f.rows).toHaveLength(0);expect(f.events).toHaveLength(0);f.fail=false;await f.store.execute("staff",c);expect(f.rows).toHaveLength(1);
 const row=f.rows[0];const q={key:randomUUID(),action:"quote",id:row.id,version:row.version,supply:100,vat:10,evidence:"합성"};
 const results=await Promise.allSettled([f.store.execute("staff",q),f.store.execute("staff",{...q,key:randomUUID()})]);
 expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);expect(f.events[1].before[0].version).toBe(1);expect(f.events[1].result.find(r=>r.id===row.id)?.version).toBe(2);
});
it("rechecks current user before reads and duplicate receipt responses",async()=>{
 const f=fakeDatabase(),c=inquiry();await f.store.execute("staff",c);
 f.user={id:"staff",department:"CS팀",accountDisabled:false};await expect(f.store.read("staff")).rejects.toThrow();await expect(f.store.execute("staff",c)).rejects.toThrow();
 f.user=null;await expect(f.store.read(null)).rejects.toThrow();expect(f.events).toHaveLength(1);
});
