"use client";

import { useState } from "react";
import type { Channel, ReviewStatus } from "@/lib/editorial";

const channelLabels: Record<
  Channel,
  { title: string; description: string }
> = {
  website: {
    title: "Website",
    description: "Artikel auf fuehrungsmandat.de veröffentlichen.",
  },
  facebook: {
    title: "Facebook",
    description: "Geprüfte Facebook-Fassung nach Website-Livegang senden.",
  },
  instagram: {
    title: "Instagram",
    description: "Markenkarte, Caption und Alt-Text veröffentlichen.",
  },
  linkedin: {
    title: "LinkedIn",
    description: "Geprüfte LinkedIn-Fassung nach Website-Livegang senden.",
  },
};

type Props = {
  token: string;
  availableChannels: Channel[];
  initialStatus: ReviewStatus;
  initialApprovedChannels: Channel[];
  initialNote: string | null;
};

export function ReviewDecision({
  token,
  availableChannels,
  initialStatus,
  initialApprovedChannels,
  initialNote,
}: Props) {
  const [status, setStatus] = useState(initialStatus);
  const [channels, setChannels] = useState<Channel[]>(
    initialApprovedChannels.length ? initialApprovedChannels : ["website"],
  );
  const [note, setNote] = useState(initialNote || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const decide = async (
    decision: "approved" | "changes_requested" | "rejected",
  ) => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/reviews/${token}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, channels, note }),
      });
      const result = (await response.json()) as {
        status?: ReviewStatus;
        error?: { message?: string };
      };
      if (!response.ok || !result.status) {
        throw new Error(result.error?.message || "Entscheidung fehlgeschlagen.");
      }
      setStatus(result.status);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Entscheidung fehlgeschlagen.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (status !== "pending") {
    const messages: Record<Exclude<ReviewStatus, "pending">, string> = {
      approved:
        "Diese Version ist für die gewählten Kanäle freigegeben. Der Veröffentlichungsprozess prüft Hash und Version vor jedem weiteren Schritt erneut.",
      changes_requested:
        "Für diese Version wurden Änderungen angefordert. Eine überarbeitete Fassung benötigt eine neue Versionsfreigabe.",
      rejected:
        "Diese Version wurde abgelehnt und kann nicht veröffentlicht werden.",
      expired:
        "Dieser Freigabelink ist abgelaufen. Bitte erzeugen Sie eine neue Version.",
    };
    return (
      <aside className="decision-panel">
        <p className="eyebrow">Entscheidung dokumentiert</p>
        <h2>{status === "approved" ? "Freigegeben" : "Abgeschlossen"}</h2>
        <p className="decision-result">{messages[status]}</p>
        {channels.length > 0 && (
          <p className="decision-intro">
            Kanäle:{" "}
            {channels
              .map((channel) => channelLabels[channel].title)
              .join(", ")}
          </p>
        )}
      </aside>
    );
  }

  const toggle = (channel: Channel) => {
    if (channel === "website") return;
    setChannels((current) =>
      current.includes(channel)
        ? current.filter((item) => item !== channel)
        : [...current, channel],
    );
  };

  return (
    <aside className="decision-panel">
      <p className="eyebrow">Ihre Entscheidung</p>
      <h2>Kanäle freigeben</h2>
      <p className="decision-intro">
        Website ist verbindlich ausgewählt. Social-Kanäle folgen ausschließlich
        nach bestätigter Erreichbarkeit des Artikels.
      </p>

      {availableChannels.map((channel) => (
        <label className="channel-choice" key={channel}>
          <input
            type="checkbox"
            checked={channels.includes(channel)}
            disabled={channel === "website" || busy}
            onChange={() => toggle(channel)}
          />
          <span>
            <strong>{channelLabels[channel].title}</strong>
            <small>{channelLabels[channel].description}</small>
          </span>
        </label>
      ))}

      <label>
        <span className="sr-only">Hinweis zur Entscheidung</span>
        <textarea
          value={note}
          maxLength={1000}
          disabled={busy}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Optionaler redaktioneller Hinweis"
        />
      </label>

      <div className="decision-actions">
        <button
          className="primary"
          type="button"
          disabled={busy}
          onClick={() => decide("approved")}
        >
          {busy ? "Wird dokumentiert …" : "Ausgewählte Kanäle freigeben"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => decide("changes_requested")}
        >
          Änderungen anfordern
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => decide("rejected")}
        >
          Version ablehnen
        </button>
      </div>
      {error && (
        <p className="decision-error" role="alert">
          {error}
        </p>
      )}
    </aside>
  );
}
