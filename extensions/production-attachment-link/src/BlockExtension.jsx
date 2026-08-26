import "@shopify/ui-extensions/preact";
import {render} from 'preact';
import {useEffect, useState} from 'preact/hooks';

const appBackendOrigin = 'https://trinity-billet-inventory.onrender.com';

export default async () => {
  render(<Extension />, document.body);
}

async function getOrderAttachment(orderId) {
  const token = await shopify.auth.idToken();
  const response = await fetch(
    `${appBackendOrigin}/api/order-attachment-link?orderId=${encodeURIComponent(orderId)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  if (response.status === 404) return null;
  if (!response.ok) throw new Error('The production attachment could not be loaded.');

  const payload = await response.json();
  return payload?.ok ? payload.attachment ?? null : null;
}

function Extension() {
  const orderId = shopify.data.selected?.[0]?.id;
  const [attachment, setAttachment] = useState(undefined);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let active = true;

    if (!orderId) {
      setAttachment(null);
      return () => {
        active = false;
      };
    }

    setAttachment(undefined);
    setLoadError(false);
    getOrderAttachment(orderId)
      .then((nextAttachment) => {
        if (active) setAttachment(nextAttachment);
      })
      .catch(() => {
        if (active) setLoadError(true);
      });

    return () => {
      active = false;
    };
  }, [orderId]);

  return (
    <s-admin-block heading="Production attachment">
      <s-stack direction="block">
        {attachment === undefined && <s-text>Loading production attachment…</s-text>}
        {attachment && (
          <>
            <s-text>{attachment.filename}</s-text>
            <s-link
              href={attachment.downloadUrl}
              target="_blank"
              accessibilityLabel={`Open or print ${attachment.filename}`}
            >
              View / print attachment
            </s-link>
          </>
        )}
        {attachment === null && <s-text>No production attachment is available for this order.</s-text>}
        {loadError && <s-text tone="critical">Could not load the production attachment.</s-text>}
      </s-stack>
    </s-admin-block>
  );
}
