# Permanent Trinity invoice reference

These are the active Order Printer Pro templates installed on September 14, 2026: quote 1315987 and receipt/invoice 1315984. Updating these files alone does not publish them; save the corresponding template in Order Printer Pro.

New manual submissions reserve T-00001 through T-99999 in immutable, app-owned Shopify metaobjects. The sequence metafield is only a hint. Never delete or upsert reservation records, reset the sequence, or reuse cancelled/deleted order numbers. Gaps are intentional. T-00001 was retired after a failed pre-release concurrency test. Existing orders are not backfilled.

Drafts stay editable and unpaid. The draft reference is retained by the actual converted order. Shopify native D/TBC names remain separate for accounting and links. The PDF uses the T-number as its primary reference and shows the native Shopify name underneath. Financial status alone determines payment status. A copied draft with inherited tags shows Reference pending until its own reservation is verified. Payment instructions are suppressed while its reference is unverified.

The signed DRAFT_ORDERS_CREATE webhook handles copied tool drafts; ORDERS_CREATE and ORDERS_PAID validate the converted order reference. Search Shopify by the exact T-number tag. Search indexing is asynchronous.

Deployment checks the existing app-owned sequence before listening. If missing, restore access to the original Shopify app and sequence; never recreate it at zero. Template rollback can restore the prior layouts, but permanent reservations must remain intact.

Activation requires the dedicated SHOPIFY_WEBHOOK_SECRET for the same app that owns the subscriptions. Until configured, new submissions keep their prior numbering behavior; permanent number allocation is inactive. Do not treat generic service health as proof of authenticated webhook delivery. Verify an actual draft-create and payment event before declaring activation complete.
