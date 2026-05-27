# Interior Illusions LLC — Tracking & Routing Deployment Notes

This document provides a complete technical reference for the tracking infrastructure, secure lead ingestion pipeline, and URL routing configurations implemented for the Interior Illusions LLC website. 

---

## Table of Contents
1. [Global Tracking Scripts (GA & Meta Pixel)](#1-global-tracking-scripts-ga--meta-pixel)
2. [HubSpot Secure Lead Submission Pipeline](#2-hubspot-secure-lead-submission-pipeline)
3. [Server-Side PHP Proxy Integration (CORS & Key Security)](#3-server-side-php-proxy-integration-cors--key-security)
4. [Clean URLs & Security Routing (`.htaccess`)](#4-clean-urls--security-routing-htaccess)
5. [Tracking Backup & Recovery System](#5-tracking-backup--recovery-system)
6. [Deployment & Maintenance Workflows](#6-deployment--maintenance-workflows)

---

## 1. Global Tracking Scripts (GA & Meta Pixel)

The website maintains site-wide tracking for Google Analytics and Meta Pixel. These scripts are injected into the `<head>` of all active pages.

### Credentials & Keys
* **Google Analytics ID**: `G-Z0F0X2TWW4`
* **Meta Pixel ID**: `1273059444474707`

### Automated Injection Utility
To prevent manual copy-pasting across all pages, we created an automated injection script:
* **Script Location**: [`scripts/inject-tracking.js`](file:///Users/hilasmic/Desktop/RIZZ/backup.IILLC/scripts/inject-tracking.js)
* **Execution Command**:
  ```bash
  node scripts/inject-tracking.js
  ```
* **Behavior**:
  - Scans all 33 defined HTML page paths.
  - Automatically skips 8 empty 0-byte placeholder pages (such as `location-hours.html`, `schedule-consultation.html`, etc.) to maintain site integrity.
  - Skips files that already contain the tracking string `G-Z0F0X2TWW4` to prevent double-injection.
  - Locates the closing `</head>` tag and injects the formatted HTML script blocks right above it.

### Exact HTML Head Code Injected
```html
    <!-- Google Analytics -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-Z0F0X2TWW4"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', 'G-Z0F0X2TWW4');
    </script>

    <!-- Meta Pixel -->
    <script>
    !function(f,b,e,v,n,t,s)
    {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};
    if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
    n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t,s)}(window, document,'script',
    'https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', '1273059444474707');
    fbq('track', 'PageView');
    </script>
    <noscript><img height="1" width="1" style="display:none"
    src="https://www.facebook.com/tr?id=1273059444474707&ev=PageView&noscript=1"
    /></noscript>
```

---

## 2. HubSpot Secure Lead Submission Pipeline

The estimate form on the contact page is integrated with HubSpot using their secure submissions API.

### Target Form Details
* **Form Location**: `/contact/get-quote.html`
* **Form Element ID**: `remodel-estimate-form`
* **Transport Script**: [`scripts/tracking.js`](file:///Users/hilasmic/Desktop/RIZZ/backup.IILLC/scripts/tracking.js)

### Hidden Tracking Inputs
To capture ad attribution data and passing the Meta Click Identifier (`fbclid`) and browser-tracked Pixel parameters, three hidden input fields are injected inside the `<form>` element:
```html
<input type="hidden" id="fbp_field" name="fbp" value="">
<input type="hidden" id="fbc_field" name="fbc" value="">
<input type="hidden" id="fbclid_raw" name="fbc.lid_raw" value="">
```

### Cookie & URL Parsing Engine
The script `scripts/tracking.js` executes immediately on page load to:
1. Retrieve the Facebook browser pool cookie (`_fbp`) if available.
2. Retrieve the Facebook click event cookie (`_fbc`) or extract the active `fbclid` query parameter from the URL.
3. Automatically generate a versioned `_fbc` cookie string format if the cookie is missing but the `fbclid` parameter is present in the URL query string:
   `fb.1.[timestamp].[fbclid_value]`
4. Inject these extracted parameters into the form's hidden input fields.

### HubSpot Field Mapping Specification
When a user submits the form, `scripts/tracking.js` intercepts the submission event, extracts the form values, and maps them to strict lowercase default and custom HubSpot contact property fields:

| Frontend Input `name` | HubSpot Property `name` | Purpose / Description |
| :--- | :--- | :--- |
| `firstName` | `firstname` | Contact first name |
| `lastName` | `lastname` | Contact last name |
| `email` | `email` | Standard primary email |
| `phone` | `phone` | Mobile/primary phone number |
| `message` | `message` | Project notes/comments |
| `projectLocation` | `address` | Project site address |
| `projectType` | `service` | Radio button/select project service category |
| `timeline` | `preferred_timeline` | Selected implementation urgency timeline |
| `referral` | `hear_about_us` | Referral attribution source data |
| `fbp` (hidden) | `fbp` | Meta Browser Cookie attribution string |
| `fbc` (hidden) | `fbc` | Meta Click Identifier with timestamp |

### Secure Submissions Protocol
1. Intercepts standard HTML submission.
2. Constructs the payload JSON containing the fields array and the user's HubSpot cookie context (`hutk`).
3. Dispatches a POST request to HubSpot's secure API integration endpoint using `keepalive: true` to prevent browser cancellation during transitions.
4. On success, redirects the user to the approved redirect page:
   `https://interiorillusionsconstruction.com/thank-you`

---

## 3. Server-Side PHP Proxy Integration (CORS & Key Security)

> [!WARNING]
> **Client-Side API Key Exposure Risk**
> Standard front-end client-side submissions direct to the `https://api.hsforms.com/submissions/v3/integration/secure/submit` endpoint require an Authorization Bearer Header containing a Private App Access Token (`pat-...`). Running this call directly from the browser exposes the access token to the public internet in the source inspector and triggers CORS blocks on modern browsers.

To secure your Private App Access Token and bypass browser-side CORS preflight blocks, a server-side PHP proxy script is designed to handle transmission. The client-side `tracking.js` is modified to point to this local PHP endpoint on the server, which signs and forwards the payload safely.

### The PHP Proxy Script: `backend/submit-lead.php`
Upload the following file to your server environment at `/backend/submit-lead.php`:

```php
<?php
// submit-lead.php - Secure Server-Side Forwarder for HubSpot API
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Content-Type: application/json");

// Handle preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["error" => "Method not allowed"]);
    exit;
}

// Retrieve raw POST input payload
$rawData = file_get_contents('php://input');
if (!$rawData) {
    http_response_code(400);
    echo json_encode(["error" => "Empty payload"]);
    exit;
}

// HubSpot Credentials (Kept secure on the server side)
$portalId = '51388633';
$formGuid = 'f47c4f3d-4891-4c48-a1a1-80a4240f5b51';
$accessToken = 'pat-na1-92f05fa5-2818-4e52-a7b8-e9b4b43d9674';

$endpoint = "https://api.hsforms.com/submissions/v3/integration/secure/submit/" . $portalId . "/" . $formGuid;

// Initialize cURL session
$ch = curl_init($endpoint);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, $rawData);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json',
    'Authorization: Bearer ' . $accessToken
]);

$response = curl_exec($ch);
$statusCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
curl_close($ch);

if ($curlError) {
    http_response_code(500);
    echo json_encode(["error" => "Proxy execution failure: " . $curlError]);
    exit;
}

// Mirror the HubSpot response status code back to client
http_response_code($statusCode);
echo $response;
?>
```

### Client-Side `tracking.js` Adjustment
To use the secure proxy, update the `endpoint` definition inside `scripts/tracking.js` as follows:

```diff
- var endpoint = "https://api.hsforms.com/submissions/v3/integration/secure/submit/" + portalId + "/" + formGuid;
+ var endpoint = "/backend/submit-lead.php";
```
*Note: Make sure to remove the `Authorization` header from the browser-side `fetch` request once the proxy is active, as the PHP backend handles authorization securely.*

---

## 4. Clean URLs & Security Routing (`.htaccess`)

The `.htaccess` file configured in the root directory manages production clean URL routing (removing the trailing `.html` suffix) and enforces critical security and HTTPS protocols.

### Key Configurations Inside `.htaccess`

1. **Force HTTPS Routing**:
   Automatically redirects all non-secure HTTP traffic to secure HTTPS:
   ```apache
   RewriteEngine On
   RewriteCond %{HTTPS} off
   RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]
   ```

2. **Clean URLs (HTML Suffix Removal)**:
   - **MultiViews Disabled**: Explicitly turns off MultiViews (`Options -MultiViews`) to avoid conflicts with extensionless URL rewriting.
   - **GET Suffix Removal Redirect**: Redirects direct browser entries containing `.html` (e.g. `index.html`) to the clean, extensionless equivalent (e.g. `/` or `/index`).
   - **Internal Extension Mapping**: Behind the scenes, rewrite rules map extensionless URLs back to the appropriate HTML file on the server without changing the user's address bar.
   ```apache
   <IfModule mod_rewrite.c>
     Options -MultiViews
     
     RewriteCond %{THE_REQUEST} ^GET\ (.*)\.html\ HTTP [NC]
     RewriteRule ^(.*)\.html$ $1 [R=301,L]

     RewriteCond %{REQUEST_FILENAME} !-d
     RewriteCond %{REQUEST_FILENAME}\.html -f
     RewriteRule ^(.*)$ $1.html [L]
   </IfModule>
   ```

3. **Production Security Headers**:
   - `X-Frame-Options SAMEORIGIN`: Prevents clickjacking attacks.
   - `X-Content-Type-Options nosniff`: Prevents MIME type sniffing exploits.
   - `X-XSS-Protection "1; mode=block"`: Enforces built-in browser cross-site scripting blocking.
   - `Strict-Transport-Security` (HSTS): Tells browsers to always use SSL/TLS for subsequent connections.

---

## 5. Tracking Backup & Recovery System

To guarantee tracking setups are never lost during visual styling updates, template rebuilds, or subsequent feature releases, a dedicated recovery environment is maintained at `/tracking-backup/`.

### Backup Manifest

* **[`tracking-backup/head-tracking-env.html`](file:///Users/hilasmic/Desktop/RIZZ/backup.IILLC/tracking-backup/head-tracking-env.html)**:
  Contains the exact GA and Meta Pixel scripts blocks. Use this if any page head is wiped or rebuilt.
* **[`tracking-backup/form-hidden-fields.html`](file:///Users/hilasmic/Desktop/RIZZ/backup.IILLC/tracking-backup/form-hidden-fields.html)**:
  Contains the HTML code for the three hidden attribution input tags. Use this if the quote form elements are modified or refactored.
* **[`tracking-backup/hubspot-payload-transport.js`](file:///Users/hilasmic/Desktop/RIZZ/backup.IILLC/tracking-backup/hubspot-payload-transport.js)**:
  A stable backup copy of the mapping engine script. Use this to restore script functionality if `scripts/tracking.js` is modified or deleted.

---

## 6. Deployment & Maintenance Workflows

### How to Safely Redeploy Site Updates
When modifications are made to the codebase, follow this deployment sequence to maintain tracking continuity:

1. **Re-Inject Tracking Scripts**:
   Always run the injection engine before pushing changes to ensure no new pages are missing tracking headers:
   ```bash
   node scripts/inject-tracking.js
   ```

2. **Run the rsync Sync Tool**:
   Deploy files to your server using the production exclusion rules to avoid transferring developmental config files and node modules:
   ```bash
   rsync -avzP --delete --exclude 'node_modules/' --exclude '.git/' --exclude '.env' -e "ssh -o ServerAliveInterval=60 -o ServerAliveCountMax=5" ./ root@77.37.63.225:/home/interiorillusionsconstruction.com/public_html/
   ```

3. **Verify DevTools Traffic**:
   - Visit the production domain in Google Chrome.
   - Open DevTools (F12) -> **Network** tab.
   - Look for requests to `fbevents.js` and `gtag/js`.
   - Submit a test lead to ensure data flows to HubSpot and redirects to the `/thank-you` page seamlessly.

4. **Maintain the Stable Branch**:
   The `production-tracking-built` branch represents the stable production-ready state with all backups and tracking modules.
   - Merge active dev commits into `gh-pages` or `main`.
   - Ensure `production-tracking-built` is merged and pushed to origin to keep an active snapshot of the build:
     ```bash
     git checkout production-tracking-built
     git merge gh-pages
     git push origin production-tracking-built
     git checkout gh-pages
     ```
