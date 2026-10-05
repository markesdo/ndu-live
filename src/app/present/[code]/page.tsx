import PresentClient from "./PresentClient";

export default async function PresentPage({ params }: PageProps<"/present/[code]">) {
  const { code } = await params;
  return <PresentClient code={code} />;
}
