export const CHAT_PUSH_QUIET_MS=60_000;
export function suppressMergedPush(type:string,previous:Date,now=Date.now()){return type!=="CHAT_MESSAGE"||now-previous.getTime()<CHAT_PUSH_QUIET_MS;}
export function allowSubscriptionFallback(result:{recipients:number;oneSignalId?:string|null}){return result.recipients===0&&!result.oneSignalId;}
export function currentRoomVisible(chatId:unknown,visible:boolean,rooms:string[]){return typeof chatId==="string"&&visible&&rooms.includes(chatId);}
