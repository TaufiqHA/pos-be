# POS Backend API Documentation

Dokumentasi ini berisi spesifikasi seluruh *endpoint* REST API untuk aplikasi Point of Sales (POS).
Base URL: `http://localhost:5000` (atau port sesuai `.env`)

---

## 1. Modul Auth

### `POST /api/auth/login`
- **Deskripsi:** Melakukan login user dan mengembalikan JWT token.
- **Auth Required:** `No`
- **Request Body:**
  ```json
  {
    "email": "admin@pos.com (string, wajib)",
    "password": "password123 (string, wajib)"
  }
  ```
- **Response Sukses (200 OK):**
  ```json
  {
    "user": {
      "id": "uuid",
      "name": "Admin Pusat",
      "email": "admin@pos.com",
      "role": "Admin",
      "status": "Aktif",
      "branchId": null
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR..."
  }
  ```

### `GET /api/auth/me`
- **Deskripsi:** Mendapatkan data user yang saat ini sedang login berdasarkan token.
- **Auth Required:** `Yes` (Gunakan Bearer Token)
- **Request Body / Params:** Kosong
- **Response Sukses (200 OK):**
  ```json
  {
    "id": "uuid",
    "name": "Admin Pusat",
    "email": "admin@pos.com",
    "role": "Admin",
    "status": "Aktif",
    "branchId": null,
    "createdAt": "2026-06-10T12:00:00.000Z",
    "updatedAt": "2026-06-10T12:00:00.000Z"
  }
  ```

---

## 2. Modul CRUD Master Data

### Users (`/api/users`)

#### `GET /api/users`
- **Deskripsi:** Mendapatkan daftar semua user.
- **Auth Required:** `Yes`
- **Request Body / Params:** Kosong
- **Response Sukses (200 OK):**
  ```json
  [
    {
      "id": "uuid",
      "name": "Admin Pusat",
      "email": "admin@pos.com",
      "role": "Admin",
      "status": "Aktif",
      "branchId": null,
      "branch": { /* Data cabang jika ada */ }
    }
  ]
  ```

#### `POST /api/users`
- **Deskripsi:** Menambahkan user baru.
- **Auth Required:** `Yes`
- **Request Body:**
  ```json
  {
    "name": "Kasir Baru (string, wajib)",
    "email": "kasir@pos.com (string, wajib)",
    "password": "password123 (string, wajib)",
    "role": "Sales (string, wajib)",
    "status": "Aktif (string, opsional)",
    "branchId": "uuid-cabang (string, opsional)"
  }
  ```
- **Response Sukses (200 OK):** Mengembalikan data user yang baru dibuat.

#### `PUT /api/users/:id`
- **Deskripsi:** Mengubah data user.
- **Auth Required:** `Yes`
- **Request Body:** (Semua field opsional)
  ```json
  {
    "name": "Kasir Update",
    "password": "newpassword123",
    "status": "Nonaktif"
  }
  ```
- **Response Sukses (200 OK):** Mengembalikan data user yang telah diupdate.

#### `DELETE /api/users/:id`
- **Deskripsi:** Menghapus user.
- **Auth Required:** `Yes`
- **Request Body / Params:** Kosong
- **Response Sukses (200 OK):**
  ```json
  {
    "message": "Deleted"
  }
  ```

---
*(Seluruh entitas master data memiliki pola GET, POST, PUT, DELETE yang serupa. Di bawah adalah ringkasan payload datanya)*

### Branches (`/api/branches`)
- **GET /api/branches**: Mendapatkan daftar cabang.
- **POST /api/branches & PUT /api/branches/:id**:
  ```json
  {
    "name": "Cabang Utama (string, wajib)",
    "address": "Jl. Sudirman (string, wajib)",
    "phone": "08123456789 (string, wajib)",
    "wilayah": "DKI Jakarta (string, opsional)"
  }
  ```
- **DELETE /api/branches/:id**: Menghapus cabang.

### Customers (`/api/customers`)
- **GET /api/customers**: Mendapatkan daftar pelanggan.
- **POST /api/customers & PUT /api/customers/:id**:
  ```json
  {
    "name": "Budi (string, wajib)",
    "phone": "08123456789 (string, wajib)",
    "address": "Jl. Melati (string, wajib)",
    "notes": "Pelanggan VIP (string, opsional)",
    "wilayah": "Jakarta (string, opsional)",
    "cabang": "Jakarta Pusat (string, opsional)"
  }
  ```
- **DELETE /api/customers/:id**: Menghapus pelanggan.

### Suppliers (`/api/suppliers`)
- **GET /api/suppliers**: Mendapatkan daftar supplier.
- **POST /api/suppliers & PUT /api/suppliers/:id**:
  ```json
  {
    "name": "PT. Supplier ABC (string, wajib)",
    "contactName": "Andi (string, wajib)",
    "phone": "08123456789 (string, wajib)",
    "address": "Jl. Industri (string, wajib)"
  }
  ```
- **DELETE /api/suppliers/:id**: Menghapus supplier.

### Categories (`/api/categories`)
- **GET /api/categories**: Mendapatkan daftar kategori.
- **POST /api/categories & PUT /api/categories/:id**:
  ```json
  {
    "name": "Elektronik (string, wajib)"
  }
  ```
- **DELETE /api/categories/:id**: Menghapus kategori.

### Units (`/api/units`)
- **GET /api/units**: Mendapatkan daftar satuan.
- **POST /api/units & PUT /api/units/:id**:
  ```json
  {
    "name": "pcs (string, wajib)"
  }
  ```
- **DELETE /api/units/:id**: Menghapus satuan.

---

## 3. Modul Products & Inventory

### Products (`/api/products`)

#### `GET /api/products`
- **Deskripsi:** Mendapatkan daftar produk.
- **Auth Required:** `Yes`
- **Response Sukses (200 OK):** Array of objects dengan atribut `id`, `sku`, `name`, `category`, `buyPrice`, `sellPrice`, `stock`, `minStock`, `unit`, `isWholesale`.

#### `POST /api/products`
- **Deskripsi:** Menambahkan produk baru. Jika dikirim dengan nilai `stock` > 0, otomatis mencatat log di Stock History.
- **Auth Required:** `Yes`
- **Request Body:**
  ```json
  {
    "sku": "SKU-001 (string, unik, wajib)",
    "name": "Laptop (string, wajib)",
    "category": "Elektronik (string, wajib)",
    "buyPrice": 5000000 (number, wajib),
    "sellPrice": 6000000 (number, wajib),
    "stock": 10 (number, opsional, default 0),
    "minStock": 5 (number, opsional, default 0),
    "unit": "pcs (string, wajib)",
    "isWholesale": false (boolean, opsional)
  }
  ```

#### `PUT /api/products/:id`
- **Deskripsi:** Mengupdate informasi detail produk (jangan gunakan untuk merubah stok secara manual).
- **Auth Required:** `Yes`
- **Request Body:** Sama seperti POST (seluruh field opsional).

#### `DELETE /api/products/:id`
- **Deskripsi:** Menghapus produk.

#### `POST /api/products/adjust-stock`
- **Deskripsi:** Menyesuaikan stok produk secara manual (tambah/kurang) dan mencatat riwayat perubahannya ke Stock History.
- **Auth Required:** `Yes`
- **Request Body:**
  ```json
  {
    "productId": "uuid-product (string, wajib)",
    "type": "Tambah (string: 'Tambah' atau 'Kurang', wajib)",
    "qty": 5 (number, wajib),
    "reason": "Barang rusak/koreksi stok (string, wajib)"
  }
  ```
- **Response Sukses (200 OK):**
  Mengembalikan object data produk terbaru yang sudah diupdate stoknya.

---

## 4. Modul Transaksi (Sales & Purchases)

### Sales (`/api/sales`)

#### `GET /api/sales`
- **Deskripsi:** Mendapatkan riwayat penjualan beserta item dan status pengirimannya.
- **Auth Required:** `Yes`
- **Response Sukses (200 OK):** Array of `Sale` objects dengan relasi `items` dan `deliveries`.

#### `POST /api/sales`
- **Deskripsi:** Membuat transaksi penjualan baru. Sistem otomatis mengurangi stok produk, mencatat Stock History, dan membuat antrean Delivery (Pengiriman).
- **Auth Required:** `Yes`
- **Request Body:**
  ```json
  {
    "invoice": "INV-2026-001 (string, unik, wajib)",
    "customer": "Budi (string, wajib)",
    "salesName": "Kasir 1 (string, wajib)",
    "total": 6000000 (number, wajib),
    "discount": 0 (number, opsional),
    "grandTotal": 6000000 (number, wajib),
    "method": "Tunai (string: 'Tunai'|'Transfer'|'Kredit', wajib)",
    "status": "Lunas (string: 'Lunas'|'Belum Bayar'|'Sebagian', wajib)",
    "paymentRef": "BCA-123 (string, opsional)",
    "notes": "Kirim secepatnya (string, opsional)",
    "cashGiven": 6000000 (number, opsional),
    "cashReturn": 0 (number, opsional),
    "items": [
      {
        "productId": "uuid-product (wajib)",
        "name": "Laptop (wajib)",
        "qty": 1 (wajib)",
        "price": 6000000 (wajib)",
        "subtotal": 6000000 (wajib)
      }
    ]
  }
  ```

#### `POST /api/sales/:id/pay`
- **Deskripsi:** Melakukan pelunasan atau cicilan pembayaran untuk penjualan yang berstatus 'Belum Bayar' atau 'Sebagian'.
- **Auth Required:** `Yes`
- **Request Body:**
  ```json
  {
    "amount": 1000000 (number, wajib)
  }
  ```

### Purchases (`/api/purchases`)
Memiliki pola yang sama persis dengan `Sales`, namun difungsikan untuk Restock dari supplier (menambah stok).

#### `GET /api/purchases`
- **Deskripsi:** Mendapatkan riwayat pembelian restock.
- **Auth Required:** `Yes`

#### `POST /api/purchases`
- **Deskripsi:** Membuat transaksi restock baru. Otomatis menambah stok produk dan mencatat Stock History.
- **Request Body:**
  ```json
  {
    "invoice": "INV-BELI-001 (string, unik, wajib)",
    "supplier": "PT. Supplier ABC (string, wajib)",
    "total": 5000000 (number, wajib),
    "method": "Transfer (string: 'Tunai'|'Transfer'|'Kredit', wajib)",
    "status": "Lunas (string: 'Lunas'|'Belum Bayar'|'Sebagian', wajib)",
    "notes": "Restock bulanan (string, opsional)",
    "cashGiven": 5000000 (number, opsional),
    "items": [
      {
        "productId": "uuid-product (wajib)",
        "name": "Laptop (wajib)",
        "qty": 1 (wajib)",
        "price": 5000000 (wajib)",
        "subtotal": 5000000 (wajib)
      }
    ]
  }
  ```

#### `POST /api/purchases/:id/pay`
- **Deskripsi:** Membayar cicilan utang pembelian ke supplier.
- **Auth Required:** `Yes`
- **Request Body:**
  ```json
  {
    "amount": 500000 (number, wajib)
  }
  ```

---

## 5. Modul Pelacakan

### Deliveries (`/api/deliveries`)

#### `GET /api/deliveries`
- **Deskripsi:** Mendapatkan daftar status pengiriman (ter-generate otomatis ketika `POST /api/sales` dilakukan).
- **Auth Required:** `Yes`

#### `PUT /api/deliveries/:id`
- **Deskripsi:** Mengupdate informasi dan status pengiriman oleh kurir.
- **Auth Required:** `Yes`
- **Request Body:**
  ```json
  {
    "status": "Selesai (string: 'Menunggu'|'Dikirim'|'Selesai')",
    "courier": "Nama Kurir (string, opsional)",
    "notes": "Diterima oleh Budi (string, opsional)"
  }
  ```

### Stock History (`/api/stock-history`)

#### `GET /api/stock-history`
- **Deskripsi:** Mendapatkan seluruh log riwayat perubahan stok barang secara kronologis. Read-only.
- **Auth Required:** `Yes`
- **Response Sukses (200 OK):**
  ```json
  [
    {
      "id": "uuid",
      "date": "2026-06-10T12:00:00.000Z",
      "productId": "uuid-product",
      "productName": "Laptop",
      "type": "Tambah",
      "qty": 1,
      "prevStock": 9,
      "newStock": 10,
      "reason": "Pembelian INV-BELI-001",
      "userName": "Admin Pusat",
      "branchId": "uuid-cabang"
    }
  ]
  ```
