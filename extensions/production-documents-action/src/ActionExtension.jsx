import "@shopify/ui-extensions/preact";
import {render} from 'preact';
import {useEffect, useState} from 'preact/hooks';
const base = 'https://trinity-billet-inventory.onrender.com';
export default async () => { render(<Extension />, document.body); };
function Extension() {
  const [urls, setUrls] = useState(null);
  const [error, setError] = useState('');
  const [layout, setLayout] = useState('detail');
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const token = await shopify.auth.idToken();
        const id = shopify.data.selected?.[0]?.id || '';
        const response = await fetch(base + '/api/production-print-link?orderId=' + encodeURIComponent(id), {headers: {Authorization: 'Bearer ' + token}});
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || 'Unable to load production documents.');
        if (active) setUrls(result.urls);
      } catch (e) { if (active) setError(e.message || 'Unable to load production documents.'); }
    }
    load();
    return () => { active = false; };
  }, []);
  return <s-admin-action heading="Production documents — internal only">
    <s-stack direction="block">
      <s-text>Open the document directly, then use your browser’s Print command (Ctrl+P or Command+P).</s-text>
      <s-text>Includes saved specifications, internal notes and attachments. Nothing is sent to the customer.</s-text>
      {error ? <s-banner tone="critical">{error}</s-banner> : !urls && <s-text>Loading production documents…</s-text>}
      {urls && <s-link href={base + urls.landscape} target="_blank">Open compact landscape sheet</s-link>}
    </s-stack>
    {urls && <s-link slot="primary-action" href={base + urls.detail} target="_blank">Open detailed production copy</s-link>}
    <s-button slot="secondary-actions" onClick={() => shopify.close()}>Close</s-button>
  </s-admin-action>;
}
