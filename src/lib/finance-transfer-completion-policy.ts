import {WORKSPACE_OWNER} from './workspace-areas';

/** Completion recording only; never an approval, edit, or bank transfer grant. */
export function canRecordTransferCompletion(isExecutor:boolean,row:{requesterId?:string|null;requester?:{role?:string|null}|null}):boolean {
  return isExecutor && !!row.requesterId && row.requesterId!==WORKSPACE_OWNER &&
    ['USER','TEAM_LEAD','CENTER_CHIEF'].includes(row.requester?.role??'');
}
