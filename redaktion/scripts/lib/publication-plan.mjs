const allowedChannels = new Set([
  "website",
  "facebook",
  "instagram",
  "linkedin"
]);

export function createPublicationPlan({
  approvedChannels,
  publications,
  config,
  retryChannels = [],
  confirmManualRetry = false
}) {
  if (
    !Array.isArray(approvedChannels) ||
    approvedChannels.length === 0 ||
    approvedChannels.some((channel) => !allowedChannels.has(channel))
  ) {
    throw new Error("Die freigegebenen Kanäle sind ungültig.");
  }
  if (!approvedChannels.includes("website")) {
    throw new Error("Website-Freigabe fehlt; Social-Veröffentlichung ist gesperrt.");
  }
  if (!Array.isArray(publications)) {
    throw new Error("Die kanalbezogenen Veröffentlichungszustände fehlen.");
  }

  const publicationByChannel = new Map(
    publications.map((publication) => [publication?.channel, publication])
  );
  for (const channel of approvedChannels) {
    if (!publicationByChannel.has(channel)) {
      throw new Error(`Veröffentlichungszustand für ${channel} fehlt.`);
    }
  }

  const notices = [];
  if (retryChannels.length > 0) {
    let channels = [...new Set(retryChannels)];
    if (channels.some((channel) => !["facebook", "instagram"].includes(channel))) {
      throw new Error("Ein angeforderter Social-Retry-Kanal ist ungültig.");
    }
    if (channels.some((channel) => !approvedChannels.includes(channel))) {
      throw new Error("Ein angeforderter Social-Retry-Kanal wurde nicht freigegeben.");
    }
    if (
      channels.some(
        (channel) => config.channels?.[channel]?.approvalEnabled !== true
      )
    ) {
      throw new Error("Ein angeforderter Social-Retry-Kanal ist pausiert.");
    }
    if (publicationByChannel.get("website")?.status !== "published") {
      throw new Error(
        "Ein Social-Retry ist erst nach bestätigter Website-Veröffentlichung möglich."
      );
    }
    for (const channel of channels) {
      const status = publicationByChannel.get(channel)?.status;
      if (status === "manual_check_required" && !confirmManualRetry) {
        throw new Error(
          `${channel} benötigt vor dem Retry eine ausdrücklich bestätigte manuelle Prüfung.`
        );
      }
      if (!["pending", "manual_check_required", "published"].includes(status)) {
        throw new Error(
          `${channel} kann im Status ${status} nicht wiederholt werden.`
        );
      }
    }
    channels = channels.filter(
      (channel) => publicationByChannel.get(channel)?.status !== "published"
    );
    return { channels, notices };
  }

  const channels = approvedChannels.filter((channel) => {
    const publication = publicationByChannel.get(channel);
    const approvalEnabled =
      config.channels?.[channel]?.approvalEnabled === true;
    if (!approvalEnabled && publication.status === "pending") {
      notices.push(`${channel} ist pausiert und wird nicht verarbeitet.`);
    }
    if (publication.status === "manual_check_required") {
      notices.push(
        `${channel} bleibt bis zu einer bestätigten manuellen Prüfung gesperrt.`
      );
    }
    return approvalEnabled && publication.status === "pending";
  });
  return { channels, notices };
}
