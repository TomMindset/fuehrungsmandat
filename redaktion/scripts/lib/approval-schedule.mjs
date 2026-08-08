const isoDay = /^\d{4}-\d{2}-\d{2}$/u;
const draftPath =
  /^src\/content\/notes\/([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/u;

export function assertIsoDay(value) {
  const day = String(value || "").trim();
  if (!isoDay.test(day)) {
    throw new Error("Der Freigabetag muss im Format YYYY-MM-DD angegeben werden.");
  }
  const parsed = new Date(`${day}T00:00:00.000Z`);
  if (
    !Number.isFinite(parsed.valueOf()) ||
    parsed.toISOString().slice(0, 10) !== day
  ) {
    throw new Error("Der Freigabetag ist kein gültiges Kalenderdatum.");
  }
  return day;
}

export function scheduledApprovalSlugs(plan, requestedDay) {
  const day = assertIsoDay(requestedDay);
  if (!Array.isArray(plan)) {
    throw new Error("Der Redaktionsplan muss eine Liste sein.");
  }

  return plan
    .filter((entry) => entry?.status === "drafted")
    .filter((entry) => String(entry.draftAfter || entry.date || "") === day)
    .map((entry) => {
      const normalized = String(entry.draftPath || "").replace(/\\/gu, "/");
      const match = normalized.match(draftPath);
      if (!match) {
        throw new Error(
          `Fälliger Planeintrag hat keinen gültigen draftPath: ${entry.topic || "unbekannt"}`
        );
      }
      return match[1];
    });
}
