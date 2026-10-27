import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {planSales,salesCommand,type SalesRecord} from '../src/lib/logistics-sales';
import {salesView,sourceRecords,viewRecords} from '../src/lib/logistics-sales-views';
it('separates stages and only offers eligible source records; invoicing remains repeatable',()=>{
 let rows:SalesRecord[]=[];
 const run=(data:object)=>{rows=planSales(rows,salesCommand.parse({key:randomUUID(),...data}),randomUUID());return rows.at(-1)!;};
 const inquiry=run({action:'inquiry',name:'Synthetic',customerKey:'0000000000',original:'test'});
 expect(sourceRecords(rows,'quote')).toEqual([inquiry]);
 const quote=run({action:'quote',id:inquiry.id,version:1,supply:100,vat:10,evidence:'test'});
 expect(viewRecords(rows,'inquiry').map(r=>r.id)).toEqual([inquiry.id]);expect(viewRecords(rows,'quote')).toEqual([quote]);
 expect(sourceRecords(rows,'quote')).toHaveLength(0);
 const contract=run({action:'contract',id:quote.id,version:1,evidence:'confirmed'});
 const client=run({action:'client',id:contract.id,version:1});
 run({action:'invoice',id:client.id,version:1,month:'2026-10',issuedOn:'2026-10-27',reference:'INV-1',supply:100,vat:10,evidence:'test'});
 expect(sourceRecords(rows,'invoice').map(r=>r.id)).toEqual([client.id]);
 expect(sourceRecords(rows,'client')).toHaveLength(0);
 expect(salesView('unknown')).toBe('inquiry');expect(salesView('toString')).toBe('inquiry');
});
