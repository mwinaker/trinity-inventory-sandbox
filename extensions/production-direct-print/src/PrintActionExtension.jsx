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
  return <s-admin-print-action src={urls ? base + urls[layout] : undefined}>
    <s-stack direction="block">
      <s-text>PRODUCTION ONLY — Internal specifications, notes and attachments. Nothing is sent to the customer.</s-text>
      {error ? <s-banner tone="critical">{error}</s-banner> : !urls && <s-text>Loading production document…</s-text>}
      <s-select label="Print layout" value={layout} onChange={event => setLayout(event.target.value)}>
        <s-option value="detail">Detailed production copy</s-option>
        <s-option value="landscape">Compact landscape sheet</s-option>
      </s-select>
      <s-text>Links expire after five minutes. Reopen this print action to refresh.</s-text>
    </s-stack>
  </s-admin-print-action>;
}
