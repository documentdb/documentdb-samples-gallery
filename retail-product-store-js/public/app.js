/* ─── State ─────────────────────────────────────── */
let currentCategory = "All";
let currentSort = "";
let searchQuery = "";

/* ─── DOM refs ──────────────────────────────────── */
const grid = document.getElementById("productGrid");
const categoryTabs = document.getElementById("categoryTabs");
const sortSelect = document.getElementById("sortSelect");
const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");
const productCount = document.getElementById("productCount");
const modal = document.getElementById("modal");
const modalClose = document.getElementById("modalClose");
const modalBackdrop = document.getElementById("modalBackdrop");
const modalContent = document.getElementById("modalContent");

/* ─── Security helper ───────────────────────────── */
function esc(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* ─── Fetch helpers ─────────────────────────────── */
async function fetchProducts() {
  const params = new URLSearchParams();
  if (currentCategory !== "All") params.set("category", currentCategory);
  if (currentSort) params.set("sort", currentSort);
  if (searchQuery) params.set("search", searchQuery);

  const res = await fetch(`/api/products?${params}`);
  if (!res.ok) throw new Error("Failed to load products");
  return res.json();
}

async function fetchCategories() {
  const res = await fetch("/api/categories");
  if (!res.ok) throw new Error("Failed to load categories");
  return res.json();
}

/* ─── Render helpers ────────────────────────────── */
function stockLabel(stock) {
  if (stock === 0) return `<span class="stock-badge out-stock">Out of stock</span>`;
  if (stock < 10) return `<span class="stock-badge low-stock">Only ${stock} left</span>`;
  return `<span class="stock-badge in-stock">In stock</span>`;
}

function stars(rating) {
  const full = Math.round(rating);
  return "★".repeat(full) + "☆".repeat(5 - full);
}

function renderCards(products) {
  if (!products.length) {
    grid.innerHTML = `<div class="empty-state">No products found. Try a different search or category.</div>`;
    productCount.textContent = "";
    return;
  }

  productCount.textContent = `${products.length} product${products.length !== 1 ? "s" : ""} found`;

  grid.innerHTML = products
    .map(
      (p) => `
      <div class="product-card" data-id="${esc(p._id)}" role="button" tabindex="0" aria-label="${esc(p.name)}">
        <img class="card-image" src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy" />
        <div class="card-body">
          <div class="card-category">${esc(p.category)}</div>
          <div class="card-name">${esc(p.name)}</div>
          <div class="card-description">${esc(p.description)}</div>
          <div class="card-footer">
            <div class="card-price">$${p.price.toFixed(2)}</div>
            <div class="card-rating">${stars(p.rating)} <span>(${p.reviews.toLocaleString()})</span></div>
          </div>
          ${stockLabel(p.stock)}
        </div>
      </div>`
    )
    .join("");

  grid.querySelectorAll(".product-card").forEach((card) => {
    card.addEventListener("click", () => openModal(card.dataset.id, products));
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") openModal(card.dataset.id, products);
    });
  });
}

function renderTabs(categories) {
  categoryTabs.innerHTML = categories
    .map(
      (cat) =>
        `<button class="tab-btn ${cat === currentCategory ? "active" : ""}" data-cat="${esc(cat)}">${esc(cat)}</button>`
    )
    .join("");

  categoryTabs.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentCategory = btn.dataset.cat;
      renderTabs(categories);
      loadProducts();
    });
  });
}

/* ─── Modal ─────────────────────────────────────── */
function openModal(id, products) {
  const p = products.find((x) => String(x._id) === id);
  if (!p) return;

  modalContent.innerHTML = `
    <img class="modal-image" src="${esc(p.image)}" alt="${esc(p.name)}" />
    <div class="modal-body">
      <div class="modal-category">${esc(p.category)}</div>
      <div class="modal-name">${esc(p.name)}</div>
      <div class="modal-description">${esc(p.description)}</div>
      <div class="modal-meta">
        <div class="meta-item">
          <span class="meta-label">Price</span>
          <span class="meta-value">$${p.price.toFixed(2)}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Rating</span>
          <span class="meta-value" style="color:#f5c518">${stars(p.rating)} ${p.rating}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Reviews</span>
          <span class="meta-value">${p.reviews.toLocaleString()}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Stock</span>
          <span class="meta-value">${p.stock}</span>
        </div>
      </div>
      <button class="btn-add" data-name="${esc(p.name)}">Add to Cart</button>
    </div>`;

  modalContent.querySelector(".btn-add").addEventListener("click", (e) => {
    addToCart(e.currentTarget.dataset.name);
  });

  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeModal() {
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

modalClose.addEventListener("click", closeModal);
modalBackdrop.addEventListener("click", closeModal);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

/* ─── Cart toast ────────────────────────────────── */
function addToCart(name) {
  closeModal();
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = `✓  "${name}" added to cart`;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 400);
  }, 2400);
}

/* ─── Load ──────────────────────────────────────── */
async function loadProducts() {
  grid.innerHTML = `<div class="loading">Loading products</div>`;
  productCount.textContent = "";
  try {
    const products = await fetchProducts();
    renderCards(products);
  } catch {
    grid.innerHTML = `<div class="empty-state">⚠ Could not load products. Is the server running?</div>`;
  }
}

/* ─── Event wiring ──────────────────────────────── */
sortSelect.addEventListener("change", () => {
  currentSort = sortSelect.value;
  loadProducts();
});

function triggerSearch() {
  searchQuery = searchInput.value.trim();
  loadProducts();
}

searchBtn.addEventListener("click", triggerSearch);
searchInput.addEventListener("keydown", (e) => { if (e.key === "Enter") triggerSearch(); });

/* ─── Init ──────────────────────────────────────── */
(async () => {
  try {
    const categories = await fetchCategories();
    renderTabs(categories);
  } catch {
    categoryTabs.innerHTML = "";
  }
  loadProducts();
})();
