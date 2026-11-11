# ShopKepa 🛒📊

> **Offline-first store management, real-time inventory tracking, and automated WhatsApp debt reminder assistant for micro-merchants and small retail businesses.**

---

## 🌟 Overview

**ShopKepa** is a lightweight, responsive web application built to empower everyday merchants, boutique owners, and market traders. It simplifies inventory management, financial bookkeeping, and debt recovery by turning messy paper records into a streamlined digital experience.

With ShopKepa, merchants can track cash sales vs. customer debts, monitor overhead costs (fuel, rent, transport, levies) to see real take-home profits, adjust product photos with built-in crop and enhance tools, and recover outstanding payments using 1-click pre-formatted WhatsApp reminders.

---

## ✨ Key Features

### 📦 Smart Inventory & Stock Catalog
- **Live Stock Alerts**: Instant badges for in-stock, low-stock (configurable threshold), and out-of-stock items.
- **In-App Photo Studio**: Built-in photo adjustment tool to crop (1:1, 3:4, 4:3, or full photo), sharpen, and brighten product images without third-party editing apps.
- **Quick Restock**: One-tap `+5 Stock` buttons for instant restocking on the go.

### 💰 Sales & Customer Debt Ledger
- **Cash & Credit Tracking**: Record cash sales alongside credit purchases with customer names and phone numbers.
- **Stock Auto-Deduction**: Inventory levels deduct automatically as sales are made.
- **Due Date Reminders**: Keep track of upcoming and overdue customer credit balances.

### 💬 Automated WhatsApp Debt Recovery
- **1-Click Pre-Filled Reminders**: Generate itemized, ready-to-send payment messages formatted for WhatsApp.
- **Adaptive Message Tones**: Choose between **Gentle & Friendly**, **Business Invoice**, or **Urgent Overdue Notice**.
- **Bank Transfer Integration**: Automatically embeds merchant bank details and account numbers into the message so customers can transfer immediately.

### 📊 Real Profit & Performance Dashboard
- **True Take-Home Profit**: Deducts operational overheads (generator fuel, rent, transport, market levies) from sales inflow.
- **Interactive Recharts Visualizer**: Responsive bar, area, and trend charts showing financial performance across weekly, monthly, and yearly horizons.

### 🏪 Public Storefront & Marketplace
- **Digital Showcase**: Shareable catalog where buyers can browse items and initiate WhatsApp order inquiries directly.
- **Dual Perspectives**: Toggle easily between merchant management tools and customer storefront browsing.

---

## 🛠️ Tech Stack

- **Frontend**: React 19, TypeScript, Vite
- **Styling**: Tailwind CSS & Glassmorphic Custom Design Tokens
- **Data Visualization**: Recharts & D3.js
- **Image Processing**: HTML5 Canvas & SVG ConvolveMatrix Sharpening Filter
- **Persistence**: LocalStorage with full offline resilience

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+ recommended)
- npm or yarn

### Installation
```bash
# Clone the repository
git clone https://github.com/your-username/shopkepa.git

# Navigate into the project directory
cd shopkepa

# Install dependencies
npm install

# Start the local development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to view the app.

---

## 📄 License
This project is open-source and available under the [MIT License](LICENSE).
