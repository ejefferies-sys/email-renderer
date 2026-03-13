const express = require("express");
const { chromium } = require("playwright");

const app = express();
app.use(express.json({ limit: "25mb" }));

function wrapHtml(emailHtml, subject = "Email Snapshot") {
  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${subject}</title>
        <style>
          html, body {
            margin: 0;
            padding: 0;
            background: #ffffff;
          }

          body {
            font-family: Arial, Helvetica, sans-serif;
          }

          img {
            max-width: 100%;
            height: auto;
            display: block;
          }

          table {
            max-width: 100% !important;
          }
        </style>
      </head>
      <body>
        ${emailHtml || "<p>No HTML supplied.</p>"}
      </body>
    </html>
  `;
}

app.get("/", (_req, res) => {
  res.json({ ok: true, service: "email-renderer" });
});

app.get("/preview", async (_req, res) => {
  const html = `
    <div style="padding:40px;font-family:Arial;background:#ffffff">
      <h1>Preview Email</h1>
      <p>This simulates a marketing email.</p>
      <table width="600" style="border:1px solid #ddd;border-collapse:collapse;background:#fff;">
        <tr>
          <td style="padding:20px">
            <h2>ServiceTitan Update</h2>
            <p>See the latest improvements.</p>
            <a href="#" style="display:inline-block;padding:12px 18px;background:#0c66e4;color:white;text-decoration:none;border-radius:6px;">
              Learn More
            </a>
          </td>
        </tr>
      </table>
    </div>
  `;

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const page = await browser.newPage({
      viewport: { width: 1280, height: 2000 },
      deviceScaleFactor: 1,
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36"
    });

    await page.setContent(wrapHtml(html, "Preview"), {
      waitUntil: "domcontentloaded"
    });

    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1200);

    const screenshot = await page.screenshot({
      fullPage: true,
      type: "png"
    });

    res.setHeader("Content-Type", "image/png");
    res.send(screenshot);
  } catch (error) {
    console.error(error);
    res.status(500).send(String(error));
  } finally {
    if (browser) {
      await browser.close();
    }
  }
});

app.post("/render-email", async (req, res) => {
  const { html, subject } = req.body || {};

  if (!html) {
    return res.status(400).json({ error: "Missing html" });
  }

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const page = await browser.newPage({
      viewport: { width: 1280, height: 2000 },
      deviceScaleFactor: 1,
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36"
    });

    await page.setContent(wrapHtml(html, subject || "Email Snapshot"), {
      waitUntil: "domcontentloaded"
    });

    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1200);

    await page.emulateMedia({ media: "screen" });

    const screenshotBuffer = await page.screenshot({
      fullPage: true,
      type: "png"
    });

    const pdfBuffer = await page.pdf({
      printBackground: true,
      format: "A4",
      margin: {
        top: "16px",
        right: "16px",
        bottom: "16px",
        left: "16px"
      }
    });

    res.json({
      screenshotBase64: screenshotBuffer.toString("base64"),
      pdfBase64: pdfBuffer.toString("base64")
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: String(error)
    });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Renderer listening on ${port}`);
});