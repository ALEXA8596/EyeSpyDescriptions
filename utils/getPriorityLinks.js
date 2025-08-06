const { GoogleGenAI } = require("@google/genai");

async function getPriorityLinks(originalUrl, urls, useHackClub = false) {
  try {
    if (!originalUrl || !urls || urls.length === 0) {
      return [];
    }
    // Ensure all URLs have a protocol
    if (!useHackClub) {
      console.log("Using Google GenAI to prioritize links...");
      const client = new GoogleGenAI({
        vertexai: true,
        project: process.env.GOOGLE_PROJECT_ID,
        location: process.env.GOOGLE_LOCATION || "us-central1",
        credentials: {
          client_email: process.env.GOOGLE_CLIENT_EMAIL,
          private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
        },
      });

      const response = await client.models.generateContent({
        model: "gemini-2.0-flash-lite",
        contents: [
          {
            role: "user",
            text: `You will be provided URLs from the main page of a website for an organization. Determine which links may contain important information related to the organization. Examples include "/about", "/events", "/blog", "/programs", and "/services". Try to limit the number of links to around 5 links. You do not need to fill 5 links if there are not that many relevant links. Return the links in the following format: ["Link1", "Link2", "Link3"]. Do not return anything else other than the JSON array. \n Here are the links: \n ${urls.join(
              ", "
            )}`,
          },
        ],
        config: {
          responseMimeType: "application/json",
        },
      });

      // console.log(
      //   "Google GenAI response:",
      //   await JSON.stringify(response, null, 2)
      // );
      const prioritizedLinks = await JSON.parse(response.text);
      // The AI might return relative paths, so we need to resolve them against the original URL.

      if (
        !originalUrl.startsWith("http://") &&
        !originalUrl.startsWith("https://")
      ) {
        originalUrl = "https://" + originalUrl;
      }
      const pageUrl = new URL(originalUrl); // Assuming the first URL is the base
      return prioritizedLinks.map((link) => new URL(link, pageUrl.origin).href);
    } else {
      console.log("Using Hack Club AI to prioritize links...");
      const response = await fetch("https://ai.hackclub.com/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [
            {
              role: "user",
              content: `You will be provided URLs from the main page of a website for an organization. Determine which links may contain important information related to the organization. Examples include "/about", "/events", "/blog", "/programs", and "/services". Try to limit the number of links to around 5 links. You do not need to fill 5 links if there are not that many relevant links. Return the links in the following format: ["Link1", "Link2", "Link3"]. Do not return anything else other than the JSON array. \n Here are the links: \n ${urls.join(
                ", "
              )}`,
            },
          ],
          response_format: { type: "json_object" },
        }),
        agent: new (require("https").Agent)({
          rejectUnauthorized: false,
        }),
      });
      const data = await response.json();
      console.log("AI response:", data);
      const prioritizedLinks = JSON.parse(data.choices[0].message.content);
      // The AI might return relative paths, so we need to resolve them against the original URL.
      const pageUrl = new URL(originalUrl); // Assuming the first URL is the base
      return prioritizedLinks.map((link) => new URL(link, pageUrl.origin).href);
    }
  } catch (error) {
    console.error("Error prioritizing links:", error);
    return [];
  }
}

module.exports = getPriorityLinks;
