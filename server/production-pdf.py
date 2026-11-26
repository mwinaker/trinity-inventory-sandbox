"""Render trusted production markup and embed fonts in Shopify's print preview."""
import sys
from urllib.parse import urlsplit

from weasyprint import HTML
from weasyprint.urls import URLFetcher


class AttachmentFetcher(URLFetcher):
    def fetch(self, url, headers=None):
        parts = urlsplit(url)
        if parts.scheme != "https" or parts.netloc.lower() != "cdn.shopify.com":
            raise ValueError("Production images must come from Shopify Files.")
        return super().fetch(url, headers)


fetcher = AttachmentFetcher(timeout=5, allow_redirects=False)
document = HTML(string=sys.stdin.buffer.read().decode("utf-8"), url_fetcher=fetcher)
document.write_pdf(sys.stdout.buffer, dpi=160)
