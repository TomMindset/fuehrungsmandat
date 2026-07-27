import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const reviews = sqliteTable("reviews", {
  id: text("id").primaryKey(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  brand: text("brand").notNull(),
  slug: text("slug").notNull(),
  version: integer("version").notNull(),
  contentHash: text("content_hash").notNull(),
  packageHash: text("package_hash").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  packageJson: text("package_json").notNull(),
  imageKey: text("image_key").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  status: text("status").notNull().default("pending"),
  approvedChannelsJson: text("approved_channels_json"),
  decisionNote: text("decision_note"),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  decisionAt: text("decision_at"),
  mailStatus: text("mail_status").notNull().default("pending"),
  mailMessageId: text("mail_message_id"),
  dispatchStatus: text("dispatch_status").notNull().default("pending"),
  dispatchError: text("dispatch_error"),
});

export const publications = sqliteTable(
  "publications",
  {
    reviewId: text("review_id")
      .notNull()
      .references(() => reviews.id),
    channel: text("channel").notNull(),
    status: text("status").notNull().default("pending"),
    claimTokenHash: text("claim_token_hash"),
    claimedAt: text("claimed_at"),
    workflowRunId: text("workflow_run_id"),
    externalId: text("external_id"),
    url: text("url"),
    publishedAt: text("published_at"),
    reason: text("reason"),
  },
  (table) => [primaryKey({ columns: [table.reviewId, table.channel] })],
);
