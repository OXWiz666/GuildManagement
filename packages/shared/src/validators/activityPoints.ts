import { z } from "zod";
import { CUSTOMIZABLE_ROLES } from "../types/roles";

const multipliersSchema = z.object(
  CUSTOMIZABLE_ROLES.reduce(
    (acc, role) => {
      acc[role] = z.number().min(0).max(20);
      return acc;
    },
    {} as Record<(typeof CUSTOMIZABLE_ROLES)[number], ReturnType<typeof z.number>>,
  ),
);

export const activityPointRuleSchema = z.object({
  key: z.string().trim().min(1).max(60),
  label: z.string().trim().min(1, "Activity name is required").max(80),
  basePoints: z.number().min(0).max(100000),
  multipliers: multipliersSchema,
});
export type ActivityPointRuleInput = z.infer<typeof activityPointRuleSchema>;

export const activityPointRulesSchema = z.object({
  activities: z.array(activityPointRuleSchema).max(60),
});
export type ActivityPointRulesInput = z.infer<typeof activityPointRulesSchema>;
