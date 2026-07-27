CREATE TABLE `publications` (
	`review_id` text NOT NULL,
	`channel` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`claim_token_hash` text,
	`claimed_at` text,
	`workflow_run_id` text,
	`external_id` text,
	`url` text,
	`published_at` text,
	`reason` text,
	PRIMARY KEY(`review_id`, `channel`),
	FOREIGN KEY (`review_id`) REFERENCES `reviews`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`idempotency_key` text NOT NULL,
	`brand` text NOT NULL,
	`slug` text NOT NULL,
	`version` integer NOT NULL,
	`content_hash` text NOT NULL,
	`package_hash` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`package_json` text NOT NULL,
	`image_key` text NOT NULL,
	`token_hash` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`approved_channels_json` text,
	`decision_note` text,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`decision_at` text,
	`mail_status` text DEFAULT 'pending' NOT NULL,
	`mail_message_id` text,
	`dispatch_status` text DEFAULT 'pending' NOT NULL,
	`dispatch_error` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reviews_idempotency_key_unique` ON `reviews` (`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `reviews_token_hash_unique` ON `reviews` (`token_hash`);