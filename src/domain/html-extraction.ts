import { z } from "zod";

const path = z.string().min(1).max(300);
const field = z.object({
  selector: path.optional(),
  attribute: z.string().min(1).max(80).optional(),
  path: path.optional(),
  prefix: z.string().max(100).optional(),
});
const date = field.extend({
  format: z.enum(["iso", "ymd", "month-name"]),
  semantic: z.enum(["published", "created", "registered"]),
});

export const HtmlExtractionSchema = z
  .object({
    records: path,
    jsonPath: path.optional(),
    title: field,
    link: field.optional(),
    date: date.optional(),
    detail: z
      .object({
        take: z.number().int().min(1).max(3),
        title: field,
        date,
        alternateDate: field.optional(),
      })
      .optional(),
  })
  .refine((value) => Boolean(value.date) !== Boolean(value.detail), {
    message: "Configure either a record date or a bounded detail extraction",
  })
  .refine((value) => !value.detail || Boolean(value.link), {
    message: "Detail extraction requires an explicit record link",
  });

export type HtmlExtraction = z.infer<typeof HtmlExtractionSchema>;
export type HtmlField = z.infer<typeof field>;
export type HtmlDate = z.infer<typeof date>;
