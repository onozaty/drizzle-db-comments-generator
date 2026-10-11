import { pgTableWithComment } from "drizzle-db-comments-generator";
import { integer, pgEnum, serial, text, timestamp } from "drizzle-orm/pg-core";

export const productType = pgEnum("product_type", ["BOOK", "TOY", "FASHION"]);

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
