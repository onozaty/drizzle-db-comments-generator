import { withComment } from "drizzle-db-comments-generator";
import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
// Extensionless relative import, to check that schemas are loaded the same way as drizzle-kit
import { productType } from "./enums";

export { productType };

export const customers = withComment(
  pgTable("customers", {
    customerId: withComment(serial("customer_id").primaryKey(), "顧客ID"),
    name: withComment(text("name").notNull(), "氏名"),
    email: withComment(text("email").notNull().unique(), "メールアドレス\nログインにも使用する"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  }),
  "顧客",
);

export const products = withComment(
  pgTable("products", {
    productId: withComment(serial("product_id").primaryKey(), "商品ID"),
    name: withComment(text("name").notNull(), "商品名（'引用符'を含む）"),
    type: withComment(productType("type").notNull(), "商品種別"),
    price: withComment(integer("price").notNull(), "税抜価格"),
  }),
  "商品",
);
