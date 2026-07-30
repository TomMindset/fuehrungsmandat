export function berlinCalendarDay(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.valueOf())) {
    throw new Error("Veröffentlichungszeitpunkt ist ungültig.");
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  return `${values.year}-${values.month}-${values.day}`;
}
