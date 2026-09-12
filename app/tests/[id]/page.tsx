import { TestDetailPage } from "@/components/pages/test-detail";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <TestDetailPage id={(await params).id} />;
}
