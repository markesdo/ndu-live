import JoinClient from "./JoinClient";

export default async function JoinPage({ params }: PageProps<"/join/[code]">) {
  const { code } = await params;
  return <JoinClient code={code} />;
}
