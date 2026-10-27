import AreaPage from "../workspaces/[area]/page";
export const dynamic="force-dynamic";
export default function LogisticsPage(){return AreaPage({params:Promise.resolve({area:"logistics"})});}
