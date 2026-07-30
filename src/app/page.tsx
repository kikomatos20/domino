import Link from "next/link";

export default function Home() {
  return (
    <main className="home">
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
        </div>

        <p className="home-note">
          Playing with friends creates a room code you can share. Empty seats can
          be filled by the computer.
        </p>
      </div>
    </main>
  );
}
