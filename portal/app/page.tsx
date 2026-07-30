export default function Home() {
  return (
    <main className="portal-home">
      <div className="home-grid" aria-hidden="true" />
      <section className="home-content">
        <p className="eyebrow">Führungsmandat Redaktion</p>
        <h1>Freigabe mit klarer Bindung.</h1>
        <p className="home-lead">
          Dieses Portal dokumentiert Entscheidungen zu Website, Facebook,
          Instagram und LinkedIn. Jeder Freigabelink gilt ausschließlich für
          eine konkrete Artikelversion und ihren geprüften Inhalts-Hash.
        </p>
        <div className="home-rule">
          <span>01</span>
          <p>Website zuerst</p>
        </div>
        <div className="home-rule">
          <span>02</span>
          <p>Kanäle einzeln auswählen</p>
        </div>
        <div className="home-rule">
          <span>03</span>
          <p>Keine Veröffentlichung ohne gültige Freigabe</p>
        </div>
        <p className="home-note">
          Öffnen Sie für eine Entscheidung den persönlichen Link aus Ihrer
          Freigabenachricht.
        </p>
        <a
          className="text-link"
          href="https://fuehrungsmandat.de"
          rel="noreferrer"
        >
          Zu fuehrungsmandat.de
        </a>
      </section>
    </main>
  );
}
