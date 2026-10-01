import { ReadEntry } from "@/components/read-entry";
export default async function EntryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ReadEntry id={id} />;
}
