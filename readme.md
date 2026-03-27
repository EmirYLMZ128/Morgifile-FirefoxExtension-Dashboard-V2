# Morgifile

[🇹🇷 Türkçe README](readme_Tr.md)

Morgifile is a powerful **Firefox extension + web dashboard** application designed to seamlessly archive, categorize, and manage web images. Acting as a true "Designer's Assistant," it ensures your visual inspiration is always safe and organized.

The project consists of a Firefox extension (featuring an isolated UI), a locally running Python server (FastAPI), and a modern dashboard interface that visualizes and manages the collected data.

---

## 🚀 Key Features

- **Instant Archiving:** Save images from any website via **right-click** using the Firefox extension.
- **Robust Backend:** Process images through a **local Python server** equipped with a custom proxy to bypass strict CORS policies (e.g., Instagram, Pinterest).
- **SQLite Engine:** Lightning-fast and reliable data storage (goodbye JSON!).
- **Safe Storage:** Shield your favorite images by physically downloading and archiving them to your local disk.
- **The Graveyard System:** An auto-cleaning mechanism that detects expired or broken links (handling ORB errors) and silently moves them to a dedicated Graveyard category, keeping your main gallery pristine.
- **Smart Duplicate Check:** Prevents saving the same image twice by analyzing base URLs.
- **Reverse Image Search:** Integrated one-click search tools (Google Lens, Yandex, TinEye) directly inside the dashboard.

---

## 🧩 Project Structure

- **Firefox Extension** Detects images on web pages and sends them to the backend. Built with **Shadow DOM** to prevent CSS conflicts with host websites.

- **Python Local Server** Built with FastAPI and Uvicorn. Receives data, handles proxy requests, manages WebSocket broadcasts, and stores data safely in an SQLite database.

- **Dashboard (Web UI)** A fully localized (English) interface that displays saved images by category, provides management functionality, and acts as the command center for your visual library.

---

## 🛠 Technologies Used

- **Frontend:** Vanilla JavaScript, HTML5, CSS3
- **Backend:** Python, FastAPI, Uvicorn, SQLite
- **Communication:** WebSockets, RESTful APIs
- **Browser:** Firefox Extension API

---

## ⚙️ Installation (Overview)

> Detailed installation steps will be added in future updates.

1. Run the Python local server (`python app.py`).
2. Load the Firefox extension into your browser via `about:debugging`.
3. Open the dashboard interface (`index.html`) in the browser.
4. Start archiving images by right-clicking on them on any website!

---

## 📌 Project Status

The project is currently in its stable **V2 Release**.
The core architecture (Database, Proxy, Safe Storage) is robust and fully functional. We are currently preparing for a massive **V3 overhaul**.

---

## 🗺 Roadmap (V3 Vision)

- **Vue.js Migration:** Transitioning the Vanilla JS dashboard to a modular Vue.js + Tailwind CSS architecture.
- **Backend Health Check:** A silent background task that pings saved URLs and automatically updates dead links without relying on frontend triggers.
- **AI Prompt Assistance:** Smart workflows to help you easily generate detailed prompts for AI tools (like Midjourney or Firefly) based on your archived images.
- **Color Palette Tools:** Quick and streamlined methods to extract dominant colors and HEX codes from your saved images.

---

## 🤝 Contributing

Morgifile is an open-source, non-commercial project.
Contributors are welcome to help improve features, UI/UX, and code quality.

If you want to contribute:
- Fork the repository
- Pick an issue
- Open a pull request

---

## 🤖 Note

This project has been developed **entirely with the assistance of artificial intelligence** so far.

---

## 📄 License

This project is intended for personal and non-commercial development purposes.