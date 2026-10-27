import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { redirect,notFound } from "next/navigation";
import { LogisticsSalesStore } from "@/lib/logistics-sales-store";
import { SalesError } from "@/lib/logistics-sales";
import { SalesPanel } from "./sales-panel";
export const dynamic="force-dynamic";
export default async function Page(){
 const actor=(await getAppSession())?.user?.id;if(!actor)redirect("/login");
 let records;
 try{records=await new LogisticsSalesStore(prisma).read(actor);}
 catch(e){if(e instanceof SalesError&&(e.status===401||e.status===403))notFound();throw e;}
 return <SalesPanel initial={records}/>;
}
