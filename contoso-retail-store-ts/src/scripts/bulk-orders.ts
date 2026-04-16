import { MongoClient } from "mongodb";
import dotenv from "dotenv";
dotenv.config();

const PRODUCTS = [
  { sku: "ELEC-001", price: 249.99 }, { sku: "ELEC-002", price: 49.99 },
  { sku: "ELEC-003", price: 299.99 }, { sku: "ELEC-004", price: 79.99 },
  { sku: "ELEC-005", price: 59.99 },  { sku: "ELEC-006", price: 129.99 },
  { sku: "ELEC-007", price: 44.99 },  { sku: "ELEC-008", price: 449.99 },
  { sku: "ELEC-009", price: 89.99 },  { sku: "ELEC-010", price: 179.99 },
  { sku: "ELEC-011", price: 399.99 }, { sku: "ELEC-012", price: 199.99 },
  { sku: "ELEC-013", price: 149.99 }, { sku: "APRL-001", price: 24.99 },
  { sku: "APRL-002", price: 189.99 }, { sku: "APRL-003", price: 69.99 },
  { sku: "APRL-004", price: 29.99 },  { sku: "APRL-005", price: 99.99 },
  { sku: "APRL-006", price: 34.99 },  { sku: "APRL-007", price: 39.99 },
  { sku: "APRL-008", price: 159.99 }, { sku: "APRL-009", price: 54.99 },
  { sku: "APRL-010", price: 64.99 },  { sku: "APRL-011", price: 74.99 },
  { sku: "APRL-012", price: 59.99 },  { sku: "HOME-001", price: 39.99 },
  { sku: "HOME-002", price: 34.99 },  { sku: "HOME-003", price: 49.99 },
  { sku: "HOME-004", price: 59.99 },  { sku: "HOME-005", price: 89.99 },
  { sku: "HOME-006", price: 44.99 },  { sku: "HOME-007", price: 69.99 },
  { sku: "HOME-008", price: 79.99 },  { sku: "HOME-009", price: 129.99 },
  { sku: "HOME-010", price: 29.99 },  { sku: "HOME-011", price: 54.99 },
  { sku: "HOME-012", price: 349.99 }, { sku: "HOME-013", price: 27.99 },
  { sku: "SPRT-001", price: 349.99 }, { sku: "SPRT-002", price: 39.99 },
  { sku: "SPRT-003", price: 29.99 },  { sku: "SPRT-004", price: 279.99 },
  { sku: "SPRT-005", price: 34.99 },  { sku: "SPRT-006", price: 89.99 },
  { sku: "SPRT-007", price: 19.99 },  { sku: "SPRT-008", price: 79.99 },
  { sku: "SPRT-009", price: 18.99 },  { sku: "SPRT-010", price: 34.99 },
  { sku: "SPRT-011", price: 22.99 },  { sku: "SPRT-012", price: 44.99 },
];

const CITIES = [
  { city: "Seattle", state: "WA", zip: "98101" },
  { city: "Austin", state: "TX", zip: "73301" },
  { city: "Chicago", state: "IL", zip: "60601" },
  { city: "Denver", state: "CO", zip: "80201" },
  { city: "Portland", state: "OR", zip: "97201" },
];

const STATUSES = ["pending", "confirmed", "shipped", "delivered", "cancelled"] as const;

function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateOrder() {
  const itemCount = rand(1, 4);
  const items = [];
  const usedSkus = new Set<string>();

  for (let i = 0; i < itemCount; i++) {
    let product;
    do { product = pick(PRODUCTS); } while (usedSkus.has(product.sku));
    usedSkus.add(product.sku);
    items.push({ sku: product.sku, quantity: rand(1, 3), unitPrice: product.price });
  }

  const totalAmount = Math.round(items.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0) * 100) / 100;
  const createdAt = new Date(Date.now() - rand(0, 30 * 24 * 60 * 60 * 1000));

  return {
    customerId: `CUST-${rand(1000, 9999)}`,
    items,
    status: pick(STATUSES),
    totalAmount,
    shippingAddress: pick(CITIES),
    createdAt,
    updatedAt: createdAt,
  };
}

async function main() {
  const uri = process.env.DOCUMENTDB_URI;
  if (!uri) { console.error("❌ DOCUMENTDB_URI not set in .env"); process.exit(1); }

  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(process.env.DB_NAME || "retaildb");
    const col = db.collection("orders");

    const TOTAL = 10000;
    const BATCH = 500;
    let inserted = 0;

    console.log(`⏳ Inserting ${TOTAL} orders into Azure DocumentDB in batches of ${BATCH}...`);

    for (let i = 0; i < TOTAL; i += BATCH) {
      const batchSize = Math.min(BATCH, TOTAL - i);
      const batch = Array.from({ length: batchSize }, generateOrder);
      const result = await col.insertMany(batch, { ordered: false });
      inserted += result.insertedCount;
      console.log(`  ✅ Batch ${Math.floor(i / BATCH) + 1}/${Math.ceil(TOTAL / BATCH)} — ${inserted}/${TOTAL} orders inserted`);
    }

    console.log(`\n🎉 Done! Inserted ${inserted} orders into Azure DocumentDB.`);
  } finally {
    await client.close();
  }
}

main().catch(console.error);
