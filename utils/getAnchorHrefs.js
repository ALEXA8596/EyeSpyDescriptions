const { parse } = require("node-html-parser");
const fetch = require("node-fetch");
const https = require('https');
const http = require('http');

async function getAnchorHrefs(url) {
  try {
    if(!url) {
        return [];
    }
    
    // Ensure URL has a protocol
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    // // Always convert to HTTPS for consistency and compatibility
    // if(url.startsWith("http://")) {
    //   url = url.replace("http://", "https://");
    // }
    
    // Choose the appropriate agent based on URL protocol
    const agent = url.startsWith('https://') 
      ? new https.Agent({ 
          rejectUnauthorized: false,
          checkServerIdentity: () => undefined // Ignore certificate hostname validation
        })
      : new http.Agent();

    console.log(`Fetching anchors from: ${url}`);
    
    const response = await fetch(url, { 
      agent: agent,
      timeout: 20000 // 10 second timeout
    });

    const html = await response.text();
    const root = parse(html);
    const anchors = root.querySelectorAll("a");
    const pageUrl = new URL(url);
    return Array.from(anchors)
      .map((anchor) => anchor.getAttribute("href"))
      .filter((href) => {
        try {
          const linkUrl = new URL(href, pageUrl);
          // Exclude links that point to the same page (ignoring hash)
          return (
            linkUrl.origin + linkUrl.pathname !==
            pageUrl.origin + pageUrl.pathname
          );
        } catch {
          return false;
        }
      });
  } catch (e) {
    console.error(`Error fetching anchors from ${url}:`, e);
    throw e;
  }
}

module.exports = getAnchorHrefs;
