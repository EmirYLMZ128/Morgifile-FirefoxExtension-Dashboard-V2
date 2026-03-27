# Morgifile

[🇬🇧 English README](readme.md)

Morgifile, web üzerindeki görselleri sorunsuz bir şekilde arşivlemek, kategorize etmek ve yönetmek için tasarlanmış güçlü bir **Firefox eklentisi + web dashboard** uygulamasıdır. Gerçek bir "Tasarımcı Asistanı" olarak hareket ederek görsel ilhamınızın her zaman güvende ve düzenli olmasını sağlar.

Proje; (izole bir arayüze sahip) bir Firefox eklentisi, yerel olarak çalışan bir Python sunucusu (FastAPI) ve toplanan verileri görselleştirip yönetmenizi sağlayan modern bir dashboard arayüzünden oluşur.

---

## 🚀 Temel Özellikler

- **Anında Arşivleme:** Firefox eklentisini kullanarak herhangi bir web sitesindeki görseli **sağ tıklayarak** kaydedin.
- **Güçlü Backend:** Katı CORS politikalarını (ör. Instagram, Pinterest) aşmak için özel bir yerel proxy ile donatılmış **Python sunucusu** üzerinden görselleri işleyin.
- **SQLite Motoru:** Işık hızında ve güvenilir veri depolama (hantal JSON dosyalarına elveda!).
- **Kalkan (Safe Storage):** Favori görsellerinizi fiziksel olarak yerel diskinize indirip arşivleyerek sonsuza kadar güvence altına alın.
- **Mezarlık (Graveyard) Sistemi:** Süresi dolan veya kırık linkleri (ORB hatalarını yöneterek) anında tespit eden ve ana galerinizi tertemiz tutmak için sessizce özel bir Mezarlık kategorisine taşıyan otomatik temizleme mekanizması.
- **Akıllı Kopya Kontrolü:** Sadece "Base URL" (saf link) analizi yaparak aynı görselin sisteme iki kez kaydedilmesini önler.
- **Tersine Görsel Arama:** Tek tıkla çalışan arama araçları (Google Lens, Yandex, TinEye) doğrudan dashboard içine entegre edilmiştir.

---

## 🧩 Proje Yapısı

- **Firefox Extension:** Web sayfalarındaki görselleri algılar ve backend'e gönderir. Hedef sitelerin CSS'leri ile çakışmayı önlemek için **Shadow DOM** kullanılarak inşa edilmiştir.

- **Python Local Server:** FastAPI ve Uvicorn ile geliştirilmiştir. Gelen verileri alır, proxy isteklerini yönetir, WebSocket yayınlarını yapar ve verileri SQLite veritabanında güvenle saklar.

- **Dashboard (Web UI):** Kaydedilen görselleri kategoriler halinde gösteren, yönetim imkânı sunan ve görsel kütüphanenizin komuta merkezi olarak çalışan tamamen İngilizce (lokalize edilmiş) bir arayüz.

---

## 🛠 Kullanılan Teknolojiler

- **Frontend:** Vanilla JavaScript, HTML5, CSS3
- **Backend:** Python, FastAPI, Uvicorn, SQLite
- **İletişim:** WebSockets, RESTful API
- **Tarayıcı:** Firefox Extension API

---

## ⚙️ Kurulum (Özet)

> Detaylı kurulum adımları ilerleyen güncellemelerde eklenecektir.

1. Python yerel sunucusunu çalıştırın (`python app.py`).
2. Firefox eklentisini `about:debugging` üzerinden tarayıcıya yükleyin.
3. Dashboard arayüzünü (`index.html`) tarayıcıda açın.
4. Herhangi bir web sitesindeki görsele sağ tıklayarak arşivlemeye başlayın!

---

## 📌 Proje Durumu

Proje şu anda stabil **V2 Sürümündedir**.
Temel mimari (Veritabanı, Proxy, Safe Storage) sağlam ve tamamen işlevseldir. Şu anda kapsamlı bir **V3 (Vue.js) revizyonu** için hazırlık yapıyoruz.

---

## 🗺 Roadmap (V3 Vizyonu)

- **Vue.js Geçişi:** Vanilla JS dashboard'unu modüler bir Vue.js + Tailwind CSS mimarisine taşıma.
- **Arka Plan Sağlık Taraması (Health Check):** Kaydedilen URL'lere ping atan ve kırık linkleri frontend tetikleyicilerine (onerror) bağlı kalmadan otomatik olarak güncelleyen sessiz bir arka plan görevi.
- **Yapay Zeka Prompt Asistanı:** Arşivlediğiniz görsellere dayanarak yapay zeka araçları (Midjourney veya Firefly gibi) için kolayca detaylı promptlar oluşturmanıza yardımcı olacak akıllı iş akışları.
- **Renk Paleti Araçları:** Kaydedilen görsellerden baskın renkleri ve HEX kodlarını çıkarmak için hızlı ve kolaylaştırılmış yöntemler.

---

## 🤝 Katkıda Bulunma

Morgifile, açık kaynaklı ve ticari olmayan bir projedir.
Özellik geliştirme, UI/UX iyileştirmeleri ve kod kalitesini artırma konularında katkıda bulunmak isteyen gönüllüler memnuniyetle karşılanır.

Katkıda bulunmak için:
- Repoyu fork’layın
- Bir issue seçin
- Pull request açın

---

## 🤖 Not

Bu proje şu ana kadar **tamamen yapay zeka yardımı ile geliştirilmiştir**.

---

## 📄 Lisans

Bu proje kişisel ve ticari olmayan kullanım amaçlıdır.