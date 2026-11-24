/* ═══════════════════════════════════════════
   ECOAUDIT — Content Script
   Injected on supported product pages.
   Extracts product info, requests audit from
   background, and injects eco badge.
═══════════════════════════════════════════ */

(function () {
  'use strict';

  /* ── Prevent double injection ── */
  if (window.__ecoaudit_injected) return;
  window.__ecoaudit_injected = true;

  /* Track scanned URLs to prevent duplicate scans */
  let lastScannedUrl = '';
  let scanDebounceTimer = null;

  /* ── Shared Cleanup Helpers ── */
  function cleanBrand(rawBrand) {
    if (!rawBrand) return '';
    let b = rawBrand.replace(/^(?:Brand:|\bVisit the\b|\bby\b)\s*/i, '').trim();
    b = b.replace(/\s+Store$/i, '').trim();
    return b;
  }

  /* ── Site-specific product extractors ── */
  const extractors = {
    'amazon.com': () => ({
      name:  document.getElementById('productTitle')?.textContent?.trim()
          || document.querySelector('.product-title-word-break')?.textContent?.trim()
          || '',
      brand: document.querySelector('#bylineInfo')?.textContent || document.querySelector('#brand')?.textContent || '',
      price: document.querySelector('.a-price .a-offscreen')?.textContent?.trim()
          || document.querySelector('#priceblock_ourprice')?.textContent?.trim() || '',
      image: document.querySelector('#landingImage')?.src || '',
      category: document.querySelector('#wayfinding-breadcrumbs_feature_div a')?.textContent?.trim() || '',
    }),
    'amazon.co.uk': () => extractors['amazon.com'](),

    'hm.com': () => ({
      name:  document.querySelector('h1.product-name, h1[class*="product"]')?.textContent?.trim()
          || document.querySelector('h1')?.textContent?.trim() || '',
      brand: 'H&M',
      price: document.querySelector('.price-value, .product-price, [class*="ProductPrice"]')?.textContent?.trim() || '',
      image: document.querySelector('.product-detail-main-image img, picture img')?.src || '',
      category: 'Fashion',
    }),

    'zara.com': () => ({
      name:  document.querySelector('h1.product-detail-info__header-name, h1[class*="product-name"]')?.textContent?.trim()
          || document.querySelector('h1')?.textContent?.trim() || '',
      brand: 'Zara',
      price: document.querySelector('[class*="price__amount"], [data-qa="product-price"]')?.textContent?.trim() || '',
      image: document.querySelector('.media-image img, picture img')?.src || '',
      category: 'Fashion',
    }),

    'nike.com': () => ({
      name:  document.querySelector('h1.headline-2, h1[data-test="product-title"]')?.textContent?.trim()
          || document.querySelector('h1')?.textContent?.trim() || '',
      brand: 'Nike',
      price: document.querySelector('[data-test="product-price"]')?.textContent?.trim() || '',
      image: document.querySelector('#pdp_6up-hero img, [data-test="hero-image"] img')?.src || '',
      category: 'Footwear / Apparel',
    }),

    'adidas.com': () => ({
      name:  document.querySelector('h1[data-auto-id="product-title"], h1.gl-heading')?.textContent?.trim()
          || document.querySelector('h1')?.textContent?.trim() || '',
      brand: 'Adidas',
      price: document.querySelector('[class*="product-price"], [data-auto-id="gl-price-item"]')?.textContent?.trim() || '',
      image: document.querySelector('[data-auto-id="image"] img, .glass-image-viewer img')?.src || '',
      category: 'Footwear / Apparel',
    }),

    'patagonia.com': () => ({
      name:  document.querySelector('h1.product-title, h1.name, h1[class*="product"]')?.textContent?.trim()
          || document.querySelector('h1')?.textContent?.trim() || '',
      brand: 'Patagonia',
      price: document.querySelector('.price, .product-price')?.textContent?.trim() || '',
      image: document.querySelector('.product-hero img, .pdp-image img')?.src || '',
      category: 'Outdoor Apparel',
    }),

    'target.com': () => ({
      name:  document.querySelector('[data-test="product-title"], h1[class*="Heading"]')?.textContent?.trim()
          || document.querySelector('h1')?.textContent?.trim() || '',
      brand: document.querySelector('[data-test="product-brand"] a, [class*="brand"]')?.textContent?.trim() || '',
      price: document.querySelector('[data-test="product-price"]')?.textContent?.trim() || '',
      image: document.querySelector('[data-test="product-image"] img')?.src || '',
      category: '',
    }),

    'walmart.com': () => ({
      name:  document.querySelector('[itemprop="name"], h1[class*="prod-ProductTitle"]')?.textContent?.trim()
          || document.querySelector('h1')?.textContent?.trim() || '',
      brand: document.querySelector('[itemprop="brand"] [itemprop="name"], a[class*="brand"]')?.textContent?.trim() || '',
      price: document.querySelector('[itemprop="price"], [class*="price-characteristic"]')?.textContent?.trim() || '',
      image: document.querySelector('[data-testid="hero-image"] img, .hover-zoom-hero-image img')?.src || '',
      category: '',
    }),

    'etsy.com': () => ({
      name:  document.querySelector('h1[data-buy-box-listing-title], h1.wt-text-body-01')?.textContent?.trim()
          || document.querySelector('h1')?.textContent?.trim() || '',
      brand: document.querySelector('[data-shop-name] a, a.wt-text-link-no-underline')?.textContent?.trim() || 'Etsy Seller',
      price: document.querySelector('[data-buy-box-region="price"] p, .wt-text-title-03')?.textContent?.trim() || '',
      image: document.querySelector('.listing-page-image-carousel img, [data-region="mainimage"] img')?.src || '',
      category: document.querySelector('[data-taxonomy-path]')?.textContent?.trim() || 'Handmade',
    }),

    'ebay.com': () => ({
      name:  document.querySelector('h1.x-item-title__mainTitle span, h1[itemprop="name"]')?.textContent?.trim()
          || document.querySelector('h1')?.textContent?.trim() || '',
      brand: document.querySelector('[class*="brand"] .ux-textspans, [itemprop="brand"] span')?.textContent?.trim() || '',
      price: document.querySelector('.x-price-primary span, [itemprop="price"]')?.textContent?.trim() || '',
      image: document.querySelector('.ux-image-carousel img, [itemprop="image"]')?.src || '',
      category: '',
    }),

    'asos.com': () => ({
      name:  document.querySelector('#aside-content h1, [data-test-id="product-title"]')?.textContent?.trim()
          || document.querySelector('h1')?.textContent?.trim() || '',
      brand: document.querySelector('[data-test-id="product-brand"] a, .product-brand a')?.textContent?.trim() || 'ASOS',
      price: document.querySelector('[data-test-id="current-price"], .product-price span')?.textContent?.trim() || '',
      image: document.querySelector('.gallery-image img, [data-test-id="product-image"] img')?.src || '',
      category: 'Fashion',
    }),

    'uniqlo.com': () => ({
      name:  document.querySelector('h1.product-name, h1[class*="product-title"]')?.textContent?.trim()
          || document.querySelector('h1')?.textContent?.trim() || '',
      brand: 'Uniqlo',
      price: document.querySelector('.product-price .sale, .product-price')?.textContent?.trim() || '',
      image: document.querySelector('.product-image img, .pdp-image img')?.src || '',
      category: 'Fashion',
    }),

    'nordstrom.com': () => ({
      name:  document.querySelector('[itemprop="name"], h1[class*="ProductName"]')?.textContent?.trim()
          || document.querySelector('h1')?.textContent?.trim() || '',
      brand: document.querySelector('[itemprop="brand"] [itemprop="name"], a[class*="brand"]')?.textContent?.trim() || '',
      price: document.querySelector('[class*="price"] span[class*="current"], [itemprop="price"]')?.textContent?.trim() || '',
      image: document.querySelector('[class*="hero"] img, [itemprop="image"]')?.src || '',
      category: 'Fashion',
    }),

    'gap.com': () => ({
      name:  document.querySelector('h1[class*="product-name"], h1[class*="ProductName"]')?.textContent?.trim()
          || document.querySelector('h1')?.textContent?.trim() || '',
      brand: 'Gap',
      price: document.querySelector('[class*="product-price"], [class*="Price"]')?.textContent?.trim() || '',
      image: document.querySelector('[class*="product-image"] img')?.src || '',
      category: 'Fashion',
    }),
  };

  /* ── Fallback extractor using structured data ── */
  function fallbackExtract() {
    const result = { name: '', brand: '', price: '', image: '', category: '', materials: '', claims: '' };

    // 1. JSON-LD Product schema
    const ldScripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const s of ldScripts) {
      try {
        let ld = JSON.parse(s.textContent);
        if (Array.isArray(ld)) ld = ld[0];
        if (ld['@type'] === 'Product' || ld['@type']?.includes?.('Product')) {
          result.name  = ld.name || result.name;
          result.brand = (typeof ld.brand === 'string' ? ld.brand : ld.brand?.name) || result.brand;
          result.image = (Array.isArray(ld.image) ? ld.image[0] : ld.image) || result.image;
          result.category = ld.category || result.category;
          if (ld.offers) {
            const offers = Array.isArray(ld.offers) ? ld.offers[0] : ld.offers;
            result.price = offers.price ? `${offers.priceCurrency || ''} ${offers.price}`.trim() : result.price;
          }
        }
      } catch { /* ignore */ }
    }

    // 2. Open Graph & meta tags
    if (!result.name)  result.name  = document.querySelector('meta[property="og:title"]')?.content || '';
    if (!result.image) result.image = document.querySelector('meta[property="og:image"]')?.content || '';
    if (!result.name)  result.name  = document.querySelector('meta[name="title"]')?.content || '';

    // 3. H1
    if (!result.name) result.name = document.querySelector('h1')?.textContent?.trim() || document.title;

    // 4. Generic price
    if (!result.price) {
      const priceEl = document.querySelector('[class*="price"]:not(style), [id*="price"]:not(style)');
      if (priceEl) result.price = priceEl.textContent?.trim()?.replace(/\s+/g, ' ').substring(0, 50) || '';
    }

    // 5. Brand from domain
    if (!result.brand) {
      result.brandMatchesDomain = true;
      result.brand = window.location.hostname.replace('www.', '').split('.')[0];
      result.brand = result.brand.charAt(0).toUpperCase() + result.brand.slice(1);
    }

    // 6. Materials from page text
    const bodyText = document.body?.innerText?.substring(0, 10000) || '';
    const matMatch = bodyText.match(/(materials?|composition|fabric|made\s+(?:with|from|of))[:\s]+([\w\s,%]+)/i);
    if (matMatch) result.materials = matMatch[0].substring(0, 200);

    // 7. Sustainability claims
    const claimKeywords = ['organic', 'recycled', 'sustainable', 'eco-friendly', 'carbon neutral', 'fair trade', 'b corp', 'vegan'];
    const claimsFound = [];
    for (const kw of claimKeywords) {
      if (bodyText.toLowerCase().includes(kw)) claimsFound.push(kw);
    }
    result.claims = claimsFound.join(', ');

    return result;
  }

  /* ── Get domain ── */
  function getDomain() {
    return window.location.hostname.replace('www.', '');
  }

  /* ── Normalize product data ── */
  function getProductInfo(domain) {
    let data;
    const extractor = extractors[domain];
    if (extractor) {
      try { data = extractor(); } catch { data = null; }
    }

    // Merge with fallback
    const fallback = fallbackExtract();
    
    // Determine product brand and confidence
    let finalBrand = '';
    let confidence = 'low';
    let source = 'heuristic';

    if (data && data.brand) {
       finalBrand = cleanBrand(data.brand);
       confidence = 'high';
       source = 'site-extractor';
    } else if (fallback.brand && !fallback.brandMatchesDomain) {
       finalBrand = cleanBrand(fallback.brand);
       confidence = 'medium';
       source = 'json-ld';
    } else {
       finalBrand = cleanBrand(fallback.brand);
       confidence = 'low';
       source = 'domain-fallback';
    }

    const merged = {
      productName: data?.name || fallback.name || document.title,
      productBrand: finalBrand,
      retailer:    domain,
      brandConfidence: confidence,
      brandSource: source,
      url:         window.location.href,
      image:       data?.image || fallback.image || '',
      price:       data?.price || fallback.price || '',
      currency:    '',
      category:    data?.category || fallback.category || '',
      materials:   fallback.materials || '',
      claims:      fallback.claims || '',
    };
    return merged;
  }

  /* ── Is product page? ── */
  function isProductPage() {
    const hasPrice    = !!document.querySelector('[class*="price"], [id*="price"], [itemprop="price"]');
    const hasAddCart  = !!document.querySelector('[id*="add-to-cart"], [class*="add-to-cart"], [name*="buy"], button[class*="AddToBag"], [data-test="add-to-cart-button"]');
    const hasProduct  = !!document.querySelector('script[type="application/ld+json"]');
    return hasPrice || hasAddCart || hasProduct;
  }

  /* ── Listen for popup requesting current product data ── */
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'getProductData') {
      if (!isProductPage()) {
        sendResponse({ productData: null });
        return;
      }
      const domain = getDomain();
      sendResponse({ productData: getProductInfo(domain) });
    }
  });

})();
