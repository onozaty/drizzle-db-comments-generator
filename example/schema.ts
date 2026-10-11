import { pgTableWithComment } from "drizzle-db-comments-generator";
import { integer, serial, text, timestamp } from "drizzle-orm/pg-core";
// Extensionless relative import, to check that schemas are loaded the same way as drizzle-kit
import { productType } from "./enums";

export { productType };

export const customers = pgTableWithComment("customers", "顧客", {
  customerId: serial("customer_id").primaryKey().comment("顧客ID"),
  name: text("name").notNull().comment("氏名"),
  email: text("email").notNull().unique().comment("メールアドレス\nログインにも使用する"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const products = pgTableWithComment("products", "商品", {
  productId: serial("product_id").primaryKey().comment("商品ID"),
  name: text("name").notNull().comment("商品名（'引用符'を含む）"),
  type: productType("type").notNull().comment("商品種別"),
  price: integer("price").notNull().comment("税抜価格"),
});
