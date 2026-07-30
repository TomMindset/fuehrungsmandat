import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { reviewByToken, type ApprovalPackage } from "@/lib/editorial";
import { MarkdownPreview } from "./MarkdownPreview";
import { ReviewDecision } from "./ReviewDecision";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Redaktionelle Freigabe",
  robots: { index: false, follow: false, noarchive: true },
};

type Props = { params: Promise<{ token: string }> };

const statusLabels = {
  pending: "Entscheidung offen",
  approved: "Freigegeben",
  changes_requested: "Änderungen angefordert",
  rejected: "Abgelehnt",
  expired: "Link abgelaufen",
} as const;

export default async function ReviewPage({ params }: Props) {
  const { token } = await params;
  const review = await reviewByToken(token);
  if (!review) notFound();
  const pkg = JSON.parse(review.package_json) as ApprovalPackage;
  const approvedChannels = review.approved_channels_json
    ? JSON.parse(review.approved_channels_json)
    : [];

  return (
    <main className="review-shell">
      <section className="review-hero">
        <div>
          <p className="eyebrow">Redaktionelle Freigabe · Version {review.version}</p>
          <h1>{review.title}</h1>
          <p className="review-description">{review.description}</p>
        </div>
        <dl className="review-meta">
          <div>
            <dt>Status</dt>
            <dd>
              <span className={`status-pill ${review.status}`}>
                {statusLabels[review.status]}
              </span>
            </dd>
          </div>
          <div>
            <dt>Erstellt</dt>
            <dd>{formatDate(review.created_at)}</dd>
          </div>
          <div>
            <dt>Gültig bis</dt>
            <dd>{formatDate(review.expires_at)}</dd>
          </div>
          <div>
            <dt>Inhalts-Hash</dt>
            <dd>{review.content_hash.slice(0, 12)}…</dd>
          </div>
        </dl>
      </section>

      <div className="review-grid">
        <div className="preview-stack">
          <section className="preview-section">
            <div className="section-heading">
              <h2>Einordnung</h2>
              <span>Verbindlich für alle Kanäle</span>
            </div>
            <div className="summary-card">
              <div>
                <h3>Kurzfassung</h3>
                <p>{pkg.payload.summary}</p>
              </div>
              <div>
                <h3>Evidenzhinweis</h3>
                <p>{pkg.payload.evidenceNote}</p>
              </div>
            </div>
          </section>

          <section className="preview-section">
            <div className="section-heading">
              <h2>Markenkarte</h2>
              <span>1080 × 1350 Pixel</span>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="social-card"
              src={`/api/review-image/${token}`}
              alt={pkg.payload.instagram.altText}
              width={1080}
              height={1350}
            />
          </section>

          <section className="preview-section">
            <div className="section-heading">
              <h2>Kanalfassungen</h2>
              <span>Getrennt prüfen</span>
            </div>
            <div className="channel-tabs">
              <article className="channel-copy">
                <header>
                  <h3>Facebook</h3>
                  <small>{pkg.payload.facebook.text.length} Zeichen</small>
                </header>
                <p>{pkg.payload.facebook.text}</p>
              </article>
              <article className="channel-copy">
                <header>
                  <h3>Instagram</h3>
                  <small>{pkg.payload.instagram.caption.length} Zeichen</small>
                </header>
                <p>{pkg.payload.instagram.caption}</p>
                <p className="alt-text">
                  <strong>Alt-Text:</strong> {pkg.payload.instagram.altText}
                </p>
              </article>
              {pkg.availableChannels.includes("linkedin") && (
                <article className="channel-copy">
                  <header>
                    <h3>LinkedIn</h3>
                    <small>{pkg.payload.linkedin.text.length} Zeichen</small>
                  </header>
                  <p>{pkg.payload.linkedin.text}</p>
                </article>
              )}
            </div>
          </section>

          <section className="preview-section">
            <div className="section-heading">
              <h2>Vollständiger Artikel</h2>
              <span>Website-Fassung</span>
            </div>
            <article className="article-preview">
              <MarkdownPreview markdown={pkg.payload.article.markdown} />
            </article>
          </section>
        </div>

        <ReviewDecision
          token={token}
          availableChannels={pkg.availableChannels}
          initialStatus={review.status}
          initialApprovedChannels={approvedChannels}
          initialNote={review.decision_note}
        />
      </div>
    </main>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  }).format(new Date(value));
}
