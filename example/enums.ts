import { pgEnum } from "drizzle-orm/pg-core";

export const productType = pgEnum("product_type", ["BOOK", "TOY", "FASHION"]);
