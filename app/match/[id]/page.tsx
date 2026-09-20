import { MatchClient } from "@/components/MatchClient";

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MatchClient matchId={id} />;
}
