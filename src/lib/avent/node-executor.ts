import 'server-only';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
// Explicit trace inclusion keeps these CommonJS worker files intact; do not bundle worker code.
// This adapter is not activated by getAventRuntime while company grants are unresolved.
export async function executeNodePreview(input:{source:Buffer;expected:Buffer;profile:'payment';stage:'pre_order'},options:{timeoutMs:number;signal:AbortSignal}):Promise<Record<string,unknown>>{
 const entry=path.join(process.cwd(),'src/lib/avent/engine/bounded_preview.cjs');
 const engine=await import(/* webpackIgnore: true */ pathToFileURL(entry).href);
 return engine.default.execute(input,options);
}
