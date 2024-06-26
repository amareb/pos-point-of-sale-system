const express = require("express");
const cors = require("cors");
const pool = require("./db");
const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/items", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM items");
    res.json(rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/orders", async (req, res) => {
  const { items } = req.body;
  const order_id = `order_${Date.now()}`;

  try {
    await pool.query("START TRANSACTION");

    let total_price = 0;
    for (const item of items) {
      const [rows] = await pool.query(
        "SELECT price, stock FROM items WHERE id = ?",
        [item.id]
      );
      const stock = rows[0].stock - item.quantity;
      if (stock < 0) {
        throw new Error(`Insufficient stock for item ${item.id}`);
      }
      total_price += rows[0].price * item.quantity;
      await pool.query("UPDATE items SET stock = ? WHERE id = ?", [
        stock,
        item.id,
      ]);
    }

    await pool.query(
      "INSERT INTO orders (id, items, total_price, status) VALUES (?, ?, ?, ?)",
      [order_id, JSON.stringify(items), total_price, "pending"]
    );
    await pool.query("COMMIT");

    res.json({ order_id, total_price });
  } catch (err) {
    await pool.query("ROLLBACK");
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/payment", async (req, res) => {
  const { order_id, payment_method } = req.body;

  try {
    const [order] = await pool.query("SELECT * FROM orders WHERE id = ?", [
      order_id,
    ]);
    if (order.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    await pool.query(
      "UPDATE orders SET status = ?, payment_method = ? WHERE id = ?",
      ["paid", payment_method, order_id]
    );
    res.json({ message: "Payment processed successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/analytics", async (req, res) => {
  try {
    const [totalSales] = await pool.query(
      'SELECT SUM(total_price) AS total_sales FROM orders WHERE status = "paid"'
    );
    const [totalOrders] = await pool.query(
      "SELECT COUNT(*) AS total_orders FROM orders"
    );

    res.json({
      total_sales: totalSales[0].total_sales,
      total_orders: totalOrders[0].total_orders,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
