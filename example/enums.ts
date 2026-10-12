import { withComment } from "@onozaty/drizzle-db-comments-generator";
import { pgEnum } from "drizzle-orm/pg-core";

export const productType = withComment(pgEnum("product_type", ["BOOK", "TOY", "FASHION"]), "商品種別");
