require("dotenv").config();
const { MongoClient } = require("mongodb");

const uri = process.env.DOCUMENTDB_URI;
const dbName = process.env.DB_NAME || "sampledb";

const products = [
  {
    name: "Wireless Noise-Cancelling Headphones",
    category: "Electronics",
    price: 249.99,
    description:
      "Premium over-ear headphones with 30-hour battery life and industry-leading noise cancellation.",
    image: "https://placehold.co/400x300/1a1a2e/ffffff?text=Headphones",
    stock: 42,
    rating: 4.8,
    reviews: 1240,
  },
  {
    name: "Ultra-Slim Laptop 14\"",
    category: "Electronics",
    price: 1099.0,
    description:
      "Featherlight 14-inch laptop with Intel Core i7, 16 GB RAM, and all-day battery.",
    image: "https://placehold.co/400x300/16213e/ffffff?text=Laptop",
    stock: 18,
    rating: 4.6,
    reviews: 874,
  },
  {
    name: "Leather Crossbody Bag",
    category: "Fashion",
    price: 89.95,
    description:
      "Genuine leather crossbody bag with adjustable strap, multiple pockets, and brass hardware.",
    image: "https://placehold.co/400x300/0f3460/ffffff?text=Bag",
    stock: 60,
    rating: 4.5,
    reviews: 532,
  },
  {
    name: "Running Shoes Pro",
    category: "Footwear",
    price: 129.99,
    description:
      "Lightweight, responsive running shoes with carbon-fiber plate and breathable mesh upper.",
    image: "https://placehold.co/400x300/533483/ffffff?text=Shoes",
    stock: 85,
    rating: 4.7,
    reviews: 2100,
  },
  {
    name: "Stainless Steel Water Bottle",
    category: "Home & Kitchen",
    price: 34.99,
    description:
      "Double-wall vacuum insulated 32 oz bottle — keeps drinks cold 24 h, hot 12 h.",
    image: "https://placehold.co/400x300/e94560/ffffff?text=Bottle",
    stock: 200,
    rating: 4.9,
    reviews: 3400,
  },
  {
    name: "Smart Watch Series X",
    category: "Electronics",
    price: 399.0,
    description:
      "Always-on Retina display, ECG, blood oxygen monitoring, and GPS in a slim aluminium case.",
    image: "https://placehold.co/400x300/1a1a2e/e94560?text=Watch",
    stock: 30,
    rating: 4.8,
    reviews: 985,
  },
  {
    name: "Organic Cotton T-Shirt",
    category: "Fashion",
    price: 29.99,
    description:
      "100% GOTS-certified organic cotton, pre-washed for a soft feel. Available in 8 colours.",
    image: "https://placehold.co/400x300/16213e/e94560?text=T-Shirt",
    stock: 150,
    rating: 4.4,
    reviews: 720,
  },
  {
    name: "Ceramic Pour-Over Coffee Set",
    category: "Home & Kitchen",
    price: 54.95,
    description:
      "Hand-crafted ceramic dripper, carafe, and two mugs — everything you need for the perfect pour-over.",
    image: "https://placehold.co/400x300/0f3460/e94560?text=Coffee+Set",
    stock: 75,
    rating: 4.6,
    reviews: 410,
  },
];

async function seed() {
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log("Connected to DocumentDB.");

    const db = client.db(dbName);
    const collection = db.collection("products");

    // Clear existing products and re-seed
    await collection.deleteMany({});
    const result = await collection.insertMany(products);
    console.log(`Seeded ${result.insertedCount} products into '${dbName}.products'.`);

    // Create indexes for common query patterns
    await collection.createIndex({ category: 1 });
    await collection.createIndex({ price: 1 });
    await collection.createIndex({ rating: -1 });
    console.log("Indexes created.");
  } finally {
    await client.close();
  }
}

seed().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
