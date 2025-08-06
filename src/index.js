require("dotenv").config();

const getAnchorHrefs = require("../utils/getAnchorHrefs");
const getBodyText = require("../utils/getBodyText");
const sanitizeFileName = require("../utils/sanitizeFileName");
const getPriorityLinks = require("../utils/getPriorityLinks");
const fs = require("fs");
const path = require("path");
const { GoogleGenAI } = require("@google/genai");


const prompt = `You are an expert website SEO consultant. Your task is to analyze the following website content and generate a concise, SEO-optimized description that highlights the key features and offerings of the given website.
Follow these rules:
1. **Length**: The description should be between 300 and 400 words.
2. The Organization's name should be the "keyword" and should be mentioned at least 3 times in the description.
3. Use an h3 tag for the title.
4. The passive voice should be used less than 10% of the time.
5. Transition words should be used at least 30% of the time.
6. The description should be engaging and informative, providing a clear overview of the website's purpose and offerings.
7. Paragraphs should be less than 150 words. Use multiple paragraphs if necessary.
8. Wrap the first mention of the organization in an anchor with the URL of the organization.
9. Use semantic HTML, such as <section> <h3> <p> and <a rel="noopener">, to structure the description.
10. End the description with "Learn more at <Organization URL> and explore other vision-focused resources at the <a href=\"https://eyespy.org/resources/\">Eye Spy directory</a>."
11. Focus on the mission, vision, and key offerings of the organization towards the visually impaired community. Give a broad overview, do not describe specific programs or events in detail.

IMPORTANT: DO NOT USE BACKTICKS OR CODE BLOCKS IN YOUR RESPONSE. DO NOT USE MARKDOWN FORMATTING. 
DO NOT BEGIN YOUR RESPONSE WITH \`\`\` OR END WITH \`\`\`.
PROVIDE ONLY THE RAW HTML CONTENT WITHOUT ANY CODE FORMATTING OR MARKDOWN SYNTAX.`;

async function main() {
  const JSONdata = JSON.parse(
    fs.readFileSync(path.join(__dirname, "./Arizona.json"), "utf8")
  );
  // Create a queue for processing organizations
  const queue = JSONdata.map((item, index) => ({
    ...item,
    index,
    processed: false,
  }));

  // Track failed organizations
  const failedOrganizations = [];

  // Process in batches to avoid rate limiting
  const batchSize = 3; // Process 3 organizations at a time

  const outputDir = path.join(__dirname, "output");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  while (queue.some((item) => !item.processed)) {
    const batch = queue.filter((item) => !item.processed).slice(0, batchSize);

    // Process batch in parallel
    await Promise.all(
      batch.map(async (item) => {
        // console.log(item)
        console.log(
          `Processing ${item.listing_title} (${item.index + 1}/${
            JSONdata.length
          })...`
        );
        const i = item.index;

        try {
          if (
            fs.existsSync(
              path.join(
                outputDir,
                `${sanitizeFileName(JSONdata[i].listing_title)}.html`
              )
            )
          ) {
            // Skip if already processed
            const fileData = fs.readFileSync(
              path.join(
                outputDir,
                `${sanitizeFileName(JSONdata[i].listing_title)}.html`
              ),
              "utf8"
            );
            JSONdata[i].ai_yoast_description = fileData
              .replaceAll(/```html/g, "")
              .replaceAll(/```/g, "");
            
              fs.writeFileSync(
                path.join(
                  outputDir,
                  `${sanitizeFileName(JSONdata[i].listing_title)}.html`
                ),
                JSONdata[i].ai_yoast_description,
                "utf8"
              );
            item.processed = true;
            console.log(`✅ Already processed ${item.listing_title}`);
            return;
          }
          const anchors = await getAnchorHrefs(JSONdata[i].website);
          console.log(`Found ${anchors.length} links on the page.`);

          const priorityLinks = await getPriorityLinks(
            JSONdata[i].website,
            anchors
          );
          console.log(`Selected ${priorityLinks.length} priority links.`);

          const bodyTexts = JSONdata[i].website
            ? await Promise.all(
                [JSONdata[i].website, ...priorityLinks].map(async (link) => {
                  try {
                    return { body: await getBodyText(link), url: link };
                  } catch (error) {
                    console.warn(
                      `Error fetching content from ${link}:`,
                      error.message,
                      error.stack
                    );
                    throw error;
                    return { body: "", url: link };
                  }
                })
              )
            : [];

          const client = new GoogleGenAI({
            vertexai: true,
            project: process.env.GOOGLE_PROJECT_ID,
            location: process.env.GOOGLE_LOCATION || "us-central1",
            credentials: {
              client_email: process.env.GOOGLE_CLIENT_EMAIL,
              private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
            },
          });

          // Build the prompt with safe fallbacks for undefined/null values
          const safeName = JSONdata[i].listing_title || "Unknown Organization";
          const safeLocation = JSONdata[i].location || "Unknown Location";
          const safeWebsite = JSONdata[i].website || "No website provided";
          const safeEmail = JSONdata[i].email || "No email provided";
          const safePhone = JSONdata[i].phone || "No phone provided";

          let entirePrompt =
            prompt +
            `\n\nHere is the information about the website and organization:\n\nName: ${safeName}\nLocation: ${safeLocation}\nURL: ${safeWebsite}\n\nEmail: ${safeEmail}\nPhone Number: ${safePhone}\nBody Texts:\n${bodyTexts
              .map(
                (text) =>
                  (text.url || "Unknown URL") +
                  "\n" +
                  (text.body || "No content available")
              )
              .join("\n\n")}`;

          let bodyTextsLength = bodyTexts.length;

          console.log(`Prompt length: ${entirePrompt.length} characters`);

          // Add safety check for empty prompt
          if (!entirePrompt || entirePrompt.trim().length === 0) {
            throw new Error("Generated prompt is empty or invalid");
          }

          try {
            while (true) {
              try {
                const tokenResponse = await client.models.countTokens({
                  contents: [{ role: "user", text: entirePrompt }],
                  model: "gemini-2.0-flash-lite",
                });

                if (!tokenResponse || !tokenResponse.totalTokens) {
                  console.warn(
                    `Failed to get token count for ${safeName}, reducing content`
                  );
                  bodyTextsLength--;
                  break;
                }

                if (tokenResponse.totalTokens <= 1048576) {
                  break;
                }
              } catch (error) {
                console.warn(
                  `Error counting tokens: ${error.message}, reducing content`
                );
                bodyTextsLength--;
              }

              bodyTextsLength--;

              // Prevent infinite loop if we run out of body texts
              if (bodyTextsLength <= 0) {
                console.warn(
                  `Token limit exceeded even with minimal content for ${safeName}`
                );
                entirePrompt =
                  prompt +
                  `\n\nHere is the information about the website and organization:\n\nName: ${safeName}\nLocation: ${safeLocation}\nURL: ${safeWebsite}\n\nEmail: ${safeEmail}\nPhone Number: ${safePhone}\nBody Texts: Content too large to include.`;
                break;
              }

              entirePrompt =
                prompt +
                `\n\nHere is the information about the website and organization:\n\nName: ${safeName}\nLocation: ${safeLocation}\nURL: ${safeWebsite}\n\nEmail: ${safeEmail}\nPhone Number: ${safePhone}\nBody Texts:\n${bodyTexts
                  .slice(0, bodyTextsLength)
                  .map(
                    (text) =>
                      (text.url || "Unknown URL") +
                      "\n" +
                      (text.body || "No content available")
                  )
                  .join("\n\n")}`;

              console.log(
                `Reduced to ${bodyTextsLength} body texts, prompt length: ${entirePrompt.length} characters`
              );
            }
          } catch (tokenCountError) {
            console.error(
              `Error counting tokens for ${safeName}:`,
              tokenCountError.message
            );
            // Use a minimal prompt if token counting fails
            entirePrompt =
              prompt +
              `\n\nHere is the information about the website and organization:\n\nName: ${safeName}\nLocation: ${safeLocation}\nURL: ${safeWebsite}\n\nEmail: ${safeEmail}\nPhone Number: ${safePhone}\nBody Texts: Unable to process content due to technical limitations.`;
          }

          const response = await client.models.generateContent({
            model: "gemini-2.0-flash-lite",
            contents: [
              {
                role: "user",
                text: entirePrompt,
              },
            ],
          });

          const content = response.text;
          JSONdata[i].ai_yoast_description = content
            .replace(/```html/g, "")
            .replace(/```/g, "");

          // Save individual description to file for backup
          fs.writeFileSync(
            path.join(
              outputDir,
              `${sanitizeFileName(JSONdata[i].listing_title)}.html`
            ),
            content,
            "utf8"
          );

          console.log(`✅ Completed ${item.listing_title}`);
          item.processed = true;
        } catch (error) {
          console.error(
            `❌ Error processing ${item.listing_title}:`,
            error.message,
            error.stack
          );
          console.log(error.stack);
          // Track failed organization
          failedOrganizations.push({
            ...item,
            error: error.message,
          });
          // Mark as processed to avoid retrying
          item.processed = true;
        }
      })
    );
  }

  // Count processed organizations
  const processedCount = queue.filter((item) => item.processed).length;
  console.log(`Processed ${processedCount}/${JSONdata.length} organizations.`);

  // Log failed organizations
  if (failedOrganizations.length > 0) {
    console.log(
      `\n❌ Failed to process ${failedOrganizations.length} organizations:`
    );
    failedOrganizations.forEach((org, index) => {
      console.log(`${index + 1}. ${org.listing_title} (${org.website})`);
      console.log(`   Error: ${org.error}\n`);
    });
  } else {
    console.log("\n✅ All organizations processed successfully!");
  }

  fs.writeFileSync(
    path.join(__dirname, "Arizona.json"),
    JSON.stringify(JSONdata, null, 2)
  );
}

main()
  .then(() => console.log("AI descriptions generated successfully."))
  .catch((error) => console.error("Error generating AI descriptions:", error));
