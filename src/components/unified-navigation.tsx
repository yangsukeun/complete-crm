'use client';
import Link from 'next/link';
import {useRef,useEffect} from 'react';
import {workspaceLabels,type WorkspaceArea} from '../lib/workspace-areas';
export type HeaderLink={href:string;label:string;hint?:string;count?:number};
export function UnifiedNavigation({pathname,areas,groups,dashboard}:{pathname:string;areas:WorkspaceArea[];groups:{label:string;links:HeaderLink[]}[];dashboard:boolean}){
 const panel=useRef<HTMLDetailsElement>(null);
 useEffect(()=>{const close=(event:PointerEvent)=>{if(panel.current&&!panel.current.contains(event.target as Node))panel.current.open=false};document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close)},[]);
 const active=(href:string)=>pathname===href||pathname.startsWith(href+'/');
 return <nav aria-label="주 업무영역과 공통 도구" className="mx-auto flex max-w-7xl flex-wrap items-center gap-1 border-t border-gray-100 px-4 py-2 text-sm sm:px-6" onKeyDown={e=>{if(e.key==='Escape'&&panel.current){panel.current.open=false;panel.current.querySelector('summary')?.focus();}}}>
 {dashboard&&<Link href="/dashboard" aria-current={active('/dashboard')?'page':undefined} className="flex min-h-11 items-center rounded-lg px-3 text-gray-700 aria-[current=page]:bg-purple-100 aria-[current=page]:text-purple-900">대시보드</Link>}
 {areas.map(area=>{const href=area==='logistics'?'/logistics':'/workspaces/'+area;const selected=active(href)||(area==='cs'&&(active('/cs-tools')||active('/cs-clients')));return <Link key={area} href={href} prefetch={false} aria-current={selected?'page':undefined} className="flex min-h-11 items-center rounded-lg px-3 font-semibold text-gray-700 aria-[current=page]:bg-purple-100 aria-[current=page]:text-purple-900">{workspaceLabels[area]}</Link>})}
 <details ref={panel} className="relative ml-auto"><summary className="flex min-h-11 cursor-pointer list-none items-center rounded-lg border px-3 font-semibold text-purple-900">공통 도구 ▾</summary><div className="absolute right-0 z-50 mt-2 grid max-h-[65dvh] w-[min(34rem,calc(100vw-2rem))] grid-cols-1 gap-4 overflow-y-auto rounded-xl border border-purple-200 bg-white p-4 shadow-xl sm:grid-cols-2">{groups.filter(g=>g.links.length).map(group=><section key={group.label}><h2 className="mb-1 text-xs font-bold text-purple-800">{group.label}</h2>{group.links.map(link=><Link key={link.href} href={link.href} prefetch={false} aria-current={active(link.href)?'page':undefined} onClick={()=>{if(panel.current)panel.current.open=false}} className="flex min-h-11 flex-wrap items-center gap-2 rounded px-2 text-gray-800 hover:bg-purple-50 aria-[current=page]:bg-purple-100"><span>{link.label}</span>{!!link.count&&<span className="rounded-full bg-red-600 px-2 text-xs text-white">{link.count>99?'99+':link.count}</span>}{link.hint&&<small className="basis-full text-gray-600">{link.hint}</small>}</Link>)}</section>)}</div></details>
 </nav>;
}
