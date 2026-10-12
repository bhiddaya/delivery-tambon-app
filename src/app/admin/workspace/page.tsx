import AgentDashboard from "@/components/AgentDashboard";
export default async function TambonWorkspacePage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const query = await searchParams;
  return <AgentDashboard initialArea={typeof query.t === "string" ? query.t : ""} />;
}
