import { Suspense } from "react";
import AccountPanel from "@/components/AccountPanel";

export const metadata = { title: "Your account — Domino" };

/**
 * The panel reads `?next=` so it can send you back where you came from, and
 * anything reading search params has to sit inside a Suspense boundary or the
 * whole page gives up being static.
 */
export default function AccountPage() {
  return (
    <Suspense fallback={<main className="home loading">Loading…</main>}>
      <AccountPanel />
    </Suspense>
  );
}
