const express = require("express");
const { chromium } = require("playwright");

const app = express();
app.use(express.json({ limit: "25mb" }));

function escapeHtml(text = "") {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function wrapHtml(emailHtml, subject = "Email Snapshot") {
  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(subject)}</title>
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

          * {
            box-sizing: border-box;
          }
        </style>
      </head>
      <body>
        ${emailHtml || "<p>No HTML supplied.</p>"}
      </body>
    </html>
  `;
}

function requireRendererKey(req, res, next) {
  const expectedKey = process.env.RENDERER_API_KEY;
  const providedKey = req.header("X-Renderer-Key");

  if (!expectedKey) {
    return res.status(500).send("Renderer API key is not configured.");
  }

  if (!providedKey || providedKey !== expectedKey) {
    return res.status(401).send("Unauthorized");
  }

  next();
}

async function renderBuffers(html, subject = "Email Snapshot") {
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

    await page.setContent(wrapHtml(html, subject), {
      waitUntil: "domcontentloaded"
    });

    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);
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

    return { screenshotBuffer, pdfBuffer };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
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

  try {
    const { screenshotBuffer } = await renderBuffers(html, "Preview");
    res.setHeader("Content-Type", "image/png");
    res.send(screenshotBuffer);
  } catch (error) {
    console.error(error);
    res.status(500).send(String(error));
  }
});

app.post("/render-email", requireRendererKey, async (req, res) => {
  try {
    const { html, subject } = req.body || {};

    if (!html) {
      return res.status(400).json({ error: "Missing html" });
    }

    const { screenshotBuffer, pdfBuffer } = await renderBuffers(
      html,
      subject || "Email Snapshot"
    );

    res.json({
      screenshotBase64: screenshotBuffer.toString("base64"),
      pdfBase64: pdfBuffer.toString("base64")
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: String(error)
    });
  }
});

app.post("/render-email.png", requireRendererKey, async (req, res) => {
  try {
    const { html, subject } = req.body || {};

    if (!html) {
      return res.status(400).send("Missing html");
    }

    const { screenshotBuffer } = await renderBuffers(
      html,
      subject || "Email Snapshot"
    );

    res.setHeader("Content-Type", "image/png");
    res.send(screenshotBuffer);
  } catch (error) {
    console.error(error);
    res.status(500).send(String(error));
  }
});

app.post("/render-email.pdf", requireRendererKey, async (req, res) => {
  try {
    const { html, subject } = req.body || {};

    if (!html) {
      return res.status(400).send("Missing html");
    }

    const { pdfBuffer } = await renderBuffers(
      html,
      subject || "Email Snapshot"
    );

    res.setHeader("Content-Type", "application/pdf");
    res.send(pdfBuffer);
  } catch (error) {
    console.error(error);
    res.status(500).send(String(error));
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Renderer listening on ${port}`);
});

