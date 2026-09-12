import { TeachersPage } from "@/components/intelligence/teachers-page";
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <TeachersPage id={id}/>;}
