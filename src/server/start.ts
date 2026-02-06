import express from "express";
import path from "path";
import app from "./index.js";

const PORT = parseInt(process.env.PORT || "3000", 10);

const clientDist = path.join(import.meta.dirname, "../../dist");
app.use(express.static(clientDist));
app.get("/{*splat}", (_req, res) => {
  res.sendFile(path.join(clientDist, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
