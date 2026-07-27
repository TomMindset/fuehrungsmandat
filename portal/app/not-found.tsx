import Link from "next/link";

export default function NotFound() {
  return (
    <main className="not-found">
      <p className="eyebrow">Freigabe nicht verfügbar</p>
      <h1>Dieser Link ist nicht gültig.</h1>
      <p>
        Der Freigabelink wurde nicht gefunden oder gehört nicht zu diesem
        Portal. Bitte verwenden Sie den vollständigen Link aus der
        Freigabenachricht.
      </p>
      <Link className="text-link" href="/">
        Zur Portalübersicht
      </Link>
    </main>
  );
}
