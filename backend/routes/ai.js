/**
 * routes/ai.js  — AI autofill helpers
 * Primary: OpenRouter | Fallback: Gemini
 *
 * Endpoints:
 *   POST /api/ai/autofill   → { brand, shortDescription }
 *   POST /api/ai/tags       → { tags: string[] }          ← HIGH-QUALITY SEO tags
 *   POST /api/ai/seo        → { metaTitle, metaDesc, focusKeyword, schema }
 *   GET  /api/ai/status     → { provider, status }
 */
const express = require('express');
const router  = express.Router();
const { adminAuth } = require('../middleware/auth');
const Product = require('../models/Product');
const Order   = require('../models/Order');
const Tenant  = require('../models/Tenant');
const User    = require('../models/User');
const { PaymentGateway, ReturnRequest, DeliveryService, BusinessPage, Banner } = require('../models/index');

router.use(adminAuth);

const ADMIN_KNOWLEDGE = [
  {
    id: 'add_product',
    title: 'Add a product',
    keywords: [
      'add product', 'add a product', 'insert product', 'insert a product',
      'create product', 'create a product', 'new product', 'upload product',
      'product insert', 'product add', 'list product', 'publish product',
    ],
    action: { label: 'Open Products', path: '/admin/products' },
    answer: [
      'Here is the exact StoreKit process to add a product:',
      '',
      '1. Open Admin -> Products.',
      '2. Click + Add Product. This opens the Add New Product modal.',
      '3. In the Basic tab, fill the required fields:',
      '   - Product Name',
      '   - Category',
      '   - Regular Price',
      '   - Full Description',
      '4. Add useful Basic tab fields when available: Brand, Sale Price, Cost Price, SKU, Stock Quantity, Low Stock Alert, Weight, Short Description, and Tags.',
      '5. Use the AI Generate Description and Suggest Tags buttons only after entering a product name. Review AI text before saving.',
      '6. Keep Active checked if the product must show on the customer store. Use Featured for homepage/featured sections, and On Sale when sale pricing applies.',
      '7. Open the Images tab and upload a Thumbnail. Add Additional Images if you have more product photos.',
      '8. Open the Variants tab only if this product has options like size, color, storage, material, style, weight, or flavor.',
      '9. Open Specifications to add product specs shown on the product page.',
      '10. Complete SEO and Shipping/Advanced fields if needed.',
      '11. Click Create Product.',
      '',
      'After saving, the product appears only for this store when it is Active and has the correct stock/pricing data.',
    ].join('\n'),
  },
  {
    id: 'orders',
    title: 'Manage orders',
    keywords: ['order', 'orders', 'pending order', 'status', 'delivery', 'tracking', 'ship order', 'confirm order', 'paid order'],
    action: { label: 'Open Orders', path: '/admin/orders' },
    answer: [
      'To manage orders:',
      '1. Open Admin -> Orders.',
      '2. Use the status filter or open the order row for details.',
      '3. Update the order status through pending, confirmed, processing, shipped, out for delivery, delivered, cancelled, or refunded.',
      '4. Add tracking number, delivery partner, estimated delivery, and admin notes when needed.',
      '5. For bank transfer orders, verify the uploaded slip/reference before marking payment as paid.',
    ].join('\n'),
  },
  {
    id: 'payment_slip',
    title: 'Billing payment proof',
    keywords: ['payment slip', 'upload slip', 'payment reference', 'renewal', 'billing payment', 'plan payment'],
    action: { label: 'Open Billing', path: '/admin/billing' },
    answer: [
      'For store subscription renewal:',
      '1. Open Admin -> Billing.',
      '2. Check the current plan, amount, due date, and subscription status.',
      '3. Enter the payment reference or slip number.',
      '4. Upload the payment proof file.',
      '5. Submit it for super admin review.',
      'The super admin approves or rejects the payment. After approval, StoreKit renews the plan period and updates the next payment date automatically.',
    ].join('\n'),
  },
  {
    id: 'payment_gateway',
    title: 'Set up payment gateways',
    keywords: [
      'payment gateway', 'payment gateways', 'gateway', 'payhere', 'stripe', 'paypal',
      'online payment', 'card payment', 'payment setup', 'payment hadnne', 'payment hadanne',
      'gateway hadnne', 'gateway hadanne',
    ],
    action: { label: 'Open Settings', path: '/admin/settings' },
    answer: [
      'To set up online payment gateways in StoreKit:',
      '1. Open Admin -> Settings.',
      '2. Open the Gateways tab.',
      '3. Choose the gateway you want to configure: PayHere, Stripe, or PayPal.',
      '4. Turn Enabled on for that gateway.',
      '5. Choose Test/Sandbox mode or Live mode.',
      '6. Fill the gateway credentials shown in the form.',
      '   - PayHere: Merchant ID, Merchant Secret, optional App ID, optional App Secret.',
      '   - Stripe: Publishable Key, Secret Key, Webhook Secret.',
      '   - PayPal: Client ID, Client Secret.',
      '7. Click Save {gateway} Settings.',
      '',
      'For manual payments/COD style methods, open Admin -> Settings -> Payment and enable the manual payment methods you need.',
    ].join('\n'),
  },
  {
    id: 'theme',
    title: 'Change storefront theme',
    keywords: ['theme', 'template', 'font', 'fonts', 'font change', 'change font', 'colors', 'theme builder', 'store design', 'fonts change', 'font eka'],
    action: { label: 'Open Theme Builder', path: '/admin/theme-builder' },
    answer: [
      'To change the storefront appearance:',
      '1. Open Admin -> Theme Builder.',
      '2. Pick a storefront template.',
      '3. Adjust colors, fonts, logo size, and other theme options.',
      '4. Save the theme.',
      'The saved theme is loaded by the customer storefront for this store only.',
    ].join('\n'),
  },
  {
    id: 'seo',
    title: 'Store SEO setup',
    keywords: ['seo', 'meta', 'sitemap', 'robots', 'google', 'search console'],
    action: { label: 'Open SEO', path: '/admin/seo' },
    answer: [
      'To configure SEO for this store:',
      '1. Open Admin -> SEO.',
      '2. Set the store meta title, meta description, site URL, language, Open Graph data, and social links.',
      '3. Save SEO settings.',
      '4. Check /robots.txt and /sitemap.xml on the store domain.',
      'Each store domain receives its own robots file, sitemap URLs, metadata, and analytics configuration.',
    ].join('\n'),
  },
  {
    id: 'settings',
    title: 'Store settings',
    keywords: ['settings', 'store email', 'whatsapp', 'currency', 'logo', 'business info'],
    action: { label: 'Open Settings', path: '/admin/settings' },
    answer: [
      'Store configuration lives in Admin -> Settings.',
      'Use this area for business information, contact details, logo/favicon, checkout behavior, notifications, payment settings, delivery settings, and other store-level controls.',
      'These settings are store-specific, so changing one store does not affect another store.',
    ].join('\n'),
  },
  {
    id: 'whatsapp_widget',
    title: 'Set up WhatsApp widget',
    keywords: [
      'whatsapp', 'whats app', 'whatapp', 'whatsapp link', 'whatsapp widget',
      'whatsapp chat', 'whatsapp setup', 'whatsapp link krnne', 'whatapp link krnne',
    ],
    action: { label: 'Open Settings', path: '/admin/settings' },
    answer: [
      'To set up the floating WhatsApp chat button:',
      '1. Open Admin -> Settings.',
      '2. Open the WhatsApp tab.',
      '3. Turn Enable WhatsApp Widget on.',
      '4. Enter the WhatsApp Number with country code, for example +94771234567.',
      '5. Enter Agent / Team Name.',
      '6. Edit the Welcome Message.',
      '7. Edit the Pre-filled Chat Message. You can use {product} and {url} on product pages.',
      '8. Set the Offline Message.',
      '9. Choose the Button Position.',
      '10. Set Online Hours.',
      '11. Choose Show on Mobile and Show on Desktop as needed.',
      '12. Click Save WhatsApp Settings.',
      '',
      'After saving, the floating WhatsApp button appears on the store based on the visibility settings.',
    ].join('\n'),
  },
  {
    id: 'banners',
    title: 'Create banners and popups',
    keywords: [
      'banner', 'banners', 'popup', 'popups', 'hero banner', 'running banner',
      'flash sale banner', 'promo banner', 'banner ekak', 'banner danne',
    ],
    action: { label: 'Open Banners', path: '/admin/banners' },
    answer: [
      'To add a banner or popup:',
      '1. Open Admin -> Banners & Popups.',
      '2. Choose the banner type tab you need:',
      '   - Running Banners for the scrolling top announcement bar.',
      '   - Hero Banners for the homepage hero slider.',
      '   - Popup Banners for site-entry popups.',
      '   - Flash Sale Banners for countdown sale strips.',
      '   - Promo Banners for mid-page promotions.',
      '   - Product Page Banners for product detail pages.',
      '   - Category Page Banners for category/shop pages.',
      '   - Global Banners for sitewide banners below the header.',
      '3. Click Add/New banner.',
      '4. Fill the title and banner-specific fields.',
      '5. Upload the banner image when that banner type uses an image.',
      '6. Add Link URL and Button Text if the banner should send customers to a page.',
      '7. Set mobile/desktop visibility, start/end dates, sort order, and Active status.',
      '8. Save the banner.',
      '',
      'After saving, use Show/Hide in the banner card to control whether it appears on the store.',
    ].join('\n'),
  },
  {
    id: 'social_media_setup',
    title: 'Set up social media accounts',
    keywords: [
      'social media setup', 'social setup', 'facebook setup', 'instagram setup',
      'tiktok setup', 'telegram setup', 'social media connect', 'social media account',
      'social media setup krnne', 'social media setup karanne',
    ],
    action: { label: 'Open Social Media', path: '/admin/social-media' },
    answer: [
      'To connect social media accounts:',
      '1. Open Admin -> Social Media.',
      '2. In the Settings tab, choose the platform tab: Facebook Pages, Instagram Business, TikTok Business, WhatsApp Business, or Telegram Bot / Channel.',
      '3. Fill the credential fields shown for that platform.',
      '4. Click Connect Account or Update Credentials.',
      '5. Click Test Connection to verify the account.',
      '6. Turn Enabled on for the platform.',
      '7. In Automation Settings, enable automation only for connected platforms.',
      '8. In Post Templates, customize the caption template and hashtags, then save templates.',
      '',
      'Post Management can only publish to platforms that are connected and enabled.',
    ].join('\n'),
  },
  {
    id: 'social_media_post',
    title: 'Publish products to social media',
    keywords: [
      'social media post', 'post to social', 'publish social', 'facebook post',
      'instagram post', 'product post', 'social post dnne', 'social media post dnne',
      'post danne', 'post danna',
    ],
    action: { label: 'Open Social Media', path: '/admin/social-media' },
    answer: [
      'To publish product posts to social media:',
      '1. First connect and enable platforms in Admin -> Social Media -> Settings.',
      '2. Open Admin -> Social Media.',
      '3. Open the Post Management tab.',
      '4. Filter products by brand/category if needed.',
      '5. Select the products you want to post.',
      '6. Select the connected platforms.',
      '7. Configure rate limits if needed.',
      '8. Start the bulk post.',
      '9. Watch the progress and review posted/failed results.',
    ].join('\n'),
  },
  {
    id: 'categories',
    title: 'Manage categories',
    keywords: ['category', 'categories', 'subcategory', 'sub category', 'product category'],
    action: { label: 'Open Categories', path: '/admin/categories' },
    answer: [
      'To manage product categories:',
      '1. Open Admin -> Categories.',
      '2. Create a top-level category first.',
      '3. If needed, create subcategories under a parent category.',
      '4. When adding or editing a product, choose the correct category and optional subcategory.',
      'Categories are store-specific, so each store manages its own category tree.',
    ].join('\n'),
  },
  {
    id: 'bulk_products',
    title: 'Bulk product upload',
    keywords: [
      'bulk product', 'bulk products', 'bulk upload', 'bulk import', 'excel upload',
      'upload many products', 'add many products', 'multiple products', 'products bulk',
      'bulk product danne', 'bulk product danna', 'godak product', 'product godak',
    ],
    action: { label: 'Open Products', path: '/admin/products' },
    answer: [
      'StoreKit has two verified ways to add products in bulk from Admin -> Products:',
      '',
      'Option 1: Bulk Upload with Excel',
      '1. Open Admin -> Products.',
      '2. Click Bulk Upload.',
      '3. Click Download Excel Template.',
      '4. Fill one row per product. Category names must match existing categories.',
      '5. Save the Excel file.',
      '6. Upload the filled .xlsx or .xls file in the Bulk Upload modal.',
      '7. Click Upload & Create Products.',
      '8. Review the created/skipped count and any errors shown after import.',
      '',
      'Option 2: Bulk URL Import',
      '1. Open Admin -> Products.',
      '2. Click Bulk URL Import.',
      '3. Paste one product URL per line, up to 200 URLs at a time.',
      '4. Select the Default Category.',
      '5. Set the Fetch Rate. A lower rate reduces the chance of being blocked by the source website.',
      '6. Click Start Import.',
      '7. Imported URL products are saved as drafts/Hidden products.',
      '8. Open each imported product, review the details/images/prices, then publish by making it Active.',
      '',
      'Use Bulk Upload when you already have product data in Excel. Use Bulk URL Import when you want StoreKit to fetch product details from product pages.',
    ].join('\n'),
  },
  {
    id: 'sku_images',
    title: 'Bulk SKU image upload',
    keywords: [
      'sku images', 'bulk images', 'bulk image upload', 'upload images by sku',
      'image bulk', 'product images bulk', 'sku image',
    ],
    action: { label: 'Open Products', path: '/admin/products' },
    answer: [
      'To bulk assign product images by SKU:',
      '1. Open Admin -> Products.',
      '2. Click SKU Images.',
      '3. Prepare folders named exactly after each product SKU.',
      '4. Put that product images inside the matching SKU folder.',
      '5. Upload the prepared image set from the SKU Images modal.',
      'StoreKit matches images to products using the SKU, so SKU values must be accurate before uploading.',
    ].join('\n'),
  },
  {
    id: 'customers',
    title: 'Customer management',
    keywords: ['customer', 'customers', 'user', 'users', 'buyer'],
    action: { label: 'Open Customers', path: '/admin/customers' },
    answer: [
      'Customer records are available from Admin -> Customers.',
      'Use this section to review registered customers for this store. Orders can also contain guest customer details, so order-level billing/shipping data remains visible even if the buyer did not register.',
    ].join('\n'),
  },
  {
    id: 'product_visibility',
    title: 'Product not showing on storefront',
    keywords: [
      'product not showing', 'product not visible', 'product missing', 'not visible',
      'storefront product missing', 'product eka penne na', 'product eka pennanne na',
      'product eka display wenne na', 'store eke penne na', 'product එක පෙන්නන්නේ නැහැ',
      'product එක නැහැ', 'store එකේ product නැහැ',
    ],
    action: { label: 'Open Products', path: '/admin/products' },
    answer: [
      'If a product is not showing on the storefront, check these items first:',
      '',
      '1. Open Admin -> Products.',
      '2. Open the affected product.',
      '3. Make sure Active is enabled. Draft or inactive products do not show on the storefront.',
      '4. Confirm the product has a valid Category, Regular Price, Stock Quantity, and Thumbnail.',
      '5. If the product uses variants, check that at least one variant is available and has stock.',
      '6. Click Save Changes.',
      '',
      'After saving, refresh the storefront and check the product category/search page again.',
    ].join('\n'),
  },
  {
    id: 'payment_pending_after_paid',
    title: 'Paid order still pending or unpaid',
    keywords: [
      'payment paid but pending', 'paid but pending', 'paid but unpaid', 'order unpaid',
      'order pending after payment', 'payment callback', 'webhook payment',
      'pay karala pending', 'paid una pending', 'paid una unpaid', 'payment eka paid habai unpaid',
      'order eka paid una habai unpaid', 'customer pay karala habai order eka pending',
      'payment කළා pending', 'paid වුණා pending', 'payment කරලා unpaid',
    ],
    action: { label: 'Open Orders', path: '/admin/orders' },
    answer: [
      'If the customer paid but StoreKit still shows the order as Pending or Unpaid, the payment confirmation may not have reached StoreKit yet.',
      '',
      'Check this path:',
      'Admin Panel -> Orders -> Select Order -> Payment Details',
      '',
      'Then verify:',
      '1. Payment method and gateway.',
      '2. Gateway transaction ID.',
      '3. Payment status in the gateway dashboard.',
      '4. Webhook/callback delivery status.',
      '5. Whether the order belongs to the correct store/domain.',
      '',
      'Do not manually mark the order as Paid unless the gateway transaction ID is verified.',
    ].join('\n'),
  },
];

const GREETING_WORDS = ['hi', 'hello', 'hey', 'help', 'start'];
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'to', 'do', 'i', 'my', 'how', 'can', 'please', 'me', 'for', 'in', 'of', 'with', 'is', 'are',
  'ekak', 'eka', 'eke', 'mage', 'mata', 'oya', 'kohomada', 'kohoma', 'kohomd', 'karanne', 'karanna', 'danne',
  'danna', 'danne', 'puluwan', 'puluvanda', 'wage', 'kiyanna', 'balanna', 'ganna', 'hadanna',
  'obage', 'danata', 'nisa', 'naha', 'naha', 'ne', 'na', 'ai', 'ayi', 'mokakda', 'mokada',
]);

const SINGLISH_INTENT_SYNONYMS = [
  ['penne na', 'not visible'],
  ['pene na', 'not visible'],
  ['pene naha', 'not visible'],
  ['pennanne na', 'not visible'],
  ['pennan na', 'not visible'],
  ['pennene na', 'not visible'],
  ['display wenne na', 'not visible'],
  ['show wenne na', 'not visible'],
  ['product eka naha', 'product missing'],
  ['wada na', 'not working'],
  ['weda na', 'not working'],
  ['hariyata wada na', 'not working correctly'],
  ['hariyata weda na', 'not working correctly'],
  ['save wenne na', 'not saving'],
  ['load wenne na', 'not loading'],
  ['login wenna ba', 'cannot login'],
  ['log wenna ba', 'cannot login'],
  ['hadanne kohomada', 'how configure fix'],
  ['kohomada meka hadanne', 'how configure fix'],
  ['order eka pending', 'pending order'],
  ['oder eka pending', 'pending order'],
  ['payment eka fail', 'payment failed'],
  ['payment fail', 'payment failed'],
  ['paymet eka fail', 'payment failed'],
  ['pay karala', 'payment paid'],
  ['paid una', 'payment paid'],
  ['unpaid kiyala', 'unpaid'],
  ['stock eka adui', 'low stock'],
  ['stock adui', 'low stock'],
  ['delete karanna', 'delete'],
  ['active karanna', 'activate active'],
  ['domain eka map karanna', 'map domain'],
  ['plan eka change karanna', 'change plan'],
  ['customer ta message ekak yawanna', 'send customer message'],
  ['report eka denna', 'provide report'],
  ['mokakda issue eka', 'what issue'],
  ['meka fix karanna', 'fix issue'],
  ['details denna', 'provide details'],
  ['kohenda balanne', 'where check'],
  ['koheda balanne', 'where check'],
  ['admin side', 'admin panel'],
  ['store side', 'storefront'],
  ['super admin side', 'super admin panel'],
];

const TYPO_INTENT_SYNONYMS = [
  ['prodcut', 'product'],
  ['oder', 'order'],
  ['paymet', 'payment'],
  ['catogory', 'category'],
  ['tenet', 'tenant store'],
  ['domian', 'domain'],
  ['subcripton', 'subscription'],
  ['delevary', 'delivery'],
  ['seting', 'setting'],
  ['settingss', 'settings'],
  ['pannel', 'panel'],
  ['resposive', 'responsive'],
  ['manges', 'manage'],
  ['mange', 'manage'],
  ['statu', 'status'],
  ['statsu', 'status'],
  ['webhock', 'webhook'],
  ['gatway', 'gateway'],
  ['getway', 'gateway'],
];

const PROTECTED_UI_TERMS = [
  'Product', 'Order', 'Customer', 'Payment', 'Settings', 'Domain', 'Plan', 'Analytics',
  'Admin Panel', 'Super Admin', 'Save Changes', 'Active', 'Draft', 'Pending', 'Paid',
  'Unpaid', 'API', 'Webhook', 'DNS', 'SSL', 'StoreKit',
];

const STOREKIT_ASSISTANT_CORE_POLICY = [
  'You are the official StoreKit AI Admin Assistant embedded inside the StoreKit ecommerce administration platform.',
  'You are not a general-purpose chatbot. You help administrators operate, understand, troubleshoot, and improve their current StoreKit ecommerce store.',
  'Always use the authenticated tenant context from the server-side session. Never trust a tenant ID supplied in an admin message.',
  'Never expose another tenant\'s data. All live reads and writes must be scoped to the authenticated tenant ID.',
  'Use data sources in this priority order: live StoreKit database data, internal StoreKit API results, current admin-page context, tenant configuration, subscription-plan configuration, permissions and feature flags, recent StoreKit logs, approved StoreKit knowledge-base records, StoreKit documentation, then general ecommerce knowledge.',
  'Never invent product counts, stock quantities, revenue, order totals, customer totals, payment results, delivery statuses, plan limits, domain status, SSL status, error causes, API responses, database records, configuration values, features, buttons, pages, routes, or workflows.',
  'If live data was not checked or is unavailable, clearly say what could not be verified. Never claim that something was checked unless StoreKit data was actually loaded for it.',
  'Before recommending restricted actions, consider the current admin role, permissions, tenant plan, enabled features, and usage limits available in context.',
  'Treat read-only checks as safe. For low-risk writes, act only when the admin clearly asks. For high-risk writes such as delete, cancel, refund, domain changes, gateway disabling, staff removal, plan changes, reset, bulk update, restore, or permanent removal, explain impact and request explicit confirmation before any action.',
  'Protect private data. Never reveal passwords, JWTs, access tokens, refresh tokens, API secret keys, database credentials, payment secrets, webhook secrets, encryption keys, authentication headers, full payment-card data, or private customer information not needed for the task.',
  'Use exact StoreKit menu names and confirmed routes. Prefer navigation like Admin Panel -> Products -> Select Product -> Status and include known routes such as /admin/products.',
  'Match the administrator\'s language style: English, Sinhala, Singlish, Sinhala-English, or Singlish-English. Keep StoreKit UI labels, route names, statuses, product names, gateway names, API names, and error codes unchanged.',
  'Communicate like an experienced Sri Lankan ecommerce support specialist: professional, clear, direct, patient, natural, action-oriented, and non-judgmental.',
  'Use the smallest response structure that solves the request. Separate confirmed findings, possible causes, required checks, recommended action, and expected result only when troubleshooting needs it.',
].join('\n');

const STOREKIT_ASSISTANT_TENANT_SECURITY_POLICY = [
  'Tenant context, authentication, permissions, and data isolation rules:',
  'Resolve tenantId, storeName, adminId, role, permissions when available, subscription plan, feature flags, current admin route, and language preference before store-specific answers.',
  'Never trust tenant IDs, store IDs, product IDs, order IDs, or customer IDs supplied by the admin as proof of access. Use authenticated server context and verify ownership with tenantId.',
  'Every tenant-owned query must include tenantId. Never use unrestricted queries for products, orders, customers, inventory, settings, analytics, or other tenant collections.',
  'Check permissions before recommending or executing actions. If access is denied, explain the missing permission and the role that normally performs the action.',
  'Verify requested features against the current subscription plan. If unavailable, explain the current plan limitation and where billing/plan changes are managed.',
  'If Super Admin impersonation exists in context, clearly state impersonation mode and log privileged operations. If no impersonation context exists, do not claim impersonation.',
  'If tenant context cannot be verified, do not guess. Ask the admin to re-authenticate or reload the session before continuing.',
  'Before every store-specific answer verify tenant, permissions, plan, feature flags, required live data, and response safety.',
].join('\n');

const STOREKIT_ASSISTANT_MULTILINGUAL_POLICY = [
  'Multilingual intelligence and human conversation rules:',
  'Classify every admin message for language, intent, sentiment, urgency, and StoreKit module before answering.',
  'Support English, Sinhala Unicode, Singlish, English+Sinhala mixed, and English+Singlish mixed conversations.',
  'Reply in the same dominant language style unless the admin explicitly requests another language.',
  'Understand common Singlish and spelling variants without correcting the admin.',
  'Use natural Sinhala when the admin writes Sinhala. Do not machine-translate StoreKit UI labels or technical terms.',
  'Preserve StoreKit terminology such as Product, Order, Settings, Active, Draft, Pending, Paid, Admin Panel, Webhook, DNS, and SSL.',
  'Use current conversation context for references like this product, that order, eka, meka, and ara order eka.',
  'Ask a clarifying question only when multiple meanings are possible and live data or conversation context cannot disambiguate.',
  'Never change factual results because the admin used a different language.',
].join('\n');

const STOREKIT_ASSISTANT_DATABASE_TOOL_POLICY = [
  'Database intelligence and tool calling rules:',
  'Prefer live StoreKit database data over memory for every store-specific answer.',
  'Use only approved backend tools that enforce tenant isolation internally.',
  'Treat tool results as the source of truth unless the tool reports an error.',
  'Every approved tool must use authenticated tenantId, admin identity, permissions, current route when relevant, and language preference when formatting.',
  'Never trust user-supplied tenant IDs. Never execute Product.find({}), Order.find({}), User.find({ role: "customer" }), unrestricted updates, or unrestricted deletes.',
  'Read operations do not require confirmation. Write operations require permission validation, ownership validation, input validation, execution, and post-action verification.',
  'High-risk writes require explicit confirmation before execution.',
  'If live data cannot be retrieved, do not guess. Explain which data could not be retrieved and suggest a safe next step.',
  'Differentiate record not found, permission denied, service unavailable, and validation failed whenever possible.',
  'Never expose raw database objects unless explicitly requested. Convert data into clear StoreKit admin guidance.',
].join('\n');

const STOREKIT_ASSISTANT_PRODUCT_POLICY = [
  'Product management expert rules:',
  'For product-specific questions, retrieve the current product record before giving a store-specific answer.',
  'Search products by authenticated tenant plus ID, SKU, slug, barcode when supported, exact name, or partial name. Never use another tenant\'s product.',
  'Before recommending changes, verify ownership, tenant scope, permissions, category, inventory, publication status, required fields, images, pricing, variants, SEO fields, and plan limits when available.',
  'For product visibility issues, check Active/Draft status, inventory, category, required fields, primary image, storefront visibility, variant availability, plan limits, and tenant isolation before concluding.',
  'Explain regular price, sale price, currency, low-stock threshold, variant inventory, and missing image/category data separately.',
  'Warn before bulk edits. Destructive product actions require explicit confirmation and post-action verification.',
  'Never claim a product was updated until StoreKit verifies the updated product record.',
].join('\n');

const STOREKIT_ASSISTANT_ORDER_POLICY = [
  'Order management expert rules:',
  'For order-specific questions, retrieve the latest order record before giving a store-specific answer.',
  'Search orders by authenticated tenant plus order number, Order ID, customer name, email, phone, or date range when appropriate.',
  'Verify tenant ownership, order status, payment status, fulfilment/shipping fields, delivery status, customer details, items, totals, discounts, transaction IDs when stored, and timestamps.',
  'Do not use Order Status, Payment Status, Fulfilment Status, Delivery Status, and Refund Status interchangeably.',
  'For payment issues, inspect payment method, payment status, amount, currency, payment slip, gateway callback/webhook data when exposed, and transaction ID when stored before concluding.',
  'For fulfilment and shipping, check tracking number, delivery partner, estimated delivery, delivered date, and status history when available.',
  'For returns/refunds/cancellations, require explicit confirmation before risky actions and verify the result after execution.',
  'When drafting customer replies, use verified order data only and never expose internal notes or sensitive payment details.',
  'Never fabricate payment results, tracking information, refund status, or transaction IDs.',
].join('\n');

const STOREKIT_ASSISTANT_CUSTOMER_POLICY = [
  'Customer management expert rules:',
  'For customer-specific questions, retrieve the latest customer record before giving a store-specific answer.',
  'Search customers by authenticated tenant plus customer ID, email, phone number, name, or linked order when appropriate.',
  'Verify tenant ownership, account status, email verification, phone availability, addresses, recent orders, wishlist, and available communication data before responding.',
  'Protect customer privacy. Never expose passwords, authentication tokens, payment details, or personal information unrelated to the request.',
  'Reveal only the minimum customer information required for the authenticated admin task. Mask email/phone unless exact values are necessary.',
  'Understand guest customers separately from registered customers. If only guest order information exists, say it is guest order data, not a registered customer account.',
  'When discussing purchase history, use verified orders only. Never invent purchase activity, loyalty points, refunds, or support history.',
  'For login issues, verify account existence, active status, email verification, Google account linkage when stored, and available login metadata. Say when password reset/auth logs are not available.',
  'Require explicit confirmation before deleting, anonymizing, merging, or changing critical customer account details.',
].join('\n');

const STOREKIT_ASSISTANT_INVENTORY_POLICY = [
  'Inventory and stock management expert rules:',
  'Always use verified live inventory/product stock data before answering stock-specific questions.',
  'In the current StoreKit schema, inventory is represented by Product.stock, Product.lowStockThreshold, Product.soldCount, and Product.variantCombinations stock. Do not invent warehouses, reserved stock, committed stock, incoming stock, purchase orders, or adjustment history if those records are not available.',
  'Search inventory by authenticated tenant plus Product ID, SKU, slug, variant SKU, or product name.',
  'Treat product-level stock and variant-combination stock separately. A variant stock value is not the same as the main product stock.',
  'For low-stock answers, state the threshold used and list only products retrieved from live data.',
  'For stock movement explanations, use verified order/return/product data only. Explain when movement history or warehouse records are unavailable.',
  'Require explicit confirmation before bulk stock updates, inventory resets, negative stock adjustments, or stock transfers. Verify inventory after every write operation.',
  'Never invent stock quantities, warehouse allocations, reserved stock, incoming stock, or adjustment history.',
].join('\n');

const STOREKIT_ASSISTANT_PAYMENT_POLICY = [
  'Payment and checkout expert rules:',
  'Always retrieve the latest order, payment status, gateway configuration, and available refund/return records before answering payment-specific questions.',
  'Never assume payment succeeded because the customer reached a success page. Treat the stored Order.paymentStatus and verified gateway/return data as the source of truth.',
  'Verify checkout totals from the order record when available: subtotal, shipping cost, tax, coupon discount, gift card discount, total, payment method, currency, billing presence, and order creation timestamp.',
  'Verify gateway status using safe gateway fields only: enabled/disabled, live/sandbox mode, supported currencies, configured credential presence, and webhook/status-history notes when available.',
  'In the current StoreKit schema, payment truth is represented mainly by Order.paymentMethod, Order.paymentStatus, order totals, payment slip fields, statusHistory notes, PaymentGateway configuration, and ReturnRequest refund fields. Do not invent a separate payment ledger, settlement state, card data, gateway event log, or transaction response if it is not stored.',
  'Never reveal API keys, merchant secrets, webhook secrets, payment tokens, database credentials, or full card details. Mask or omit all sensitive gateway configuration values.',
  'For refunds, verify payment status, return/refund records, refund amount, net refund amount, refund method, and order refunded status when available. Require explicit confirmation before refunding, voiding, capturing, retrying financial operations, or changing gateway configuration.',
  'Payment answers must present Payment Status, Verified Findings, Confirmed Cause, Admin Navigation, Recommended Action, and Expected Result.',
].join('\n');

const STOREKIT_ASSISTANT_NAVIGATION_POLICY = [
  'StoreKit knowledge and navigation expert rules:',
  'Guide administrators using verified StoreKit routes and menu labels only.',
  'Use exact navigation format: Admin Panel -> Module -> Page. Include routes only when they are confirmed in StoreKit route configuration.',
  'Use current page context, authenticated tenant, admin role, subscription plan, and feature flags before recommending a page.',
  'Differentiate Tenant Admin and Super Admin responsibilities. Tenant Admin manages one store under /admin. Super Admin manages plans, tenants, billing, domains, and monitoring under /superadmin.',
  'Verify feature flags before recommending feature-specific pages. If a feature is unavailable, explain the plan/feature limitation and where Billing is managed.',
  'For "Where do I find..." questions, answer with Current Context, Navigation, Action, Expected Result, and Related Pages when useful.',
  'If a page/button is missing, check permissions, plan, feature flags, current route, and confirmed routes before saying it is unavailable.',
  'Never invent menus, buttons, routes, tabs, or StoreKit features.',
].join('\n');

const STOREKIT_ASSISTANT_SETTINGS_POLICY = [
  'Store settings expert rules:',
  'Always retrieve the latest store settings/configuration before answering settings-specific questions.',
  'Use verified Settings page tabs only: Store, Business, Delivery, Announcement, WhatsApp, Payment, Gateways, Theme, Fonts, Pages, Banners & Popups, Content, SEO, Discounts, Features, Advanced, Admins, Email Notifications.',
  'Verify tenant ownership, current admin role, subscription plan, feature flags, and related dependencies before recommending settings changes.',
  'Explain dependencies clearly: currency affects pricing/reports/checkout display; tax affects checkout/order totals; delivery affects checkout shipping/COD; payment settings affect checkout; email notification settings affect customer/admin emails; SEO defaults affect storefront metadata; logos/theme affect storefront branding.',
  'For critical settings such as payments, taxes, domains, maintenance mode, email providers, and gateway credentials, summarize impact and require confirmation before write actions.',
  'If a setting appears ineffective, verify saved configuration, feature flags, cache/theme application, related integrations, and recent logs before identifying the root cause.',
  'Never invent settings, tabs, fields, routes, default values, or successful configuration changes.',
].join('\n');

const STOREKIT_ASSISTANT_THEME_POLICY = [
  'Theme and website builder expert rules:',
  'Always retrieve the active tenant theme, theme settings, layout_builder configuration, business pages, banners, and feature flags before answering website/theme questions.',
  'In the current StoreKit schema, there is no separate draft/published theme model. The saved Tenant.theme and layout_builder settings are treated as the active storefront configuration. Do not invent draft themes or publish states.',
  'Use verified menu paths only: Admin Panel -> Theme Builder, Admin Panel -> Layout Builder, Admin Panel -> Settings -> Theme, Admin Panel -> Settings -> Pages, Admin Panel -> Banners & Popups.',
  'Distinguish theme styling, layout sections, banners, business pages, and SEO/settings. Do not merge them into one imaginary Website page.',
  'Explain desktop, tablet, and mobile/customer-facing impact for theme/layout/banner changes.',
  'Before recommending publishing/saving customer-facing changes, verify required assets such as logo/favicon/banner images, feature flags, layout sections, and preview/review steps.',
  'For troubleshooting, check saved theme, layout_builder, banners/pages, feature flags, cache/theme application, browser cache, and recent logs before naming a root cause.',
  'Never invent theme options, templates, pages, sections, widgets, draft states, publishing workflows, or deployment/CDN checks that are not exposed by StoreKit.',
].join('\n');

const APPROVED_ASSISTANT_TOOLS = [
  'getStoreSummary',
  'getProducts',
  'searchProducts',
  'getProductById',
  'getInventory',
  'getOrders',
  'searchOrders',
  'getOrderById',
  'getCustomers',
  'searchCustomers',
  'getCustomerById',
  'getCustomerOrders',
  'getStoreSettings',
  'getPaymentGateways',
  'getDeliveryServices',
  'getBusinessPages',
  'getWebsiteTheme',
  'getTenantDomains',
  'getReturnRequestsForOrder',
  'getAnalytics',
  'getRecentErrors',
  'getAdminRoutes',
];

const FEATURE_LABELS = {
  products: 'Products',
  orders: 'Orders',
  categories: 'Categories',
  customers: 'Customers',
  coupons: 'Coupons',
  giftCards: 'Gift Cards',
  banners: 'Banners & Popups',
  seasonal: 'Seasonal',
  deals: 'Deals & Offers',
  reviews: 'Reviews',
  subscribers: 'Subscribers',
  returns: 'Returns',
  seo: 'SEO',
  layoutEditor: 'Layout Builder',
  themeBuilder: 'Theme Builder',
  animations: 'Animations',
  socialMedia: 'Social Media',
  automation: 'Automation Rules',
  backup: 'Backup Center',
  analytics: 'Analytics',
  customDomain: 'Custom Domain',
  metaPixel: 'Meta Pixel',
};

const FEATURE_ROUTES = {
  dashboard: '/admin',
  products: '/admin/products',
  orders: '/admin/orders',
  categories: '/admin/categories',
  customers: '/admin/customers',
  coupons: '/admin/coupons',
  giftCards: '/admin/gift-cards',
  banners: '/admin/banners',
  seasonal: '/admin/seasonal',
  deals: '/admin/deals',
  reviews: '/admin/reviews',
  subscribers: '/admin/subscribers',
  returns: '/admin/returns',
  seo: '/admin/seo',
  layoutEditor: '/admin/layout',
  themeBuilder: '/admin/theme-builder',
  animations: '/admin/animations',
  socialMedia: '/admin/social-media',
  automation: '/admin/automation',
  backup: '/admin/backup',
  monitoring: '/admin/monitoring',
  billing: '/admin/billing',
  settings: '/admin/settings',
  analytics: '/admin',
  customDomain: '/admin/settings',
  metaPixel: '/admin/seo',
};

const ADMIN_NAVIGATION_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', path: '/admin', feature: null, aliases: ['dashboard', 'home', 'overview', 'reports', 'analytics summary', 'sales report', 'report', 'reports eka'] },
  { key: 'products', label: 'Products', path: '/admin/products', feature: 'products', aliases: ['products', 'product', 'inventory', 'stock', 'sku', 'variants', 'bulk upload', 'sku images', 'low stock', 'products koheda', 'product kohenda'] },
  { key: 'orders', label: 'Orders', path: '/admin/orders', feature: 'orders', aliases: ['orders', 'order', 'payment details', 'tracking', 'fulfilment', 'fulfillment', 'pending orders', 'order koheda', 'orders koheda'] },
  { key: 'returns', label: 'Returns', path: '/admin/returns', feature: 'returns', aliases: ['returns', 'refunds', 'exchanges', 'return request', 'refund request'] },
  { key: 'categories', label: 'Categories', path: '/admin/categories', feature: 'categories', aliases: ['categories', 'category', 'sub category', 'subcategory'] },
  { key: 'customers', label: 'Customers', path: '/admin/customers', feature: 'customers', aliases: ['customers', 'customer', 'buyers', 'users', 'customer accounts'] },
  { key: 'coupons', label: 'Coupons', path: '/admin/coupons', feature: 'coupons', aliases: ['coupons', 'coupon', 'discount code', 'promo code'] },
  { key: 'giftCards', label: 'Gift Cards', path: '/admin/gift-cards', feature: 'giftCards', aliases: ['gift cards', 'gift card', 'voucher'] },
  { key: 'banners', label: 'Banners & Popups', path: '/admin/banners', feature: 'banners', aliases: ['banners', 'banner', 'popups', 'popup', 'hero banner', 'running banner'] },
  { key: 'seasonal', label: 'Seasonal', path: '/admin/seasonal', feature: 'seasonal', aliases: ['seasonal', 'seasonal themes', 'campaign'] },
  { key: 'deals', label: 'Deals & Offers', path: '/admin/deals', feature: 'deals', aliases: ['deals', 'offers', 'flash sale', 'deal'] },
  { key: 'reviews', label: 'Reviews', path: '/admin/reviews', feature: 'reviews', aliases: ['reviews', 'review', 'ratings'] },
  { key: 'subscribers', label: 'Subscribers', path: '/admin/subscribers', feature: 'subscribers', aliases: ['subscribers', 'newsletter', 'emails list'] },
  { key: 'layoutEditor', label: 'Layout Builder', path: '/admin/layout', feature: 'layoutEditor', aliases: ['layout', 'layout builder', 'homepage layout', 'checkout layout'] },
  { key: 'seo', label: 'SEO', path: '/admin/seo', feature: 'seo', aliases: ['seo', 'meta', 'sitemap', 'robots', 'search console', 'meta pixel', 'google analytics'] },
  { key: 'themeBuilder', label: 'Theme Builder', path: '/admin/theme-builder', feature: 'themeBuilder', aliases: ['theme', 'theme builder', 'appearance', 'fonts', 'colors'] },
  { key: 'animations', label: 'Animations', path: '/admin/animations', feature: 'animations', aliases: ['animations', 'animation'] },
  { key: 'backup', label: 'Backup Center', path: '/admin/backup', feature: 'backup', aliases: ['backup', 'restore', 'backup center'] },
  { key: 'settings', label: 'Settings', path: '/admin/settings', feature: null, aliases: ['settings', 'store settings', 'business info', 'payment settings', 'gateways', 'payment gateway', 'delivery', 'whatsapp', 'domain', 'dns', 'ssl', 'staff', 'admins', 'pages'] },
  { key: 'socialMedia', label: 'Social Media', path: '/admin/social-media', feature: 'socialMedia', aliases: ['social media', 'facebook', 'instagram', 'tiktok', 'telegram', 'whatsapp business'] },
  { key: 'automation', label: 'Automation Rules', path: '/admin/automation', feature: 'automation', aliases: ['automation', 'automation rules', 'auto rules'] },
  { key: 'billing', label: 'Billing', path: '/admin/billing', feature: null, aliases: ['billing', 'plan', 'subscription', 'payment slip', 'renewal', 'upgrade', 'downgrade'] },
  { key: 'monitoring', label: 'Monitoring', path: '/admin/monitoring', feature: null, aliases: ['monitoring', 'system monitoring', 'logs'] },
];

const SUPER_ADMIN_NAVIGATION_ITEMS = [
  { key: 'overview', label: 'Overview', path: '/superadmin', aliases: ['super admin overview', 'platform overview', 'superadmin dashboard'] },
  { key: 'plans', label: 'Plans', path: '/superadmin', aliases: ['plans', 'plan management', 'subscription plans'] },
  { key: 'tenants', label: 'Tenants', path: '/superadmin', aliases: ['tenants', 'stores', 'tenant management', 'store management'] },
  { key: 'billing', label: 'Billing', path: '/superadmin', aliases: ['super admin billing', 'platform billing', 'tenant payments'] },
  { key: 'domains', label: 'Domains', path: '/superadmin', aliases: ['domains', 'tenant domains', 'domain verification'] },
  { key: 'monitoring', label: 'Monitoring', path: '/superadmin', aliases: ['super admin monitoring', 'platform monitoring'] },
];

const SETTINGS_TABS = [
  { id: 'general', label: 'Store', path: '/admin/settings', feature: null, aliases: ['store profile', 'store name', 'tagline', 'currency', 'currency code', 'currency symbol', 'contact information', 'phone', 'address', 'social links', 'facebook url', 'instagram url'] },
  { id: 'business', label: 'Business', path: '/admin/settings', feature: null, aliases: ['business information', 'business type', 'tax', 'tax settings', 'vat', 'terms', 'privacy', 'legal pages'] },
  { id: 'delivery', label: 'Delivery', path: '/admin/settings', feature: null, aliases: ['shipping', 'shipping settings', 'delivery settings', 'delivery service', 'cod allowed', 'cash on delivery delivery', 'free shipping', 'delivery fee', 'delivery eta'] },
  { id: 'announcement', label: 'Announcement', path: '/admin/settings', feature: null, aliases: ['announcement', 'announcement bar', 'top bar notice'] },
  { id: 'whatsapp', label: 'WhatsApp', path: '/admin/settings', feature: null, aliases: ['whatsapp', 'whatsapp widget', 'whatsapp chat'] },
  { id: 'payment', label: 'Payment', path: '/admin/settings', feature: null, aliases: ['payment settings', 'cod', 'cash on delivery', 'bank transfer', 'bank details', 'payment slip'] },
  { id: 'gateways', label: 'Gateways', path: '/admin/settings', feature: null, aliases: ['gateways', 'payment gateway', 'payhere', 'stripe', 'paypal', 'merchant id', 'webhook secret'] },
  { id: 'appearance', label: 'Theme', path: '/admin/settings', feature: null, aliases: ['theme', 'branding', 'logo', 'favicon', 'logo size', 'colors', 'dark mode'] },
  { id: 'fonts', label: 'Fonts', path: '/admin/settings', feature: null, aliases: ['fonts', 'font style', 'font family'] },
  { id: 'pages', label: 'Pages', path: '/admin/settings', feature: null, aliases: ['pages', 'legal pages', 'business pages', 'footer pages', 'nav pages'] },
  { id: 'banners_link', label: 'Banners & Popups', path: '/admin/settings', feature: 'banners', aliases: ['banners settings', 'popup settings'] },
  { id: 'content', label: 'Content', path: '/admin/settings', feature: null, aliases: ['content', 'header code', 'footer code'] },
  { id: 'seo', label: 'SEO', path: '/admin/settings', feature: 'seo', aliases: ['seo defaults', 'meta title', 'meta description', 'google analytics', 'facebook pixel', 'meta pixel'] },
  { id: 'discounts', label: 'Discounts', path: '/admin/settings', feature: 'coupons', aliases: ['discounts', 'coupon settings', 'gift card covers delivery', 'discount priority'] },
  { id: 'features', label: 'Features', path: '/admin/settings', feature: null, aliases: ['features', 'wishlist', 'reviews', 'returns', 'guest checkout', 'gift cards'] },
  { id: 'advanced', label: 'Advanced', path: '/admin/settings', feature: null, aliases: ['advanced', 'maintenance mode', 'low stock alert', 'auto confirm orders', 'cancel window', 'auto decision'] },
  { id: 'admins', label: 'Admins', path: '/admin/settings', feature: null, aliases: ['admins', 'staff', 'admin users', 'add admin'] },
  { id: 'emails', label: 'Email Notifications', path: '/admin/settings', feature: null, aliases: ['email notifications', 'emails', 'order confirmation emails', 'notification settings', 'panel notifications', 'smtp', 'email provider'] },
];

const KNOWLEDGE_FEATURE_REQUIREMENTS = {
  add_product: 'products',
  orders: 'orders',
  payment_slip: null,
  payment_gateway: null,
  theme: 'themeBuilder',
  seo: 'seo',
  settings: null,
  whatsapp_widget: null,
  banners: 'banners',
  social_media_setup: 'socialMedia',
  social_media_post: 'socialMedia',
  categories: 'categories',
  bulk_products: 'products',
  sku_images: 'products',
  customers: 'customers',
  product_visibility: 'products',
  payment_pending_after_paid: 'orders',
};

const INTENT_FEATURE_REQUIREMENTS = {
  fastMoving: 'orders',
  lowStock: 'products',
  usage: null,
  listingIdeas: 'products',
};

const HIGH_RISK_ACTIONS = [
  { action: 'delete product', feature: 'products', recordType: 'product', words: ['delete product', 'remove product', 'product delete', 'product eka delete', 'product eka ain', 'product එක delete'] },
  { action: 'delete customer', feature: 'customers', recordType: 'customer', words: ['delete customer', 'remove customer', 'customer delete', 'customer eka delete'] },
  { action: 'cancel order', feature: 'orders', recordType: 'order', words: ['cancel order', 'order cancel', 'order eka cancel', 'order එක cancel'] },
  { action: 'refund payment', feature: 'orders', recordType: 'payment/order', words: ['refund', 'refund payment', 'payment refund', 'money return'] },
  { action: 'capture payment', feature: 'orders', recordType: 'payment/order', words: ['capture payment', 'payment capture', 'capture transaction', 'payment eka capture'] },
  { action: 'void transaction', feature: 'orders', recordType: 'payment/order', words: ['void transaction', 'void payment', 'cancel transaction', 'transaction void'] },
  { action: 'retry financial operation', feature: 'orders', recordType: 'payment/order', words: ['retry payment', 'retry transaction', 'retry webhook', 'payment retry', 'financial retry'] },
  { action: 'change domain', feature: 'customDomain', recordType: 'domain', words: ['change domain', 'delete domain', 'remove domain', 'domain map', 'domain eka map', 'domain eka change'] },
  { action: 'disable payment gateway', feature: null, recordType: 'payment gateway', words: ['disable payment gateway', 'gateway disable', 'payhere disable', 'stripe disable', 'paypal disable'] },
  { action: 'change payment gateway configuration', feature: null, recordType: 'payment gateway', words: ['change payment gateway', 'update gateway config', 'gateway config change', 'merchant secret change', 'webhook secret change', 'payment gateway settings change'] },
  { action: 'change tax settings', feature: null, recordType: 'tax settings', words: ['change tax', 'tax rate change', 'enable tax', 'disable tax', 'vat change', 'tax settings update'] },
  { action: 'change maintenance mode', feature: null, recordType: 'store availability setting', words: ['maintenance mode on', 'maintenance mode off', 'enable maintenance', 'disable maintenance', 'turn on maintenance', 'turn off maintenance'] },
  { action: 'change email provider/settings', feature: null, recordType: 'email settings', words: ['change email provider', 'smtp change', 'email provider change', 'disable order emails', 'turn off emails'] },
  { action: 'publish website/theme changes', feature: 'themeBuilder', recordType: 'theme/layout', words: ['publish theme', 'publish website', 'save theme live', 'apply theme live', 'website publish', 'theme publish karanna'] },
  { action: 'reset website layout/theme', feature: 'layoutEditor', recordType: 'theme/layout', words: ['reset layout', 'reset theme', 'restore default theme', 'layout reset', 'theme reset'] },
  { action: 'remove staff member', feature: null, recordType: 'staff/admin user', words: ['remove staff', 'delete staff', 'remove admin', 'delete admin'] },
  { action: 'change plan', feature: null, recordType: 'subscription plan', words: ['change plan', 'plan eka change', 'upgrade plan', 'downgrade plan'] },
  { action: 'restore backup', feature: 'backup', recordType: 'backup', words: ['restore backup', 'backup restore'] },
  { action: 'reset configuration', feature: null, recordType: 'store configuration', words: ['reset settings', 'reset configuration', 'factory reset', 'reset store'] },
  { action: 'bulk stock update', feature: 'products', recordType: 'inventory/products', words: ['bulk stock update', 'bulk update stock', 'stock bulk update', 'stock tika update', 'inventory bulk update'] },
  { action: 'inventory reset', feature: 'products', recordType: 'inventory/products', words: ['inventory reset', 'reset stock', 'stock reset', 'stock eka reset'] },
  { action: 'stock transfer', feature: 'products', recordType: 'inventory/warehouse transfer', words: ['stock transfer', 'warehouse transfer', 'transfer stock'] },
  { action: 'negative stock adjustment', feature: 'products', recordType: 'inventory/products', words: ['negative stock', 'stock negative', 'minus stock', 'stock adu karanna'] },
  { action: 'bulk update records', feature: null, recordType: 'multiple records', words: ['bulk update', 'bulk delete', 'mass update', 'delete all'] },
];

const INTENT_PHRASES = {
  fastMoving: [
    'fast moving', 'fast-moving', 'best selling', 'best-selling', 'top selling', 'most sold',
    'popular item', 'popular product', 'sales item', 'moving item', 'selling item',
    'hoda sell wena', 'hodata sell wena', 'wediya sell wena', 'ikmanata sell wena',
    'වැඩියෙන් sell', 'වැඩියෙන් විකිණෙන', 'හොඳට sell වෙන', 'popular products',
  ],
  lowStock: [
    'low stock', 'restock', 'stock alert', 'stock low', 'stock adu',
    'stock adui', 'stock eka adui', 'stock eka adu', 'adu stock', 'අඩු stock',
    'stock අඩු', 'තොග අඩු', 'තොගය අඩු', 'stock අඩු products',
  ],
  inventoryStatus: [
    'inventory', 'stock level', 'stock status', 'available stock', 'reserved stock',
    'committed stock', 'incoming stock', 'stock adjustment', 'stock movement',
    'why out of stock', 'out of stock', 'stock zero', 'stock eka', 'stock kochchara',
    'stock keeyada', 'stock කීයද', 'තොගය', 'inventory report',
  ],
  usage: [
    'usage', 'limit', 'plan', 'billing status', 'how many products', 'orders this month',
    'revenue', 'income', 'sales amount', 'payment amount', 'plan usage', 'usage eka',
    'plan eka', 'billing status eka', 'ආදායම', 'සීමාව', 'plan එක', 'billing',
  ],
  listingIdeas: [
    'what items should i list', 'what products should i list', 'best items to list',
    'hod items', 'hoda items', 'list krnn', 'list karanna', 'sell karanna hoda',
    'monawada list', 'monawa list', 'list karanna hoda', 'මොන products list',
  ],
  productVisibility: [
    'product not showing', 'product not visible', 'product missing', 'not visible',
    'storefront product missing', 'product eka penne na', 'product eka pennanne na',
    'product eka display wenne na', 'store eke penne na', 'product එක පෙන්නන්නේ නැහැ',
    'product එක නැහැ', 'store එකේ product නැහැ',
  ],
  paymentPending: [
    'payment paid but pending', 'paid but pending', 'paid but unpaid', 'order unpaid',
    'order pending after payment', 'payment callback', 'webhook payment',
    'pay karala pending', 'paid una pending', 'paid una unpaid', 'payment eka paid habai unpaid',
    'order eka paid una habai unpaid', 'customer pay karala habai order eka pending',
    'payment කළා pending', 'paid වුණා pending', 'payment කරලා unpaid',
  ],
  paymentCheckout: [
    'checkout', 'payment issue', 'payment error', 'payment failed', 'failed payment',
    'transaction', 'transaction id', 'payment reference', 'payment method', 'payment gateway',
    'gateway issue', 'gateway status', 'webhook', 'callback', 'signature validation',
    'payhere issue', 'stripe issue', 'paypal issue', 'refund status', 'partial refund',
    'invoice', 'tax', 'shipping cost', 'cart total', 'coupon payment', 'checkout wada na',
    'checkout weda na', 'payment wada na', 'payment weda na', 'payment eka fail',
    'gateway eka wada na', 'checkout එක', 'payment එක fail', 'gateway එක',
  ],
  navigationHelp: [
    'where do i find', 'where is', 'where can i', 'how to open', 'open page',
    'go to', 'navigate', 'navigation', 'menu', 'page', 'route', 'button missing',
    'page missing', 'where check', 'kohenda balanne', 'koheda balanne',
    'kohenda open karanne', 'koheda thiyenne', ' කොහෙද', 'කොහෙන්ද',
    'මෙනු', 'page eka', 'menu eka', 'button eka naha',
  ],
  settingsHelp: [
    'settings', 'store settings', 'store profile', 'business information', 'currency',
    'currency code', 'timezone', 'time zone', 'language', 'tax settings', 'shipping settings',
    'delivery settings', 'payment settings', 'email settings', 'notification settings',
    'branding', 'logo', 'favicon', 'contact information', 'maintenance mode', 'seo defaults',
    'legal pages', 'integrations', 'order confirmation email', 'store currency',
    'settings wada na', 'save settings', 'setting save wenne na', 'currency eka',
    'tax eka', 'delivery settings eka', 'email yawenne na', 'logo eka', 'maintenance mode eka',
    'settings එක', 'currency එක', 'tax එක', 'email යවන්නේ නැහැ',
  ],
  themeWebsite: [
    'theme', 'theme builder', 'website builder', 'layout builder', 'homepage',
    'header', 'footer', 'menu', 'menus', 'banners', 'banner', 'sections',
    'widgets', 'pages', 'branding', 'colors', 'fonts', 'logo', 'favicon',
    'templates', 'responsive layout', 'mobile layout', 'desktop layout',
    'publish theme', 'preview theme', 'store design', 'website design',
    'hero slider', 'category grid', 'featured products', 'new arrivals',
    'theme eka', 'website eka', 'layout eka', 'homepage eka', 'logo eka',
    'banner eka', 'font eka', 'color eka', 'theme එක', 'website එක',
  ],
  orderStatus: [
    'order status', 'order pending', 'order tracking', 'tracking number', 'delivery status',
    'where is order', 'shipment', 'shipping status', 'fulfilment', 'fulfillment',
    'order eka status', 'order eka koheda', 'tracking eka', 'delivery eka',
    'order එක status', 'order එක කොහෙද', 'delivery status එක',
  ],
  customerLookup: [
    'customer', 'customers', 'customer account', 'customer profile', 'buyer',
    'customer login', 'cannot login', 'login issue', 'account blocked', 'inactive customer',
    'customer ta', 'customer eka', 'customer login wenna ba', 'login wenna ba',
    'customer එක', 'customer account එක', 'login වෙන්න බැහැ',
  ],
};

function normalizeAdminMessage(text) {
  let output = String(text || '').toLowerCase();
  [...SINGLISH_INTENT_SYNONYMS, ...TYPO_INTENT_SYNONYMS].forEach(([from, to]) => {
    output = output.replace(new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), `${from} ${to}`);
  });
  return output;
}

function tokenizeIntent(text) {
  return normalizeAdminMessage(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(word => word && !STOP_WORDS.has(word));
}

function textIncludesAny(text, words) {
  const value = normalizeAdminMessage(text);
  const valueTokens = tokenizeIntent(value);
  const normalizedValue = valueTokens.join(' ');
  return words.some(word => {
    const wordTokens = tokenizeIntent(word);
    const normalizedWord = wordTokens.join(' ');
    const allKeywordTokensPresent = wordTokens.length > 0 && wordTokens.every(token => valueTokens.includes(token));
    return value.includes(String(word).toLowerCase()) || allKeywordTokensPresent || (normalizedWord && normalizedValue.includes(normalizedWord));
  });
}

function matchKnowledge(message) {
  return ADMIN_KNOWLEDGE.find(item => textIncludesAny(message, item.keywords));
}

function classifyAssistantMessage(message, history = []) {
  const language = detectAssistantLanguage(message, history);
  const normalized = normalizeAdminMessage(message);

  const moduleChecks = [
    ['products', ['product', 'products', 'stock', 'sku', 'variant', 'image', 'category', 'brand', 'prodcut', 'thumbnail', 'draft', 'active', 'visibility']],
    ['orders', ['order', 'orders', 'oder', 'pending', 'paid', 'unpaid', 'payment', 'paymet', 'delivery', 'tracking', 'refund', 'cancel']],
    ['customers', ['customer', 'customers', 'buyer', 'user account', 'address']],
    ['billing', ['billing', 'plan', 'subscription', 'payment slip', 'renewal', 'upgrade', 'downgrade']],
    ['settings', ['settings', 'setting', 'whatsapp', 'gateway', 'domain', 'dns', 'ssl', 'store info']],
    ['marketing', ['seo', 'meta pixel', 'google analytics', 'banner', 'coupon', 'discount', 'social media', 'post']],
    ['backup', ['backup', 'restore']],
  ];

  const moduleMatch = moduleChecks.find(([, words]) => textIncludesAny(normalized, words));
  const urgency = textIncludesAny(normalized, ['urgent', 'asap', 'now', 'quick', 'ikmanata', 'danma', 'දැන්ම', 'හදිසි'])
    ? 'high'
    : textIncludesAny(normalized, ['issue', 'error', 'fail', 'failed', 'wada na', 'not working', 'ba', 'නැහැ'])
      ? 'medium'
      : 'normal';
  const sentiment = textIncludesAny(normalized, ['thanks', 'thank you', 'hari', 'ela', 'හරි', 'ස්තුතියි'])
    ? 'positive'
    : textIncludesAny(normalized, ['angry', 'bad', 'awul', 'අවුල්', 'වැඩ නෑ', 'wada na', 'fail', 'cannot', 'ba'])
      ? 'frustrated'
      : 'neutral';

  let intent = 'general_help';
  if (detectHighRiskAction(message)) intent = 'high_risk_action';
  else if (textIncludesAny(normalized, INTENT_PHRASES.productVisibility)) intent = 'troubleshoot_product_visibility';
  else if (textIncludesAny(normalized, INTENT_PHRASES.paymentPending)) intent = 'troubleshoot_payment_status';
  else if (textIncludesAny(normalized, INTENT_PHRASES.paymentCheckout)) intent = textIncludesAny(normalized, ['order', 'oder', 'ord-', 'paid', 'unpaid', 'pending', 'refund', 'transaction id', 'payment reference'])
    ? 'troubleshoot_payment_status'
    : 'troubleshoot_checkout_payment';
  else if (textIncludesAny(normalized, INTENT_PHRASES.themeWebsite)) intent = textIncludesAny(normalized, ['not working', 'wada na', 'weda na', 'not showing', 'save wenne na', 'published not', 'mobile issue', 'responsive', 'cache', 'නැහැ'])
    ? 'troubleshoot_theme'
    : 'theme_help';
  else if (textIncludesAny(normalized, INTENT_PHRASES.settingsHelp)) intent = textIncludesAny(normalized, ['not working', 'wada na', 'weda na', 'save wenne na', 'email yawenne na', 'ineffective', 'not showing', 'නැහැ'])
    ? 'troubleshoot_settings'
    : 'settings_help';
  else if (
    textIncludesAny(normalized, INTENT_PHRASES.navigationHelp)
    && !textIncludesAny(normalized, ['where is order', 'order eka koheda', 'order එක කොහෙද'])
  ) intent = 'navigation_help';
  else if (textIncludesAny(normalized, INTENT_PHRASES.orderStatus)) intent = 'read_order_status';
  else if (textIncludesAny(normalized, INTENT_PHRASES.customerLookup)) intent = textIncludesAny(normalized, ['login', 'log wenna', 'login wenna ba', 'cannot login', 'blocked', 'inactive', 'verify', 'verification'])
    ? 'troubleshoot_customer_login'
    : 'read_customer_status';
  else if (textIncludesAny(normalized, INTENT_PHRASES.lowStock)) intent = 'read_low_stock';
  else if (textIncludesAny(normalized, INTENT_PHRASES.inventoryStatus)) intent = textIncludesAny(normalized, ['why', 'ai', 'ayi', 'out of stock', 'stock zero', 'stock 0', 'ඇයි'])
    ? 'troubleshoot_inventory'
    : 'read_inventory_status';
  else if (textIncludesAny(normalized, INTENT_PHRASES.fastMoving)) intent = 'read_fast_moving_products';
  else if (textIncludesAny(normalized, INTENT_PHRASES.usage)) intent = 'read_plan_usage';
  else if (textIncludesAny(normalized, ['how many products', 'product count', 'products count', 'product kiyak', 'products kiyak', 'product ගණන', 'products කීයද'])) intent = 'read_product_count';
  else if (textIncludesAny(normalized, ['how', 'kohomada', 'kohomd', 'කොහොමද', 'setup', 'configure', 'hadanne'])) intent = 'how_to';
  else if (textIncludesAny(normalized, ['fix', 'meka fix', 'issue', 'error', 'wada na', 'not working'])) intent = 'troubleshoot';

  const liveDataRequired = [
    'troubleshoot_product_visibility',
    'troubleshoot_payment_status',
    'troubleshoot_checkout_payment',
    'navigation_help',
    'settings_help',
    'troubleshoot_settings',
    'theme_help',
    'troubleshoot_theme',
    'read_order_status',
    'troubleshoot_customer_login',
    'read_customer_status',
    'read_low_stock',
    'troubleshoot_inventory',
    'read_inventory_status',
    'read_fast_moving_products',
    'read_plan_usage',
    'read_product_count',
    'high_risk_action',
    'troubleshoot',
  ].includes(intent);

  return {
    languageCode: language.code,
    languageLabel: language.label,
    intent,
    module: moduleMatch?.[0] || 'general',
    urgency,
    sentiment,
    liveDataRequired,
    hasContextReference: /\b(this|that|same|previous|current|eka|meka|ara)\b/i.test(message) || /මේ|ඒ|අර/.test(message),
    recentMessages: Array.isArray(history) ? history.length : 0,
  };
}

function detectHighRiskAction(message) {
  return HIGH_RISK_ACTIONS.find(item => textIncludesAny(message, item.words));
}

function isFeatureEnabled(ctx, featureKey) {
  if (!featureKey) return true;
  return !!ctx.tenant.planFeatures?.[featureKey];
}

function featureName(featureKey) {
  return FEATURE_LABELS[featureKey] || featureKey;
}

function featureRoute(featureKey) {
  return FEATURE_ROUTES[featureKey] || '/admin/billing';
}

function hasAssistantPermission(ctx, permission) {
  if (!permission) return true;
  if (ctx.admin.role !== 'admin') return false;
  if (!ctx.admin.permissionsKnown) return true;
  return ctx.admin.permissions.includes(permission);
}

function buildPlanRestrictionAnswer(ctx, featureKey) {
  const label = featureName(featureKey);
  return {
    answer: [
      `${label} is not enabled on the current ${ctx.tenant.planName} plan for ${ctx.tenant.storeName}.`,
      '',
      'Current status:',
      `- Store: ${ctx.tenant.storeName}`,
      `- Plan: ${ctx.tenant.planName}`,
      `- Feature: ${label}`,
      '',
      'An authorized administrator can review plan access from:',
      'Admin Panel -> Billing',
      '',
      'I will not recommend using this feature until it is enabled for the current plan.',
    ].join('\n'),
    actions: [{ label: 'Open Billing', path: '/admin/billing' }],
  };
}

function buildPermissionDeniedAnswer(ctx, permission, normalRole = 'Administrator') {
  return {
    answer: [
      `Your current role is ${ctx.admin.role}, and this action requires ${permission}.`,
      '',
      `${normalRole} users normally perform this action in StoreKit.`,
      '',
      'Ask an authorized administrator to complete it, or update staff permissions if your StoreKit setup includes fine-grained permissions.',
    ].join('\n'),
    actions: [{ label: 'Open Dashboard', path: '/admin' }],
  };
}

function money(value, currency = 'LKR') {
  const n = Number(value || 0);
  return `${currency} ${n.toLocaleString('en-LK', { maximumFractionDigits: 0 })}`;
}

function createToolResult(name, status, data = null, error = null) {
  return {
    name,
    status,
    data,
    error: error ? { type: error.type || 'service_unavailable', message: error.message || String(error) } : null,
    checkedAt: new Date().toISOString(),
  };
}

const SECRET_CONFIG_KEYS = new Set([
  'secretKey',
  'merchantSecret',
  'clientSecret',
  'webhookSecret',
  'appSecret',
  'accessToken',
  'refreshToken',
  'token',
  'password',
]);

function compactPaymentGateway(gateway, tenantId) {
  const config = gateway.config || {};
  const configStatus = Object.fromEntries(Object.entries(config).map(([key, value]) => {
    const configured = value !== undefined && value !== null && String(value).trim() !== '';
    return [
      key,
      {
        configured,
        value: configured && !SECRET_CONFIG_KEYS.has(key) ? maskSecretValue(value) : undefined,
        sensitive: SECRET_CONFIG_KEYS.has(key),
      },
    ];
  }));

  return {
    gateway: gateway.gateway,
    displayName: gateway.displayName || gateway.gateway,
    isEnabled: !!gateway.isEnabled,
    mode: gateway.isLive ? 'Live' : 'Sandbox',
    supportedCurrencies: Array.isArray(gateway.supportedCurrencies) ? gateway.supportedCurrencies : [],
    scope: String(gateway.tenantId || '') === String(tenantId) ? 'current_store' : 'global_fallback',
    configStatus,
    updatedAt: gateway.updatedAt || null,
  };
}

function compactStoreSettings(settings = {}) {
  return {
    storeName: settings.storeName || '',
    storeEmailPresent: !!settings.storeEmail,
    storePhonePresent: !!settings.storePhone,
    storeAddressPresent: !!settings.storeAddress,
    currency: settings.currency || settings.currencyCode || 'LKR',
    currencySymbol: settings.currencySymbol || '',
    country: settings.country || '',
    timezone: settings.timezone || '',
    standardDelivery: Number(settings.standardDelivery || 0),
    freeDeliveryThreshold: Number(settings.freeDeliveryThreshold || 0),
    codEnabled: settings.codEnabled !== false,
    bankTransferEnabled: settings.bankTransferEnabled !== false,
    bankDetailsConfigured: !!(settings.bankName || settings.bankAccountName || settings.bankAccountNumber || settings.bankBranch),
    taxEnabled: !!settings.taxEnabled,
    taxRate: Number(settings.taxRate || 0),
    taxLabel: settings.taxLabel || '',
    announcementEnabled: !!settings.announcementEnabled,
    whatsappNumberPresent: !!settings.whatsappNumber,
    maintenanceMode: !!settings.maintenanceMode,
    allowGuestCheckout: settings.allowGuestCheckout !== false,
    enableWishlist: settings.enableWishlist !== false,
    enableReviews: settings.enableReviews !== false,
    enableGiftCards: settings.enableGiftCards !== false,
    enableReturns: settings.enableReturns !== false,
    giftCardCoversDelivery: settings.giftCardCoversDelivery === true,
    lowStockAlert: Number(settings.lowStockAlert || 0),
    orderNotificationEmailPresent: !!settings.orderNotificationEmail,
    metaTitlePresent: !!settings.metaTitle,
    metaDescriptionPresent: !!settings.metaDescription,
    googleAnalyticsPresent: !!settings.googleAnalytics,
    facebookPixelPresent: !!settings.facebookPixel,
    termsUrl: settings.termsUrl || '',
    privacyUrl: settings.privacyUrl || '',
    emailNotifications: Object.fromEntries(Object.entries(settings).filter(([key]) => key.startsWith('emailNotif_')).map(([key, value]) => [key, value === true || value === 'true' || value === 1])),
    panelNotifications: Object.fromEntries(Object.entries(settings).filter(([key]) => key.startsWith('panelNotif_')).map(([key, value]) => [key, value === true || value === 'true' || value === 1])),
  };
}

function compactThemeSettings(theme = {}) {
  return {
    theme: theme.theme || 'default',
    storeTemplate: theme.storeTemplate || theme.template || '',
    layoutTemplate: theme.layoutTemplate || '',
    primaryColorPresent: !!theme.primaryColor,
    primaryColor: theme.primaryColor || '',
    primaryDarkColor: theme.primaryDarkColor || '',
    primaryLightColor: theme.primaryLightColor || '',
    secondaryColorPresent: !!(theme.secondaryColor || theme.accentColor),
    secondaryColor: theme.secondaryColor || theme.accentColor || '',
    darkMode: !!theme.darkMode,
    fontStyle: theme.fontStyle || theme.fontFamily || '',
    logoUrlPresent: !!theme.logoUrl,
    faviconUrlPresent: !!theme.faviconUrl,
    logoSize: Number(theme.logoSize || 0),
    customCSSPresent: !!theme.customCSS,
  };
}

function compactLayoutBuilder(layoutBuilder = {}) {
  const pages = ['homepage', 'product_page', 'category_page', 'checkout', 'header', 'footer'];
  return Object.fromEntries(pages.map(page => {
    const sections = Array.isArray(layoutBuilder?.[page]) ? layoutBuilder[page] : [];
    return [page, {
      configured: sections.length > 0,
      totalSections: sections.length,
      enabledSections: sections.filter(section => section.enabled !== false).length,
      disabledSections: sections.filter(section => section.enabled === false).length,
      sectionIds: sections
        .slice()
        .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
        .map(section => section.id)
        .slice(0, 12),
    }];
  }));
}

function compactBannerForWebsite(banner) {
  return {
    title: banner.title || '',
    position: banner.position || 'hero',
    isActive: banner.isActive !== false,
    imagePresent: !!banner.image,
    showOnMobile: banner.showOnMobile !== false,
    showOnDesktop: banner.showOnDesktop !== false,
    startDate: banner.startDate || null,
    endDate: banner.endDate || null,
  };
}

function maskSecretValue(value = '') {
  const text = String(value || '');
  if (!text) return '';
  if (text.length <= 8) return '****';
  return `${text.slice(0, 3)}****${text.slice(-4)}`;
}

async function runAssistantTool(name, fn) {
  try {
    return createToolResult(name, 'ok', await fn());
  } catch (err) {
    console.warn(`[AI assistant tool:${name}]`, err.message);
    return createToolResult(name, 'error', null, err);
  }
}

function createAssistantTools({ tenantId, tenant, user, pageContext }) {
  const tenantMatch = { tenantId };
  const currency = tenant.settings?.currencyCode || tenant.settings?.currency || tenant.billing?.currency || tenant.plan?.currency || 'LKR';

  return {
    getStoreSummary: () => runAssistantTool('getStoreSummary', async () => {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const [productCount, activeProducts, orderCount, ordersThisMonth, pendingOrders, paidOrders, adminCount, revenueAgg] = await Promise.all([
        Product.countDocuments(tenantMatch),
        Product.countDocuments({ ...tenantMatch, isActive: true }),
        Order.countDocuments(tenantMatch),
        Order.countDocuments({ ...tenantMatch, createdAt: { $gte: monthStart } }),
        Order.countDocuments({ ...tenantMatch, orderStatus: 'pending' }),
        Order.countDocuments({ ...tenantMatch, paymentStatus: 'paid' }),
        User.countDocuments({ tenantId, role: 'admin', isActive: true }),
        Order.aggregate([
          { $match: { tenantId, paymentStatus: 'paid' } },
          { $group: { _id: null, totalRevenue: { $sum: '$total' }, thisMonthRevenue: { $sum: { $cond: [{ $gte: ['$createdAt', monthStart] }, '$total', 0] } } } },
        ]),
      ]);

      return {
        tenant: {
          id: String(tenant._id),
          storeName: tenant.storeName,
          status: tenant.status,
          planName: tenant.plan?.name || 'No plan',
          planLimits: tenant.plan?.limits || {},
          planFeatures: tenant.plan?.features || {},
          billing: tenant.billing || {},
          currency,
        },
        admin: compactAdmin(user),
        page: pageContext,
        counts: {
          productCount,
          activeProducts,
          orderCount,
          ordersThisMonth,
          pendingOrders,
          paidOrders,
          adminCount,
          totalRevenue: revenueAgg[0]?.totalRevenue || 0,
          thisMonthRevenue: revenueAgg[0]?.thisMonthRevenue || 0,
        },
      };
    }),

    getProducts: (options = {}) => runAssistantTool('getProducts', async () => {
      const limit = Math.min(Number(options.limit || 20), 50);
      return Product.find(tenantMatch)
        .sort(options.sort || { updatedAt: -1 })
        .limit(limit)
        .select('name sku stock lowStockThreshold soldCount price salePrice isActive isFeatured category thumbnail updatedAt')
        .lean();
    }),

    searchProducts: (query, options = {}) => runAssistantTool('searchProducts', async () => {
      const limit = Math.min(Number(options.limit || 10), 25);
      const q = String(query || '').trim();
      if (!q) return [];
      return Product.find({
        ...tenantMatch,
        $or: [
          { name: { $regex: q, $options: 'i' } },
          { sku: { $regex: q, $options: 'i' } },
          { slug: { $regex: q, $options: 'i' } },
          { brand: { $regex: q, $options: 'i' } },
        ],
      })
        .limit(limit)
        .select('name slug sku stock lowStockThreshold soldCount price salePrice isActive isFeatured category thumbnail images variants variantCombinations description shortDescription brand tags updatedAt')
        .lean();
    }),

    getProductById: (id) => runAssistantTool('getProductById', async () => {
      if (!id) {
        const err = new Error('Product ID is required');
        err.type = 'validation_failed';
        throw err;
      }
      const product = await Product.findOne({ ...tenantMatch, _id: id }).lean();
      if (!product) {
        const err = new Error('Product not found in the authenticated store');
        err.type = 'record_not_found';
        throw err;
      }
      return product;
    }),

    getInventory: () => runAssistantTool('getInventory', async () => {
      const lowStockProducts = await Product.find({
        ...tenantMatch,
        isActive: true,
        $expr: { $lte: ['$stock', '$lowStockThreshold'] },
      }).sort({ stock: 1 }).limit(10).select('name sku stock lowStockThreshold soldCount price salePrice isActive').lean();
      return { lowStockProducts: lowStockProducts.map(compactProduct), lowStockCount: lowStockProducts.length };
    }),

    getOrders: (options = {}) => runAssistantTool('getOrders', async () => {
      const limit = Math.min(Number(options.limit || 20), 50);
      return Order.find(tenantMatch)
        .sort({ createdAt: -1 })
        .limit(limit)
        .select('orderNumber paymentMethod paymentStatus orderStatus total createdAt updatedAt trackingNumber deliveryPartner')
        .lean();
    }),

    searchOrders: (query, options = {}) => runAssistantTool('searchOrders', async () => {
      const limit = Math.min(Number(options.limit || 10), 25);
      const q = String(query || '').trim();
      if (!q) return [];
      const or = [
        { orderNumber: { $regex: q, $options: 'i' } },
        { 'guestInfo.email': { $regex: q, $options: 'i' } },
        { 'guestInfo.phone': { $regex: q, $options: 'i' } },
        { 'guestInfo.firstName': { $regex: q, $options: 'i' } },
        { 'guestInfo.lastName': { $regex: q, $options: 'i' } },
        { 'billing.email': { $regex: q, $options: 'i' } },
        { 'billing.phone': { $regex: q, $options: 'i' } },
        { 'billing.firstName': { $regex: q, $options: 'i' } },
        { 'billing.lastName': { $regex: q, $options: 'i' } },
      ];
      if (/^[a-f0-9]{24}$/i.test(q)) or.push({ _id: q });
      if (/^\d{4}-\d{2}-\d{2}$/.test(q)) {
        const start = new Date(`${q}T00:00:00.000Z`);
        const end = new Date(`${q}T23:59:59.999Z`);
        or.push({ createdAt: { $gte: start, $lte: end } });
      }
      return Order.find({ ...tenantMatch, $or: or })
        .sort({ createdAt: -1 })
        .limit(limit)
        .select('orderNumber guestInfo billing paymentMethod paymentStatus orderStatus total subtotal shippingCost tax couponDiscount giftCardDiscount paymentReference payhereOrderId trackingNumber deliveryPartner estimatedDelivery deliveredAt paymentSlip paymentSlipUploadedAt statusHistory items createdAt updatedAt')
        .lean();
    }),

    getOrderById: (idOrNumber) => runAssistantTool('getOrderById', async () => {
      const value = String(idOrNumber || '').trim();
      if (!value) {
        const err = new Error('Order ID or order number is required');
        err.type = 'validation_failed';
        throw err;
      }
      const lookup = [{ orderNumber: value }];
      if (/^[a-f0-9]{24}$/i.test(value)) lookup.push({ _id: value });
      const order = await Order.findOne({ ...tenantMatch, $or: lookup }).lean();
      if (!order) {
        const err = new Error('Order not found in the authenticated store');
        err.type = 'record_not_found';
        throw err;
      }
      return order;
    }),

    getCustomers: (options = {}) => runAssistantTool('getCustomers', async () => {
      const limit = Math.min(Number(options.limit || 20), 50);
      return User.find({ tenantId, role: 'customer' }).sort({ createdAt: -1 }).limit(limit).select('firstName lastName email phone isActive createdAt lastLogin').lean();
    }),

    searchCustomers: (query, options = {}) => runAssistantTool('searchCustomers', async () => {
      const limit = Math.min(Number(options.limit || 10), 25);
      const q = String(query || '').trim();
      if (!q) return [];
      const or = [
        { firstName: { $regex: q, $options: 'i' } },
        { lastName: { $regex: q, $options: 'i' } },
        { username: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } },
        { phone: { $regex: q, $options: 'i' } },
      ];
      if (/^[a-f0-9]{24}$/i.test(q)) or.push({ _id: q });
      return User.find({ tenantId, role: 'customer', $or: or })
        .sort({ createdAt: -1 })
        .limit(limit)
        .select('firstName lastName username email phone role tenantId isActive isVerified googleId addresses wishlist avatar createdAt lastLogin')
        .lean();
    }),

    getCustomerById: (id) => runAssistantTool('getCustomerById', async () => {
      if (!id) {
        const err = new Error('Customer ID is required');
        err.type = 'validation_failed';
        throw err;
      }
      const customer = await User.findOne({ tenantId, role: 'customer', _id: id })
        .select('firstName lastName username email phone role tenantId isActive isVerified googleId addresses wishlist avatar createdAt lastLogin')
        .lean();
      if (!customer) {
        const err = new Error('Customer not found in the authenticated store');
        err.type = 'record_not_found';
        throw err;
      }
      return customer;
    }),

    getCustomerOrders: (customer) => runAssistantTool('getCustomerOrders', async () => {
      const customerId = customer?._id;
      const email = customer?.email;
      const phone = customer?.phone;
      const or = [];
      if (customerId) or.push({ customer: customerId });
      if (email) {
        or.push({ 'guestInfo.email': email });
        or.push({ 'billing.email': email });
      }
      if (phone) {
        or.push({ 'guestInfo.phone': phone });
        or.push({ 'billing.phone': phone });
      }
      if (!or.length) return [];
      return Order.find({ ...tenantMatch, $or: or })
        .sort({ createdAt: -1 })
        .limit(10)
        .select('orderNumber paymentStatus orderStatus total createdAt updatedAt')
        .lean();
    }),

    getStoreSettings: () => runAssistantTool('getStoreSettings', async () => ({
      settings: compactStoreSettings(tenant.settings || {}),
      theme: compactThemeSettings(tenant.theme || {}),
      planFeatures: tenant.plan?.features || {},
      planLimits: tenant.plan?.limits || {},
    })),
    getTenantDomains: () => runAssistantTool('getTenantDomains', async () => ({ domains: tenant.domains || [] })),
    getPaymentGateways: () => runAssistantTool('getPaymentGateways', async () => {
      const tenantGateways = await PaymentGateway.find({ tenantId }).sort({ gateway: 1 }).lean();
      const gateways = tenantGateways.length
        ? tenantGateways
        : await PaymentGateway.find({ $or: [{ tenantId: null }, { tenantId: { $exists: false } }] }).sort({ gateway: 1 }).lean();
      return {
        gatewayScope: tenantGateways.length ? 'current_store' : 'global_fallback',
        gateways: gateways.map(gateway => compactPaymentGateway(gateway, tenantId)),
      };
    }),
    getReturnRequestsForOrder: (orderId) => runAssistantTool('getReturnRequestsForOrder', async () => {
      if (!orderId) return [];
      return ReturnRequest.find({ tenantId, order: orderId })
        .sort({ updatedAt: -1 })
        .limit(10)
        .select('status refundAmount courierCharge netRefundAmount refundMethod orderStatusUpdated stockProcessed createdAt updatedAt')
        .lean();
    }),
    getDeliveryServices: () => runAssistantTool('getDeliveryServices', async () => {
      const services = await DeliveryService.find({ tenantId }).sort({ sortOrder: 1, createdAt: -1 }).limit(20).lean();
      return {
        count: services.length,
        enabledCount: services.filter(service => !!service.isEnabled).length,
        services: services.map(service => ({
          name: service.name,
          code: service.code,
          isEnabled: !!service.isEnabled,
          codAllowed: service.codAllowed !== false,
          ratesCount: Array.isArray(service.rates) ? service.rates.length : 0,
          zoneRatesCount: Array.isArray(service.zoneRates) ? service.zoneRates.length : 0,
          shippingRulesCount: Array.isArray(service.shippingRules) ? service.shippingRules.length : 0,
          estimatedDays: service.estimatedDays || '',
          trackingUrlPresent: !!service.trackingUrl,
          apiKeyConfigured: !!service.apiKey,
          apiSecretConfigured: !!service.apiSecret,
        })),
      };
    }),
    getBusinessPages: () => runAssistantTool('getBusinessPages', async () => {
      const pages = await BusinessPage.find({ tenantId }).sort({ sortOrder: 1, updatedAt: -1 }).limit(30).select('slug title isActive showInFooter showInNav updatedAt').lean();
      return {
        count: pages.length,
        activeCount: pages.filter(page => page.isActive !== false).length,
        pages: pages.map(page => ({
          slug: page.slug,
          title: page.title,
          isActive: page.isActive !== false,
          showInFooter: !!page.showInFooter,
          showInNav: !!page.showInNav,
          updatedAt: page.updatedAt || null,
        })),
      };
    }),
    getWebsiteTheme: () => runAssistantTool('getWebsiteTheme', async () => {
      const [banners, pages] = await Promise.all([
        Banner.find({ tenantId }).sort({ sortOrder: 1, createdAt: -1 }).limit(30).lean(),
        BusinessPage.find({ tenantId }).sort({ sortOrder: 1, updatedAt: -1 }).limit(30).select('slug title isActive showInFooter showInNav updatedAt').lean(),
      ]);
      const activeBanners = banners.filter(banner => banner.isActive !== false);
      return {
        activeTheme: compactThemeSettings(tenant.theme || {}),
        layoutBuilder: compactLayoutBuilder(tenant.settings?.layout_builder || {}),
        bannerSummary: {
          count: banners.length,
          activeCount: activeBanners.length,
          byPosition: activeBanners.reduce((acc, banner) => {
            const key = banner.position || 'hero';
            acc[key] = (acc[key] || 0) + 1;
            return acc;
          }, {}),
          banners: banners.slice(0, 10).map(compactBannerForWebsite),
        },
        pageSummary: {
          count: pages.length,
          activeCount: pages.filter(page => page.isActive !== false).length,
          pages: pages.slice(0, 10).map(page => ({
            slug: page.slug,
            title: page.title,
            isActive: page.isActive !== false,
            showInFooter: !!page.showInFooter,
            showInNav: !!page.showInNav,
          })),
        },
        featureFlags: {
          themeBuilder: !!tenant.plan?.features?.themeBuilder,
          layoutEditor: !!tenant.plan?.features?.layoutEditor,
          banners: !!tenant.plan?.features?.banners,
          seo: !!tenant.plan?.features?.seo,
        },
      };
    }),
    getAnalytics: () => runAssistantTool('getAnalytics', async () => ({ message: 'Analytics are summarized through getStoreSummary for the assistant.' })),
    getRecentErrors: () => runAssistantTool('getRecentErrors', async () => ({ message: 'Recent error log inspection is not exposed through assistant tools yet.' })),
    getAdminRoutes: () => runAssistantTool('getAdminRoutes', async () => ({
      tenantAdmin: ADMIN_NAVIGATION_ITEMS.map(item => ({ label: item.label, path: item.path, feature: item.feature || null })),
      superAdmin: SUPER_ADMIN_NAVIGATION_ITEMS.map(item => ({ label: item.label, path: item.path })),
    })),
  };
}

function compactProduct(p) {
  return {
    name: p.name,
    slug: p.slug || '',
    sku: p.sku || '',
    stock: Number(p.stock || 0),
    lowStockThreshold: Number(p.lowStockThreshold || 0),
    soldCount: Number(p.soldCount || 0),
    price: Number(p.salePrice || p.price || 0),
    isActive: !!p.isActive,
  };
}

function compactProductDetail(p) {
  const variantOptions = Array.isArray(p.variants) ? p.variants : [];
  const variantCombinations = Array.isArray(p.variantCombinations) ? p.variantCombinations : [];
  return {
    id: String(p._id || ''),
    name: p.name,
    slug: p.slug || '',
    sku: p.sku || '',
    brand: p.brand || '',
    isActive: !!p.isActive,
    isFeatured: !!p.isFeatured,
    stock: Number(p.stock || 0),
    lowStockThreshold: Number(p.lowStockThreshold || 0),
    price: Number(p.price || 0),
    salePrice: p.salePrice === undefined || p.salePrice === null ? null : Number(p.salePrice || 0),
    categoryPresent: !!p.category,
    thumbnailPresent: !!p.thumbnail,
    imageCount: [p.thumbnail, ...(Array.isArray(p.images) ? p.images : [])].filter(Boolean).length,
    descriptionPresent: !!String(p.description || '').trim(),
    shortDescriptionPresent: !!String(p.shortDescription || '').trim(),
    variantOptionCount: variantOptions.length,
    variantCombinationCount: variantCombinations.length,
    availableVariantCombinationCount: variantCombinations.filter(v => Number(v.stock || 0) > 0).length,
    tagsCount: Array.isArray(p.tags) ? p.tags.length : 0,
    updatedAt: p.updatedAt,
  };
}

function extractProductLookupTerms(message, ctx) {
  const text = String(message || '');
  const terms = [];
  const add = (value) => {
    const cleaned = String(value || '').trim().replace(/^[:#-]+|[:#-]+$/g, '').trim();
    if (cleaned.length >= 3 && !terms.some(t => t.toLowerCase() === cleaned.toLowerCase())) terms.push(cleaned);
  };

  Array.from(text.matchAll(/`([^`]{2,100})`/g)).forEach(match => add(match[1]));
  Array.from(text.matchAll(/["']([^"']{2,100})["']/g)).forEach(match => add(match[1]));
  Array.from(text.matchAll(/\bSKU\s*[:#-]?\s*([A-Z0-9._-]{3,})\b/gi)).forEach(match => add(match[1]));
  Array.from(text.matchAll(/\b([a-f0-9]{24})\b/gi)).forEach(match => add(match[1]));
  Array.from(text.matchAll(/\b([a-z0-9]+(?:-[a-z0-9]+){1,})\b/gi)).forEach(match => add(match[1]));
  (ctx?.page?.conversation?.productRefs || []).forEach(add);

  let candidate = normalizeAdminMessage(text)
    .replace(/\b(my|mage|obage|this|that|same|previous|current|eka|meka|ara|product|prodcut|store|storefront|shop|admin|panel|why|is|not|showing|visible|missing|penne|pene|pennanne|display|wenne|na|naha|ai|ayi|issue|fix|please|pls|mata|mge|stock|inventory|level|status|out|available|reserved|committed|incoming|keeyada|kochchara|එක|මේක|අර|නැහැ|පෙන්නන්නේ|ඇයි|තොගය|store එකේ|product එක)\b/gi, ' ')
    .replace(/[^\p{L}\p{N}\s._-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (candidate.length >= 4 && candidate.split(/\s+/).length <= 8) add(candidate);

  return terms.slice(0, 5);
}

async function resolveProductForAssistant(ctx, message) {
  const terms = extractProductLookupTerms(message, ctx);
  if (!terms.length) {
    return { status: 'needs_identifier', terms, product: null, toolResults: [] };
  }

  const toolResults = [];
  for (const term of terms) {
    const bySearch = await ctx.tools.searchProducts(term, { limit: 5 });
    toolResults.push({
      name: bySearch.name,
      status: bySearch.status,
      errorType: bySearch.error?.type || null,
      checkedAt: bySearch.checkedAt,
      query: term,
      resultCount: Array.isArray(bySearch.data) ? bySearch.data.length : 0,
    });
    if (bySearch.status === 'ok' && Array.isArray(bySearch.data) && bySearch.data.length === 1) {
      return { status: 'found', terms, product: bySearch.data[0], toolResults };
    }
    if (bySearch.status === 'ok' && Array.isArray(bySearch.data) && bySearch.data.length > 1) {
      const exact = bySearch.data.find(p =>
        [p.name, p.sku, p.slug].filter(Boolean).some(value => String(value).toLowerCase() === term.toLowerCase())
      );
      if (exact) return { status: 'found', terms, product: exact, toolResults };
      return { status: 'ambiguous', terms, matches: bySearch.data.map(compactProduct).slice(0, 5), toolResults };
    }
  }

  return { status: 'not_found', terms, product: null, toolResults };
}

function compactOrder(order) {
  return {
    id: String(order._id || ''),
    orderNumber: order.orderNumber || '',
    paymentStatus: order.paymentStatus || 'pending',
    orderStatus: order.orderStatus || 'pending',
    paymentMethod: order.paymentMethod || '',
    total: Number(order.total || 0),
    createdAt: order.createdAt,
    customerName: [order.guestInfo?.firstName || order.billing?.firstName, order.guestInfo?.lastName || order.billing?.lastName].filter(Boolean).join(' ').trim(),
  };
}

function compactOrderDetail(order) {
  const items = Array.isArray(order.items) ? order.items : [];
  const statusHistory = Array.isArray(order.statusHistory) ? order.statusHistory : [];
  return {
    id: String(order._id || ''),
    orderNumber: order.orderNumber || '',
    orderStatus: order.orderStatus || 'pending',
    paymentStatus: order.paymentStatus || 'pending',
    paymentMethod: order.paymentMethod || '',
    subtotal: Number(order.subtotal || 0),
    shippingCost: Number(order.shippingCost || 0),
    tax: Number(order.tax || 0),
    couponDiscount: Number(order.couponDiscount || 0),
    giftCardDiscount: Number(order.giftCardDiscount || 0),
    total: Number(order.total || 0),
    itemCount: items.length,
    totalQuantity: items.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    trackingNumber: order.trackingNumber || '',
    deliveryPartner: order.deliveryPartner || '',
    estimatedDelivery: order.estimatedDelivery || null,
    deliveredAt: order.deliveredAt || null,
    paymentSlipPresent: !!order.paymentSlip,
    paymentSlipUploadedAt: order.paymentSlipUploadedAt || null,
    paymentReferencePresent: !!order.paymentReference,
    paymentReferenceMasked: order.paymentReference ? maskSecretValue(order.paymentReference) : '',
    payhereOrderIdPresent: !!order.payhereOrderId,
    statusHistoryCount: statusHistory.length,
    latestStatusNote: statusHistory.length ? statusHistory[statusHistory.length - 1]?.note || '' : '',
    paymentHistoryNotes: statusHistory
      .filter(row => /payment|payhere|stripe|paypal|webhook|paid|refund/i.test(`${row?.status || ''} ${row?.note || ''} ${row?.updatedBy || ''}`))
      .slice(-5)
      .map(row => ({
        status: row.status || '',
        note: String(row.note || '').slice(0, 160),
        updatedBy: row.updatedBy || '',
        updatedAt: row.updatedAt || null,
      })),
    customerName: [order.guestInfo?.firstName || order.billing?.firstName, order.guestInfo?.lastName || order.billing?.lastName].filter(Boolean).join(' ').trim(),
    customerEmailPresent: !!(order.guestInfo?.email || order.billing?.email),
    customerPhonePresent: !!(order.guestInfo?.phone || order.billing?.phone),
    billingPresent: !!(order.billing?.firstName || order.billing?.street || order.billing?.email || order.billing?.phone),
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

function maskEmail(email = '') {
  const value = String(email || '');
  const [name, domain] = value.split('@');
  if (!name || !domain) return value ? 'available' : 'not available';
  return `${name.slice(0, 2)}***@${domain}`;
}

function maskPhone(phone = '') {
  const value = String(phone || '').replace(/\s+/g, '');
  if (!value) return 'not available';
  return `${value.slice(0, 3)}****${value.slice(-2)}`;
}

function compactCustomer(customer) {
  return {
    id: String(customer._id || ''),
    name: [customer.firstName, customer.lastName].filter(Boolean).join(' ').trim() || customer.username || 'Customer',
    email: maskEmail(customer.email),
    phone: maskPhone(customer.phone),
    isActive: customer.isActive !== false,
    isVerified: !!customer.isVerified,
    createdAt: customer.createdAt,
    lastLogin: customer.lastLogin || null,
  };
}

function compactCustomerDetail(customer, orders = []) {
  const addresses = Array.isArray(customer.addresses) ? customer.addresses : [];
  const wishlist = Array.isArray(customer.wishlist) ? customer.wishlist : [];
  return {
    ...compactCustomer(customer),
    username: customer.username || '',
    googleLinked: !!customer.googleId,
    addressCount: addresses.length,
    defaultAddressPresent: addresses.some(addr => !!addr.isDefault),
    wishlistCount: wishlist.length,
    recentOrderCount: orders.length,
    totalSpent: orders.reduce((sum, order) => sum + Number(order.total || 0), 0),
    latestOrder: orders[0] ? compactOrder(orders[0]) : null,
  };
}

function extractOrderLookupTerms(message, ctx) {
  const text = String(message || '');
  const terms = [];
  const add = (value) => {
    const cleaned = String(value || '').trim().replace(/^[:#-]+|[:#-]+$/g, '').trim();
    if (cleaned.length >= 3 && !terms.some(t => t.toLowerCase() === cleaned.toLowerCase())) terms.push(cleaned);
  };

  Array.from(text.matchAll(/`([^`]{2,100})`/g)).forEach(match => add(match[1]));
  Array.from(text.matchAll(/["']([^"']{2,100})["']/g)).forEach(match => add(match[1]));
  Array.from(text.matchAll(/\b(ORD-[A-Z0-9-]{4,})\b/gi)).forEach(match => add(match[1]));
  Array.from(text.matchAll(/\border\s*#?\s*([A-Z0-9-]{4,})\b/gi)).forEach(match => add(match[1]));
  Array.from(text.matchAll(/\b([a-f0-9]{24})\b/gi)).forEach(match => add(match[1]));
  Array.from(text.matchAll(/\b[\w.%+-]+@[\w.-]+\.[A-Z]{2,}\b/gi)).forEach(match => add(match[0]));
  Array.from(text.matchAll(/\b(?:\+?94|0)?7\d[\d\s-]{7,}\b/g)).forEach(match => add(match[0].replace(/\s+/g, '')));
  Array.from(text.matchAll(/\b(\d{4}-\d{2}-\d{2})\b/g)).forEach(match => add(match[1]));
  (ctx?.page?.conversation?.orderRefs || []).forEach(add);

  return terms.slice(0, 5);
}

async function resolveOrderForAssistant(ctx, message) {
  const terms = extractOrderLookupTerms(message, ctx);
  if (!terms.length) {
    return { status: 'needs_identifier', terms, order: null, toolResults: [] };
  }

  const toolResults = [];
  for (const term of terms) {
    const bySearch = await ctx.tools.searchOrders(term, { limit: 5 });
    toolResults.push({
      name: bySearch.name,
      status: bySearch.status,
      errorType: bySearch.error?.type || null,
      checkedAt: bySearch.checkedAt,
      query: term,
      resultCount: Array.isArray(bySearch.data) ? bySearch.data.length : 0,
    });
    if (bySearch.status === 'ok' && Array.isArray(bySearch.data) && bySearch.data.length === 1) {
      return { status: 'found', terms, order: bySearch.data[0], toolResults };
    }
    if (bySearch.status === 'ok' && Array.isArray(bySearch.data) && bySearch.data.length > 1) {
      const exact = bySearch.data.find(order =>
        [order.orderNumber, String(order._id || '')].filter(Boolean).some(value => String(value).toLowerCase() === term.toLowerCase())
      );
      if (exact) return { status: 'found', terms, order: exact, toolResults };
      return { status: 'ambiguous', terms, matches: bySearch.data.map(compactOrder).slice(0, 5), toolResults };
    }
  }

  return { status: 'not_found', terms, order: null, toolResults };
}

function extractCustomerLookupTerms(message, ctx) {
  const text = String(message || '');
  const terms = [];
  const add = (value) => {
    const cleaned = String(value || '').trim().replace(/^[:#-]+|[:#-]+$/g, '').trim();
    if (cleaned.length >= 3 && !terms.some(t => t.toLowerCase() === cleaned.toLowerCase())) terms.push(cleaned);
  };

  Array.from(text.matchAll(/`([^`]{2,100})`/g)).forEach(match => add(match[1]));
  Array.from(text.matchAll(/["']([^"']{2,100})["']/g)).forEach(match => add(match[1]));
  Array.from(text.matchAll(/\b([a-f0-9]{24})\b/gi)).forEach(match => add(match[1]));
  Array.from(text.matchAll(/\b[\w.%+-]+@[\w.-]+\.[A-Z]{2,}\b/gi)).forEach(match => add(match[0]));
  Array.from(text.matchAll(/\b(?:\+?94|0)?7\d[\d\s-]{7,}\b/g)).forEach(match => add(match[0].replace(/\s+/g, '')));
  Array.from(text.matchAll(/\b(?:customer|buyer|user)\s+([A-Z][A-Z\s.'-]{2,60})\b/gi)).forEach(match => add(match[1]));
  (ctx?.page?.conversation?.customerRefs || []).forEach(add);
  return terms.slice(0, 5);
}

async function resolveCustomerForAssistant(ctx, message) {
  const terms = extractCustomerLookupTerms(message, ctx);
  const orderLookup = await resolveOrderForAssistant(ctx, message);
  const toolResults = [...(orderLookup.toolResults || [])];
  if (orderLookup.status === 'found') {
    const order = orderLookup.order;
    if (order.customer) terms.unshift(String(order.customer));
    if (order.guestInfo?.email || order.billing?.email) terms.push(order.guestInfo?.email || order.billing?.email);
    if (order.guestInfo?.phone || order.billing?.phone) terms.push(order.guestInfo?.phone || order.billing?.phone);
  }

  const uniqueTerms = terms.filter((term, index) => terms.findIndex(t => String(t).toLowerCase() === String(term).toLowerCase()) === index);
  if (!uniqueTerms.length) {
    return { status: 'needs_identifier', terms: uniqueTerms, customer: null, orders: [], toolResults };
  }

  for (const term of uniqueTerms) {
    const bySearch = await ctx.tools.searchCustomers(term, { limit: 5 });
    toolResults.push({
      name: bySearch.name,
      status: bySearch.status,
      errorType: bySearch.error?.type || null,
      checkedAt: bySearch.checkedAt,
      query: term,
      resultCount: Array.isArray(bySearch.data) ? bySearch.data.length : 0,
    });
    if (bySearch.status === 'ok' && Array.isArray(bySearch.data) && bySearch.data.length === 1) {
      const customer = bySearch.data[0];
      const ordersResult = await ctx.tools.getCustomerOrders(customer);
      toolResults.push({
        name: ordersResult.name,
        status: ordersResult.status,
        errorType: ordersResult.error?.type || null,
        checkedAt: ordersResult.checkedAt,
        resultCount: Array.isArray(ordersResult.data) ? ordersResult.data.length : 0,
      });
      return { status: 'found', terms: uniqueTerms, customer, orders: ordersResult.status === 'ok' ? ordersResult.data : [], toolResults };
    }
    if (bySearch.status === 'ok' && Array.isArray(bySearch.data) && bySearch.data.length > 1) {
      const exact = bySearch.data.find(customer =>
        [customer.email, customer.phone, customer.username, String(customer._id || '')].filter(Boolean).some(value => String(value).toLowerCase() === String(term).toLowerCase())
      );
      if (exact) {
        const ordersResult = await ctx.tools.getCustomerOrders(exact);
        toolResults.push({
          name: ordersResult.name,
          status: ordersResult.status,
          errorType: ordersResult.error?.type || null,
          checkedAt: ordersResult.checkedAt,
          resultCount: Array.isArray(ordersResult.data) ? ordersResult.data.length : 0,
        });
        return { status: 'found', terms: uniqueTerms, customer: exact, orders: ordersResult.status === 'ok' ? ordersResult.data : [], toolResults };
      }
      return { status: 'ambiguous', terms: uniqueTerms, matches: bySearch.data.map(compactCustomer).slice(0, 5), toolResults };
    }
  }

  if (orderLookup.status === 'found') {
    return { status: 'guest_only', terms: uniqueTerms, order: orderLookup.order, customer: null, orders: [orderLookup.order], toolResults };
  }
  return { status: 'not_found', terms: uniqueTerms, customer: null, orders: [], toolResults };
}

function compactAdmin(user) {
  const rawPermissions = Array.isArray(user?.permissions) ? user.permissions : [];
  return {
    id: user?._id ? String(user._id) : '',
    name: [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() || user?.username || 'Admin',
    role: user?.role || 'admin',
    permissions: rawPermissions.map(p => String(p)).filter(Boolean),
    permissionsKnown: Array.isArray(user?.permissions),
    isActive: user?.isActive !== false,
  };
}

function compactPageContext(body = {}) {
  const history = Array.isArray(body.history) ? body.history : [];
  return {
    currentRoute: String(body.currentRoute || '').slice(0, 160),
    currentPage: String(body.currentPage || '').slice(0, 120),
    conversation: compactConversationContext(history),
  };
}

function compactConversationContext(history = []) {
  const safeMessages = (Array.isArray(history) ? history : [])
    .slice(-8)
    .map(item => ({
      role: item?.role === 'assistant' ? 'assistant' : 'user',
      content: String(item?.content || '').replace(/\s+/g, ' ').slice(0, 220),
    }))
    .filter(item => item.content);

  const joined = safeMessages.map(item => item.content).join(' ');
  const productRefs = Array.from(joined.matchAll(/`([^`]{2,80})`/g)).map(match => match[1]).slice(-3);
  const orderRefs = Array.from(joined.matchAll(/\b(?:order\s*#?|#)([A-Z0-9-]{4,})\b/gi)).map(match => match[1]).slice(-3);
  const customerRefs = Array.from(joined.matchAll(/\b[\w.%+-]+@[\w.-]+\.[A-Z]{2,}\b/gi)).map(match => match[0]).slice(-3);

  return {
    messageCount: safeMessages.length,
    recentSummary: safeMessages.map(item => `${item.role}: ${item.content}`).join(' | ').slice(0, 900),
    productRefs,
    orderRefs,
    customerRefs,
  };
}

function buildAssistantContextSummary(ctx) {
  return [
    `Store name: ${ctx.tenant.storeName}`,
    `Tenant status: ${ctx.tenant.status}`,
    `Admin: ${ctx.admin.name}`,
    `Admin role: ${ctx.admin.role}`,
    `Admin permissions: ${ctx.admin.permissionsKnown ? (ctx.admin.permissions.join(', ') || 'none') : 'role-based admin access; fine-grained permissions not configured'}`,
    `Subscription plan: ${ctx.tenant.planName}`,
    `Enabled feature flags: ${Object.entries(ctx.tenant.planFeatures || {}).filter(([, enabled]) => !!enabled).map(([key]) => key).join(', ') || 'none'}`,
    `Current route: ${ctx.page.currentRoute || 'not provided'}`,
    `Conversation messages available: ${ctx.page.conversation?.messageCount || 0}`,
    `Detected module: ${ctx.messageAnalysis?.module || 'general'}`,
    `Detected intent: ${ctx.messageAnalysis?.intent || 'general_help'}`,
    `Detected urgency: ${ctx.messageAnalysis?.urgency || 'normal'}`,
    `Detected sentiment: ${ctx.messageAnalysis?.sentiment || 'neutral'}`,
    `Product count: ${ctx.counts.productCount}`,
    `Active products: ${ctx.counts.activeProducts}`,
    `Orders this month: ${ctx.counts.ordersThisMonth}`,
    `Pending orders: ${ctx.counts.pendingOrders}`,
    `Low-stock products loaded: ${ctx.counts.lowStockCount}`,
  ].join('\n');
}

async function loadAssistantContext(tenantId, user, pageContext = {}) {
  const tenant = await Tenant.findById(tenantId).populate('plan').lean();
  if (!tenant) return null;

  const now = new Date();
  const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const tenantMatch = { tenantId: tenant._id };
  const tools = createAssistantTools({ tenantId: tenant._id, tenant, user, pageContext });

  const [
    storeSummaryResult,
    inventoryResult,
    topBySoldCount,
    statusAgg,
    topByOrders,
  ] = await Promise.all([
    tools.getStoreSummary(),
    tools.getInventory(),
    Product.find(tenantMatch).sort({ soldCount: -1, updatedAt: -1 }).limit(10).select('name sku stock lowStockThreshold soldCount price salePrice isActive').lean(),
    Order.aggregate([
      { $match: tenantMatch },
      { $group: { _id: '$orderStatus', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    Order.aggregate([
      { $match: { tenantId: tenant._id, createdAt: { $gte: last30 }, orderStatus: { $nin: ['cancelled', 'refunded'] } } },
      { $unwind: '$items' },
      { $group: {
        _id: { product: '$items.product', name: '$items.name' },
        quantity: { $sum: '$items.quantity' },
        revenue: { $sum: '$items.subtotal' },
      } },
      { $sort: { quantity: -1, revenue: -1 } },
      { $limit: 10 },
    ]),
  ]);

  if (storeSummaryResult.status !== 'ok') {
    const err = new Error('Store summary could not be retrieved');
    err.type = storeSummaryResult.error?.type || 'service_unavailable';
    throw err;
  }

  const summary = storeSummaryResult.data;
  const inventory = inventoryResult.status === 'ok'
    ? inventoryResult.data
    : { lowStockProducts: [], lowStockCount: 0 };
  const toolResults = [storeSummaryResult, inventoryResult].map(result => ({
    name: result.name,
    status: result.status,
    errorType: result.error?.type || null,
    checkedAt: result.checkedAt,
  }));

  return {
    tenant: {
      ...summary.tenant,
      domains: (tenant.domains || []).map(d => ({
        domain: d.domain,
        type: d.type,
        verified: !!d.verified,
        active: !!d.active,
      })),
    },
    admin: summary.admin,
    page: pageContext,
    tools,
    counts: {
      ...summary.counts,
      lowStockCount: inventory.lowStockCount,
    },
    toolResults,
    statusBreakdown: statusAgg.map(s => ({ status: s._id || 'unknown', count: s.count })),
    lowStockProducts: inventory.lowStockProducts,
    topProductsBySoldCount: topBySoldCount.map(compactProduct),
    topProductsLast30Days: topByOrders.map(row => ({
      name: row._id?.name || 'Unknown product',
      quantity: row.quantity || 0,
      revenue: row.revenue || 0,
    })),
  };
}

function buildFastMovingAnswer(ctx) {
  const currency = ctx.tenant.currency;
  const top = ctx.topProductsLast30Days.length
    ? ctx.topProductsLast30Days
    : ctx.topProductsBySoldCount.map(p => ({ name: p.name, quantity: p.soldCount, revenue: 0, stock: p.stock }));

  if (!top.length || top.every(p => Number(p.quantity || 0) <= 0)) {
    return {
      answer: [
        `I checked ${ctx.tenant.storeName}'s store data, but there are no sold products yet.`,
        'Once orders are placed, I can rank fast-moving items from order items and product sold counts.',
      ].join('\n'),
      actions: [{ label: 'Open Orders', path: '/admin/orders' }, { label: 'Open Products', path: '/admin/products' }],
    };
  }

  const rows = top.slice(0, 10).map((p, i) => {
    const revenue = p.revenue ? `, revenue ${money(p.revenue, currency)}` : '';
    const stock = p.stock !== undefined ? `, stock ${p.stock}` : '';
    return `${i + 1}. ${p.name}: ${p.quantity} units${revenue}${stock}`;
  });

  return {
    answer: [
      `Fast-moving items for ${ctx.tenant.storeName}:`,
      ...rows,
      '',
      ctx.topProductsLast30Days.length
        ? 'This ranking is calculated from non-cancelled order items in the last 30 days.'
        : 'This ranking is calculated from product sold counts because recent order-item data was not available.',
    ].join('\n'),
    actions: [{ label: 'Open Products', path: '/admin/products' }, { label: 'Open Orders', path: '/admin/orders' }],
  };
}

function buildLowStockAnswer(ctx) {
  if (!ctx.lowStockProducts.length) {
    return {
      answer: `Good news: there are no active products at or below their low-stock threshold in ${ctx.tenant.storeName}.`,
      actions: [{ label: 'Open Products', path: '/admin/products' }],
    };
  }
  return {
    answer: [
      `Low-stock products in ${ctx.tenant.storeName}:`,
      ...ctx.lowStockProducts.map((p, i) => `${i + 1}. ${p.name}: stock ${p.stock}, threshold ${p.lowStockThreshold}${p.sku ? `, SKU ${p.sku}` : ''}`),
      '',
      'Update stock from Admin -> Products. Products with accurate stock and low-stock thresholds make dashboard alerts more useful.',
    ].join('\n'),
    actions: [{ label: 'Open Products', path: '/admin/products' }],
  };
}

function buildUsageAnswer(ctx) {
  const limits = ctx.tenant.planLimits || {};
  return {
    answer: [
      `${ctx.tenant.storeName} is on the ${ctx.tenant.planName} plan.`,
      `Products: ${ctx.counts.productCount}/${limits.products || 'unlimited'}`,
      `Orders this month: ${ctx.counts.ordersThisMonth}/${limits.ordersPerMonth || 'unlimited'}`,
      `Admins: ${ctx.counts.adminCount}/${limits.admins || 'unlimited'}`,
      `Total paid revenue: ${money(ctx.counts.totalRevenue, ctx.tenant.currency)}`,
      `This month paid revenue: ${money(ctx.counts.thisMonthRevenue, ctx.tenant.currency)}`,
      `Pending orders: ${ctx.counts.pendingOrders}`,
      '',
      'These numbers are read from this store only.',
    ].join('\n'),
    actions: [{ label: 'Open Dashboard', path: '/admin' }, { label: 'Open Billing', path: '/admin/billing' }],
  };
}

function routeToNavigationPath(item, isSuperAdmin = false) {
  if (isSuperAdmin) return `Super Admin -> ${item.label}`;
  return `Admin Panel -> ${item.label}`;
}

function scoreNavigationItem(message, item) {
  const text = normalizeAdminMessage(message);
  const aliases = [item.label, item.key, ...(item.aliases || [])];
  return aliases.reduce((score, alias) => {
    if (!alias) return score;
    const normalizedAlias = normalizeAdminMessage(alias);
    if (text.includes(normalizedAlias)) return score + normalizedAlias.length + 20;
    return textIncludesAny(text, [alias]) ? score + 10 : score;
  }, 0);
}

function resolveNavigationItem(message, ctx) {
  const isSuperAdminQuery = textIncludesAny(message, ['super admin', 'superadmin', '/superadmin', 'platform', 'tenant management']);
  const items = isSuperAdminQuery || ctx.admin.role === 'superadmin'
    ? [...SUPER_ADMIN_NAVIGATION_ITEMS, ...ADMIN_NAVIGATION_ITEMS]
    : ADMIN_NAVIGATION_ITEMS;
  const ranked = items
    .map(item => ({ item, score: scoreNavigationItem(message, item), isSuperAdmin: SUPER_ADMIN_NAVIGATION_ITEMS.includes(item) }))
    .filter(row => row.score > 0)
    .sort((a, b) => b.score - a.score);
  return {
    match: ranked[0] || null,
    related: ranked.slice(1, 4),
  };
}

function buildNavigationNotFoundAnswer(ctx) {
  const roleNote = ctx.admin.role === 'superadmin'
    ? 'You are signed in as Super Admin, so platform tabs are under /superadmin and store admin pages are under /admin when you enter a tenant admin area.'
    : 'You are signed in as Tenant Admin, so store-management pages are under Admin Panel.';
  return {
    answer: [
      'Current Context:',
      `- Store: ${ctx.tenant.storeName}`,
      `- Role: ${ctx.admin.role}`,
      `- Current route: ${ctx.page.currentRoute || 'not provided'}`,
      `- Plan: ${ctx.tenant.planName}`,
      '',
      'Navigation:',
      '- I could not match the requested page to a verified StoreKit menu or route.',
      `- ${roleNote}`,
      '',
      'Action:',
      '- Send the page name or feature you are looking for, for example Products, Orders, Settings, Gateways, Billing, SEO, Theme Builder, or Returns.',
      '',
      'Expected Result:',
      '- I will answer with the confirmed StoreKit path and route only if it exists in the current app.',
    ].join('\n'),
    actions: [{ label: 'Open Dashboard', path: '/admin' }],
  };
}

function buildNavigationAnswer(ctx, navResult) {
  if (!navResult.match) return buildNavigationNotFoundAnswer(ctx);
  const { item, isSuperAdmin } = navResult.match;
  const featureKey = item.feature || null;
  const enabled = isSuperAdmin || isFeatureEnabled(ctx, featureKey);
  const roleAllowed = !isSuperAdmin || ctx.admin.role === 'superadmin';
  const relatedRows = navResult.related
    .filter(row => row.item.key !== item.key)
    .map(row => `- ${routeToNavigationPath(row.item, row.isSuperAdmin)} (${row.item.path})`);

  const routeLine = isSuperAdmin
    ? `${routeToNavigationPath(item, true)} (${item.path})`
    : `${routeToNavigationPath(item)} (${item.path})`;
  const limitation = !roleAllowed
    ? `- ${item.label} is a Super Admin area. Tenant Admin users should not manage platform-level ${item.label.toLowerCase()} from the store Admin Panel.`
    : !enabled
      ? `- ${item.label} exists in StoreKit, but this store's current plan/feature flags do not enable ${FEATURE_LABELS[featureKey] || item.label}.`
      : `- ${item.label} is available from the verified StoreKit navigation.`;

  return {
    answer: [
      'Current Context:',
      `- Store: ${ctx.tenant.storeName}`,
      `- Role: ${ctx.admin.role}`,
      `- Current route: ${ctx.page.currentRoute || 'not provided'}`,
      `- Plan: ${ctx.tenant.planName}`,
      '',
      'Navigation:',
      `- ${routeLine}`,
      limitation,
      '',
      'Action:',
      roleAllowed && enabled
        ? `- Open ${routeToNavigationPath(item, isSuperAdmin)} and complete the required changes there.`
        : !roleAllowed
          ? '- Ask a Super Admin to open this area from the Super Admin panel.'
          : `- Open Admin Panel -> Billing (/admin/billing) to review the plan, or ask an authorized admin to enable ${FEATURE_LABELS[featureKey] || item.label}.`,
      '',
      'Expected Result:',
      roleAllowed && enabled
        ? `- You should see the ${item.label} page for the current StoreKit context.`
        : '- The page/button should appear only after the required role, permission, or plan feature is available.',
      relatedRows.length ? '' : null,
      relatedRows.length ? 'Related Pages:' : null,
      ...relatedRows,
    ].filter(Boolean).join('\n'),
    actions: roleAllowed && enabled
      ? [{ label: `Open ${item.label}`, path: item.path }]
      : [{ label: 'Open Billing', path: '/admin/billing' }],
  };
}

function scoreSettingsTab(message, tab) {
  const text = normalizeAdminMessage(message);
  return [tab.label, tab.id, ...(tab.aliases || [])].reduce((score, alias) => {
    const normalizedAlias = normalizeAdminMessage(alias);
    if (text.includes(normalizedAlias)) return score + normalizedAlias.length + 20;
    return textIncludesAny(text, [alias]) ? score + 10 : score;
  }, 0);
}

function resolveSettingsTab(message) {
  const ranked = SETTINGS_TABS
    .map(tab => ({ tab, score: scoreSettingsTab(message, tab) }))
    .filter(row => row.score > 0)
    .sort((a, b) => b.score - a.score);
  return {
    match: ranked[0]?.tab || SETTINGS_TABS.find(tab => tab.id === 'general'),
    related: ranked.slice(1, 4).map(row => row.tab),
  };
}

function settingValue(value) {
  if (value === true) return 'Enabled';
  if (value === false) return 'Disabled';
  if (value === undefined || value === null || value === '') return 'not set';
  return String(value);
}

function buildSettingsConfigurationRows(tab, settingsData, gatewayData, deliveryData, pagesData) {
  const settings = settingsData?.settings || {};
  const theme = settingsData?.theme || {};
  const gateways = gatewayData?.gateways || [];
  const delivery = deliveryData || {};
  const pages = pagesData || {};

  switch (tab.id) {
    case 'general':
      return [
        `Store email: ${settings.storeEmailPresent ? 'configured' : 'not set'}`,
        `Store phone: ${settings.storePhonePresent ? 'configured' : 'not set'}`,
        `Store address: ${settings.storeAddressPresent ? 'configured' : 'not set'}`,
        `Currency: ${settings.currency}${settings.currencySymbol ? ` (${settings.currencySymbol})` : ''}`,
        `Timezone: ${settingValue(settings.timezone)}`,
      ];
    case 'business':
      return [
        `Tax: ${settings.taxEnabled ? `${settings.taxLabel || 'Tax'} at ${settings.taxRate}%` : 'Disabled'}`,
        `Terms URL: ${settingValue(settings.termsUrl)}`,
        `Privacy URL: ${settingValue(settings.privacyUrl)}`,
        `Business pages: ${pages.count || 0} total, ${pages.activeCount || 0} active`,
      ];
    case 'delivery':
      return [
        `Default shipping cost: ${settings.standardDelivery}`,
        `Free shipping threshold: ${settings.freeDeliveryThreshold}`,
        `Delivery services: ${delivery.count || 0} total, ${delivery.enabledCount || 0} enabled`,
        `COD in store settings: ${settings.codEnabled ? 'Enabled' : 'Disabled'}`,
      ];
    case 'payment':
      return [
        `Cash on Delivery: ${settings.codEnabled ? 'Enabled' : 'Disabled'}`,
        `Bank Transfer: ${settings.bankTransferEnabled ? 'Enabled' : 'Disabled'}`,
        `Bank details: ${settings.bankDetailsConfigured ? 'configured' : 'not fully configured'}`,
      ];
    case 'gateways':
      return gateways.length
        ? gateways.map(gateway => `${gateway.displayName}: ${gateway.isEnabled ? 'Enabled' : 'Disabled'}, ${gateway.mode}, ${gateway.scope}`)
        : ['No gateway records returned.'];
    case 'emails':
      return [
        `Order placed customer email: ${settingValue(settings.emailNotifications?.emailNotif_order_placed_customer)}`,
        `Order placed admin email: ${settingValue(settings.emailNotifications?.emailNotif_order_placed_admin)}`,
        `Payment confirmed customer email: ${settingValue(settings.emailNotifications?.emailNotif_payment_confirmed_customer)}`,
        `Return refunded customer email: ${settingValue(settings.emailNotifications?.emailNotif_return_refunded_customer)}`,
        `Order notification email: ${settings.orderNotificationEmailPresent ? 'configured' : 'not set'}`,
      ];
    case 'seo':
      return [
        `Meta title: ${settings.metaTitlePresent ? 'configured' : 'not set'}`,
        `Meta description: ${settings.metaDescriptionPresent ? 'configured' : 'not set'}`,
        `Google Analytics: ${settings.googleAnalyticsPresent ? 'configured' : 'not set'}`,
        `Meta/Facebook Pixel: ${settings.facebookPixelPresent ? 'configured' : 'not set'}`,
      ];
    case 'appearance':
    case 'fonts':
      return [
        `Theme: ${settingValue(theme.theme)}`,
        `Template: ${settingValue(theme.storeTemplate)}`,
        `Logo: ${theme.logoUrlPresent ? 'configured' : 'not set'}`,
        `Favicon: ${theme.faviconUrlPresent ? 'configured' : 'not set'}`,
        `Font: ${settingValue(theme.fontStyle)}`,
        `Dark mode: ${theme.darkMode ? 'Enabled' : 'Disabled'}`,
      ];
    case 'pages':
      return [
        `Business pages: ${pages.count || 0} total, ${pages.activeCount || 0} active`,
        ...(Array.isArray(pages.pages) && pages.pages.length
          ? pages.pages.slice(0, 5).map(page => `${page.title} (/page/${page.slug}) - ${page.isActive ? 'Active' : 'Inactive'}`)
          : ['No business pages returned.']),
      ];
    case 'advanced':
    case 'features':
      return [
        `Maintenance Mode: ${settings.maintenanceMode ? 'Enabled' : 'Disabled'}`,
        `Guest Checkout: ${settings.allowGuestCheckout ? 'Enabled' : 'Disabled'}`,
        `Wishlist: ${settings.enableWishlist ? 'Enabled' : 'Disabled'}`,
        `Reviews: ${settings.enableReviews ? 'Enabled' : 'Disabled'}`,
        `Gift Cards: ${settings.enableGiftCards ? 'Enabled' : 'Disabled'}`,
        `Returns: ${settings.enableReturns ? 'Enabled' : 'Disabled'}`,
        `Low stock alert: ${settings.lowStockAlert}`,
      ];
    case 'announcement':
      return [`Announcement bar: ${settings.announcementEnabled ? 'Enabled' : 'Disabled'}`];
    case 'whatsapp':
      return [`WhatsApp number: ${settings.whatsappNumberPresent ? 'configured' : 'not set'}`];
    case 'discounts':
      return [
        `Gift card covers delivery: ${settings.giftCardCoversDelivery ? 'Enabled' : 'not enabled/unknown'}`,
        `Coupons feature: ${settingValue(settingsData?.planFeatures?.coupons)}`,
      ];
    default:
      return ['Live settings were retrieved. Open the matched Settings tab to review the saved values.'];
  }
}

function settingDependencyText(tab) {
  const map = {
    general: 'Currency/contact changes affect storefront display, checkout labels, invoices, and reports.',
    business: 'Tax and legal page changes affect checkout totals, order records, and storefront legal links.',
    delivery: 'Delivery changes affect checkout shipping options, delivery fees, COD availability, and order fulfilment.',
    payment: 'Payment settings affect checkout payment methods and payment slip workflows.',
    gateways: 'Gateway settings affect online checkout, callbacks/webhooks, and payment verification.',
    emails: 'Email notification settings affect customer/admin order, payment, cancellation, and return emails.',
    seo: 'SEO defaults affect storefront metadata, analytics, Meta Pixel, and search visibility.',
    appearance: 'Theme/logo changes affect storefront branding and may require cache/theme refresh.',
    fonts: 'Font changes affect storefront appearance and may require cache/theme refresh.',
    pages: 'Page changes affect footer/navigation legal content and storefront /page/:slug routes.',
    advanced: 'Advanced settings can affect storefront availability, checkout rules, stock alerts, and automation.',
    features: 'Feature toggles affect which storefront/admin workflows are visible or active.',
  };
  return map[tab.id] || 'This setting can affect related StoreKit modules depending on the saved configuration.';
}

function buildSettingsAnswer(ctx, tab, settingsResult, gatewayResult, deliveryResult, pagesResult, mode = 'help') {
  const settingsData = settingsResult.status === 'ok' ? settingsResult.data : null;
  const gatewayData = gatewayResult.status === 'ok' ? gatewayResult.data : null;
  const deliveryData = deliveryResult.status === 'ok' ? deliveryResult.data : null;
  const pagesData = pagesResult.status === 'ok' ? pagesResult.data : null;
  const enabled = isFeatureEnabled(ctx, tab.feature);
  const rows = settingsData
    ? buildSettingsConfigurationRows(tab, settingsData, gatewayData, deliveryData, pagesData)
    : ['Store settings could not be retrieved.'];
  const critical = ['payment', 'gateways', 'business', 'delivery', 'advanced', 'emails'].includes(tab.id);

  return {
    answer: [
      'Current Configuration:',
      `- Store: ${ctx.tenant.storeName}`,
      `- Role: ${ctx.admin.role}`,
      `- Plan: ${ctx.tenant.planName}`,
      `- Current route: ${ctx.page.currentRoute || 'not provided'}`,
      `- Settings tab: ${tab.label}`,
      ...rows.map(row => `- ${row}`),
      '',
      'Verified Findings:',
      settingsResult.status === 'ok' ? '- Latest tenant settings were retrieved for the authenticated current store.' : `- Store settings could not be verified: ${settingsResult.error?.type || 'unknown error'}.`,
      gatewayResult.status === 'ok' ? '- Payment gateway configuration summary was retrieved with secrets masked/omitted.' : '- Payment gateway configuration could not be verified.',
      deliveryResult.status === 'ok' ? '- Delivery service configuration was checked.' : '- Delivery service configuration could not be verified.',
      pagesResult.status === 'ok' ? '- Business/legal pages were checked.' : '- Business/legal pages could not be verified.',
      enabled ? `- ${tab.label} is allowed by the current plan/feature context.` : `- ${tab.label} exists, but the related feature is not enabled in the current plan/feature flags.`,
      mode === 'troubleshoot' ? '- If the setting still looks ineffective, check saved configuration, feature flags, cache/theme application, related integrations, and recent logs.' : null,
      '',
      'Recommended Change:',
      critical
        ? `- Open Admin Panel -> Settings -> ${tab.label} (${tab.path}) and review the saved values. For critical changes, confirm the impact before saving.`
        : `- Open Admin Panel -> Settings -> ${tab.label} (${tab.path}) and update the required value, then click Save & Apply.`,
      `- Dependency: ${settingDependencyText(tab)}`,
      '',
      'Expected Result:',
      '- After saving and verification, the updated configuration should be reflected in the related StoreKit area.',
      '',
      'Related Settings:',
      '- Admin Panel -> Settings -> Store',
      '- Admin Panel -> Settings -> Payment',
      '- Admin Panel -> Settings -> Gateways',
      '- Admin Panel -> Settings -> Email Notifications',
    ].filter(Boolean).join('\n'),
    actions: [{ label: `Open Settings`, path: '/admin/settings' }],
  };
}

function websiteFocus(message) {
  const normalized = normalizeAdminMessage(message);
  if (textIncludesAny(normalized, ['layout', 'homepage', 'header', 'footer', 'section', 'widget', 'responsive', 'mobile layout', 'desktop layout'])) return 'layout';
  if (textIncludesAny(normalized, ['banner', 'hero slider', 'popup', 'running banner'])) return 'banners';
  if (textIncludesAny(normalized, ['page', 'pages', 'legal page', 'footer page', 'nav page'])) return 'pages';
  if (textIncludesAny(normalized, ['logo', 'favicon', 'branding', 'color', 'font', 'theme', 'template'])) return 'theme';
  return 'website';
}

function layoutRows(layoutBuilder = {}) {
  const labels = {
    homepage: 'Homepage',
    product_page: 'Product Page',
    category_page: 'Category Page',
    checkout: 'Checkout',
    header: 'Header',
    footer: 'Footer',
  };
  return Object.entries(labels).map(([key, label]) => {
    const page = layoutBuilder[key] || {};
    return `${label}: ${page.configured ? `${page.enabledSections}/${page.totalSections} sections enabled` : 'default layout, no saved custom layout'}`;
  });
}

function buildThemeWebsiteAnswer(ctx, websiteResult, mode = 'help', focus = 'website') {
  const data = websiteResult.status === 'ok' ? websiteResult.data : null;
  if (!data) {
    return {
      answer: [
        'Current Theme:',
        '- I could not retrieve the active theme configuration for the authenticated current store.',
        '',
        'Findings:',
        `- Tool status: ${websiteResult.status}`,
        `- Error type: ${websiteResult.error?.type || 'unknown'}`,
        '',
        'Action:',
        '- Reload the admin session and try again before changing theme, layout, banners, or pages.',
        '',
        'Expected Result:',
        '- Once configuration is available, I can verify the saved theme and website builder settings safely.',
      ].join('\n'),
      actions: [{ label: 'Open Theme Builder', path: '/admin/theme-builder' }],
    };
  }

  const theme = data.activeTheme || {};
  const featureFlags = data.featureFlags || {};
  const bannerSummary = data.bannerSummary || {};
  const pageSummary = data.pageSummary || {};
  const missingAssets = [];
  if (!theme.logoUrlPresent) missingAssets.push('Logo is not configured');
  if (!theme.faviconUrlPresent) missingAssets.push('Favicon is not configured');
  if ((bannerSummary.activeCount || 0) > 0 && Array.isArray(bannerSummary.banners)) {
    const imageMissing = bannerSummary.banners.filter(banner => banner.isActive && !banner.imagePresent).length;
    if (imageMissing) missingAssets.push(`${imageMissing} active banner(s) have no image`);
  }

  const actionMap = {
    theme: 'Admin Panel -> Theme Builder',
    layout: 'Admin Panel -> Layout Builder',
    banners: 'Admin Panel -> Banners & Popups',
    pages: 'Admin Panel -> Settings -> Pages',
    website: 'Admin Panel -> Theme Builder',
  };
  const pathMap = {
    theme: '/admin/theme-builder',
    layout: '/admin/layout',
    banners: '/admin/banners',
    pages: '/admin/settings',
    website: '/admin/theme-builder',
  };
  const featureMap = {
    theme: 'themeBuilder',
    layout: 'layoutEditor',
    banners: 'banners',
    pages: null,
    website: 'themeBuilder',
  };
  const requiredFeature = featureMap[focus] || null;
  const featureAllowed = isFeatureEnabled(ctx, requiredFeature);

  const findings = [
    `Active theme: ${theme.theme || 'default'}`,
    `Store template: ${theme.storeTemplate || 'classic/not set'}`,
    `Font: ${theme.fontStyle || 'default/not set'}`,
    `Logo: ${theme.logoUrlPresent ? 'configured' : 'not set'}`,
    `Favicon: ${theme.faviconUrlPresent ? 'configured' : 'not set'}`,
    `Custom CSS: ${theme.customCSSPresent ? 'configured' : 'not set'}`,
    `Dark mode: ${theme.darkMode ? 'Enabled' : 'Disabled'}`,
    `Banners: ${bannerSummary.activeCount || 0}/${bannerSummary.count || 0} active`,
    `Business pages: ${pageSummary.activeCount || 0}/${pageSummary.count || 0} active`,
    `Theme Builder feature: ${featureFlags.themeBuilder ? 'Enabled' : 'Not enabled'}`,
    `Layout Builder feature: ${featureFlags.layoutEditor ? 'Enabled' : 'Not enabled'}`,
    `Banners feature: ${featureFlags.banners ? 'Enabled' : 'Not enabled'}`,
  ];

  const troubleshootingRows = mode === 'troubleshoot'
    ? [
      '- Verify the saved active theme above.',
      '- Check Layout Builder saved sections for hidden homepage/header/footer sections.',
      '- Check active banners and required images.',
      '- Refresh storefront/browser cache after saving.',
      '- Check feature flags and recent StoreKit logs if the saved configuration still does not appear.',
      '- CDN/deployment logs are not exposed through the current assistant tools, so I cannot verify CDN state from here.',
    ]
    : [];

  return {
    answer: [
      `Current Theme:`,
      `- Store: ${ctx.tenant.storeName}`,
      `- Active saved theme: ${theme.theme || 'default'}`,
      `- Template: ${theme.storeTemplate || 'classic/not set'}`,
      `- Font: ${theme.fontStyle || 'default/not set'}`,
      '- Publish state: StoreKit does not expose separate draft/published themes here; the saved tenant theme/layout is the active storefront configuration.',
      '',
      'Findings:',
      ...findings.map(row => `- ${row}`),
      ...layoutRows(data.layoutBuilder).map(row => `- ${row}`),
      missingAssets.length ? `- Asset checks: ${missingAssets.join('; ')}` : '- Asset checks: required logo/favicon/banner image blockers were not found in the retrieved summary.',
      featureAllowed ? `- Required feature for this request is available.` : `- Required feature ${requiredFeature || 'none'} is not enabled for this plan/context.`,
      ...troubleshootingRows,
      '',
      'Action:',
      featureAllowed
        ? `- Open ${actionMap[focus] || actionMap.website} (${pathMap[focus] || pathMap.website}), preview/review desktop, tablet, and mobile impact, then save the customer-facing change.`
        : `- Open Admin Panel -> Billing (/admin/billing) or ask an authorized admin to enable ${FEATURE_LABELS[requiredFeature] || 'the required website feature'} before changing this area.`,
      '- For customer-facing changes, check storefront on mobile and desktop after saving.',
      '',
      'Expected Result:',
      mode === 'troubleshoot'
        ? '- After cache refresh and verified saved configuration, the storefront should reflect the active theme/layout/banner/page settings.'
        : '- The storefront should use the saved colors, typography, logo, layout sections, banners, and pages for this store only.',
    ].join('\n'),
    actions: [
      { label: focus === 'layout' ? 'Open Layout Builder' : focus === 'banners' ? 'Open Banners' : 'Open Theme Builder', path: pathMap[focus] || pathMap.website },
      { label: 'Open Settings', path: '/admin/settings' },
    ],
  };
}

function buildProductCountAnswer(ctx) {
  return {
    answer: [
      `${ctx.tenant.storeName} currently has ${ctx.counts.productCount} products.`,
      `Active products: ${ctx.counts.activeProducts}`,
      '',
      'This count was read from the authenticated current store only.',
      '',
      'Open:',
      'Admin Panel -> Products',
    ].join('\n'),
    actions: [{ label: 'Open Products', path: '/admin/products' }],
  };
}

function buildProductLookupClarificationAnswer(ctx) {
  return {
    answer: [
      `I need the product name, SKU, slug, or Product ID to check live product data in ${ctx.tenant.storeName}.`,
      '',
      'Please send one of these:',
      '- Product name',
      '- SKU',
      '- Product slug',
      '- Product ID',
      '',
      'Then I can verify Active/Draft status, stock, category, images, price, variants, and visibility from the authenticated current store.',
    ].join('\n'),
    actions: [{ label: 'Open Products', path: '/admin/products' }],
  };
}

function buildProductNotFoundAnswer(ctx, lookup) {
  return {
    answer: [
      `I could not find a matching product in ${ctx.tenant.storeName}.`,
      '',
      `Searched for: ${lookup.terms.join(', ')}`,
      '',
      'Please check the product name, SKU, slug, or Product ID and send it again.',
      '',
      'I only searched products belonging to the authenticated current store.',
    ].join('\n'),
    actions: [{ label: 'Open Products', path: '/admin/products' }],
  };
}

function buildProductAmbiguousAnswer(ctx, lookup) {
  return {
    answer: [
      `I found multiple matching products in ${ctx.tenant.storeName}.`,
      '',
      ...lookup.matches.map((p, index) => `${index + 1}. ${p.name}${p.sku ? ` - SKU ${p.sku}` : ''}${p.slug ? ` - ${p.slug}` : ''}`),
      '',
      'Please send the exact product name, SKU, or Product ID so I can check the correct product.',
    ].join('\n'),
    actions: [{ label: 'Open Products', path: '/admin/products' }],
  };
}

function buildProductVisibilityLiveAnswer(ctx, product) {
  const p = compactProductDetail(product);
  const currency = ctx.tenant.currency || 'LKR';
  const findings = [];
  const actions = [];

  findings.push(`Product: ${p.name}`);
  findings.push(`Status: ${p.isActive ? 'Active' : 'Draft/Inactive'}`);
  findings.push(`Stock: ${p.stock} units`);
  findings.push(`Low-stock threshold: ${p.lowStockThreshold} units`);
  findings.push(`Regular price: ${money(p.price, currency)}`);
  if (p.salePrice !== null) findings.push(`Sale price: ${money(p.salePrice, currency)}`);
  findings.push(`Category: ${p.categoryPresent ? 'set' : 'missing'}`);
  findings.push(`Primary image: ${p.thumbnailPresent ? 'set' : 'missing'}`);
  findings.push(`Gallery images: ${p.imageCount}`);
  if (p.variantOptionCount > 0) {
    findings.push(`Variants: ${p.variantOptionCount} option group(s), ${p.variantCombinationCount} combination(s), ${p.availableVariantCombinationCount} with stock`);
  }

  if (!p.isActive) actions.push('Change status to Active.');
  if (p.stock <= 0 && p.availableVariantCombinationCount <= 0) actions.push('Update stock or at least one variant stock above 0.');
  if (!p.categoryPresent) actions.push('Assign a valid Category.');
  if (!p.price || p.price <= 0) actions.push('Set a valid Regular Price.');
  if (!p.thumbnailPresent) actions.push('Upload a Thumbnail image.');
  if (!p.descriptionPresent) actions.push('Add a Full Description.');
  if (p.variantOptionCount > 0 && p.variantCombinationCount > 0 && p.availableVariantCombinationCount <= 0) actions.push('Check variant combinations and make at least one variant available with stock.');

  const planLimit = Number(ctx.tenant.planLimits?.products || 0);
  if (planLimit > 0 && ctx.counts.productCount > planLimit) {
    actions.push(`Review plan product limit: current ${ctx.counts.productCount}/${planLimit}.`);
  }

  const confirmedCause = actions.length
    ? actions[0]
    : 'I did not find a clear product-record blocker in Active status, stock, category, price, thumbnail, description, or variant stock.';

  return {
    answer: [
      `I checked live product data for ${ctx.tenant.storeName}.`,
      '',
      'Current state:',
      ...findings.map(item => `- ${item}`),
      '',
      `Confirmed result: ${confirmedCause}`,
      '',
      actions.length ? 'Recommended action:' : 'Next required checks:',
      ...(actions.length
        ? actions.map(item => `- ${item}`)
        : [
          '- Refresh the storefront and clear any cached page.',
          '- Check whether the category page/search filters are hiding the product.',
          '- Check recent storefront/API errors if the product still does not appear.',
        ]),
      '',
      'Open:',
      `Admin Panel -> Products -> ${p.name}`,
      '',
      actions.length
        ? 'Expected result: after saving the missing fields/status/stock, the product should become eligible to appear on the storefront.'
        : 'Expected result: if no storefront/API error exists, this product should already be eligible to appear on the storefront.',
    ].join('\n'),
    actions: [{ label: 'Open Products', path: '/admin/products' }],
  };
}

function buildInventoryLookupClarificationAnswer(ctx) {
  return {
    answer: [
      `I need the product name, SKU, slug, variant SKU, or Product ID to check live inventory in ${ctx.tenant.storeName}.`,
      '',
      'Please send one of these:',
      '- Product name',
      '- Product SKU',
      '- Variant SKU',
      '- Product slug',
      '- Product ID',
      '',
      'Then I can verify product stock, low-stock threshold, variant stock, and out-of-stock status from live StoreKit data.',
    ].join('\n'),
    actions: [{ label: 'Open Products', path: '/admin/products' }],
  };
}

function buildInventoryLiveAnswer(ctx, product, mode = 'status') {
  const p = compactProductDetail(product);
  const variantCombinations = Array.isArray(product.variantCombinations) ? product.variantCombinations : [];
  const variantRows = variantCombinations.slice(0, 8).map((variant, index) => {
    const options = variant.combination && typeof variant.combination === 'object'
      ? Object.entries(variant.combination).map(([key, value]) => `${key}: ${value}`).join(', ')
      : `Variant ${index + 1}`;
    const sku = variant.sku ? `, SKU ${variant.sku}` : '';
    return `${index + 1}. ${options}${sku}, stock ${Number(variant.stock || 0)}`;
  });

  const stockState = p.stock <= 0
    ? 'Out of Stock'
    : p.stock <= p.lowStockThreshold
      ? 'Low Stock'
      : 'In Stock';

  const findings = [
    `Product: ${p.name}`,
    `Product-level stock: ${p.stock}`,
    `Low-stock threshold: ${p.lowStockThreshold}`,
    `Stock status: ${stockState}`,
    `Sold count: ${Number(product.soldCount || 0)}`,
    `Main SKU: ${p.sku || 'not set'}`,
    `Variants: ${p.variantCombinationCount} combination(s), ${p.availableVariantCombinationCount} with stock`,
    `Last product update: ${p.updatedAt ? new Date(p.updatedAt).toISOString().slice(0, 10) : 'not recorded'}`,
  ];

  const actions = [];
  if (p.stock <= 0 && p.availableVariantCombinationCount <= 0) actions.push('Update product stock or variant stock before expecting customers to purchase it.');
  else if (p.stock <= p.lowStockThreshold) actions.push('Replenish stock or increase the low-stock threshold only if the current threshold is too high.');
  if (p.variantCombinationCount > 0) actions.push('Check each variant combination separately because variant stock can differ from product-level stock.');

  return {
    answer: [
      `I checked live inventory data for ${ctx.tenant.storeName}.`,
      '',
      'Current Inventory Status:',
      ...findings.map(item => `- ${item}`),
      '',
      variantRows.length ? 'Variant Inventory:' : 'Variant Inventory:',
      ...(variantRows.length ? variantRows.map(row => `- ${row}`) : ['- No variant-combination stock records found for this product.']),
      '',
      'Confirmed Findings:',
      `- StoreKit currently tracks stock on Product.stock and variantCombinations.stock for this product.`,
      '- Reserved stock, warehouse allocation, incoming stock, purchase orders, and adjustment history are not exposed through the current assistant inventory tools.',
      '',
      mode === 'troubleshoot'
        ? `Cause: ${stockState === 'Out of Stock' ? 'The product/variants have no available stock in the verified product record.' : `The verified product record is ${stockState}.`}`
        : `Cause: Current verified stock status is ${stockState}.`,
      '',
      'Admin Navigation:',
      `Admin Panel -> Products -> ${p.name} -> Basic / Variants`,
      '',
      'Recommended Action:',
      ...(actions.length ? actions.map(item => `- ${item}`) : ['- No immediate stock action is required from the verified product record.']),
      '',
      'Expected Result:',
      '- After stock or variant stock is saved and verified, storefront availability should reflect the updated inventory.',
    ].join('\n'),
    actions: [{ label: 'Open Products', path: '/admin/products' }],
  };
}

function buildOrderLookupClarificationAnswer(ctx) {
  return {
    answer: [
      `I need the order number, Order ID, customer email, phone number, or order date to check live order data in ${ctx.tenant.storeName}.`,
      '',
      'Please send one of these:',
      '- Order number, for example ORD-...',
      '- Order ID',
      '- Customer email or phone',
      '- Order date, for example 2026-07-10',
      '',
      'Then I can verify Order Status, Payment Status, shipping/tracking fields, totals, and timestamps from the authenticated current store.',
    ].join('\n'),
    actions: [{ label: 'Open Orders', path: '/admin/orders' }],
  };
}

function buildOrderNotFoundAnswer(ctx, lookup) {
  return {
    answer: [
      `I could not find a matching order in ${ctx.tenant.storeName}.`,
      '',
      `Searched for: ${lookup.terms.join(', ')}`,
      '',
      'Please check the order number, Order ID, customer email, phone number, or order date and send it again.',
      '',
      'I only searched orders belonging to the authenticated current store.',
    ].join('\n'),
    actions: [{ label: 'Open Orders', path: '/admin/orders' }],
  };
}

function buildOrderAmbiguousAnswer(ctx, lookup) {
  return {
    answer: [
      `I found multiple matching orders in ${ctx.tenant.storeName}.`,
      '',
      ...lookup.matches.map((order, index) => `${index + 1}. ${order.orderNumber || order.id} - ${order.orderStatus} / ${order.paymentStatus} - ${money(order.total, ctx.tenant.currency)}${order.customerName ? ` - ${order.customerName}` : ''}`),
      '',
      'Please send the exact order number or Order ID so I can check the correct order.',
    ].join('\n'),
    actions: [{ label: 'Open Orders', path: '/admin/orders' }],
  };
}

function buildOrderLiveAnswer(ctx, order, mode = 'status') {
  const o = compactOrderDetail(order);
  const currency = ctx.tenant.currency || 'LKR';
  const findings = [
    `Order: ${o.orderNumber || o.id}`,
    `Order Status: ${o.orderStatus}`,
    `Payment Status: ${o.paymentStatus}`,
    `Payment Method: ${o.paymentMethod}`,
    `Total: ${money(o.total, currency)}`,
    `Items: ${o.itemCount} item(s), ${o.totalQuantity} unit(s)`,
    `Tracking Number: ${o.trackingNumber || 'not added'}`,
    `Delivery Partner: ${o.deliveryPartner || 'not added'}`,
    `Estimated Delivery: ${o.estimatedDelivery ? new Date(o.estimatedDelivery).toISOString().slice(0, 10) : 'not set'}`,
    `Delivered At: ${o.deliveredAt ? new Date(o.deliveredAt).toISOString().slice(0, 10) : 'not marked delivered'}`,
    `Payment Slip: ${o.paymentSlipPresent ? 'uploaded' : 'not uploaded'}`,
  ];

  let cause;
  const actions = [];
  if (mode === 'payment') {
    if (o.paymentStatus === 'paid') {
      cause = 'Payment Status is already Paid in StoreKit.';
    } else if (o.paymentMethod === 'bank_transfer' && o.paymentSlipPresent) {
      cause = 'The customer has uploaded a payment slip, but Payment Status is not Paid yet. The slip still needs admin verification.';
      actions.push('Open Payment Details and verify the uploaded slip/reference before marking the payment as Paid.');
    } else if (['payhere', 'stripe', 'paypal'].includes(o.paymentMethod)) {
      cause = 'StoreKit has not recorded this online payment as Paid. A gateway callback/webhook confirmation or transaction verification is still missing from the available order record.';
      actions.push('Verify the transaction in the payment gateway dashboard.');
      actions.push('Check whether the gateway callback/webhook was delivered successfully.');
      actions.push('Do not manually mark Paid unless the gateway transaction is verified.');
    } else if (o.paymentMethod === 'cod') {
      cause = 'This is a Cash on Delivery order, so Payment Status may stay Pending/Unpaid until payment is collected.';
      actions.push('Update Payment Status only after cash collection is confirmed.');
    } else {
      cause = 'Payment Status is not Paid on the current order record.';
      actions.push('Verify the payment method and supporting proof before changing Payment Status.');
    }
  } else {
    if (o.orderStatus === 'pending') {
      cause = 'Order Status is Pending, so fulfilment has not moved to confirmed/processing/shipped yet.';
      actions.push('Confirm the order after checking stock and payment/payment method.');
    } else if (o.orderStatus === 'shipped' || o.orderStatus === 'out_for_delivery') {
      cause = o.trackingNumber ? 'The order is in delivery flow and has tracking information.' : 'The order is in delivery flow but tracking number is not added.';
      if (!o.trackingNumber) actions.push('Add tracking number and delivery partner.');
    } else if (o.orderStatus === 'delivered') {
      cause = 'Order Status is Delivered.';
    } else {
      cause = `Order Status is ${o.orderStatus}.`;
    }
  }

  if (!actions.length) actions.push('Review the order details and status history before making any change.');

  return {
    answer: [
      `I checked live order data for ${ctx.tenant.storeName}.`,
      '',
      'Current Status:',
      ...findings.map(item => `- ${item}`),
      '',
      'Status definitions:',
      '- Order Status: fulfilment lifecycle such as Pending, Processing, Shipped, Delivered, Cancelled.',
      '- Payment Status: payment result such as Pending, Paid, Failed, Refunded.',
      '- Delivery Status: represented here by tracking fields, delivery partner, estimated delivery, delivered date, and order status.',
      '- Refund Status: represented by Payment Status `refunded` or related return/refund records when available.',
      '',
      `Confirmed Cause: ${cause}`,
      '',
      'Exact Admin Navigation:',
      `Admin Panel -> Orders -> ${o.orderNumber || o.id} -> Payment Details / Status`,
      '',
      'Recommended Action:',
      ...actions.map(item => `- ${item}`),
      '',
      'Expected Result:',
      '- After the correct payment/fulfilment update is saved and verified, the order should show the updated status in Admin Panel -> Orders.',
    ].join('\n'),
    actions: [{ label: 'Open Orders', path: '/admin/orders' }],
  };
}

function compactReturnRequestForPayment(ret) {
  return {
    status: ret.status || 'pending',
    refundAmount: Number(ret.refundAmount || 0),
    courierCharge: Number(ret.courierCharge || 0),
    netRefundAmount: Number(ret.netRefundAmount || 0),
    refundMethod: ret.refundMethod || '',
    orderStatusUpdated: !!ret.orderStatusUpdated,
    updatedAt: ret.updatedAt || ret.createdAt || null,
  };
}

function summarizeGatewayForMethod(gatewayData, method) {
  const gateways = Array.isArray(gatewayData?.gateways) ? gatewayData.gateways : [];
  return gateways.find(gateway => gateway.gateway === method) || null;
}

function buildPaymentGatewayRows(gatewayData) {
  const gateways = Array.isArray(gatewayData?.gateways) ? gatewayData.gateways : [];
  if (!gateways.length) return ['- No payment gateway records were returned by the assistant gateway tool.'];
  return gateways.map(gateway => {
    const configuredKeys = Object.entries(gateway.configStatus || {})
      .filter(([, info]) => info.configured)
      .map(([key, info]) => info.sensitive ? `${key}: configured` : `${key}: ${info.value || 'configured'}`);
    const configText = configuredKeys.length ? configuredKeys.join(', ') : 'no credentials configured';
    return `- ${gateway.displayName}: ${gateway.isEnabled ? 'Enabled' : 'Disabled'}, ${gateway.mode}, ${gateway.scope}, ${configText}`;
  });
}

function buildPaymentCheckoutGatewayAnswer(ctx, gatewayResult) {
  const gatewayData = gatewayResult?.status === 'ok' ? gatewayResult.data : null;
  return {
    answer: [
      `I checked payment gateway configuration available to the assistant for ${ctx.tenant.storeName}.`,
      '',
      'Payment Status:',
      '- No specific order was provided, so I could not verify an order payment status or transaction result.',
      '',
      'Verified Findings:',
      ...(gatewayData ? buildPaymentGatewayRows(gatewayData) : ['- Gateway configuration could not be retrieved.']),
      gatewayData?.gatewayScope === 'global_fallback'
        ? '- No current-store gateway records were found, so StoreKit returned global fallback gateway configuration.'
        : '- Gateway records are scoped to the authenticated current store.',
      '- Checkout totals, billing details, transaction ID, webhook delivery, settlement status, and error codes require a specific order or gateway event record.',
      '',
      'Confirmed Cause:',
      '- I cannot confirm a payment failure or success without an affected order number, transaction ID, or visible checkout error.',
      '',
      'Admin Navigation:',
      'Admin Panel -> Settings -> Gateways',
      'Admin Panel -> Orders -> Select Order -> Payment Details',
      '',
      'Recommended Action:',
      '- Send the exact Order number, customer email/phone, transaction ID, or checkout error message.',
      '- Confirm the selected gateway is Enabled and in the correct Live/Sandbox mode.',
      '- Do not retry, capture, void, or refund any payment until the transaction is verified.',
      '',
      'Expected Result:',
      '- With the order or error details, I can verify the stored Payment Status, order totals, gateway configuration, and available webhook/status-history evidence.',
    ].join('\n'),
    actions: [{ label: 'Open Settings', path: '/admin/settings' }, { label: 'Open Orders', path: '/admin/orders' }],
  };
}

function buildPaymentLiveAnswer(ctx, order, gatewayResult, returnResult) {
  const o = compactOrderDetail(order);
  const currency = ctx.tenant.currency || 'LKR';
  const gatewayData = gatewayResult?.status === 'ok' ? gatewayResult.data : null;
  const gateway = summarizeGatewayForMethod(gatewayData, o.paymentMethod);
  const returns = returnResult?.status === 'ok' && Array.isArray(returnResult.data)
    ? returnResult.data.map(compactReturnRequestForPayment)
    : [];
  const latestReturn = returns[0] || null;

  const findings = [
    `Order: ${o.orderNumber || o.id}`,
    `Payment Status: ${o.paymentStatus}`,
    `Order Status: ${o.orderStatus}`,
    `Payment Method: ${o.paymentMethod}`,
    `Subtotal: ${money(o.subtotal, currency)}`,
    `Shipping Cost: ${money(o.shippingCost, currency)}`,
    `Tax: ${money(o.tax, currency)}`,
    `Coupon Discount: ${money(o.couponDiscount, currency)}`,
    `Gift Card Discount: ${money(o.giftCardDiscount, currency)}`,
    `Total: ${money(o.total, currency)}`,
    `Billing Details: ${o.billingPresent ? 'present' : 'not stored on this order'}`,
    `Payment Slip: ${o.paymentSlipPresent ? 'uploaded' : 'not uploaded'}`,
    `Transaction / Payment Reference: ${o.paymentReferencePresent ? o.paymentReferenceMasked : 'not stored on this order record'}`,
    `Gateway Config: ${gateway ? `${gateway.displayName} is ${gateway.isEnabled ? 'Enabled' : 'Disabled'} in ${gateway.mode} mode (${gateway.scope})` : 'not returned for this payment method'}`,
    `Refund / Return Records: ${returns.length}`,
  ];

  const historyRows = o.paymentHistoryNotes.length
    ? o.paymentHistoryNotes.map((row, index) => `- ${index + 1}. ${row.status || 'status'}: ${row.note || 'no note'}${row.updatedBy ? ` (${row.updatedBy})` : ''}`)
    : ['- No payment/webhook/refund status-history notes are stored on this order.'];

  const returnRows = returns.length
    ? returns.map((ret, index) => `- ${index + 1}. ${ret.status}: gross ${money(ret.refundAmount, currency)}, net ${money(ret.netRefundAmount, currency)}, method ${ret.refundMethod || 'not set'}`)
    : ['- No return/refund record was found for this order.'];

  let cause = 'The stored order payment data is the current verified source of truth.';
  const actions = [];

  if (o.paymentStatus === 'paid') {
    cause = 'StoreKit currently marks this order as Paid.';
    if (!o.paymentReferencePresent && ['payhere', 'stripe', 'paypal'].includes(o.paymentMethod)) {
      actions.push('Verify the gateway dashboard because this online payment is Paid but no transaction/payment reference is stored on the order record.');
    }
  } else if (o.paymentStatus === 'refunded') {
    cause = latestReturn
      ? `StoreKit marks this order as Refunded, and the latest return/refund record is ${latestReturn.status}.`
      : 'StoreKit marks this order as Refunded, but no return/refund record was returned by the assistant tool.';
  } else if (o.paymentMethod === 'bank_transfer') {
    cause = o.paymentSlipPresent
      ? 'A bank-transfer slip is uploaded, but Payment Status is not Paid yet. It needs admin verification.'
      : 'This bank-transfer order has no uploaded payment slip in the order record.';
    actions.push('Open Payment Details and verify the uploaded slip/reference before changing Payment Status.');
  } else if (o.paymentMethod === 'cod') {
    cause = 'This is a Cash on Delivery order, so payment may remain Pending until cash collection is confirmed.';
    actions.push('Update Payment Status only after cash collection is confirmed.');
  } else if (['payhere', 'stripe', 'paypal'].includes(o.paymentMethod)) {
    cause = 'StoreKit has not verified this online payment as Paid in the order record.';
    actions.push('Check the gateway dashboard using the customer/payment details.');
    actions.push('Check whether webhook/callback status-history notes exist for this order.');
    actions.push('Do not manually mark Paid unless the gateway transaction is verified.');
  } else {
    cause = 'Payment Status is not Paid on the current order record.';
    actions.push('Verify the payment method, amount, and supporting proof before making any payment-status change.');
  }

  if (!gateway && ['payhere', 'stripe', 'paypal'].includes(o.paymentMethod)) {
    actions.push('Review Admin Panel -> Settings -> Gateways because no matching gateway configuration was returned for this payment method.');
  } else if (gateway && !gateway.isEnabled) {
    actions.push(`Enable ${gateway.displayName} only after confirming the credentials and correct Live/Sandbox mode.`);
  }

  if (!actions.length) actions.push('No immediate payment action is required from the verified order record. Review the gateway dashboard before any financial operation.');

  return {
    answer: [
      `I checked live order/payment data for ${ctx.tenant.storeName}.`,
      '',
      'Payment Status:',
      `- ${o.paymentStatus}`,
      '',
      'Verified Findings:',
      ...findings.map(item => `- ${item}`),
      '',
      'Gateway Findings:',
      ...(gatewayData ? buildPaymentGatewayRows(gatewayData) : ['- Gateway configuration could not be retrieved.']),
      '',
      'Webhook / Callback Evidence:',
      ...historyRows,
      '- Gateway event logs, settlement status, signature validation details, and raw gateway responses are not exposed through the current assistant tools unless they appear in order status history.',
      '',
      'Refund Findings:',
      ...returnRows,
      '',
      `Confirmed Cause: ${cause}`,
      '',
      'Admin Navigation:',
      `Admin Panel -> Orders -> ${o.orderNumber || o.id} -> Payment Details`,
      'Admin Panel -> Settings -> Gateways',
      '',
      'Recommended Action:',
      ...actions.map(item => `- ${item}`),
      '',
      'Expected Result:',
      '- After the payment/gateway evidence is verified and the correct update is saved, Admin Panel -> Orders should show the correct Payment Status.',
    ].join('\n'),
    actions: [{ label: 'Open Orders', path: '/admin/orders' }, { label: 'Open Settings', path: '/admin/settings' }],
  };
}

function buildCustomerLookupClarificationAnswer(ctx) {
  return {
    answer: [
      `I need the customer ID, email, phone number, name, or linked order number to check live customer data in ${ctx.tenant.storeName}.`,
      '',
      'Please send one of these:',
      '- Customer email',
      '- Phone number',
      '- Customer name',
      '- Customer ID',
      '- Order number linked to the customer',
      '',
      'I will only use the authenticated current store data and will keep customer details private.',
    ].join('\n'),
    actions: [{ label: 'Open Customers', path: '/admin/customers' }],
  };
}

function buildCustomerNotFoundAnswer(ctx, lookup) {
  return {
    answer: [
      `I could not find a registered customer in ${ctx.tenant.storeName}.`,
      '',
      lookup.terms.length ? `Searched for: ${lookup.terms.join(', ')}` : 'No searchable customer identifier was provided.',
      '',
      'Please check the customer email, phone, name, Customer ID, or linked order number and send it again.',
      '',
      'I only searched customers belonging to the authenticated current store.',
    ].join('\n'),
    actions: [{ label: 'Open Customers', path: '/admin/customers' }],
  };
}

function buildCustomerAmbiguousAnswer(ctx, lookup) {
  return {
    answer: [
      `I found multiple matching customers in ${ctx.tenant.storeName}.`,
      '',
      ...lookup.matches.map((customer, index) => `${index + 1}. ${customer.name} - ${customer.email} - ${customer.phone} - ${customer.isActive ? 'Active' : 'Inactive'}`),
      '',
      'Please send the exact customer email, phone number, or Customer ID so I can check the correct account.',
    ].join('\n'),
    actions: [{ label: 'Open Customers', path: '/admin/customers' }],
  };
}

function buildGuestCustomerAnswer(ctx, lookup) {
  const order = compactOrderDetail(lookup.order);
  return {
    answer: [
      `I found a linked order in ${ctx.tenant.storeName}, but I could not verify a registered customer account for it.`,
      '',
      'Customer Status:',
      '- Type: Guest order data',
      `- Linked Order: ${order.orderNumber || order.id}`,
      `- Order Status: ${order.orderStatus}`,
      `- Payment Status: ${order.paymentStatus}`,
      `- Customer Email: ${order.customerEmailPresent ? 'available on order' : 'not available on order'}`,
      `- Customer Phone: ${order.customerPhonePresent ? 'available on order' : 'not available on order'}`,
      '',
      'Cause:',
      '- This order may have been placed as a guest checkout, or the registered customer account is not linked to the order.',
      '',
      'Admin Navigation:',
      `Admin Panel -> Orders -> ${order.orderNumber || order.id}`,
      '',
      'Recommended Action:',
      '- Use the order details for order-specific support.',
      '- Ask the customer to register/login if they need account-based order history.',
    ].join('\n'),
    actions: [{ label: 'Open Orders', path: '/admin/orders' }],
  };
}

function buildCustomerLiveAnswer(ctx, customer, orders = [], mode = 'status') {
  const c = compactCustomerDetail(customer, orders);
  const currency = ctx.tenant.currency || 'LKR';
  const findings = [
    `Customer: ${c.name}`,
    `Email: ${c.email}`,
    `Phone: ${c.phone}`,
    `Account Status: ${c.isActive ? 'Active' : 'Inactive/Blocked'}`,
    `Email Verified: ${c.isVerified ? 'Yes' : 'No'}`,
    `Google Login Linked: ${c.googleLinked ? 'Yes' : 'No'}`,
    `Addresses: ${c.addressCount}${c.defaultAddressPresent ? ' (default set)' : ''}`,
    `Wishlist Items: ${c.wishlistCount}`,
    `Recent Orders Checked: ${c.recentOrderCount}`,
    `Verified Recent Spend: ${money(c.totalSpent, currency)}`,
    `Last Login: ${c.lastLogin ? new Date(c.lastLogin).toISOString().slice(0, 10) : 'not recorded'}`,
  ];

  let cause = 'The customer account exists in the authenticated current store.';
  const actions = [];
  if (mode === 'login') {
    if (!c.isActive) {
      cause = 'The customer account is inactive/blocked, so login may fail.';
      actions.push('Review the customer account status before reactivating access.');
    } else if (!c.isVerified) {
      cause = 'The account is active, but email verification is not completed.';
      actions.push('Ask the customer to verify their email or use the password reset/login flow if available.');
    } else {
      cause = 'The customer account is active. I could not verify password reset history or authentication error logs because those logs are not exposed through assistant tools yet.';
      actions.push('Ask the customer to use Forgot Password.');
      actions.push('Check backend auth logs if login still fails.');
    }
  } else {
    if (!c.isActive) actions.push('Review whether the account should remain inactive or be reactivated.');
    if (!c.isVerified) actions.push('Ask the customer to complete email verification if account features require it.');
    if (!c.recentOrderCount) actions.push('No recent registered/linked orders were found from the assistant customer lookup.');
  }

  if (!actions.length) actions.push('Review the customer profile and recent orders before taking any account action.');

  return {
    answer: [
      `I checked live customer data for ${ctx.tenant.storeName}.`,
      '',
      'Customer Status:',
      ...findings.map(item => `- ${item}`),
      '',
      'Confirmed Findings:',
      `- Registered customer account found in this store.`,
      c.latestOrder ? `- Latest linked order: ${c.latestOrder.orderNumber} - ${c.latestOrder.orderStatus} / ${c.latestOrder.paymentStatus}` : '- No linked recent order found in the assistant lookup.',
      '',
      `Cause: ${cause}`,
      '',
      'Admin Navigation:',
      'Admin Panel -> Customers -> Select Customer',
      '',
      'Recommended Action:',
      ...actions.map(item => `- ${item}`),
      '',
      'Expected Result:',
      '- After the correct account/status action is completed and verified, the customer should see the updated account behavior.',
    ].join('\n'),
    actions: [{ label: 'Open Customers', path: '/admin/customers' }],
  };
}

function buildListingIdeasAnswer(ctx) {
  const fastMoving = ctx.topProductsLast30Days.length
    ? ctx.topProductsLast30Days.filter(p => Number(p.quantity || 0) > 0)
    : ctx.topProductsBySoldCount.filter(p => Number(p.soldCount || 0) > 0).map(p => ({
      name: p.name,
      quantity: p.soldCount,
      stock: p.stock,
    }));

  if (fastMoving.length > 0) {
    return {
      answer: [
        `Based on ${ctx.tenant.storeName}'s store data, these are the best items to focus on now:`,
        ...fastMoving.slice(0, 8).map((p, i) => `${i + 1}. ${p.name}: ${p.quantity} units sold${p.stock !== undefined ? `, stock ${p.stock}` : ''}`),
        '',
        'List or promote these first because they already have sales movement. Also check stock before boosting them.',
      ].join('\n'),
      actions: [{ label: 'Open Products', path: '/admin/products' }, { label: 'Open Dashboard', path: '/admin' }],
    };
  }

  if (ctx.counts.productCount > 0) {
    return {
      answer: [
        `${ctx.tenant.storeName} has products, but there is not enough sales data yet to identify best items accurately.`,
        'For now, review active products in Admin -> Products and make sure each important item has:',
        '- clear product name',
        '- category',
        '- correct price',
        '- stock quantity',
        '- thumbnail image',
        '- full description',
        '- Active enabled',
        '',
        'After orders come in, ask "What are my fast-moving items?" and I can rank products from store data.',
      ].join('\n'),
      actions: [{ label: 'Open Products', path: '/admin/products' }],
    };
  }

  return {
    answer: [
      `${ctx.tenant.storeName} does not have product/sales data yet, so I cannot accurately say which items will sell best from this store data.`,
      'Start by listing products that your business actually has stock for. For each product, add name, category, price, stock, thumbnail, description, and keep it Active.',
      'After customers place orders, I can identify fast-moving items using real order data.',
    ].join('\n'),
    actions: [{ label: 'Open Products', path: '/admin/products' }],
  };
}

function buildHighRiskActionAnswer(ctx, risk) {
  const featureBlocked = risk.feature && !isFeatureEnabled(ctx, risk.feature);
  if (featureBlocked) return buildPlanRestrictionAnswer(ctx, risk.feature);

  if (!hasAssistantPermission(ctx, risk.action)) {
    return buildPermissionDeniedAnswer(ctx, risk.action);
  }

  return {
    answer: [
      `I can help with ${risk.action}, but this is a high-risk action and I will not perform it without explicit confirmation.`,
      '',
      'Before continuing, verify:',
      `- Store: ${ctx.tenant.storeName}`,
      `- Affected record type: ${risk.recordType}`,
      `- Current role: ${ctx.admin.role}`,
      `- Plan: ${ctx.tenant.planName}`,
      '',
      'Impact:',
      '- This may permanently change or remove StoreKit data.',
      '- It may affect storefront visibility, reporting, customer history, payments, or fulfilment.',
      '- Some actions may not be reversible without a backup.',
      '',
      'Send the exact record name/order number/ID and a clear confirmation like:',
      '`Confirm: delete this product`',
      '',
      'After confirmation, StoreKit must verify tenant ownership, permission, plan access, execute the action through the correct API, and verify the result.',
    ].join('\n'),
    actions: risk.feature ? [{ label: `Open ${featureName(risk.feature)}`, path: featureRoute(risk.feature) }] : [{ label: 'Open Dashboard', path: '/admin' }],
  };
}

function buildGreetingAnswer(ctx) {
  return {
    answer: [
      `Hi ${ctx.admin.name}. I am the official StoreKit AI Admin Assistant for ${ctx.tenant.storeName}.`,
      '',
      'I can guide you through StoreKit admin work and read this authenticated store data for operational answers.',
      '',
      'Examples I can answer accurately:',
      '- How do I add a product?',
      '- What are my fast-moving items?',
      '- Show low-stock products.',
      '- What is my plan usage?',
      '- How do I upload a payment slip?',
      '- How do I configure SEO?',
      '- How do I change the theme?',
      '',
      'For store-data questions, I only use the authenticated current store, so tenant data does not mix.',
    ].join('\n'),
    actions: [{ label: 'Open Dashboard', path: '/admin' }, { label: 'Open Products', path: '/admin/products' }],
  };
}

function buildFallbackAnswer(ctx) {
  return {
    answer: [
      `I do not have a verified StoreKit knowledge entry for that exact question yet, so I will not invent an answer.`,
      '',
      `What I can answer accurately for ${ctx.tenant.storeName}:`,
      '- How do I add a product?',
      '- What are my fast-moving items?',
      '- Show low-stock products.',
      '- What is my plan usage?',
      '- How do I upload a payment slip?',
      '- How do I configure SEO?',
      '- How do I change the theme?',
      '',
      'If your question needs a specific product, order, customer, domain, payment, or error, send the exact name, order number, or visible error message so I can check the right StoreKit area safely.',
    ].join('\n'),
    actions: [{ label: 'Open Dashboard', path: '/admin' }],
  };
}

function needsContextClarification(message, analysis, ctx) {
  if (!analysis?.hasContextReference) return false;
  if (['troubleshoot_product_visibility', 'troubleshoot_payment_status', 'troubleshoot_checkout_payment', 'settings_help', 'troubleshoot_settings', 'read_low_stock', 'troubleshoot_inventory', 'read_inventory_status', 'read_fast_moving_products', 'read_plan_usage', 'high_risk_action'].includes(analysis.intent)) return false;
  const hasPriorRefs = (ctx.page.conversation?.productRefs?.length || 0) > 0 || (ctx.page.conversation?.orderRefs?.length || 0) > 0;
  if (hasPriorRefs) return false;
  return textIncludesAny(message, ['this', 'that', 'same', 'previous', 'current', 'eka', 'meka', 'ara', 'මේක', 'ඒක', 'අර']);
}

function buildContextClarificationAnswer(ctx, analysis) {
  const moduleName = analysis.module === 'general' ? 'StoreKit record' : analysis.module;
  return {
    answer: [
      `I need one more detail to check the correct ${moduleName} in ${ctx.tenant.storeName}.`,
      '',
      'Please send the exact product name, order number, customer name, domain, or visible error message.',
      '',
      'I will use only the authenticated current store data when checking it.',
    ].join('\n'),
    actions: [{ label: 'Open Dashboard', path: '/admin' }],
  };
}

function detectAssistantLanguage(userMessage = '', history = []) {
  const text = String(userMessage || '').trim();
  const historyText = (Array.isArray(history) ? history : [])
    .slice(-4)
    .map(item => String(item?.content || ''))
    .join(' ');
  const combinedForFallback = `${text} ${historyText}`.trim();
  const explicit = text.toLowerCase();
  if (/\b(reply|respond|answer)\s+in\s+sinhala\b/i.test(text) || /සිංහලෙන්|sinhala walin|sinhala වලින්/i.test(text)) {
    return {
      code: 'sinhala',
      label: 'Sinhala',
      instruction: [
        'Reply in natural, grammatically correct Sinhala using Sinhala script.',
        'Do not produce broken machine-translated Sinhala.',
        `Keep these StoreKit UI/technical terms in English when they appear in English: ${PROTECTED_UI_TERMS.join(', ')}.`,
      ].join(' '),
    };
  }
  if (/\b(reply|respond|answer)\s+in\s+singlish\b/i.test(text) || /singlish walin|singlish වලින්/i.test(text)) {
    return {
      code: 'singlish',
      label: 'Singlish',
      instruction: [
        'Reply in natural Singlish: romanized Sinhala mixed with common StoreKit/admin English words.',
        'Use answer/instruction style, not question style.',
        'Use verbs like "open karanna", "click karanna", "fill karanna", "upload karanna", "save karanna".',
        `Keep these StoreKit UI/technical terms in English when they appear in English: ${PROTECTED_UI_TERMS.join(', ')}.`,
      ].join(' '),
    };
  }
  if (/\b(reply|respond|answer)\s+in\s+english\b/i.test(text) || /english walin|english වලින්/i.test(text)) {
    return {
      code: 'english',
      label: 'English',
      instruction: 'Reply in natural English. Do not translate into any other language.',
    };
  }

  const hasSinhalaScript = /[\u0D80-\u0DFF]/.test(text);
  const hasLatin = /[a-z]/i.test(text);
  const hasEnglishAdminTerms = /\b(product|order|customer|payment|settings|domain|plan|analytics|admin|super admin|save|active|draft|pending|paid|unpaid|api|webhook|dns|ssl|store|stock|login|report)\b/i.test(text);

  if (hasSinhalaScript) {
    return {
      code: hasEnglishAdminTerms || hasLatin ? 'sinhala_mixed' : 'sinhala',
      label: hasEnglishAdminTerms || hasLatin ? 'Mixed Sinhala and English' : 'Sinhala',
      instruction: [
        'Reply in natural, grammatically correct Sinhala using Sinhala script.',
        hasEnglishAdminTerms || hasLatin ? 'Use a natural Sinhala-English mixed style because the admin mixed languages.' : '',
        'Do not produce broken machine-translated Sinhala.',
        `Keep these StoreKit UI/technical terms in English when they appear in English: ${PROTECTED_UI_TERMS.join(', ')}.`,
      ].filter(Boolean).join(' '),
    };
  }

  const lower = text.toLowerCase();
  const singlishHints = [
    'kohomada', 'kohoma', 'mokakda', 'mokada', 'mata', 'meka', 'eka', 'oya',
    'kohomd', 'hari', 'puluwan', 'puluvanda', 'karanne', 'karanna', 'danne', 'danna', 'balanna',
    'ganna', 'hadanna', 'pennanna', 'kiyanna', 'thiyenne', 'nadda', 'wage',
    'mage', 'obage', 'danawa', 'danna one', 'shop eka', 'product eka', 'order eka', 'payment eka', 'stock eka',
    'penne na', 'pennanne na', 'wada na', 'wenne na', 'login wenna ba', 'save wenne na',
    'load wenne na', 'pay karala', 'paid una', 'unpaid kiyala', 'adui', 'kohenda', 'monawada',
    'nathuwa', 'nadda', 'thiyenawa', 'thiyenne', 'dila', 'gihin', 'baluwada',
  ];

  if (singlishHints.some(hint => lower.includes(hint))) {
    const englishTermCount = (lower.match(/\b(product|order|customer|payment|settings|domain|plan|analytics|admin|super admin|save|active|draft|pending|paid|unpaid|api|webhook|dns|ssl|store|stock|login|report)\b/g) || []).length;
    return {
      code: englishTermCount > 0 ? 'singlish_mixed' : 'singlish',
      label: englishTermCount > 0 ? 'Mixed Singlish and English' : 'Singlish',
      instruction: [
        'Reply in natural Singlish: romanized Sinhala mixed with common StoreKit/admin English words.',
        englishTermCount > 0 ? 'Use the same Singlish-English mixed style as the admin.' : '',
        'Use answer/instruction style, not question style.',
        'Use verbs like "open karanna", "click karanna", "fill karanna", "upload karanna", "save karanna".',
        'Do not write repeated question phrases like "karanne kohomada", "open karanne kohomada", or "click karanne kohomada".',
        'Do not use Spanish, Hindi, or Sinhala script unless the user used Sinhala script.',
        `Keep these StoreKit UI/technical terms in English when they appear in English: ${PROTECTED_UI_TERMS.join(', ')}.`,
      ].filter(Boolean).join(' '),
    };
  }

  if (text.length <= 12 && /[\u0D80-\u0DFF]/.test(combinedForFallback)) {
    return {
      code: 'sinhala_mixed',
      label: 'Mixed Sinhala and English',
      instruction: [
        'Reply in natural, grammatically correct Sinhala using Sinhala script.',
        'Use a natural Sinhala-English mixed style because recent conversation used Sinhala.',
        `Keep these StoreKit UI/technical terms in English when they appear in English: ${PROTECTED_UI_TERMS.join(', ')}.`,
      ].join(' '),
    };
  }

  if (text.length <= 12 && singlishHints.some(hint => combinedForFallback.toLowerCase().includes(hint))) {
    return {
      code: 'singlish_mixed',
      label: 'Mixed Singlish and English',
      instruction: [
        'Reply in natural Singlish: romanized Sinhala mixed with common StoreKit/admin English words.',
        'Use the recent conversation style for short follow-up messages.',
        `Keep these StoreKit UI/technical terms in English when they appear in English: ${PROTECTED_UI_TERMS.join(', ')}.`,
      ].join(' '),
    };
  }

  return {
    code: 'english',
    label: 'English',
    instruction: 'Reply in natural English. Do not translate into any other language.',
  };
}

function cleanLocalizedAssistantAnswer(text, languageCode) {
  let output = String(text || '')
    .replace(/^\s*(here is the translated answer|translated answer|translation)\s*:?\s*/i, '')
    .trim();

  if (languageCode.startsWith('singlish')) {
    output = output
      .replace(/\b(open|click|fill|upload|save|select|choose|set|review|publish|enable|disable|add|edit)\s+karanne\s+kohomada\b/gi, '$1 karanna')
      .replace(/\b(open|click|fill|upload|save|select|choose|set|review|publish|enable|disable|add|edit)\s+krnne\s+kohomd\b/gi, '$1 karanna')
      .replace(/\bkaranne\s+kohomada\b/gi, 'karanna')
      .replace(/\bkrnne\s+kohomd\b/gi, 'karanna')
      .replace(/\bkohomada\?\s*/gi, '')
      .replace(/\bkohomd\?\s*/gi, '')
      .replace(/\btenant\b/gi, 'store')
      .replace(/\s+\./g, '.')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  if (languageCode.startsWith('sinhala')) {
    output = output
      .replace(/\btenant\b/gi, 'store')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  return output;
}

async function localizeAssistantAnswer(answer, userMessage, ctx) {
  const language = detectAssistantLanguage(userMessage, [{ role: 'user', content: ctx?.page?.conversation?.recentSummary || '' }]);
  if (language.code === 'english') return answer;
  if (!process.env.OPENROUTER_API_KEY && !process.env.GEMINI_API_KEY) return answer;

  try {
    const localized = await callAI(
      [
        STOREKIT_ASSISTANT_CORE_POLICY,
        STOREKIT_ASSISTANT_TENANT_SECURITY_POLICY,
        STOREKIT_ASSISTANT_MULTILINGUAL_POLICY,
        STOREKIT_ASSISTANT_DATABASE_TOOL_POLICY,
        STOREKIT_ASSISTANT_PRODUCT_POLICY,
        STOREKIT_ASSISTANT_INVENTORY_POLICY,
        STOREKIT_ASSISTANT_ORDER_POLICY,
        STOREKIT_ASSISTANT_PAYMENT_POLICY,
        STOREKIT_ASSISTANT_NAVIGATION_POLICY,
        STOREKIT_ASSISTANT_SETTINGS_POLICY,
        STOREKIT_ASSISTANT_CUSTOMER_POLICY,
        language.instruction,
        'The admin asked a question; your response must be the answer.',
        'Return only the final assistant answer.',
        'Never start with phrases like "Here is the translated answer", "Translated answer", or language labels.',
        'Never translate into Spanish.',
        'Do not mention internal words such as "tenant" in the final answer. Say "store" instead if needed.',
        `Keep StoreKit menu names, button names, route names, field names, statuses, and technical terms in English when they are English in the source. Protected terms: ${PROTECTED_UI_TERMS.join(', ')}.`,
        'Keep every number, order number, product count, currency value, error code, API name, route, database value, status, and product name exactly the same.',
        'Understand spelling mistakes, incomplete commands, and informal wording without correcting the admin.',
        'Do not add tool-call claims. If the approved answer does not say live data was checked, do not say you checked it.',
        'Do not add new facts, new steps, or extra promises.',
      ].join(' '),
      [
        `User language mode: ${language.label}`,
        `Admin message: ${userMessage}`,
        '',
        'Authenticated StoreKit context available to the answer:',
        ctx ? buildAssistantContextSummary(ctx) : 'not provided',
        '',
        'Approved backend tools used:',
        (ctx?.toolResults || []).map(result => `${result.name}: ${result.status}${result.errorType ? ` (${result.errorType})` : ''}`).join(', ') || 'none',
        '',
        'Recent conversation context:',
        ctx?.page?.conversation?.recentSummary || 'none',
        '',
        'Approved StoreKit answer. Convert only the human explanation text to the requested language mode while preserving all facts:',
        answer,
      ].join('\n'),
      1200
    );
    return cleanLocalizedAssistantAnswer(localized, language.code) || answer;
  } catch (err) {
    console.warn('[AI assistant localization] skipped:', err.message);
    return answer;
  }
}

/* ══════════════════════════════════════════════════════════════════
   AI CALLERS
══════════════════════════════════════════════════════════════════ */

async function callOpenRouter(systemMsg, userMsg, maxTokens = 1000) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'HTTP-Referer':  process.env.FRONTEND_URL || 'https://storekit.local',
      'X-Title':       'StoreKit',
    },
    body: JSON.stringify({
      model:       'meta-llama/llama-3.1-8b-instruct',
      max_tokens:  maxTokens,
      temperature: 0.2,
      messages: [
        { role: 'system', content: systemMsg },
        { role: 'user',   content: userMsg   },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}

async function callGemini(prompt, maxTokens = 1000) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.2 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
}

async function callAI(systemMsg, userMsg, maxTokens = 1000) {
  if (process.env.OPENROUTER_API_KEY) {
    try {
      return await callOpenRouter(systemMsg, userMsg, maxTokens);
    } catch (err) {
      console.warn('[AI] OpenRouter failed, trying Gemini fallback:', err.message);
      if (process.env.GEMINI_API_KEY)
        return await callGemini(`${systemMsg}\n\n${userMsg}`, maxTokens);
      throw err;
    }
  }
  if (process.env.GEMINI_API_KEY)
    return callGemini(`${systemMsg}\n\n${userMsg}`, maxTokens);
  throw new Error('No AI key configured. Set OPENROUTER_API_KEY or GEMINI_API_KEY in your .env');
}

/* ── safe JSON extractor ── */
function extractJSON(raw, type = 'object') {
  const open  = type === 'array' ? '[' : '{';
  const close = type === 'array' ? ']' : '}';
  const start = raw.indexOf(open);
  const end   = raw.lastIndexOf(close);
  if (start === -1 || end === -1 || end <= start)
    throw new Error(`No JSON ${type} in response: ` + raw.slice(0, 120));
  return JSON.parse(raw.slice(start, end + 1));
}

/* ══════════════════════════════════════════════════════════════════
   POST /api/ai/autofill  →  { brand, shortDescription }
   shortDescription is SEO-optimised: 110-155 chars, buying-intent,
   Sri Lanka market signals, Google-ready.
══════════════════════════════════════════════════════════════════ */
router.post('/autofill', async (req, res) => {
  const { name, category, brand: existingBrand, price, salePrice } = req.body;
  if (!name || name.trim().length < 3)
    return res.status(400).json({ message: 'Product name too short' });

  const n = name.trim();

  const ctxLines = [
    existingBrand && `Brand: ${existingBrand}`,
    category      && `Category: ${category}`,
    price         && `Price: Rs.${price}${salePrice ? ` (sale Rs.${salePrice})` : ''}`,
  ].filter(Boolean).join('\n');

  const systemMsg = 'You are an expert e-commerce SEO copywriter for a Sri Lankan online store. You output ONLY valid JSON. No markdown. No explanation.';

  const userMsg = [
    `Generate autofill fields for this product on storekit.local (Sri Lanka e-commerce).`,
    ``,
    `Product name: "${n}"`,
    ctxLines ? `Context:\n${ctxLines}` : '',
    ``,
    `Reply ONLY with this JSON, nothing else:`,
    `{"brand":"BRAND_HERE","shortDescription":"DESC_HERE"}`,
    ``,
    `BRAND_HERE rules:`,
    `- The manufacturer/brand name (extract from product name or context)`,
    `- Empty string "" if genuinely unknown`,
    ``,
    `DESC_HERE rules — this appears directly in Google search results:`,
    `- Length: 110-155 characters EXACTLY`,
    `- Open with the key feature or benefit — NOT the product name`,
    `- Include ONE buying-intent phrase: "buy online in Sri Lanka", "best price in Sri Lanka", or "fast delivery across Sri Lanka"`,
    `- Mention a real spec or use-case that differentiates this product`,
    `- End with: "Fast delivery across Sri Lanka." or "Order now at StoreKit."`,
    `- Plain English only — no markdown, no asterisks, no ALL CAPS, no emoji`,
    `- Do NOT open with the brand name or product name`,
    `- Do NOT use vague filler like "high quality", "perfect for everyone"`,
    ``,
    `GOOD example for "Sony XV800 X-Series Wireless Party Speaker":`,
    `"Powerful 360-degree party sound with built-in mic input, LED lighting and IPX4 splash-proof body. Buy the Sony XV800 online with fast delivery across Sri Lanka."`,
    ``,
    `BAD example (too short, generic, no Sri Lanka signal):`,
    `"Wireless party speaker with great sound quality."`,
  ].filter(s => s !== undefined).join('\n');

  try {
    const raw    = await callAI(systemMsg, userMsg, 500);
    const parsed = extractJSON(raw, 'object');

    const shortDescription = (parsed.shortDescription || '').trim();
    if (shortDescription.length < 50) {
      console.warn('[AI /autofill] shortDescription too short (' + shortDescription.length + ' chars):', shortDescription);
    }

    res.json({
      brand:            (parsed.brand            || '').trim(),
      shortDescription: shortDescription,
    });
  } catch (err) {
    console.error('[AI /autofill]', err.message);
    res.status(500).json({ message: 'AI autofill failed: ' + err.message });
  }
});

/* ══════════════════════════════════════════════════════════════════
   POST /api/ai/tags  →  { tags: string[] }
   HIGH-QUALITY SEO tags — buyer-intent + long-tail keywords
══════════════════════════════════════════════════════════════════ */
router.post('/tags', async (req, res) => {
  const { name, category, brand, description, price } = req.body;
  if (!name || name.trim().length < 3)
    return res.status(400).json({ message: 'Product name too short' });

  const ctx = [
    name,
    brand     && `Brand: ${brand}`,
    category  && `Category: ${category}`,
    price     && `Price: Rs.${price}`,
    description && `Description snippet: ${String(description).replace(/<[^>]+>/g,'').slice(0,200)}`,
  ].filter(Boolean).join('\n');

  const systemMsg = 'You are an expert e-commerce SEO specialist. You output ONLY valid JSON arrays. No markdown. No explanation.';
  const userMsg = `Generate 15 high-value SEO search tags for this Sri Lankan e-commerce product. 

Product info:
${ctx}

Rules:
- Mix of: exact product keywords, buyer-intent phrases, long-tail variations, brand+product combos, category terms
- Include Sri Lanka / LK specific buying terms where relevant (e.g. "buy in sri lanka", "colombo delivery")
- Tags must be what real shoppers TYPE into Google/search bars
- All lowercase, no special characters except hyphens
- 1 to 4 words each — no full sentences

Reply ONLY with a JSON array of 15 strings:
["tag1","tag2","tag3","tag4","tag5","tag6","tag7","tag8","tag9","tag10","tag11","tag12","tag13","tag14","tag15"]`;

  try {
    const raw  = await callAI(systemMsg, userMsg, 600);
    console.log('[AI tags raw]', raw);
    const arr  = extractJSON(raw, 'array');
    const tags = Array.isArray(arr)
      ? arr.map(t => String(t).trim().toLowerCase().replace(/[^a-z0-9\s\-]/g, '')).filter(t => t.length > 1).slice(0, 15)
      : [];
    if (tags.length === 0) throw new Error('AI returned empty tags');
    res.json({ tags });
  } catch (err) {
    console.error('[AI /tags]', err.message);
    res.status(500).json({ message: 'AI tag suggestion failed: ' + err.message });
  }
});

/* ══════════════════════════════════════════════════════════════════
   POST /api/ai/seo  →  { metaTitle, metaDesc, focusKeyword, schema }
   Full on-page SEO package for a product
══════════════════════════════════════════════════════════════════ */
router.post('/seo', async (req, res) => {
  const { name, category, brand, description, price, salePrice, sku, tags, slug } = req.body;
  if (!name || name.trim().length < 3)
    return res.status(400).json({ message: 'Product name too short' });

  const siteUrl   = (process.env.FRONTEND_URL || 'https://storekit.local').replace(/\/$/, '');
  const productUrl = `${siteUrl}/product/${slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  const descText  = String(description || '').replace(/<[^>]+>/g, '').slice(0, 300);
  const tagList   = Array.isArray(tags) ? tags.join(', ') : tags || '';

  const systemMsg = 'You are a senior SEO expert specialising in e-commerce. Output ONLY valid JSON. No markdown fences. No explanation.';
  const userMsg = `Create a complete SEO package for this product listed on a Sri Lankan online store (storekit.local).

Product details:
- Name: ${name}
- Brand: ${brand || 'unknown'}
- Category: ${category || 'General'}
- Price: Rs.${price}${salePrice ? ` (Sale: Rs.${salePrice})` : ''}
- SKU: ${sku || 'N/A'}
- Tags: ${tagList}
- Description snippet: ${descText}
- Product URL: ${productUrl}

Return ONLY this JSON (fill every field, no nulls):
{
  "metaTitle": "...",
  "metaDesc": "...",
  "focusKeyword": "...",
  "secondaryKeywords": ["...", "..."],
  "schema": {}
}

Rules:
- metaTitle: 50–60 chars, include main keyword + brand if space allows + "| StoreKit" suffix
- metaDesc: 140–160 chars, include focus keyword naturally, mention Sri Lanka / fast delivery, add a call to action
- focusKeyword: the single best keyword a shopper would use to find this exact product
- secondaryKeywords: 5 related long-tail keyword phrases (what people also search)
- schema: complete JSON-LD Product schema object (type Product) with name, description, brand, offers (price, priceCurrency LKR, availability, url), image placeholder "IMAGE_URL", sku`;

  try {
    const raw    = await callAI(systemMsg, userMsg, 1200);
    console.log('[AI seo raw]', raw);
    const parsed = extractJSON(raw, 'object');

    // Validate and sanitize
    const result = {
      metaTitle:         (parsed.metaTitle         || `${name} | StoreKit`).slice(0, 70),
      metaDesc:          (parsed.metaDesc           || '').slice(0, 165),
      focusKeyword:      (parsed.focusKeyword       || name).toLowerCase(),
      secondaryKeywords: Array.isArray(parsed.secondaryKeywords) ? parsed.secondaryKeywords.slice(0, 5) : [],
      schema:            parsed.schema              || {},
    };

    res.json(result);
  } catch (err) {
    console.error('[AI /seo]', err.message);
    res.status(500).json({ message: 'AI SEO generation failed: ' + err.message });
  }
});

/* ══════════════════════════════════════════════════════════════════
   POST /api/ai/description  →  { description: "<html>..." }
   Full long-form product description in the fixed marketing format:
   Title line, intro paragraph, "Key Features" bullets, "Product
   Description" paragraphs (with related-search keywords woven in),
   "Ideal For" bullets, closing line. Returned as ready-to-use HTML
   for the rich-text editor.
══════════════════════════════════════════════════════════════════ */
router.post('/description', async (req, res) => {
  const { name, category, brand, sku, price, salePrice, shortDescription, tags } = req.body;
  if (!name || name.trim().length < 3)
    return res.status(400).json({ message: 'Product name too short' });

  const ctxLines = [
    brand            && `Brand: ${brand}`,
    category         && `Category: ${category}`,
    sku              && `Model / SKU: ${sku}`,
    price            && `Price: Rs.${price}${salePrice ? ` (sale Rs.${salePrice})` : ''}`,
    shortDescription && `Short description: ${shortDescription}`,
    tags             && `Existing tags/keywords: ${Array.isArray(tags) ? tags.join(', ') : tags}`,
  ].filter(Boolean).join('\n');

  const systemMsg = 'You are an expert e-commerce copywriter for a Sri Lankan online store. You output ONLY valid HTML for a product description. No markdown, no code fences, no explanation, no <html>/<body> wrapper — just the inner HTML fragment.';

  const userMsg = [
    `Write a long-form product description for "${name.trim()}" for storekit.local.`,
    ctxLines ? `\nProduct context:\n${ctxLines}` : '',
    ``,
    `Return ONLY an HTML fragment using EXACTLY this structure and tags (fill in real content, keep the section order and headings):`,
    ``,
    `<h3>{Catchy SEO title for the product, ~60-90 chars, may include the product/model name}</h3>`,
    `<p>{1-2 sentence intro paragraph describing what the product is and its main benefit/technology}</p>`,
    `<h4 style="margin-top:1.25em;margin-bottom:0.5em;">Key Features</h4>`,
    `<ul>`,
    `<li>{feature 1}</li>`,
    `<li>{feature 2}</li>`,
    `... (8-10 short feature bullets total, each 3-8 words)`,
    `</ul>`,
    `<h4 style="margin-top:1.25em;margin-bottom:0.5em;">Product Description</h4>`,
    `<p>{paragraph 1: 2-3 sentences expanding on the product's purpose and what kind of buyer it suits}</p>`,
    `<p>{paragraph 2: 1-2 sentences that naturally weave in 5-8 related search terms a shopper might type, phrased like "This product is perfect for customers searching for X, Y, Z, ..."}</p>`,
    `<p>{paragraph 3: 1-2 sentences about ideal usage settings (home/office/etc) and the overall value proposition}</p>`,
    `<h4 style="margin-top:1.25em;margin-bottom:0.5em;">Ideal For</h4>`,
    `<ul>`,
    `<li>{use case 1}</li>`,
    `<li>{use case 2}</li>`,
    `... (4-6 short "ideal for" bullets total, each 2-6 words)`,
    `</ul>`,
    `<p>{1 short closing sentence that reinforces the key benefit and ends with the product name}</p>`,
    ``,
    `Rules:`,
    `- Plain factual marketing tone, no emojis, no asterisks, no markdown.`,
    `- Use EXACTLY these h4 tags with their style attributes as shown above — do not change or omit the style attribute.`,
    `- Use the exact tag names <h3>, <p>, <h4>, <ul>, <li> only — no extra attributes, classes, or wrapper divs except the style on h4.`,
    `- Do not invent specific technical specs that weren't provided — keep features plausible and generic to the product type if details are missing.`,
    `- Output must start with <h3> and contain nothing before or after the HTML fragment.`,
  ].filter(s => s !== undefined).join('\n');

  try {
    let html = await callAI(systemMsg, userMsg, 1200);

    // Strip accidental code fences / wrappers if the model adds them
    html = html.trim()
      .replace(/^```(?:html)?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    const start = html.indexOf('<h3');
    if (start === -1) throw new Error('AI did not return expected HTML structure');
    html = html.slice(start).trim();

    res.json({ description: html });
  } catch (err) {
    console.error('[AI /description]', err.message);
    res.status(500).json({ message: 'AI description generation failed: ' + err.message });
  }
});

/* ══════════════════════════════════════════════════════════════════
   GET /api/ai/status
══════════════════════════════════════════════════════════════════ */
router.get('/status', (req, res) => {
  if (process.env.OPENROUTER_API_KEY) return res.json({ provider: 'openrouter', status: 'ok' });
  if (process.env.GEMINI_API_KEY)     return res.json({ provider: 'gemini',     status: 'ok' });
  res.status(500).json({ provider: 'none', status: 'error' });
});

/* ══════════════════════════════════════════════════════════════════
   POST /api/ai/specs  →  { specs: [{ key, value }] }
   Generates a full product specifications table in the same format
   as the SpecsPanel — ordered rows of { key, value } pairs covering
   brand, model, connectivity, dimensions, safety, warranty, etc.
══════════════════════════════════════════════════════════════════ */
router.post('/specs', async (req, res) => {
  const { name, category, brand, sku, price, salePrice, description } = req.body;
  if (!name || name.trim().length < 3)
    return res.status(400).json({ message: 'Product name too short' });

  const ctxLines = [
    brand       && `Brand: ${brand}`,
    category    && `Category: ${category}`,
    sku         && `Model / SKU: ${sku}`,
    price       && `Price: Rs.${price}${salePrice ? ` (sale Rs.${salePrice})` : ''}`,
    description && `Description snippet: ${String(description).replace(/<[^>]+>/g, '').slice(0, 300)}`,
  ].filter(Boolean).join('\n');

  const systemMsg = 'You are an expert e-commerce product data specialist. You output ONLY valid JSON arrays. No markdown, no code fences, no explanation.';

  const userMsg = [
    `Generate a complete product specifications table for "${name.trim()}" on storekit.local.`,
    ctxLines ? `\nProduct context:\n${ctxLines}` : '',
    ``,
    `Reply ONLY with a JSON array of objects, each with "key" and "value" string fields, nothing else.`,
    `Example format:`,
    `[{"key":"Brand","value":"UGREEN"},{"key":"Model","value":"W707"},{"key":"Charging Standard","value":"Qi2 Certified"}]`,
    ``,
    `SPEC RULES:`,
    `- Always start with: Brand, Model (if known), Part Number / SKU (if known), Product Type`,
    `- Include all relevant technical specifications appropriate for this product category`,
    `- For CHARGERS/POWER: include Charging Standard, Output Power (per port), Input Interface, Cable Length/Type, Certifications, Safety Features, Compatibility`,
    `- For SMARTPHONES: include Display, Processor, RAM, Storage, Battery, Camera, OS, Connectivity, Dimensions, Weight`,
    `- For AUDIO: include Driver Size, Frequency Response, Impedance, Connectivity, Battery Life, Codec Support, Noise Cancellation`,
    `- For LAPTOPS/COMPUTERS: include Processor, RAM, Storage, Display, GPU, OS, Ports, Battery, Weight`,
    `- For ACCESSORIES: include Material, Compatibility, Dimensions/Size, Color, Certifications`,
    `- Always end with: Color (if applicable), Certifications (if applicable), Warranty`,
    `- Use factual spec names (e.g. "Phone Charging Output" not "Output") — be specific and professional`,
    `- Values must be concise but complete (e.g. "Up to 15W" not just "15W"; "Overcharge, Overcurrent, Overheat Protection" not "Yes")`,
    `- Include 12–25 spec rows depending on product complexity`,
    `- Do NOT invent specific model numbers or certifications not inferable from the product name — use generic accurate values`,
    `- Do NOT include price, availability, or shipping info`,
  ].filter(s => s !== undefined).join('\n');

  try {
    const raw    = await callAI(systemMsg, userMsg, 1200);
    const parsed = extractJSON(raw, 'array');

    // Validate and clean: must be array of { key, value }
    const specs = parsed
      .filter(item => item && typeof item.key === 'string' && typeof item.value === 'string')
      .map(item => ({ key: item.key.trim(), value: item.value.trim() }))
      .filter(item => item.key && item.value);

    if (specs.length === 0) throw new Error('AI returned no valid specs');

    res.json({ specs });
  } catch (err) {
    console.error('[AI /specs]', err.message);
    res.status(500).json({ message: 'AI spec generation failed: ' + err.message });
  }
});

/* ══════════════════════════════════════════════════════════════════
   POST /api/ai/assistant
   Floating admin assistant: grounded StoreKit help + store data.
══════════════════════════════════════════════════════════════════ */
router.post('/assistant', async (req, res) => {
  const message = String(req.body?.message || '').trim();
  if (!message) return res.status(400).json({ message: 'Message is required' });

  const tenantId = req.user?.tenantId || req.tenantId;
  if (!tenantId) {
    return res.status(400).json({
      message: 'Store context could not be verified. Please reload the admin panel or sign in again before using the assistant.',
    });
  }

  try {
    const pageContext = compactPageContext(req.body || {});
    const ctx = await loadAssistantContext(tenantId, req.user, pageContext);
    if (!ctx) {
      return res.status(404).json({
        message: 'Store context could not be verified. Please reload the admin panel or sign in again before using the assistant.',
      });
    }
    ctx.messageAnalysis = classifyAssistantMessage(message, req.body?.history || []);

    let result;
    const lower = message.toLowerCase();
    const highRiskAction = detectHighRiskAction(message);

    if (needsContextClarification(message, ctx.messageAnalysis, ctx)) {
      result = buildContextClarificationAnswer(ctx, ctx.messageAnalysis);
    } else if (highRiskAction) {
      result = buildHighRiskActionAnswer(ctx, highRiskAction);
    } else if (GREETING_WORDS.includes(lower) || GREETING_WORDS.includes(lower.replace(/[^\w]+/g, ''))) {
      result = buildGreetingAnswer(ctx);
    } else if (textIncludesAny(lower, INTENT_PHRASES.fastMoving)) {
      result = isFeatureEnabled(ctx, INTENT_FEATURE_REQUIREMENTS.fastMoving)
        ? buildFastMovingAnswer(ctx)
        : buildPlanRestrictionAnswer(ctx, INTENT_FEATURE_REQUIREMENTS.fastMoving);
    } else if (ctx.messageAnalysis.intent === 'troubleshoot_inventory' || ctx.messageAnalysis.intent === 'read_inventory_status') {
      if (!isFeatureEnabled(ctx, 'products')) {
        result = buildPlanRestrictionAnswer(ctx, 'products');
      } else {
        const lookup = await resolveProductForAssistant(ctx, message);
        ctx.toolResults.push(...(lookup.toolResults || []));
        if (lookup.status === 'found') {
          result = buildInventoryLiveAnswer(
            ctx,
            lookup.product,
            ctx.messageAnalysis.intent === 'troubleshoot_inventory' ? 'troubleshoot' : 'status'
          );
        } else if (lookup.status === 'ambiguous') result = buildProductAmbiguousAnswer(ctx, lookup);
        else if (lookup.status === 'not_found') result = buildProductNotFoundAnswer(ctx, lookup);
        else result = buildInventoryLookupClarificationAnswer(ctx);
      }
    } else if (textIncludesAny(lower, INTENT_PHRASES.lowStock)) {
      result = isFeatureEnabled(ctx, INTENT_FEATURE_REQUIREMENTS.lowStock)
        ? buildLowStockAnswer(ctx)
        : buildPlanRestrictionAnswer(ctx, INTENT_FEATURE_REQUIREMENTS.lowStock);
    } else if (ctx.messageAnalysis.intent === 'troubleshoot_product_visibility') {
      if (!isFeatureEnabled(ctx, 'products')) {
        result = buildPlanRestrictionAnswer(ctx, 'products');
      } else {
        const lookup = await resolveProductForAssistant(ctx, message);
        ctx.toolResults.push(...(lookup.toolResults || []));
        if (lookup.status === 'found') result = buildProductVisibilityLiveAnswer(ctx, lookup.product);
        else if (lookup.status === 'ambiguous') result = buildProductAmbiguousAnswer(ctx, lookup);
        else if (lookup.status === 'not_found') result = buildProductNotFoundAnswer(ctx, lookup);
        else result = buildProductLookupClarificationAnswer(ctx);
      }
    } else if (ctx.messageAnalysis.intent === 'troubleshoot_payment_status' || ctx.messageAnalysis.intent === 'read_order_status') {
      if (!isFeatureEnabled(ctx, 'orders')) {
        result = buildPlanRestrictionAnswer(ctx, 'orders');
      } else {
        const lookup = await resolveOrderForAssistant(ctx, message);
        ctx.toolResults.push(...(lookup.toolResults || []));
        if (lookup.status === 'found' && ctx.messageAnalysis.intent === 'troubleshoot_payment_status') {
          const [gatewayResult, returnResult] = await Promise.all([
            ctx.tools.getPaymentGateways(),
            ctx.tools.getReturnRequestsForOrder(lookup.order._id),
          ]);
          ctx.toolResults.push(
            { name: gatewayResult.name, status: gatewayResult.status, errorType: gatewayResult.error?.type || null, checkedAt: gatewayResult.checkedAt },
            { name: returnResult.name, status: returnResult.status, errorType: returnResult.error?.type || null, checkedAt: returnResult.checkedAt }
          );
          result = buildPaymentLiveAnswer(ctx, lookup.order, gatewayResult, returnResult);
        } else if (lookup.status === 'found') result = buildOrderLiveAnswer(ctx, lookup.order, 'status');
        else if (lookup.status === 'ambiguous') result = buildOrderAmbiguousAnswer(ctx, lookup);
        else if (lookup.status === 'not_found') result = buildOrderNotFoundAnswer(ctx, lookup);
        else result = buildOrderLookupClarificationAnswer(ctx);
      }
    } else if (ctx.messageAnalysis.intent === 'troubleshoot_checkout_payment') {
      const gatewayResult = await ctx.tools.getPaymentGateways();
      ctx.toolResults.push({
        name: gatewayResult.name,
        status: gatewayResult.status,
        errorType: gatewayResult.error?.type || null,
        checkedAt: gatewayResult.checkedAt,
      });
      result = buildPaymentCheckoutGatewayAnswer(ctx, gatewayResult);
    } else if (ctx.messageAnalysis.intent === 'settings_help' || ctx.messageAnalysis.intent === 'troubleshoot_settings') {
      const tab = resolveSettingsTab(message).match;
      const [settingsResult, gatewayResult, deliveryResult, pagesResult] = await Promise.all([
        ctx.tools.getStoreSettings(),
        ctx.tools.getPaymentGateways(),
        ctx.tools.getDeliveryServices(),
        ctx.tools.getBusinessPages(),
      ]);
      ctx.toolResults.push(
        { name: settingsResult.name, status: settingsResult.status, errorType: settingsResult.error?.type || null, checkedAt: settingsResult.checkedAt },
        { name: gatewayResult.name, status: gatewayResult.status, errorType: gatewayResult.error?.type || null, checkedAt: gatewayResult.checkedAt },
        { name: deliveryResult.name, status: deliveryResult.status, errorType: deliveryResult.error?.type || null, checkedAt: deliveryResult.checkedAt },
        { name: pagesResult.name, status: pagesResult.status, errorType: pagesResult.error?.type || null, checkedAt: pagesResult.checkedAt }
      );
      result = buildSettingsAnswer(ctx, tab, settingsResult, gatewayResult, deliveryResult, pagesResult, ctx.messageAnalysis.intent === 'troubleshoot_settings' ? 'troubleshoot' : 'help');
    } else if (ctx.messageAnalysis.intent === 'navigation_help') {
      const routesResult = await ctx.tools.getAdminRoutes();
      ctx.toolResults.push({
        name: routesResult.name,
        status: routesResult.status,
        errorType: routesResult.error?.type || null,
        checkedAt: routesResult.checkedAt,
      });
      result = buildNavigationAnswer(ctx, resolveNavigationItem(message, ctx));
    } else if (ctx.messageAnalysis.intent === 'troubleshoot_customer_login' || ctx.messageAnalysis.intent === 'read_customer_status') {
      if (!isFeatureEnabled(ctx, 'customers')) {
        result = buildPlanRestrictionAnswer(ctx, 'customers');
      } else {
        const lookup = await resolveCustomerForAssistant(ctx, message);
        ctx.toolResults.push(...(lookup.toolResults || []));
        if (lookup.status === 'found') result = buildCustomerLiveAnswer(ctx, lookup.customer, lookup.orders, ctx.messageAnalysis.intent === 'troubleshoot_customer_login' ? 'login' : 'status');
        else if (lookup.status === 'guest_only') result = buildGuestCustomerAnswer(ctx, lookup);
        else if (lookup.status === 'ambiguous') result = buildCustomerAmbiguousAnswer(ctx, lookup);
        else if (lookup.status === 'not_found') result = buildCustomerNotFoundAnswer(ctx, lookup);
        else result = buildCustomerLookupClarificationAnswer(ctx);
      }
    } else if (ctx.messageAnalysis.intent === 'read_product_count') {
      result = isFeatureEnabled(ctx, 'products')
        ? buildProductCountAnswer(ctx)
        : buildPlanRestrictionAnswer(ctx, 'products');
    } else if (textIncludesAny(lower, INTENT_PHRASES.usage)) {
      result = buildUsageAnswer(ctx);
    } else if (textIncludesAny(lower, INTENT_PHRASES.listingIdeas)) {
      result = isFeatureEnabled(ctx, INTENT_FEATURE_REQUIREMENTS.listingIdeas)
        ? buildListingIdeasAnswer(ctx)
        : buildPlanRestrictionAnswer(ctx, INTENT_FEATURE_REQUIREMENTS.listingIdeas);
    } else {
      const knowledge = matchKnowledge(message);
      if (knowledge) {
        const featureKey = KNOWLEDGE_FEATURE_REQUIREMENTS[knowledge.id];
        result = isFeatureEnabled(ctx, featureKey)
          ? { answer: knowledge.answer, actions: knowledge.action ? [knowledge.action] : [] }
          : buildPlanRestrictionAnswer(ctx, featureKey);
      } else {
        result = buildFallbackAnswer(ctx);
      }
    }

    const localized = await localizeAssistantAnswer(result.answer, message, ctx);
    res.json({
      answer: localized,
      actions: result.actions || [],
      data: {
        storeName: ctx.tenant.storeName,
        planName: ctx.tenant.planName,
        tenantStatus: ctx.tenant.status,
        adminRole: ctx.admin.role,
        permissionsKnown: ctx.admin.permissionsKnown,
        enabledFeatures: Object.fromEntries(Object.entries(ctx.tenant.planFeatures || {}).filter(([, enabled]) => !!enabled)),
        currentRoute: ctx.page.currentRoute,
        messageAnalysis: ctx.messageAnalysis,
        liveData: {
          required: !!ctx.messageAnalysis.liveDataRequired,
          toolsUsed: ctx.toolResults || [],
          approvedTools: APPROVED_ASSISTANT_TOOLS,
        },
        counts: ctx.counts,
      },
    });
  } catch (err) {
    console.error('[AI /assistant]', err);
    res.status(500).json({ message: 'Assistant failed: ' + err.message });
  }
});


/* ── generateProductDescription — exported helper for scrape.js ──────────────
 * Generates a fully formatted HTML product description using the same
 * AI prompt as POST /api/ai/description, but callable directly from
 * other backend modules without going through HTTP.
 *
 * Usage in scrape.js:
 *   const { generateProductDescription } = require('./ai');
 *   const html = await generateProductDescription({ name, brand, sku, price });
 * ─────────────────────────────────────────────────────────────────────────── */
async function generateProductDescription({ name = '', category = '', brand = '', sku = '', price = '', salePrice = '', shortDescription = '', tags = [] } = {}) {
  if (!name || name.trim().length < 3) throw new Error('Product name too short');

  // Auto-generate brand if not provided — extract it from product name via AI
  if (!brand) {
    try {
      const brandSystemMsg = 'You are an expert e-commerce product data assistant. You output ONLY valid JSON. No markdown. No explanation.';
      const brandUserMsg = `Extract the manufacturer brand name from this product name: "${name.trim()}"\n\nReply ONLY with this JSON: {"brand":"BRAND_HERE"}\n\nRules:\n- BRAND_HERE must be the manufacturer/brand name extracted from the product name\n- Use empty string "" only if genuinely impossible to determine\n- Do NOT include model numbers, series names, or descriptive words — only the brand`;
      const brandRaw = await callAI(brandSystemMsg, brandUserMsg, 100);
      const brandParsed = extractJSON(brandRaw, 'object');
      brand = (brandParsed.brand || '').trim();
    } catch (_) {
      // Brand extraction is non-fatal — continue without it
    }
  }

  const ctxLines = [
    brand            && `Brand: ${brand}`,
    category         && `Category: ${category}`,
    sku              && `Model / SKU: ${sku}`,
    price            && `Price: Rs.${price}${salePrice ? ` (sale Rs.${salePrice})` : ''}`,
    shortDescription && `Short description: ${shortDescription}`,
    tags && tags.length && `Existing tags/keywords: ${Array.isArray(tags) ? tags.join(', ') : tags}`,
  ].filter(Boolean).join('\n');

  const systemMsg = 'You are an expert e-commerce copywriter for a Sri Lankan online store. You output ONLY valid HTML for a product description. No markdown, no code fences, no explanation, no <html>/<body> wrapper — just the inner HTML fragment.';

  const userMsg = [
    `Write a long-form product description for "${name.trim()}" for storekit.local.`,
    ctxLines ? `\nProduct context:\n${ctxLines}` : '',
    '',
    'Return ONLY an HTML fragment using EXACTLY this structure and tags (fill in real content, keep the section order and headings):',
    '',
    '<h3>{Catchy SEO title for the product, ~60-90 chars, may include the product/model name}</h3>',
    '<p>{1-2 sentence intro paragraph describing what the product is and its main benefit/technology}</p>',
    '<h4 style="margin-top:1.25em;margin-bottom:0.5em;">Key Features</h4>',
    '<ul>',
    '<li>{feature 1}</li>',
    '<li>{feature 2}</li>',
    '... (8-10 short feature bullets total, each 3-8 words)',
    '</ul>',
    '<h4 style="margin-top:1.25em;margin-bottom:0.5em;">Product Description</h4>',
    '<p>{paragraph 1: 2-3 sentences expanding on the product\'s purpose and what kind of buyer it suits}</p>',
    '<p>{paragraph 2: 1-2 sentences that naturally weave in 5-8 related search terms a shopper might type, phrased like "This product is perfect for customers searching for X, Y, Z, ..."}</p>',
    '<p>{paragraph 3: 1-2 sentences about ideal usage settings (home/office/etc) and the overall value proposition}</p>',
    '<h4 style="margin-top:1.25em;margin-bottom:0.5em;">Ideal For</h4>',
    '<ul>',
    '<li>{use case 1}</li>',
    '<li>{use case 2}</li>',
    '... (4-6 short "ideal for" bullets total, each 2-6 words)',
    '</ul>',
    '<p>{1 short closing sentence that reinforces the key benefit and ends with the product name}</p>',
    '',
    'Rules:',
    '- Plain factual marketing tone, no emojis, no asterisks, no markdown.',
    '- Use EXACTLY these h4 tags with their style attributes as shown above — do not change or omit the style attribute.',
    '- Use the exact tag names <h3>, <p>, <h4>, <ul>, <li> only — no extra attributes, classes, or wrapper divs except the style on h4.',
    '- Do not invent specific technical specs that were not provided — keep features plausible and generic to the product type if details are missing.',
    '- Output must start with <h3> and contain nothing before or after the HTML fragment.',
  ].filter(s => s !== undefined).join('\n');

  let html = await callAI(systemMsg, userMsg, 1200);

  // Strip accidental code fences the model may add
  html = html.trim()
    .replace(/^```(?:html)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  const start = html.indexOf('<h3');
  if (start === -1) throw new Error('AI did not return expected HTML structure');
  return html.slice(start).trim();
}

/* ── generateProductSpecs — exported helper for scrape.js ───────────────────
 * Generates a specifications array [{ key, value }] using the same AI prompt
 * as POST /api/ai/specs, callable directly from other backend modules.
 *
 * Usage in scrape.js:
 *   const { generateProductSpecs } = require('./ai');
 *   const specs = await generateProductSpecs({ name, brand, sku, category });
 * ─────────────────────────────────────────────────────────────────────────── */
async function generateProductSpecs({ name = '', category = '', brand = '', sku = '', price = '', salePrice = '', description = '' } = {}) {
  if (!name || name.trim().length < 3) throw new Error('Product name too short');

  const ctxLines = [
    brand       && `Brand: ${brand}`,
    category    && `Category: ${category}`,
    sku         && `Model / SKU: ${sku}`,
    price       && `Price: Rs.${price}${salePrice ? ` (sale Rs.${salePrice})` : ''}`,
    description && `Description snippet: ${String(description).replace(/<[^>]+>/g, '').slice(0, 300)}`,
  ].filter(Boolean).join('\n');

  const systemMsg = 'You are an expert e-commerce product data specialist. You output ONLY valid JSON arrays. No markdown, no code fences, no explanation.';

  const userMsg = [
    `Generate a complete product specifications table for "${name.trim()}" on storekit.local.`,
    ctxLines ? `\nProduct context:\n${ctxLines}` : '',
    '',
    'Reply ONLY with a JSON array of objects, each with "key" and "value" string fields, nothing else.',
    'Example format:',
    '[{"key":"Brand","value":"UGREEN"},{"key":"Model","value":"W707"},{"key":"Charging Standard","value":"Qi2 Certified"}]',
    '',
    'SPEC RULES:',
    '- Always start with: Brand, Model (if known), Part Number / SKU (if known), Product Type',
    '- Include all relevant technical specifications appropriate for this product category',
    '- For CHARGERS/POWER: include Charging Standard, Output Power (per port), Input Interface, Cable Length/Type, Certifications, Safety Features, Compatibility',
    '- For SMARTPHONES: include Display, Processor, RAM, Storage, Battery, Camera, OS, Connectivity, Dimensions, Weight',
    '- For AUDIO: include Driver Size, Frequency Response, Impedance, Connectivity, Battery Life, Codec Support, Noise Cancellation',
    '- For LAPTOPS/COMPUTERS: include Processor, RAM, Storage, Display, GPU, OS, Ports, Battery, Weight',
    '- For ACCESSORIES: include Material, Compatibility, Dimensions/Size, Color, Certifications',
    '- Always end with: Color (if applicable), Certifications (if applicable), Warranty',
    '- Use factual spec names (e.g. "Phone Charging Output" not "Output") — be specific and professional',
    '- Values must be concise but complete (e.g. "Up to 15W" not just "15W"; "Overcharge, Overcurrent, Overheat Protection" not "Yes")',
    '- Include 12–25 spec rows depending on product complexity',
    '- Do NOT invent specific model numbers or certifications not inferable from the product name — use generic accurate values',
    '- Do NOT include price, availability, or shipping info',
  ].filter(s => s !== undefined).join('\n');

  const raw    = await callAI(systemMsg, userMsg, 1200);
  const parsed = extractJSON(raw, 'array');

  const specs = parsed
    .filter(item => item && typeof item.key === 'string' && typeof item.value === 'string')
    .map(item => ({ key: item.key.trim(), value: item.value.trim() }))
    .filter(item => item.key && item.value);

  if (specs.length === 0) throw new Error('AI returned no valid specs');
  return specs;
}

/* ── generateBrand — exported helper for scrape.js ──────────────────────────
 * Extracts the manufacturer brand from a product name using AI.
 * Returns a string (empty string if not determinable).
 * ─────────────────────────────────────────────────────────────────────────── */
async function generateBrand(name = '') {
  if (!name || name.trim().length < 3) return '';
  try {
    const systemMsg = 'You are an expert e-commerce product data assistant. You output ONLY valid JSON. No markdown. No explanation.';
    const userMsg = `Extract the manufacturer brand name from this product name: "${name.trim()}"\n\nReply ONLY with this JSON: {"brand":"BRAND_HERE"}\n\nRules:\n- BRAND_HERE must be the manufacturer/brand name extracted from the product name\n- Use empty string "" only if genuinely impossible to determine\n- Do NOT include model numbers, series names, or descriptive words — only the brand`;
    const raw    = await callAI(systemMsg, userMsg, 100);
    const parsed = extractJSON(raw, 'object');
    return (parsed.brand || '').trim();
  } catch (_) {
    return '';
  }
}

/* ── generateShortDescription — exported helper for scrape.js ────────────────
 * Generates a 110-155 char SEO-optimised short description using the same
 * prompt rules as the /api/ai/autofill endpoint.
 * Returns a string (empty string if AI unavailable).
 * ─────────────────────────────────────────────────────────────────────────── */
async function generateShortDescription({ name = '', brand = '', category = '', price = '', salePrice = '' } = {}) {
  if (!name || name.trim().length < 3) return '';
  try {
    const ctxLines = [
      brand    && `Brand: ${brand}`,
      category && `Category: ${category}`,
      price    && `Price: Rs.${price}${salePrice ? ` (sale Rs.${salePrice})` : ''}`,
    ].filter(Boolean).join('\n');

    const systemMsg = 'You are an expert e-commerce SEO copywriter for a Sri Lankan online store. You output ONLY valid JSON. No markdown. No explanation.';

    const userMsg = [
      `Generate autofill fields for this product on storekit.local (Sri Lanka e-commerce).`,
      ``,
      `Product name: "${name.trim()}"`,
      ctxLines ? `Context:\n${ctxLines}` : '',
      ``,
      `Reply ONLY with this JSON, nothing else:`,
      `{"brand":"BRAND_HERE","shortDescription":"DESC_HERE"}`,
      ``,
      `BRAND_HERE rules:`,
      `- The manufacturer/brand name (extract from product name or context)`,
      `- Empty string "" if genuinely unknown`,
      ``,
      `DESC_HERE rules — this appears directly in Google search results:`,
      `- Length: 110-155 characters EXACTLY`,
      `- Open with the key feature or benefit — NOT the product name`,
      `- Include ONE buying-intent phrase: "buy online in Sri Lanka", "best price in Sri Lanka", or "fast delivery across Sri Lanka"`,
      `- Mention a real spec or use-case that differentiates this product`,
      `- End with: "Fast delivery across Sri Lanka." or "Order now at StoreKit."`,
      `- Plain English only — no markdown, no asterisks, no ALL CAPS, no emoji`,
      `- Do NOT open with the brand name or product name`,
      `- Do NOT use vague filler like "high quality", "perfect for everyone"`,
      ``,
      `GOOD example for "Sony XV800 X-Series Wireless Party Speaker":`,
      `"Powerful 360-degree party sound with built-in mic input, LED lighting and IPX4 splash-proof body. Buy the Sony XV800 online with fast delivery across Sri Lanka."`,
      ``,
      `BAD example (too short, generic, no Sri Lanka signal):`,
      `"Wireless party speaker with great sound quality."`,
    ].filter(s => s !== undefined).join('\n');

    const raw    = await callAI(systemMsg, userMsg, 500);
    const parsed = extractJSON(raw, 'object');
    const sd     = (parsed.shortDescription || '').trim();
    if (sd.length < 50) {
      console.warn('[AI generateShortDescription] too short (' + sd.length + ' chars):', sd);
    }
    return sd;
  } catch (err) {
    console.warn('[AI generateShortDescription] skipped:', err.message);
    return '';
  }
}

module.exports = router;
module.exports.generateProductDescription = generateProductDescription;
module.exports.generateProductSpecs       = generateProductSpecs;
module.exports.generateShortDescription   = generateShortDescription;
module.exports.generateBrand              = generateBrand;
