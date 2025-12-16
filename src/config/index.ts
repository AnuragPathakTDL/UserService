import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  HTTP_HOST: z.string().default("0.0.0.0"),
  HTTP_PORT: z.coerce.number().int().positive().default(4500),
  HTTP_BODY_LIMIT: z.coerce.number().int().positive().default(1_048_576),
  GRPC_BIND_ADDRESS: z.string().default("0.0.0.0:50052"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
  SERVICE_AUTH_TOKEN: z.string().optional(),
  AUTH_SERVICE_ADDRESS: z
    .string()
    .optional()
    .transform((value) =>
      value && value.trim().length > 0 ? value : undefined
    ),
  AUTH_SERVICE_TOKEN: z.string().optional(),
});

type Env = z.infer<typeof envSchema>;

let cachedConfig: Env | null = null;

export function loadConfig(): Env {
  if (cachedConfig) {
    return cachedConfig;
  }
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${message}`);
  }
  cachedConfig = parsed.data;
  return cachedConfig;
}

export function resetConfigCache() {
  cachedConfig = null;
}
