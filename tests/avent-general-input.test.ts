// @vitest-environment jsdom
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {act,createElement} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {GeneralReview} from '../app/logistics/orders/general/review-client';

let host:HTMLDivElement,root:Root;
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement('div');document.body.append(host);root=createRoot(host);act(()=>root.render(createElement(GeneralReview)));});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.unstubAllGlobals();});

// Model the native file-input contract: clearing value also clears its FileList.
function choose(input:HTMLInputElement,file:File|null){
 let value=file?`C:\\fakepath\\${file.name}`:'',files=file?[file]:[];
 Object.defineProperty(input,'value',{configurable:true,get:()=>value,set:(next:string)=>{value=next;if(next==='')files=[];}});
 Object.defineProperty(input,'files',{configurable:true,get:()=>files});
 act(()=>input.dispatchEvent(new Event('change',{bubbles:true})));
 expect(input.value).toBe('');expect(input.files).toHaveLength(0);
 expect(host.textContent).not.toContain('PRIVATE_FILENAME');expect(host.innerHTML).not.toContain('PRIVATE_FILENAME');
}
function file(name='PRIVATE_FILENAME.xlsx'){const f=new File(['synthetic bytes'],name);Object.defineProperty(f,'arrayBuffer',{value:async()=>new ArrayBuffer(16)});return f;}
function button(text:string){return [...host.querySelectorAll('button')].find(b=>b.textContent===text)!;}

test.each([0,1])('input %i clears filenames for repeated selection, invalid files and cancellation',index=>{
 const input=host.querySelectorAll('input')[index],status=()=>document.getElementById(index?'avent-reference-selection':'avent-source-selection')!.textContent;
 const same=file();choose(input,same);expect(status()).toContain('선택됨');
 choose(input,same);expect(status()).toContain('선택됨');
 choose(input,file('PRIVATE_FILENAME.txt'));expect(status()).toContain('미선택');
 choose(input,same);expect(status()).toContain('선택됨');
 choose(input,null);expect(status()).toContain('미선택');
 choose(input,same);expect(status()).toContain('선택됨');
 act(()=>button('선택·결과 비우기').click());expect(status()).toContain('미선택');
});

test.each([0,1])('input %i invalidates completed results and ignores stopped worker results',async index=>{
 const workers:FakeWorker[]=[];
 class FakeWorker{
  onmessage:((event:{data:unknown})=>void)|null=null;
  terminate=vi.fn();postMessage=vi.fn();
  constructor(){workers.push(this);}
  complete(){this.onmessage?.({data:{ok:true,report:{rows:1,issues:[],channels:[],reference:'not_provided'},output:new ArrayBuffer(8)}});}
 }
 vi.stubGlobal('Worker',FakeWorker);vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true}));
 const inputs=host.querySelectorAll('input');choose(inputs[0],file());
 await act(async()=>{button('파일 검사 시작').click();});expect(workers).toHaveLength(1);
 act(()=>workers[0].complete());expect(host.textContent).toContain('검수 보고서 받기');
 choose(inputs[index],file());expect(host.textContent).not.toContain('검수 보고서 받기');
 await act(async()=>{button('파일 검사 시작').click();});
 act(()=>button('중지').click());expect(workers[1].terminate).toHaveBeenCalled();
 act(()=>workers[1].complete());expect(host.textContent).not.toContain('검수 보고서 받기');
 choose(inputs[index],file());await act(async()=>{button('파일 검사 시작').click();});
 act(()=>workers[2].complete());expect(host.textContent).toContain('검수 보고서 받기');
 expect(host.textContent).not.toContain('PRIVATE_FILENAME');
});
