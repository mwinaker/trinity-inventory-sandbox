export function formatOrderAttachmentUploadError(error) {
  const internalMessage =
    error instanceof Error ? error.message : 'Unknown attachment upload error.'

  if (
    /access denied for stagedUploadsCreate field/i.test(internalMessage) ||
    /access denied for fileCreate field/i.test(internalMessage)
  ) {
    return {
      status: 503,
      message:
        'Shopify Files access is not enabled for order attachments. Remove the attachment to submit the order, or ask an administrator to reconnect the app with Files access.',
      internalMessage,
    }
  }

  return {
    status: 500,
    message: internalMessage,
    internalMessage,
  }
}
