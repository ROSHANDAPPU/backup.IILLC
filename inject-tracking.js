const fs = require('fs');
const path = require('path');

const trackingCode = `
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
`;

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(function(file) {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      if (!file.includes('node_modules') && !file.includes('.git')) {
        results = results.concat(walk(file));
      }
    } else {
      if (file.endsWith('.html')) {
        results.push(file);
      }
    }
  });
  return results;
}

const htmlFiles = walk('/Users/hilasmic/.gemini/antigravity/scratch/backup.IILLC');
htmlFiles.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  if (!content.includes('G-Z0F0X2TWW4')) {
    content = content.replace(/<\/head>/i, trackingCode + '\n</head>');
    fs.writeFileSync(file, content, 'utf8');
  }
});
console.log('Injected tracking code into ' + htmlFiles.length + ' HTML files.');
