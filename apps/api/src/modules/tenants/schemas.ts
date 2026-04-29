import { z } from "zod";

export const createTenantBodySchema = z.object({
  slug: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z][a-z0-9_-]{1,49}$/, "slug debe empezar con letra y contener solo a-z 0-9 _ -"),
  name: z.string().min(1).max(120),
  planCode: z.string().min(1).default("free"),
});

export const tenantParamsSchema = z.object({
  slug: z.string().min(1),
});
