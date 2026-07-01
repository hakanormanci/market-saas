import { Html5QrcodeScanner } from "html5-qrcode";
import { useEffect, useState, useRef } from "react"; // Çift import teke düşürüldü

interface InventoryItem {
  id: string;
  barcode: string;
  product_name: string;
  category: string;
  expiration_date: string;
  quantity: number;
}

const API_BASE_URL =
  window.location.hostname === "localhost"
    ? "http://localhost:5000/api"
    : window.location.hostname.includes("vercel.app")
      ? "https://market-saas.onrender.com/api"
      : "http://192.168.0.117:5000/api";

export default function App() {
  const [barcodeInput, setBarcodeInput] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [successMsg, setSuccessMsg] = useState<string>("");
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [activeTab, setActiveTab] = useState<"entry" | "analysis">("entry");

  // Kamera Aktiflik Kontrolü
  const [isCameraOpen, setIsCameraOpen] = useState<boolean>(false);

  const [formBarcode, setFormBarcode] = useState<string>("");
  const [formName, setFormName] = useState<string>("");
  const [formCategory, setFormCategory] = useState<string>("Kühlschrank");
  const [formExpiry, setFormExpiry] = useState<string>("");
  const [formQuantity, setFormQuantity] = useState<number>(1);

  const [searchTerm, setSearchTerm] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("All");
  const [sortBy, setSortBy] = useState<
    "expiry_asc" | "expiry_desc" | "qty_desc" | "name_asc"
  >("expiry_asc");

  const barcodeRef = useRef<HTMLInputElement>(null);
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  useEffect(() => {
    barcodeRef.current?.focus();
    fetchInventory();
  }, []);

  // 📷 Kamera Tarayıcı Yönetimi
  useEffect(() => {
    if (activeTab === "entry" && isCameraOpen) {
      // DOM elementinin renderlandığından emin olmak için kısa bir timeout
      const timer = setTimeout(() => {
        scannerRef.current = new Html5QrcodeScanner(
          "reader",
          {
            fps: 10,
            qrbox: { width: 250, height: 150 }, // Dikdörtgen barkodlar için ideal kutu boyutu
            rememberLastUsedCamera: true,
          },
          /* verbose= */ false,
        );

        scannerRef.current.render(
          async (decodedText) => {
            // Başarılı Tarama: Input'u doldur, kamerayı kapat ve API'ye istek at
            setBarcodeInput(decodedText);
            setIsCameraOpen(false);
            if (scannerRef.current) {
              scannerRef.current.clear().catch((err) => console.error(err));
            }
            await triggerAutomaticSearch(decodedText);
          },
          (_errorMessage) => {
            // Tarama sırasında sürekli tetiklenen logları buraya yazabilirsiniz (Genelde boş bırakılır)
          },
        );
      }, 100);

      return () => {
        clearTimeout(timer);
        if (scannerRef.current) {
          scannerRef.current.clear().catch((err) => console.error(err));
        }
      };
    }
  }, [isCameraOpen, activeTab]);

  const fetchInventory = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/inventory`);
      const result = await res.json();
      if (result.success) setInventory(result.data);
    } catch (err) {
      console.error("Envanter çekilemedi:", err);
    }
  };

  // Kameradan gelen metin için manuel formu tetikleme fonksiyonu
  const triggerAutomaticSearch = async (barcode: string) => {
    if (!barcode.trim()) return;
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const res = await fetch(`${API_BASE_URL}/products/${barcode}`);
      const result = await res.json();

      if (result.success) {
        setFormBarcode(result.data.barcode);
        setFormName(result.data.product_name);
        setFormCategory(result.data.category || "Kühlschrank");
        setFormExpiry("");
        setFormQuantity(1);
      } else {
        // Ürün bulunamadıysa yeni barkodu forma direkt basıp kullanıcının doldurmasını kolaylaştıralım
        setFormBarcode(barcode);
        setFormName("");
        setErrorMsg("Ürün veritabanında bulunamadı, lütfen manuel ekleyin.");
      }
    } catch (err) {
      setErrorMsg("Sunucu bağlantı hatası!");
    }
  };

  const handleBarcodeSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    await triggerAutomaticSearch(barcodeInput);
  };

  const handleSaveToInventory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formBarcode || !formExpiry || formQuantity < 1) {
      setErrorMsg("Lütfen Barkod, SKT ve Adet alanlarını doldurun!");
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/inventory`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          barcode: formBarcode,
          product_name: formName,
          category: formCategory,
          expiration_date: formExpiry,
          quantity: formQuantity,
        }),
      });
      const result = await res.json();

      if (result.success) {
        setSuccessMsg("Ürün envantere başarıyla işlendi!");
        setInventory(result.data);
        setFormBarcode("");
        setFormName("");
        setFormCategory("Kühlschrank");
        setFormExpiry("");
        setFormQuantity(1);
        setBarcodeInput("");
        barcodeRef.current?.focus();
      }
    } catch (err) {
      setErrorMsg("Kaydedilirken bir hata oluştu.");
    }
  };

  const getProcessedInventory = () => {
    let processed = [...inventory];

    if (searchTerm.trim() !== "") {
      const term = searchTerm.toLowerCase();
      processed = processed.filter(
        (item) =>
          item.product_name.toLowerCase().includes(term) ||
          item.barcode.includes(term),
      );
    }

    if (categoryFilter !== "All") {
      processed = processed.filter((item) => item.category === categoryFilter);
    }

    processed.sort((a, b) => {
      if (sortBy === "expiry_asc") {
        return (
          new Date(a.expiration_date).getTime() -
          new Date(b.expiration_date).getTime()
        );
      }
      if (sortBy === "expiry_desc") {
        return (
          new Date(b.expiration_date).getTime() -
          new Date(a.expiration_date).getTime()
        );
      }
      if (sortBy === "qty_desc") {
        return b.quantity - a.quantity;
      }
      if (sortBy === "name_asc") {
        return a.product_name.localeCompare(b.product_name);
      }
      return 0;
    });

    return processed;
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center p-4 font-sans">
      {/* Header */}
      <header className="w-full max-w-md bg-white shadow-sm rounded-xl p-4 mb-4 text-center">
        <h1 className="text-xl font-bold text-gray-800">
          Berlin Market Logistics
        </h1>
        <p className="text-xs text-gray-500">MHD / SKT Esnek Takip Paneli</p>
      </header>

      {/* ÜST SEKME MENÜSÜ */}
      <div className="w-full max-w-md flex bg-white rounded-lg p-1 shadow-sm mb-4">
        <button
          onClick={() => {
            setActiveTab("entry");
            setTimeout(() => barcodeRef.current?.focus(), 100);
          }}
          className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === "entry" ? "bg-blue-600 text-white shadow" : "text-gray-600 hover:text-gray-900"}`}
        >
          📥 Ürün Kayıt
        </button>
        <button
          onClick={() => {
            setActiveTab("analysis");
            setIsCameraOpen(false); // Sekme değiştiğinde kamerayı kapat
          }}
          className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === "analysis" ? "bg-indigo-600 text-white shadow" : "text-gray-600 hover:text-gray-900"}`}
        >
          🔍 Envanter & Filtreleme ({inventory.length})
        </button>
      </div>

      <main className="w-full max-w-md space-y-4">
        {/* SEKME 1: ÜRÜN KAYIT EKRANI */}
        {activeTab === "entry" && (
          <>
            <section className="bg-white p-5 rounded-xl shadow-md">
              <div className="flex justify-between items-center mb-2">
                <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  1. Barkod Okut / Yaz
                </h2>

                {/* 📸 Kamera Aç/Kapat Butonu */}
                <button
                  type="button"
                  onClick={() => setIsCameraOpen(!isCameraOpen)}
                  className={`text-xs px-2 py-1 rounded font-medium shadow-sm transition-colors ${
                    isCameraOpen
                      ? "bg-red-500 text-white"
                      : "bg-gray-800 text-white hover:bg-gray-700"
                  }`}
                >
                  {isCameraOpen ? "✖ Kamerayı Kapat" : "📷 Kamerayı Aç"}
                </button>
              </div>

              {/* Kamera Container Alanı */}
              {isCameraOpen && (
                <div className="mb-3 overflow-hidden rounded-lg border border-gray-200 bg-black">
                  <div id="reader" className="w-full"></div>
                </div>
              )}

              <form onSubmit={handleBarcodeSearch} className="flex gap-2">
                <input
                  ref={barcodeRef}
                  type="text"
                  placeholder="Barkod girin..."
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm font-mono"
                />
                <button
                  type="submit"
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
                >
                  Bul
                </button>
              </form>

              {errorMsg && (
                <div className="mt-2 text-xs text-red-600 bg-red-50 p-2 rounded">
                  {errorMsg}
                </div>
              )}
              {successMsg && (
                <div className="mt-2 text-xs text-green-600 bg-green-50 p-2 rounded">
                  {successMsg}
                </div>
              )}
            </section>

            {formBarcode && (
              <section className="bg-white p-5 rounded-xl shadow-md border-t-4 border-blue-500 animate-fadeIn">
                <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
                  2. Detayları Doldur
                </h2>
                <form
                  onSubmit={handleSaveToInventory}
                  className="space-y-3 text-sm"
                >
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">
                      Barkod
                    </label>
                    <input
                      type="text"
                      disabled
                      value={formBarcode}
                      className="w-full px-3 py-2 bg-gray-50 border rounded-lg font-mono text-gray-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">
                      Ürün Adı
                    </label>
                    <input
                      type="text"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="Ürün adı..."
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">
                        Kategori
                      </label>
                      <select
                        value={formCategory}
                        onChange={(e) => setFormCategory(e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                      >
                        <option value="Kühlschrank">Kühlschrank</option>
                        <option value="Getränke">Getränke</option>
                        <option value="Trocken">Trocken</option>
                        <option value="Non-Food">Non-Food</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">
                        Adet
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={formQuantity}
                        onChange={(e) =>
                          setFormQuantity(
                            Math.max(1, parseInt(e.target.value) || 1),
                          )
                        }
                        className="w-full px-3 py-2 border rounded-lg text-center font-bold focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-red-600 mb-1">
                      📅 Son Kullanım Tarihi (MHD)
                    </label>
                    <input
                      type="date"
                      required
                      value={formExpiry}
                      onChange={(e) => setFormExpiry(e.target.value)}
                      className="w-full px-3 py-2 border border-red-300 rounded-lg focus:ring-2 focus:ring-red-500 font-medium"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2.5 rounded-lg transition-colors mt-2 shadow-sm"
                  >
                    Envantere Ekle
                  </button>
                </form>
              </section>
            )}
          </>
        )}

        {/* SEKME 2: GELİŞMİŞ ENVANTER VE FİLTRELEME EKRANI */}
        {activeTab === "analysis" && (
          <section className="bg-white p-5 rounded-xl shadow-md border-t-4 border-indigo-500">
            {/* Filtre Kontrol Paneli */}
            <div className="space-y-3 bg-gray-50 p-3 rounded-lg mb-4 text-xs">
              <div>
                <input
                  type="text"
                  placeholder="🔍 İsme veya barkoda göre anlık ara..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 mb-1 uppercase">
                    Kategori Seç
                  </label>
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="w-full p-2 border bg-white rounded-md"
                  >
                    <option value="All">Hepsi (Alle)</option>
                    <option value="Kühlschrank">Kühlschrank</option>
                    <option value="Getränke">Getränke</option>
                    <option value="Trocken">Trocken</option>
                    <option value="Non-Food">Non-Food</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-500 mb-1 uppercase">
                    Sıralama Ölçütü
                  </label>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className="w-full p-2 border bg-white rounded-md"
                  >
                    <option value="expiry_asc">📅 SKT: En Yakın Üste</option>
                    <option value="expiry_desc">📅 SKT: En Uzak Üste</option>
                    <option value="qty_desc">📦 Adet: En Çok Üste</option>
                    <option value="name_asc">🔤 Ürün Adı (A-Z)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Sonuç Listesi */}
            <div className="space-y-2 max-h-[450px] overflow-y-auto pr-1">
              {getProcessedInventory().length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-8">
                  Kriterlere uygun ürün bulunamadı.
                </p>
              ) : (
                getProcessedInventory().map((item) => {
                  const isExpired =
                    new Date(item.expiration_date) <= new Date();

                  return (
                    <div
                      key={item.id}
                      className={`p-3 rounded-lg border flex justify-between items-center text-xs transition-all ${
                        isExpired
                          ? "bg-red-50 border-red-200"
                          : "bg-white border-gray-200 hover:border-indigo-300"
                      }`}
                    >
                      <div>
                        <p
                          className={`font-bold ${isExpired ? "text-red-900" : "text-gray-800"}`}
                        >
                          {item.product_name}
                        </p>
                        <p className="text-[10px] text-gray-400 font-mono">
                          {item.barcode} |{" "}
                          <span className="bg-gray-100 px-1 rounded text-gray-600">
                            {item.category}
                          </span>
                        </p>
                      </div>
                      <div className="text-right">
                        <span
                          className={`font-bold px-2 py-0.5 rounded ${isExpired ? "bg-red-200 text-red-800" : "bg-indigo-50 text-indigo-700"}`}
                        >
                          {item.quantity} Adet
                        </span>
                        <p
                          className={`text-[10px] font-semibold mt-1.5 ${isExpired ? "text-red-600 font-bold animate-pulse" : "text-gray-600"}`}
                        >
                          📅 SKT: {item.expiration_date}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
