import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

import { config } from "@fibrepulse/config";
import { topologyRouter } from "./routes/topology.js";

const app = express();
const topologyPort = Number(
  process.env.TOPOLOGY_API_PORT ?? config.API_PORT + 1,
);

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "fibrepulse-topology-api",
    time: new Date().toISOString(),
  });
});

app.use("/api/topology", topologyRouter);

app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error(err);

    res.status(500).json({
      error: "internal_server_error",
      message:
        err instanceof Error
          ? err.message
          : "Unknown topology API error",
    });
  },
);

app.listen(topologyPort, () => {
  console.log(
    `FibrePulse topology API listening on port ${topologyPort}`,
  );
});
