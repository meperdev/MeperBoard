import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Self-hosting MeperBoard",
  description: "How to self-host MeperBoard with a personal access token (PAT) instead of the hosted GitHub App flow.",
};

const STEPS = [
  {
    title: "Set the auth mode",
    body: "Run MeperBoard in PAT mode by setting AUTH_MODE=pat in your environment. The proxy validates the request Origin in both modes.",
  },
  {
    title: "Provide a GitHub token",
    body: "Set GITHUB_TOKEN to a personal access token with read access to the repositories you want to load. Classic tokens work; fine-grained tokens with read-only Issues and Contents permissions are recommended. Add write access to Issues and set WRITE_MODE=enabled if you want the opt-in write actions.",
  },
  {
    title: "Set the allowed origin",
    body: "Set ALLOWED_ORIGIN to the public URL of your instance (for example, https://meperboard.example.com). Localhost is allowed in development automatically.",
  },
  {
    title: "Run it",
    body: "Deploy the app as usual — `npm run build` then `npm start`. The board loads the repository identified by the token's owner and the DEFAULT_REPO, or the repository you select once signed in.",
  },
];

export default function SelfHostPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Self-hosting MeperBoard</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        MeperBoard is local-first and can run against a single GitHub repository with a personal
        access token, without registering the hosted GitHub App. This is the recommended setup for a
        private or air-gapped instance.
      </p>

      <ol className="mt-8 space-y-6">
        {STEPS.map((step, index) => (
          <li key={step.title} className="rounded-xl border bg-card p-5">
            <div className="flex items-center gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">
                {index + 1}
              </span>
              <h2 className="text-sm font-semibold text-foreground">{step.title}</h2>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
          </li>
        ))}
      </ol>

      <div className="mt-8 rounded-xl border border-amber-500/30 bg-amber-500/5 p-5">
        <h2 className="text-sm font-semibold text-foreground">Security note</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          A personal access token grants broad access to the repositories it can reach. Store it only
          in server-side environment variables and never expose it to the browser. The hosted flow on
          meperboard.vercel.app uses a scoped GitHub App and stores tokens in an HTTP-only cookie so
          they never reach client JavaScript — prefer that flow for public or shared instances.
        </p>
      </div>
    </main>
  );
}
