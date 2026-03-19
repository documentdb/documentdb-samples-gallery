require("dotenv").config();
const express = require("express");
const { MongoClient, ObjectId } = require("mongodb");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const uri = process.env.DOCUMENTDB_URI;
const dbName = process.env.DB_NAME || "sampledb";

let db;

async function connectDB() {
  const client = new MongoClient(uri);
  await client.connect();
  db = client.db(dbName);
  console.log(`Connected to DocumentDB — database: ${dbName}`);
}

// Serve static files from /public
app.use(express.static(path.join(__dirname, "public")));

// GET /api/products — supports ?category=&sort=&search=
app.get("/api/products", async (req, res) => {
  try {
    const { category, sort, search } = req.query;
    const filter = {};

    if (category && category !== "All") {
      filter.category = category;
    }

    if (search) {
      filter.name = { $regex: search, $options: "i" };
    }

    let sortOption = {};
    if (sort === "price_asc") sortOption = { price: 1 };
    else if (sort === "price_desc") sortOption = { price: -1 };
    else if (sort === "rating") sortOption = { rating: -1 };
    else sortOption = { name: 1 }; // default: alphabetical

    const products = await db
      .collection("products")
      .find(filter)
      .sort(sortOption)
      .toArray();

    res.json(products);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch products" });
  }
});

// GET /api/categories — distinct categories
app.get("/api/categories", async (req, res) => {
  try {
    const categories = await db.collection("products").distinct("category");
    res.json(["All", ...categories.sort()]);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch categories" });
  }
});

// GET /api/products/:id
app.get("/api/products/:id", async (req, res) => {
  try {
    const product = await db
      .collection("products")
      .findOne({ _id: new ObjectId(req.params.id) });

    if (!product) return res.status(404).json({ error: "Product not found" });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch product" });
  }
});

connectDB()
  .then(() => {
    app.listen(PORT, () =>
      console.log(`Retail store running at http://localhost:${PORT}`)
    );
  })
  .catch((err) => {
    console.error("Could not connect to DocumentDB:", err.message);
    process.exit(1);
  });
