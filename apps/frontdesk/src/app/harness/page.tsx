import { DeskDemonstrator } from "./desk-demonstrator";

/**
 * HARNESS-ONLY. The demonstrator page (roadmap 05 Deliverable 6).
 *
 * `run` scopes this desk's actions in the server's accept log, so two E2E
 * tests — or two desks — never read each other's rows. It comes from the query
 * string so a clip can name its own run, and falls back to a minted value when
 * a human opens the page by hand.
 */
export default async function HarnessPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const requested = (await searchParams).run;
  const run = typeof requested === "string" && requested.length > 0 ? requested : "manual";

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Offline contract harness</h1>
        <p className="text-sm text-muted-foreground">
          HARNESS-ONLY. This surface is the proof rig for the write contract
          (roadmap 05 Deliverable 6), not a desk feature: it writes only to the
          test double at <code>/harness/write</code>, it holds no money, and it
          is exempt from the session guard because the offline battery has to
          run with no session and no server.
        </p>
      </header>
      <DeskDemonstrator run={run} />
    </main>
  );
}
