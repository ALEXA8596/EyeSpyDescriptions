const { parse } = require("node-html-parser");
const fetch = require("node-fetch");
const https = require("https");
const http = require("http");

async function getBodyText(url) {
  if (url.startsWith("mailto:") || url.startsWith("tel:")) {
    return ""; // Skip mailto and tel links
  }

  if (!url.startsWith("https://") && !url.startsWith("http://")) {
    url = "https://" + url; // Ensure URL has a protocol
  }

  // Special handling for eyesonsite - use HTTP
  let useHttps = true;
  if(url.includes("eyesonsite")) {
    url = url.replace("https://", "http://");
    useHttps = false;
  }

  const httpsAgent = new https.Agent({
    rejectUnauthorized: false,
    timeout: 20000, // 20 second timeout
  });

  const httpAgent = new http.Agent({
    timeout: 20000, // 20 second timeout
  });

  const response = await fetch(url, {
    agent: useHttps ? httpsAgent : httpAgent,
    timeout: 20000 // Additional timeout at fetch level
  });
  const html = await response.text();
  const root = parse(html);
  const bodyText = root.querySelector("body")?.text || "";
  // Remove excessive whitespace
  return bodyText.replace(/\s+/g, " ").trim();
}

module.exports = getBodyText;
