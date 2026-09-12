import { SubjectDetailPage } from "@/components/pages/subject-detail";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <SubjectDetailPage id={(await params).id} />;
}
