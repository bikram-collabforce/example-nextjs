import { Pool } from "pg";
import bcrypt from "bcryptjs";

const DATABASE_URL =
  "postgresql://postgres:wZvXUnfkNQnAvrrcQqwdIbVkUBAIGnjr@shortline.proxy.rlwy.net:12476/railway";

export const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      name VARCHAR(255) NOT NULL,
      role VARCHAR(100) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  const { rows } = await pool.query("SELECT COUNT(*) FROM users");
  if (parseInt(rows[0].count, 10) === 0) {
    const hash = await bcrypt.hash("Abcd@1234", 10);
    const users = [
      {
        email: "developer@collabforce.com",
        name: "Alex Johnson",
        role: "Developer",
      },
      {
        email: "manager@collabforce.com",
        name: "Sarah Mitchell",
        role: "Manager",
      },
      {
        email: "pm@collabforce.com",
        name: "David Chen",
        role: "Project Manager",
      },
      {
        email: "leadership@collabforce.com",
        name: "Rachel Torres",
        role: "VP of Engineering",
      },
    ];

    for (const u of users) {
      await pool.query(
        "INSERT INTO users (email, password, name, role) VALUES ($1, $2, $3, $4)",
        [u.email, hash, u.name, u.role],
      );
    }

    console.log("Seeded 4 users into the database.");
  }
}
