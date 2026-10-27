export const WORKSPACE_OWNER="cmmitn4830000fc0jt8c1l2jf";
export const workspaceLabels={management:"경영지원",marketing:"마케팅",cs:"CS",logistics:"3PL"} as const;
export type WorkspaceArea=keyof typeof workspaceLabels;
export function workspaceAreas(user:{id:string;department?:string|null}):WorkspaceArea[]{
 if(user.id===WORKSPACE_OWNER)return ["management","marketing","cs","logistics"];
 const department=(user.department??"").replace(/\s+/g,"").toLowerCase();
 if(["물류","물류팀","물류창고","3pl"].includes(department))return ["logistics"];
 if(["cs","cs팀","cs센터","cscenter"].includes(department))return ["cs"];
 if(["마케팅","마케팅팀"].includes(department))return ["marketing"];
 if(["경영지원","경영지원팀"].includes(department))return ["management"];
 return [];
}
