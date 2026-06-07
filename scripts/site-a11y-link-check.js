const fs = require("fs");
const path = require("path");

function walk(dir, files = []) {
  fs.readdirSync(dir).forEach((name) => {
    const fp = path.join(dir, name);
    const stat = fs.statSync(fp);
    if (stat.isDirectory()) walk(fp, files);
    else if (stat.isFile() && fp.endsWith(".html")) files.push(fp);
  });
  return files;
}

function isLocal(h) {
  if (!h) return false;
  h = h.trim();
  if (
    h.startsWith("http://") ||
    h.startsWith("https://") ||
    h.startsWith("mailto:") ||
    h.startsWith("tel:") ||
    h.startsWith("data:") ||
    h.startsWith("#")
  )
    return false;
  return true;
}

const root = process.cwd();
const htmlFiles = walk(root);
const report = {
  filesScanned: htmlFiles.length,
  brokenLinks: [],
  missingAlts: [],
  nonDescriptiveLinks: [],
  missingFootnote: [],
  footnoteMissingAria: [],
};

htmlFiles.forEach((file) => {
  const relFile = path.relative(root, file);
  const txt = fs.readFileSync(file, "utf8");

  // href and src
  const hrefSrcRegex = /(href|src)\s*=\s*"([^"]+)"/g;
  let m;
  while ((m = hrefSrcRegex.exec(txt))) {
    const attr = m[1];
    const val = m[2];
    if (isLocal(val)) {
      const clean = val.split("?")[0].split("#")[0];
      const resolved = path.normalize(path.join(path.dirname(file), clean));
      if (!fs.existsSync(resolved)) {
        report.brokenLinks.push({ file: relFile, attr, target: val, resolved });
      }
    }
  }

  // missing alt on img
  const imgRegex = /<img([^>]+)>/g;
  while ((m = imgRegex.exec(txt))) {
    const attrs = m[1];
    if (!/\salt\s*=\s*"[^"]*"/i.test(attrs)) {
      // capture src for context
      const srcMatch = attrs.match(/src\s*=\s*"([^"]+)"/i);
      const src = srcMatch ? srcMatch[1] : "";
      report.missingAlts.push({ file: relFile, src });
    }
  }

  // non-descriptive links
  const aRegex = /<a([^>]*)>([\s\S]*?)<\/a>/gi;
  while ((m = aRegex.exec(txt))) {
    const attrs = m[1];
    const inner = m[2].replace(/<[^>]*>/g, "").trim();
    const hrefMatch = attrs.match(/href\s*=\s*"([^"]+)"/i);
    const href = hrefMatch ? hrefMatch[1] : "";
    if (isLocal(href)) {
      if (
        inner.length === 0 ||
        inner.length < 3 ||
        inner.toLowerCase().match(/click here|read more|here|more|link/)
      ) {
        report.nonDescriptiveLinks.push({ file: relFile, href, text: inner });
      }
    }
  }

  // lightbox footnote presence
  if (
    /class\s*=\s*"[^"]*lightbox-modal[^"]*"/.test(txt) ||
    /id\s*=\s*"lightboxModal"/.test(txt)
  ) {
    if (!/id\s*=\s*"lightboxFootnote"/.test(txt)) {
      report.missingFootnote.push({ file: relFile });
    } else {
      // does it have aria-live?
      const footnoteRegex = /<[^>]*id\s*=\s*"lightboxFootnote"([^>]*)>/i;
      const fm = txt.match(footnoteRegex);
      if (fm) {
        const attrs = fm[1];
        if (!/aria-live\s*=\s*"[^"]+"/i.test(attrs))
          report.footnoteMissingAria.push({ file: relFile });
      }
    }
  }
});

console.log(JSON.stringify(report, null, 2));
