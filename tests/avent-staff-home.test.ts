import {test,expect} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {WorkspaceHome} from '../src/components/workspace-home';

test('limited designated tester sees only synthetic pilot card and no logistics data links',()=>{
 const html=renderToStaticMarkup(createElement(WorkspaceHome,{area:'logistics',allowed:['marketing','logistics'],owner:false,limitedAccess:true,aventPilot:true}));
 expect(html).toContain('href="/logistics/orders"');
 expect(html.match(/<article/g)).toHaveLength(1);
 for(const target of ['/logistics/sales','/logistics/seoyoung','/logistics/ocr','/logistics/purchases'])expect(html).not.toContain(target);
 expect(html).not.toContain('경영지원 조회 범위');
});

test('ordinary logistics and limited support users do not see pilot card',()=>{
 for(const limitedAccess of [true,false]){
  const html=renderToStaticMarkup(createElement(WorkspaceHome,{area:'logistics',allowed:['logistics'],owner:false,limitedAccess}));
  expect(html).not.toContain('href="/logistics/orders"');
 }
 const owner=renderToStaticMarkup(createElement(WorkspaceHome,{area:'logistics',allowed:['logistics'],owner:true,aventPilot:true}));
 expect(owner).toContain('href="/logistics/orders"');
});
