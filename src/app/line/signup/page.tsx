import LineSignupForm from "@/components/LineSignupForm";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function LineSignupPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const first = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
  return <LineSignupForm type={first(params.type)} uid={first(params.uid)} sig={first(params.sig)} />;
}
