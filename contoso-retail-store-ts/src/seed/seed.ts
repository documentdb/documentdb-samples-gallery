import { ObjectId } from "mongodb";
import { config } from "../config/index.js";
import { connectDb, getDb, closeDb } from "../db/client.js";
import { generateEmbedding } from "../services/embeddingService.js";
import { ensureIndexes } from "../services/productService.js";
import type { Product, InventoryRecord, Order, OrderStatus } from "../types/index.js";

const WAREHOUSES = ["WH-SEATTLE", "WH-AUSTIN", "WH-CHICAGO"] as const;

const PRODUCTS_RAW: Omit<Product, "_id" | "embedding" | "createdAt">[] = [
  // ── Electronics (13) ──
  { sku: "ELEC-001", name: "Wireless Noise-Cancelling Headphones", category: "Electronics", description: "Premium over-ear headphones with adaptive noise cancellation and 30-hour battery life.", price: 249.99, tags: ["audio", "wireless", "noise-cancelling"] },
  { sku: "ELEC-002", name: "4K Ultra HD Streaming Media Player", category: "Electronics", description: "Stream your favorite content in stunning 4K HDR with Dolby Vision and Atmos support.", price: 49.99, tags: ["streaming", "4k", "media"] },
  { sku: "ELEC-003", name: "Smart Wi-Fi Mesh Router System", category: "Electronics", description: "Whole-home mesh Wi-Fi 6E coverage up to 6,000 sq ft with automatic band steering.", price: 299.99, tags: ["networking", "wifi", "router"] },
  { sku: "ELEC-004", name: "Portable Bluetooth Speaker", category: "Electronics", description: "Waterproof portable speaker with 360-degree sound and 20-hour playtime.", price: 79.99, tags: ["audio", "bluetooth", "portable"] },
  { sku: "ELEC-005", name: "USB-C Fast Charging Hub", category: "Electronics", description: "7-in-1 USB-C hub with 100W power delivery, HDMI 4K, and SD card reader.", price: 59.99, tags: ["accessories", "usb-c", "charging"] },
  { sku: "ELEC-006", name: "Mechanical Gaming Keyboard", category: "Electronics", description: "RGB mechanical keyboard with hot-swappable switches and programmable macros.", price: 129.99, tags: ["gaming", "keyboard", "mechanical"] },
  { sku: "ELEC-007", name: "Wireless Ergonomic Mouse", category: "Electronics", description: "Vertical ergonomic mouse with adjustable DPI and silent click technology.", price: 44.99, tags: ["mouse", "ergonomic", "wireless"] },
  { sku: "ELEC-008", name: "27-inch 4K Monitor", category: "Electronics", description: "Professional-grade IPS panel with 99% sRGB color accuracy and USB-C connectivity.", price: 449.99, tags: ["monitor", "4k", "display"] },
  { sku: "ELEC-009", name: "Smart Home Security Camera", category: "Electronics", description: "Indoor/outdoor security camera with night vision, two-way audio, and cloud storage.", price: 89.99, tags: ["security", "camera", "smart-home"] },
  { sku: "ELEC-010", name: "Wireless Earbuds Pro", category: "Electronics", description: "True wireless earbuds with active noise cancellation and spatial audio support.", price: 179.99, tags: ["audio", "wireless", "earbuds"] },
  { sku: "ELEC-011", name: "Portable Power Station", category: "Electronics", description: "500Wh portable power station with solar panel input and multiple AC outlets.", price: 399.99, tags: ["power", "portable", "camping"] },
  { sku: "ELEC-012", name: "Digital Drawing Tablet", category: "Electronics", description: "Pen tablet with 8192 pressure levels and tilt recognition for digital artists.", price: 199.99, tags: ["tablet", "drawing", "creative"] },
  { sku: "ELEC-013", name: "Smart Doorbell Camera", category: "Electronics", description: "Video doorbell with HDR video, package detection, and quick replies.", price: 149.99, tags: ["smart-home", "doorbell", "security"] },

  // ── Apparel (12) ──
  { sku: "APRL-001", name: "Premium Merino Wool Crew Socks", category: "Apparel", description: "Ultra-soft merino wool blend socks with moisture-wicking and temperature regulation.", price: 24.99, tags: ["socks", "merino", "wool"] },
  { sku: "APRL-002", name: "Waterproof Trail Running Jacket", category: "Apparel", description: "Lightweight waterproof-breathable jacket with sealed seams and reflective detailing.", price: 189.99, tags: ["jacket", "waterproof", "running"] },
  { sku: "APRL-003", name: "Stretch Denim Slim Fit Jeans", category: "Apparel", description: "Comfort-stretch denim jeans with a modern slim fit and reinforced stitching.", price: 69.99, tags: ["jeans", "denim", "slim-fit"] },
  { sku: "APRL-004", name: "Organic Cotton Graphic Tee", category: "Apparel", description: "Sustainably sourced 100% organic cotton t-shirt with vintage-inspired graphic print.", price: 29.99, tags: ["t-shirt", "organic", "casual"] },
  { sku: "APRL-005", name: "Insulated Puffer Vest", category: "Apparel", description: "Lightweight insulated vest with synthetic down fill and packable design.", price: 99.99, tags: ["vest", "insulated", "layering"] },
  { sku: "APRL-006", name: "UV Protection Sun Hat", category: "Apparel", description: "Wide-brim hat with UPF 50+ protection and adjustable chin strap.", price: 34.99, tags: ["hat", "sun-protection", "outdoor"] },
  { sku: "APRL-007", name: "Performance Athletic Shorts", category: "Apparel", description: "Quick-dry athletic shorts with built-in liner and zippered pocket.", price: 39.99, tags: ["shorts", "athletic", "quick-dry"] },
  { sku: "APRL-008", name: "Cashmere V-Neck Sweater", category: "Apparel", description: "Luxurious 100% cashmere sweater with ribbed cuffs and a relaxed fit.", price: 159.99, tags: ["sweater", "cashmere", "luxury"] },
  { sku: "APRL-009", name: "Convertible Travel Pants", category: "Apparel", description: "Zip-off travel pants that convert to shorts with wrinkle-resistant fabric.", price: 54.99, tags: ["pants", "travel", "convertible"] },
  { sku: "APRL-010", name: "Thermal Base Layer Set", category: "Apparel", description: "Midweight thermal top and bottom set for cold-weather layering.", price: 64.99, tags: ["base-layer", "thermal", "winter"] },
  { sku: "APRL-011", name: "Recycled Fleece Hoodie", category: "Apparel", description: "Cozy hoodie made from 100% recycled polyester fleece with kangaroo pocket.", price: 74.99, tags: ["hoodie", "fleece", "sustainable"] },
  { sku: "APRL-012", name: "Compression Running Tights", category: "Apparel", description: "Graduated compression tights with reflective logos and hidden waist pocket.", price: 59.99, tags: ["tights", "compression", "running"] },

  // ── Home (13) ──
  { sku: "HOME-001", name: "Stainless Steel French Press", category: "Home", description: "Double-wall insulated French press that keeps coffee hot for hours. Dishwasher safe.", price: 39.99, tags: ["coffee", "french-press", "kitchen"] },
  { sku: "HOME-002", name: "Bamboo Cutting Board Set", category: "Home", description: "Set of three organic bamboo cutting boards with juice grooves and easy-grip handles.", price: 34.99, tags: ["kitchen", "bamboo", "cutting-board"] },
  { sku: "HOME-003", name: "Smart LED Bulb Starter Kit", category: "Home", description: "Pack of four Wi-Fi smart bulbs with 16M colors, scheduling, and voice control.", price: 49.99, tags: ["lighting", "smart-home", "led"] },
  { sku: "HOME-004", name: "Memory Foam Pillow", category: "Home", description: "Contour memory foam pillow with cooling gel layer and removable bamboo cover.", price: 59.99, tags: ["pillow", "memory-foam", "sleep"] },
  { sku: "HOME-005", name: "Cast Iron Dutch Oven", category: "Home", description: "6-quart enameled cast iron Dutch oven with self-basting lid. Oven-safe to 500°F.", price: 89.99, tags: ["cooking", "cast-iron", "dutch-oven"] },
  { sku: "HOME-006", name: "Ceramic Plant Pot Set", category: "Home", description: "Set of three modern ceramic planters with drainage holes and bamboo saucers.", price: 44.99, tags: ["garden", "planters", "ceramic"] },
  { sku: "HOME-007", name: "Automatic Pet Feeder", category: "Home", description: "Programmable pet feeder with portion control and stainless steel bowl.", price: 69.99, tags: ["pets", "feeder", "automatic"] },
  { sku: "HOME-008", name: "Weighted Throw Blanket", category: "Home", description: "15lb weighted blanket with micro-fleece cover for deep pressure relaxation.", price: 79.99, tags: ["blanket", "weighted", "comfort"] },
  { sku: "HOME-009", name: "Air Purifier with HEPA Filter", category: "Home", description: "True HEPA air purifier for rooms up to 400 sq ft with auto mode and sleep timer.", price: 129.99, tags: ["air-purifier", "hepa", "health"] },
  { sku: "HOME-010", name: "Insulated Water Bottle", category: "Home", description: "32oz vacuum-insulated stainless steel bottle keeps drinks cold 24h or hot 12h.", price: 29.99, tags: ["bottle", "insulated", "hydration"] },
  { sku: "HOME-011", name: "Electric Kettle with Temperature Control", category: "Home", description: "1.7L glass electric kettle with six preset temperatures and keep-warm function.", price: 54.99, tags: ["kettle", "electric", "kitchen"] },
  { sku: "HOME-012", name: "Robotic Vacuum Cleaner", category: "Home", description: "Smart robot vacuum with LiDAR navigation, app control, and auto-empty dock.", price: 349.99, tags: ["vacuum", "robot", "cleaning"] },
  { sku: "HOME-013", name: "Essential Oil Diffuser", category: "Home", description: "Ultrasonic aromatherapy diffuser with color-changing LED and 300ml capacity.", price: 27.99, tags: ["diffuser", "aromatherapy", "wellness"] },

  // ── Sports (12) ──
  { sku: "SPRT-001", name: "Adjustable Dumbbell Set", category: "Sports", description: "Pair of adjustable dumbbells from 5-52.5 lbs each with quick-change dial system.", price: 349.99, tags: ["weights", "dumbbell", "strength"] },
  { sku: "SPRT-002", name: "Non-Slip Yoga Mat", category: "Sports", description: "6mm thick TPE yoga mat with alignment lines and carrying strap. Eco-friendly.", price: 39.99, tags: ["yoga", "mat", "fitness"] },
  { sku: "SPRT-003", name: "Resistance Band Set", category: "Sports", description: "Set of five latex resistance bands with door anchor, handles, and ankle straps.", price: 29.99, tags: ["resistance", "bands", "workout"] },
  { sku: "SPRT-004", name: "GPS Sports Watch", category: "Sports", description: "Multi-sport GPS watch with heart rate, blood oxygen, and 14-day battery life.", price: 279.99, tags: ["watch", "gps", "fitness-tracker"] },
  { sku: "SPRT-005", name: "Foam Roller Recovery Kit", category: "Sports", description: "High-density foam roller with massage ball and trigger point release set.", price: 34.99, tags: ["recovery", "foam-roller", "massage"] },
  { sku: "SPRT-006", name: "Hydration Running Vest", category: "Sports", description: "Lightweight running vest with two soft flask bottles and multiple gear pockets.", price: 89.99, tags: ["running", "hydration", "vest"] },
  { sku: "SPRT-007", name: "Jump Rope Speed Cable", category: "Sports", description: "Adjustable speed jump rope with ball bearings and weighted handles for cardio.", price: 19.99, tags: ["jump-rope", "cardio", "speed"] },
  { sku: "SPRT-008", name: "Collapsible Hiking Poles", category: "Sports", description: "Carbon fiber trekking poles with cork grips and quick-lock adjustment.", price: 79.99, tags: ["hiking", "poles", "trekking"] },
  { sku: "SPRT-009", name: "Insulated Cycling Water Bottle", category: "Sports", description: "24oz insulated squeeze bottle designed to fit standard bike cage mounts.", price: 18.99, tags: ["cycling", "bottle", "hydration"] },
  { sku: "SPRT-010", name: "Pull-Up Bar Doorway Mount", category: "Sports", description: "Heavy-duty pull-up bar that fits doorways 26-36 inches wide, no screws needed.", price: 34.99, tags: ["pull-up", "bar", "home-gym"] },
  { sku: "SPRT-011", name: "Swim Goggles Anti-Fog", category: "Sports", description: "Competition swim goggles with anti-fog coating and UV protection lenses.", price: 22.99, tags: ["swimming", "goggles", "competition"] },
  { sku: "SPRT-012", name: "Portable Camping Hammock", category: "Sports", description: "Double-size parachute nylon hammock with tree straps, holds up to 500 lbs.", price: 44.99, tags: ["camping", "hammock", "outdoor"] },
];

const CITIES = [
  { city: "Seattle", state: "WA", zip: "98101" },
  { city: "Austin", state: "TX", zip: "73301" },
  { city: "Chicago", state: "IL", zip: "60601" },
  { city: "Denver", state: "CO", zip: "80201" },
  { city: "Portland", state: "OR", zip: "97201" },
];

const STATUSES: OrderStatus[] = ["pending", "confirmed", "shipped", "delivered", "cancelled"];

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

async function seed(): Promise<void> {
  console.log("🌱 Starting seed...\n");
  await connectDb();
  const db = getDb();

  // Drop existing collections
  const collections = await db.listCollections().toArray();
  for (const col of collections) {
    await db.dropCollection(col.name);
    console.log(`  Dropped collection: ${col.name}`);
  }

  // ── Products ──
  console.log("\n📦 Seeding products...");
  const products: Product[] = [];

  for (let i = 0; i < PRODUCTS_RAW.length; i++) {
    const raw = PRODUCTS_RAW[i]!;
    const text = `${raw.name} ${raw.description} ${raw.tags.join(" ")}`;
    console.log(`  [${i + 1}/${PRODUCTS_RAW.length}] Generating embedding for ${raw.sku}...`);
    const embedding = await generateEmbedding(text);

    products.push({
      _id: new ObjectId(),
      ...raw,
      embedding,
      createdAt: new Date(Date.now() - randomInt(0, 90) * 86_400_000),
    });
  }

  await db.collection<Product>("products").insertMany(products);
  console.log(`  ✅ ${products.length} products inserted`);

  // ── Inventory ──
  console.log("\n📊 Seeding inventory...");
  const inventory: InventoryRecord[] = [];

  for (const product of products) {
    for (const wh of WAREHOUSES) {
      inventory.push({
        _id: new ObjectId(),
        sku: product.sku,
        warehouseId: wh,
        quantityOnHand: randomInt(0, 500),
        reorderThreshold: randomInt(10, 50),
        lastUpdated: new Date(),
      });
    }
  }

  await db.collection<InventoryRecord>("inventory").insertMany(inventory);
  console.log(`  ✅ ${inventory.length} inventory records inserted`);

  // ── Orders ──
  console.log("\n🛒 Seeding orders...");
  const orders: Order[] = [];

  for (let i = 0; i < 25; i++) {
    const itemCount = randomInt(1, 4);
    const items = Array.from({ length: itemCount }, () => {
      const product = pickRandom(products);
      return {
        sku: product.sku,
        quantity: randomInt(1, 3),
        unitPrice: product.price,
      };
    });

    const totalAmount = Math.round(
      items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0) * 100
    ) / 100;

    const now = new Date(Date.now() - randomInt(0, 30) * 86_400_000);
    orders.push({
      _id: new ObjectId(),
      customerId: `CUST-${String(randomInt(1000, 9999))}`,
      items,
      status: pickRandom(STATUSES),
      totalAmount,
      shippingAddress: pickRandom(CITIES),
      createdAt: now,
      updatedAt: now,
    });
  }

  await db.collection<Order>("orders").insertMany(orders);
  console.log(`  ✅ ${orders.length} orders inserted`);

  // ── Indexes ──
  console.log("\n🔍 Creating indexes...");
  await ensureIndexes();

  await db.collection("inventory").createIndex({ sku: 1 }, { name: "idx_inv_sku" });
  await db.collection("orders").createIndex({ customerId: 1 }, { name: "idx_order_customer" });
  console.log("  ✅ Indexes created");

  console.log("\n🎉 Seed complete!");
  console.log(`   Products:  ${products.length}`);
  console.log(`   Inventory: ${inventory.length}`);
  console.log(`   Orders:    ${orders.length}`);

  await closeDb();
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
