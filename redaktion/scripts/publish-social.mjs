import { readFile } from "node:fs/promises";
import path from "node:path";
import { argument } from "./lib/args.mjs";
import {
  optionalEnv,
  portalJson,
  requestJson,
  requiredEnv,
  safeBaseUrl
} from "./lib/http.mjs";

function assertEqualConfig(label, configured, runtime) {
  if (!configured) {
    throw new Error(`${label} ist in redaktion/config.json noch nicht festgelegt.`);
  }
  if (configured !== runtime) {
    throw new Error(`${label} stimmt nicht mit redaktion/config.json überein.`);
  }
}

function providerConfiguration(config, channels) {
  const values = {};
  if (channels.includes("facebook") || channels.includes("instagram")) {
    values.metaVersion = requiredEnv("META_GRAPH_API_VERSION");
    values.metaToken = requiredEnv("META_PAGE_ACCESS_TOKEN");
    if (!/^v\d+\.\d+$/u.test(values.metaVersion)) {
      throw new Error("META_GRAPH_API_VERSION muss wie v25.0 formatiert sein.");
    }
  }
  if (channels.includes("facebook")) {
    values.facebookPageId = requiredEnv("META_PAGE_ID");
    if (!/^\d+$/u.test(values.facebookPageId)) {
      throw new Error("META_PAGE_ID muss eine numerische Seiten-ID sein.");
    }
    assertEqualConfig(
      "META_PAGE_ID",
      config.channels.facebook.pageId,
      values.facebookPageId
    );
  }
  if (channels.includes("instagram")) {
    values.instagramAccountId = requiredEnv("META_INSTAGRAM_ACCOUNT_ID");
    if (!/^\d+$/u.test(values.instagramAccountId)) {
      throw new Error("META_INSTAGRAM_ACCOUNT_ID muss eine numerische Konto-ID sein.");
    }
    assertEqualConfig(
      "META_INSTAGRAM_ACCOUNT_ID",
      config.channels.instagram.accountId,
      values.instagramAccountId
    );
  }
  if (channels.includes("linkedin")) {
    values.linkedinVersion = requiredEnv("LINKEDIN_VERSION");
    values.linkedinToken = requiredEnv("LINKEDIN_ACCESS_TOKEN");
    values.linkedinAuthorUrn = requiredEnv("LINKEDIN_AUTHOR_URN");
    if (!/^\d{6}$/u.test(values.linkedinVersion)) {
      throw new Error("LINKEDIN_VERSION muss als YYYYMM angegeben werden.");
    }
    if (!/^urn:li:(person|organization):[A-Za-z0-9_-]+$/u.test(values.linkedinAuthorUrn)) {
      throw new Error("LINKEDIN_AUTHOR_URN ist ungültig.");
    }
    assertEqualConfig(
      "LINKEDIN_AUTHOR_URN",
      config.channels.linkedin.authorUrn,
      values.linkedinAuthorUrn
    );
    const authorType = values.linkedinAuthorUrn.split(":")[2];
    if (
      (config.channels.linkedin.mode === "personal" && authorType !== "person") ||
      (config.channels.linkedin.mode === "organization" &&
        authorType !== "organization") ||
      !["personal", "organization"].includes(config.channels.linkedin.mode)
    ) {
      throw new Error("LinkedIn-Modus und Autor-URN passen nicht zusammen.");
    }
  }
  return values;
}

async function claimChannel(context, channel) {
  const { body } = await portalJson(
    context.portalBaseUrl,
    context.portalSecret,
    `/api/editorial/reviews/${encodeURIComponent(context.reviewId)}/publications/${channel}/claim`,
    {
      method: "POST",
      body: JSON.stringify({
        version: context.pkg.version,
        contentHash: context.pkg.contentHash,
        packageHash: context.pkg.packageHash,
        workflowRunId: optionalEnv("GITHUB_RUN_ID") || "local",
        confirmManualRetry:
          context.pkg.approval?.confirmManualRetry === true
      })
    }
  );
  if (body.status === "already_published") {
    console.log(`${channel} wurde bereits veröffentlicht; kein erneuter Schreibaufruf.`);
    return null;
  }
  if (body.status !== "claimed" || !body.claimToken) {
    throw new Error(`${channel} konnte nicht eindeutig reserviert werden.`);
  }
  return body.claimToken;
}

async function completeChannel(context, channel, claimToken, result) {
  await portalJson(
    context.portalBaseUrl,
    context.portalSecret,
    `/api/editorial/reviews/${encodeURIComponent(context.reviewId)}/publications/${channel}/complete`,
    {
      method: "POST",
      body: JSON.stringify({
        claimToken,
        externalId: result.externalId,
        url: result.url || null,
        publishedAt: new Date().toISOString()
      })
    }
  );
}

async function requireManualCheck(context, channel, claimToken) {
  try {
    await portalJson(
      context.portalBaseUrl,
      context.portalSecret,
      `/api/editorial/reviews/${encodeURIComponent(context.reviewId)}/publications/${channel}/manual-check`,
      {
        method: "POST",
        body: JSON.stringify({
          claimToken,
          reason: "Schreibaufruf ohne eindeutig abschließbaren Plattformstatus"
        })
      }
    );
  } catch {
    console.error(
      `${channel}: Portal konnte die manuelle Prüfsperre nicht bestätigen. Keine automatische Wiederholung.`
    );
  }
}

async function publishFacebook(context) {
  const url = `https://graph.facebook.com/${context.providers.metaVersion}/${encodeURIComponent(context.providers.facebookPageId)}/feed`;
  const body = new URLSearchParams({
    message: context.pkg.payload.facebook.text,
    link: context.articleUrl,
    access_token: context.providers.metaToken
  });
  const { body: result } = await requestJson(
    url,
    { method: "POST", body },
    "Facebook-Veröffentlichung"
  );
  if (!result.id) throw new Error("Facebook lieferte keine Beitrags-ID.");
  return {
    externalId: result.id,
    url: `https://www.facebook.com/${result.id}`
  };
}

async function instagramContainerStatus(context, containerId) {
  const statusUrl = new URL(
    `https://graph.facebook.com/${context.providers.metaVersion}/${encodeURIComponent(containerId)}`
  );
  statusUrl.searchParams.set("fields", "status_code,status");
  statusUrl.searchParams.set("access_token", context.providers.metaToken);

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const { body } = await requestJson(
      statusUrl,
      {},
      "Instagram-Containerstatus"
    );
    if (body.status_code === "FINISHED") return;
    if (["ERROR", "EXPIRED"].includes(body.status_code)) {
      throw new Error(`Instagram-Containerstatus ist ${body.status_code}.`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  throw new Error("Instagram-Container wurde nicht rechtzeitig fertig.");
}

async function publishInstagram(context) {
  const createUrl = `https://graph.facebook.com/${context.providers.metaVersion}/${encodeURIComponent(context.providers.instagramAccountId)}/media`;
  const caption = `${context.pkg.payload.instagram.caption}\n\n${context.articleUrl}`;
  const createBody = new URLSearchParams({
    image_url: context.imageUrl,
    caption,
    alt_text: context.pkg.payload.instagram.altText,
    access_token: context.providers.metaToken
  });
  const { body: container } = await requestJson(
    createUrl,
    { method: "POST", body: createBody },
    "Instagram-Mediencontainer"
  );
  if (!container.id) throw new Error("Instagram lieferte keine Container-ID.");
  await instagramContainerStatus(context, container.id);

  const publishUrl = `https://graph.facebook.com/${context.providers.metaVersion}/${encodeURIComponent(context.providers.instagramAccountId)}/media_publish`;
  const publishBody = new URLSearchParams({
    creation_id: container.id,
    access_token: context.providers.metaToken
  });
  const { body: result } = await requestJson(
    publishUrl,
    { method: "POST", body: publishBody },
    "Instagram-Veröffentlichung"
  );
  if (!result.id) throw new Error("Instagram lieferte keine Medien-ID.");

  const permalinkUrl = new URL(
    `https://graph.facebook.com/${context.providers.metaVersion}/${encodeURIComponent(result.id)}`
  );
  permalinkUrl.searchParams.set("fields", "permalink");
  permalinkUrl.searchParams.set("access_token", context.providers.metaToken);
  const { body: media } = await requestJson(
    permalinkUrl,
    {},
    "Instagram-Permalink"
  );
  return { externalId: result.id, url: media.permalink || null };
}

async function publishLinkedIn(context) {
  const commentary = `${context.pkg.payload.linkedin.text}\n\n${context.articleUrl}`;
  const { response } = await requestJson(
    "https://api.linkedin.com/rest/posts",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${context.providers.linkedinToken}`,
        "Content-Type": "application/json",
        "LinkedIn-Version": context.providers.linkedinVersion,
        "X-Restli-Protocol-Version": "2.0.0"
      },
      body: JSON.stringify({
        author: context.providers.linkedinAuthorUrn,
        commentary,
        visibility: "PUBLIC",
        distribution: {
          feedDistribution: "MAIN_FEED",
          targetEntities: [],
          thirdPartyDistributionChannels: []
        },
        lifecycleState: "PUBLISHED",
        isReshareDisabledByAuthor: false
      })
    },
    "LinkedIn-Veröffentlichung"
  );
  const externalId = response.headers.get("x-restli-id");
  if (!externalId) throw new Error("LinkedIn lieferte keine Beitrags-ID.");
  return {
    externalId,
    url: `https://www.linkedin.com/feed/update/${externalId}`
  };
}

const publishers = {
  facebook: publishFacebook,
  instagram: publishInstagram,
  linkedin: publishLinkedIn
};

async function main() {
  const packagePath = path.resolve(argument("--package", { required: true }));
  const articleUrl = argument("--article-url", { required: true });
  const imageUrl = argument("--image-url", { required: true });
  const [pkg, config] = await Promise.all([
    readFile(packagePath, "utf8").then(JSON.parse),
    readFile(path.join(process.cwd(), "redaktion", "config.json"), "utf8").then(
      JSON.parse
    )
  ]);
  if (config.publishing?.live !== true) {
    throw new Error("Social-Veröffentlichung ist in config.json gesperrt.");
  }
  if (pkg.canonicalUrl !== articleUrl) {
    throw new Error("Artikel-URL weicht vom freigegebenen Paket ab.");
  }
  const expectedImageUrl = new URL(pkg.imagePath, `${articleUrl}/`).toString();
  const actualImageUrl = new URL(imageUrl).toString();
  if (new URL(actualImageUrl).pathname !== new URL(expectedImageUrl).pathname) {
    throw new Error("Bild-URL weicht vom freigegebenen Paket ab.");
  }

  const approvedChannels = pkg.approval?.channels;
  if (!Array.isArray(approvedChannels)) {
    throw new Error("Freigegebene Kanäle fehlen.");
  }
  const requestedChannel = argument("--channel");
  const approvedSocialChannels = approvedChannels.filter(
    (channel) => channel !== "website"
  );
  if (
    requestedChannel &&
    !["facebook", "instagram", "linkedin"].includes(requestedChannel)
  ) {
    throw new Error("Angeforderter Social-Kanal ist ungültig.");
  }
  if (requestedChannel && !approvedSocialChannels.includes(requestedChannel)) {
    throw new Error(
      `Angeforderter Social-Kanal ${requestedChannel} ist nicht für diesen Lauf freigegeben.`
    );
  }
  const channels = requestedChannel
    ? [requestedChannel]
    : approvedSocialChannels;
  if (channels.length === 0) {
    console.log("Keine Social-Kanäle freigegeben.");
    return;
  }
  const providers = providerConfiguration(config, channels);
  const portalBaseUrl = safeBaseUrl(
    process.env.FUEHRUNGSMANDAT_PORTAL_URL ||
      config.approval.portalBaseUrl ||
      "",
    "FUEHRUNGSMANDAT_PORTAL_URL"
  );
  const context = {
    pkg,
    config,
    providers,
    articleUrl,
    imageUrl: actualImageUrl,
    reviewId: pkg.approval.id,
    portalBaseUrl,
    portalSecret: requiredEnv("FUEHRUNGSMANDAT_PORTAL_SECRET")
  };

  for (const channel of channels) {
    const publish = publishers[channel];
    if (!publish) throw new Error(`Unbekannter Social-Kanal: ${channel}`);
    const claimToken = await claimChannel(context, channel);
    if (!claimToken) continue;
    try {
      const result = await publish(context);
      await completeChannel(context, channel, claimToken, result);
      console.log(`${channel} veröffentlicht: ${result.externalId}`);
    } catch (error) {
      await requireManualCheck(context, channel, claimToken);
      throw error;
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Unbekannter Fehler.");
  process.exitCode = 1;
});
