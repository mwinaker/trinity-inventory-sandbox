import "@shopify\/ui-extensions/preact";
import {render} from 'preact';
export default async () => { render(<Extension />, document.body); };
function Extension() {
  const id = shopify.data.selected?.[0]?.id || '';
  const valid = /^gid:\/\/shopify\/DraftOrder\/\d+$/.test(id);
  const url = 'https://trinity-billet-inventory.onrender.com/internal-tool?productionResource=DraftOrder&id=' + encodeURIComponent(id);
  return <s-admin-action heading="Production documents — internal only">
    <s-stack direction="block">
      <s-text>Open this order’s production page, then choose Detailed copy or Landscape sheet. Both include saved specifications, internal notes and attachments.</s-text>
      <s-text>For the production team only. This action does not send anything to the customer. Your Trinity team PIN may be required.</s-text>
      {!valid && <s-text>No valid order was selected. Close this window and reopen the action from the order.</s-text>}
    </s-stack>
    {valid && <s-link slot="primary-action" href={url} target="_blank">Open production documents</s-link>}
    <s-button slot="secondary-actions" onClick={() => shopify.close()}>Close</s-button>
  </s-admin-action>;
}
