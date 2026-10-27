"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Someone sent you a code: type it here and go straight to that table. */
export default function HomeJoin() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const clean = code.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 6);

  return (
    <form
      className="home-join"
      onSubmit={(e) => {
        e.preventDefault();
        if (clean.length === 6) router.push(`/room/${clean}`);
      }}
    >
      <label htmlFor="home-join-code">Have a code?</label>
      <div className="home-join-row">
        <input
          id="home-join-code"
          value={clean}
          onChange={(e) => setCode(e.target.value)}
          placeholder="ABC123"
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          maxLength={6}
          aria-describedby="home-join-help"
        />
        <button type="submit" disabled={clean.length !== 6}>
          Join
        </button>
      </div>
      <span id="home-join-help" className="sr-only">
        Six letters and numbers, from the person who made the table.
      </span>
    </form>
  );
}
