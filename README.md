# Gayrimenkul Taksit Planı - Standalone Versiyon

CSV tabanlı, veritabanı gerektirmeyen standalone gayrimenkul taksit planı uygulaması.

## Özellikler

- ✅ CSV dosyasından konut verilerini okuma
- ✅ NPV (Net Present Value) tabanlı taksit hesaplama
- ✅ İki farklı ödeme modeli karşılaştırması
- ✅ AI chatbot ile interaktif taksit planı önerileri
- ✅ Konut karşılaştırma özelliği
- ✅ Modern, responsive arayüz
- ✅ Veritabanı gerektirmez

## Kurulum

```bash
# Bağımlılıkları yükle
npm install

# Geliştirme sunucusunu başlat
npm run dev

# Production build
npm run build
```

## CSV Dosyası Formatı

`public/data/gayrimenkul.csv` dosyası şu kolonları içermelidir:

```csv
ev_id,proje_adi,sehir,ilce,mahalle,blok,kat,oda_sayisi,m2,teslim_suresi,bitis_tarihi,bugunku_pesin_fiyat
GZP-H04-001,Gazipark Konutları,Gaziantep,Şahinbey,Yukarıbayındır,H,4,1+1,70,9 Ay,2026-08-12,761670
```

## Kullanım

1. `public/data/gayrimenkul.csv` dosyasına konut verilerinizi ekleyin
2. `npm run dev` ile uygulamayı başlatın
3. Tarayıcıda `http://localhost:5173` adresini açın
4. Sol tarafta AI chatbot ile konuşarak taksit planı oluşturun
5. Sağ tarafta konutları görüntüleyin ve karşılaştırın

## NPV Hesaplama

Uygulama iki farklı ödeme modeli sunar:

- **Model A (Concurrent)**: Taksitler hemen başlar
- **Model B (Skip)**: Peşinat ayında taksit alınmaz

Her iki model için:
- Aylık taksit tutarı
- Toplam ödeme
- Bugünkü değer (Present Value)
- Toplam faiz
- Detaylı ödeme takvimi

## Teknolojiler

- React 18
- TypeScript
- Vite
- Tailwind CSS
- PapaParse (CSV parsing)
- Lucide Icons

## Lisans

MIT
