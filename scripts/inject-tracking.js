const fs = require('fs');
const path = require('path');

const htmlFiles = [
  "./about.html",
  "./contact/get-quote.html",
  "./contact/location-hours.html",
  "./contact/schedule-consultation.html",
  "./contact/service-request.html",
  "./contact/thank-you.html",
  "./index.html",
  "./our-process.html",
  "./portfolio/before-after-gallery.html",
  "./portfolio/commercial-projects.html",
  "./portfolio/contemporary-living-room.html",
  "./portfolio/elegant-master-bedroom.html",
  "./portfolio/luxury-bathroom-suite.html",
  "./portfolio/modern-kitchen-renovation.html",
  "./portfolio/modern-office-space.html",
  "./portfolio/project-detail.html",
  "./portfolio/residential-projects.html",
  "./resources/design-blog.html",
  "./resources/design-tips.html",
  "./resources/trend-insights.html",
  "./services/bathrooms.html",
  "./services/color-consultation.html",
  "./services/custom-cabinetry.html",
  "./services/flooring.html",
  "./services/full-home-remodels.html",
  "./services/general-construction.html",
  "./services/home-staging.html",
  "./services/interior-design.html",
  "./services/kitchens.html",
  "./services/painting-finishes.html",
  "./services/selective-demolition.html",
  "./services/space-planning.html",
  "./templates/page-template.html"
];

const trackingCode = `    <!-- Google Analytics -->
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
`;

const workspaceDir = path.resolve(__dirname, '..');

let modifiedCount = 0;
let skippedCount = 0;
const updatedFiles = [];

htmlFiles.forEach(fileRelPath => {
  const filePath = path.join(workspaceDir, fileRelPath);
  
  if (!fs.existsSync(filePath)) {
    console.log(`File not found: ${filePath}`);
    return;
  }
  
  const stats = fs.statSync(filePath);
  if (stats.size === 0) {
    console.log(`Skipping (empty file): ${fileRelPath}`);
    skippedCount++;
    return;
  }
  
  const content = fs.readFileSync(filePath, 'utf8');
  
  if (content.includes('G-Z0F0X2TWW4')) {
    console.log(`Skipping (already has tracking): ${fileRelPath}`);
    skippedCount++;
    return;
  }
  
  // Find </head> tag (case-insensitive)
  const headMatch = content.match(/<\/head>/i);
  if (!headMatch) {
    console.log(`No </head> tag found in: ${fileRelPath}`);
    return;
  }
  
  const idx = headMatch.index;
  const newContent = content.slice(0, idx) + trackingCode + content.slice(idx);
  
  fs.writeFileSync(filePath, newContent, 'utf8');
  console.log(`Successfully injected tracking into: ${fileRelPath}`);
  updatedFiles.push(fileRelPath);
  modifiedCount++;
});

console.log(`\nSummary: Modified ${modifiedCount} files, Skipped ${skippedCount} files.`);
console.log('\nModified Files:');
updatedFiles.forEach(f => console.log(`- ${f}`));
