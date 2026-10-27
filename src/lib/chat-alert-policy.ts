export type ChatAlert={id:string;type:string;link:string;message:string;createdAt:string;isRead:boolean};
export function chatAlertKey(n:ChatAlert){return `${n.id}:${n.createdAt}`;}
export function shouldAlert(n:ChatAlert,options:{enabled:boolean;visible:boolean;activeRooms:string[];seen:Set<string>}){
 const match=/^\/chat\/([^/?#]+)$/.exec(n.link??"");
 return options.enabled&&options.visible&&n.type==="CHAT_MESSAGE"&&!n.isRead&&!!match&&!options.activeRooms.includes(match[1])&&!options.seen.has(chatAlertKey(n));
}
