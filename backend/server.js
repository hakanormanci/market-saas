const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { Pool } = require('pg');

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;

// 🔗 Supabase'den kopyaladığın URI linkini buraya yapıştır (Şifreni içine yazmayı unutma!)
const connectionString = "postgresql://postgres.ftgopveczerwhrwbztok:fb1907***Volkan@aws-0-eu-west-1.pooler.supabase.com:5432/postgres";

// PostgreSQL Bağlantı Havuzu
const pool = new Pool({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false } // Bulut sunucuları (Render/Supabase) güvenliği için şart
});

// Sabit Ürün Tanımları (Barkod Sözlüğü)
const productDictionary = {
    "8690504012345": { product_name: "Sütaş Süt 1L", category: "Kühlschrank" },
    "8690504055555": { product_name: "Gazi Beyaz Peynir", category: "Kühlschrank" },
    "4000123456789": { product_name: "Coca Cola 330ml", category: "Getränke" }
};

// API - 1: Barkod Sorgulama (Sözlükten isim ve kategori çeker)
app.get('/api/products/:barcode', (req, res) => {
    const { barcode } = req.params;
    const found = productDictionary[barcode];

    if (found) {
        res.json({ success: true, data: { barcode, ...found } });
    } else {
        res.json({ success: true, data: { barcode, product_name: '', category: 'Kühlschrank' } });
    }
});

// API - 2: Envantere Kaydet / Güncelle (PostgreSQL uyumlu ON CONFLICT)
app.post('/api/inventory', async (req, res) => {
    const { barcode, product_name, category, expiration_date, quantity } = req.body;

    if (!barcode || !expiration_date || !quantity) {
        return res.status(400).json({ success: false, message: "Eksik alan bıraktınız!" });
    }

    try {
        // PostgreSQL'de çakışma durumunda (Aynı barkod ve aynı SKT) adet güncellemesi yapıyoruz
        await pool.query(`
            INSERT INTO inventory (id, barcode, product_name, category, expiration_date, quantity)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (barcode, expiration_date) 
            DO UPDATE SET quantity = inventory.quantity + EXCLUDED.quantity
        `, [
            `stok_${Date.now()}`,
            barcode,
            product_name || "Bilinmeyen Ürün",
            category || "Kühlschrank",
            expiration_date,
            Number(quantity)
        ]);

        // Güncel listeyi buluttan çekip frontend'e dönüyoruz
        const result = await pool.query('SELECT * FROM inventory ORDER BY expiration_date ASC');
        res.json({ success: true, message: "Supabase başarıyla güncellendi!", data: result.rows });
    } catch (err) {
        console.error("Kayıt sırasında hata oluştu:", err);
        res.status(500).json({ success: false, message: "Bulut veritabanı hatası!" });
    }
});

// API - 3: Tüm Envanteri Listeleme
app.get('/api/inventory', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM inventory ORDER BY expiration_date ASC');
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error("Veriler çekilirken hata oluştu:", err);
        res.status(500).json({ success: false, message: "Veriler çekilemedi." });
    }
});

// Sunucuyu dışa açık (0.0.0.0) şekilde başlatıyoruz
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Backend ${PORT} portunda bulut bağlantısı ile çalışıyor...`);
});