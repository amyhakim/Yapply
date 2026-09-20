'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { api, postJson } from '@/lib/client-api';

export function RoomLobby() {
  const router = useRouter();
  const [language, setLanguage] = useState('es');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enter(event: FormEvent, action: 'create' | 'join') {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      // This endpoint reuses a valid guest cookie, creating one only when needed.
      await api('/api/session', { method: 'POST' });
      const match = action === 'create'
        ? await postJson<{ id: string }>('/api/matches', { language })
        : await postJson<{ id: string }>('/api/invites/join', { code: code.trim().toUpperCase() });
      router.push(`/match/${match.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not enter the room. Please try again.');
      setBusy(false);
    }
  }

  return <section className="room-lobby" aria-label="Play with a friend" aria-busy={busy}>
    <div className="lobby-intro"><span className="eyebrow">READY FOR A REAL CONVERSATION?</span>
      <h2>Bring a friend. Find your voice.</h2>
      <p>Create a private room or enter a friend’s code. You choose when to enable your camera and microphone.</p>
    </div>
    <div className="lobby-forms">
      <form onSubmit={event => void enter(event, 'create')}>
        <label htmlFor="practice-language">Practice language</label>
        <select id="practice-language" value={language} disabled={busy} onChange={event => setLanguage(event.target.value)}>
          <option value="es">Spanish</option><option value="en">English</option>
        </select>
        <button className="primary-button" disabled={busy} type="submit">Create room <ArrowRight size={16}/></button>
      </form>
      <form onSubmit={event => void enter(event, 'join')}>
        <label htmlFor="friend-code">Friend’s room code</label>
        <input id="friend-code" value={code} disabled={busy} maxLength={10} autoComplete="off" spellCheck={false}
          placeholder="10-character code" onChange={event => setCode(event.target.value.toUpperCase().trim())}/>
        <button className="primary-button" disabled={busy || !/^[A-F0-9]{10}$/.test(code)} type="submit">Join room <ArrowRight size={16}/></button>
      </form>
    </div>
    {busy && <p role="status">Opening your room…</p>}
    {error && <p className="api-error" role="alert">{error}</p>}
    <p className="lobby-note">Guest access stays in this browser for 30 days. The interface below is a separate demo.</p>
  </section>;
}
