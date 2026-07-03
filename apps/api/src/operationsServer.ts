import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

import { config } from "@fibrepulse/config";
import { topologyRouter } from "./routes/topology.js";
import { evidenceRouter } from "./routes/evidence.js";
import { routingRouter } from "./routes/routing.js";

const app = express();
const port = Number(
  process.env.OPERATIONS_API_PORT ??
    process.env.TOPOLOGY_API_PORT ??
    config.API_PORT + 1,
);

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "fibrepulse-operations-api",
    time: new Date().toISOString(),
  });
});

app.use("/api/topology", topologyRouter);
app.use("/api/evidence", routingRouter);
app.use("/api/evidence", evidenceRouter);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({
    error: "internal_server_error",
    message: err instanceof Error ? err.message : "Unknown operations API error",
  });
});

app.listen(port, () => {
  console.log(`FibrePulse operations API listening on port ${port}`);
});
