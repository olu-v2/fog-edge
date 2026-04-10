import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import serverlessExpress from "@vendia/serverless-express";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const DIST = path.join(__dirname, "dist");

// Serve Vite build assets with long-term caching
app.use(
  "/assets",
  express.static(path.join(DIST, "assets"), {
    maxAge: "1y",
    immutable: true,
  }),
);

// Serve all other static files
app.use(express.static(DIST, { maxAge: "0" }));

// SPA fallback — always return index.html for client-side routing
app.get("/", (req, res) => {
  console.log("Running");
  res.sendFile(path.join(DIST, "index.html"));
});

// Export as Lambda handler via serverless-http
export const handler = serverlessExpress({ app });
