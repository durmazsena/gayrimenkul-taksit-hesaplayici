import Papa from 'papaparse';
import type { Apartment } from '../types';

export async function loadApartmentsFromCSV(): Promise<Apartment[]> {
  try {
    const response = await fetch('/data/gayrimenkul.csv');
    const csvText = await response.text();
    
    return new Promise((resolve, reject) => {
      Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const apartments: Apartment[] = results.data.map((row: any) => ({
            ev_id: row.ev_id || '',
            proje_adi: row.proje_adi || '',
            sehir: row.sehir || '',
            ilce: row.ilce || '',
            mahalle: row.mahalle || '',
            blok: row.blok || '',
            kat: parseInt(row.kat) || 0,
            oda_sayisi: row.oda_sayisi || '',
            m2: parseInt(row.m2) || 0,
            teslim_suresi: row.teslim_suresi || '',
            bitis_tarihi: row.bitis_tarihi || '',
            bugunku_pesin_fiyat: Math.round(parseFloat(row.bugunku_pesin_fiyat) || 0),
          })).filter(apt => apt.ev_id); // Boş satırları filtrele
          
          resolve(apartments);
        },
        error: (error) => {
          reject(error);
        },
      });
    });
  } catch (error) {
    console.error('CSV yükleme hatası:', error);
    return [];
  }
}

export function filterApartments(
  apartments: Apartment[],
  filters: {
    searchText?: string;
    minPrice?: number;
    maxPrice?: number;
    odaSayisi?: string[];
  }
): Apartment[] {
  let filtered = [...apartments];

  if (filters.searchText) {
    const search = filters.searchText.toLowerCase();
    filtered = filtered.filter(apt =>
      apt.ev_id.toLowerCase().includes(search) ||
      apt.mahalle.toLowerCase().includes(search) ||
      apt.ilce.toLowerCase().includes(search) ||
      apt.sehir.toLowerCase().includes(search)
    );
  }

  if (filters.minPrice !== undefined) {
    filtered = filtered.filter(apt => apt.bugunku_pesin_fiyat >= filters.minPrice!);
  }

  if (filters.maxPrice !== undefined) {
    filtered = filtered.filter(apt => apt.bugunku_pesin_fiyat <= filters.maxPrice!);
  }

  if (filters.odaSayisi && filters.odaSayisi.length > 0) {
    filtered = filtered.filter(apt => filters.odaSayisi!.includes(apt.oda_sayisi));
  }

  return filtered;
}
