"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, postJson } from "@/lib/client-api";

type User = { id: string; username: string };

export default function Home() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [language, setLanguage] = useState("es");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ user: User }>("/api/session")
      .catch(() => api<{ user: User }>("/api/session", { method: "POST" }))
      .then((data) => setUser(data.user))
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Session failed"));
  }, []);

  const create = async () => {
    setBusy(true); setError(null);
    try {
      const result = await postJson<{ id: string }>("/api/matches", { language });
      router.push(`/match/${result.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create match");
      setBusy(false);
    }
  };

  const join = async () => {
    setBusy(true); setError(null);
    try {
      const result = await postJson<{ id: string }>("/api/invites/join", { code });
      router.push(`/match/${result.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not join match");
      setBusy(false);
    }
  };

  return <main className="home">
    <header><span className="brand">Yapply</span><span>Speak. Play. Improve.</span></header>
    <div className="hero">
      <p className="eyebrow">Live language practice</p>
      <h1>Have a conversation.<br />Find your next word.</h1>
      <p>Start a two-person voice room and get pronunciation feedback while you practice.</p>
      <p className="muted">{user ? `Playing as ${user.username}` : "Starting guest session…"}</p>
    </div>
    <div className="home-grid">
      <section className="panel">
        <h2>Create a room</h2>
        <label htmlFor="language">Practice language</label>
        <select id="language" value={language} onChange={(event) => setLanguage(event.target.value)}>
          <option value="es">Spanish</option><option value="en">English</option>
        </select>
        <button disabled={!user || busy} onClick={() => void create()}>Create room</button>
      </section>
      <section className="panel">
        <h2>Join a friend</h2>
        <label htmlFor="room-code">Room code</label>
        <input id="room-code" value={code} maxLength={10} placeholder="10-character code"
          onChange={(event) => setCode(event.target.value.toUpperCase())} />
        <button disabled={!user || busy || code.length !== 10} onClick={() => void join()}>Join room</button>
      </section>
    </div>
    {error && <p className="error" role="alert">{error}</p>}
  </main>;
}
