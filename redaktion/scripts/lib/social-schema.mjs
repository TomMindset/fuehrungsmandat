export const socialSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "summary",
    "evidenceNote",
    "audience",
    "facebook",
    "instagram",
    "linkedin"
  ],
  properties: {
    summary: { type: "string", minLength: 80, maxLength: 800 },
    evidenceNote: { type: "string", minLength: 80, maxLength: 1000 },
    audience: { type: "string", minLength: 5, maxLength: 160 },
    facebook: {
      type: "object",
      additionalProperties: false,
      required: ["text"],
      properties: {
        text: { type: "string", minLength: 250, maxLength: 1200 }
      }
    },
    instagram: {
      type: "object",
      additionalProperties: false,
      required: ["caption", "altText"],
      properties: {
        caption: { type: "string", minLength: 250, maxLength: 1800 },
        altText: { type: "string", minLength: 80, maxLength: 600 }
      }
    },
    linkedin: {
      type: "object",
      additionalProperties: false,
      required: ["text"],
      properties: {
        text: { type: "string", minLength: 300, maxLength: 2200 }
      }
    }
  }
};
