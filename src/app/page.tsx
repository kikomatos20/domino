import Link from "next/link";
import AppMenu from "@/components/AppMenu";

export default function Home() {
  return (
    <main className="home">
      <AppMenu className="corner" />
      <div className="home-card">
        <h1>Dominoes</h1>
        <p className="home-sub">Partner dominoes, double six. First team to 100.</p>

        <div className="home-actions">
          <Link className="home-button primary" href="/solo">
            Play vs Computer
          </Link>
          <Link className="home-button" href="/online">
            Play with Friends
          </Link>
          {/* Not a link yet — announced, not clickable. */}
          <div className="home-button soon" aria-disabled="true">
            Academy
            <span className="soon-tag">coming soon</span>
          </div>
        </div>

        <p className="home-note">
          Playing with friends creates a room code you can share. Empty seats can
          be filled by the computer.
        </p>

        <p className="home-note">
          <Link className="quiet-link" href="/account">
            Sign in to keep your record
          </Link>{" "}
          — optional, and never needed to play.
        </p>
      </div>
    </main>
  );
}
