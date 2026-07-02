import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.string().default("development"),
  DATABASE_URL: z.string().min(1),
  API_PORT: z.coerce.number().default(3000),
  SOURCE_APP: z.string().default("fibrepulseza"),
  BGP_CHECK_INTERVAL_MINUTES: z.coerce.number().default(15)
});

export const config = envSchema.parse(process.env);
