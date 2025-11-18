import type { ConversationState, Apartment, NPVResult } from '../types';
import { calculateNPV, annualToMonthlyRate } from './npv-calculator';
import { formatMoney } from './utils';

/**
 * Bugünkü tarihi alır ve yıl/ay bilgisini döndürür
 */
function getCurrentDate(): { year: number; month: number } {
  const today = new Date();
  return {
    year: today.getFullYear(),
    month: today.getMonth() + 1, // JavaScript'te ay 0-11 arası, biz 1-12 istiyoruz
  };
}

/**
 * Yıl parse eder
 */
function parseYear(input: string): number | null {
  const trimmed = input.trim();
  const yearMatch = trimmed.match(/(\d{4})/);
  if (yearMatch) {
    const year = parseInt(yearMatch[1]);
    if (year > 2000 && year < 2100) {
      return year;
    }
  }
  return null;
}

/**
 * Ay parse eder (1-12)
 */
function parseMonth(input: string): number | null {
  const trimmed = input.trim().toLowerCase();
  
  // Sayı olarak ay
  const numMatch = trimmed.match(/(\d{1,2})/);
  if (numMatch) {
    const month = parseInt(numMatch[1]);
    if (month >= 1 && month <= 12) {
      return month;
    }
  }
  
  // Ay isimleri (Türkçe)
  const monthNames: { [key: string]: number } = {
    'ocak': 1, 'şubat': 2, 'mart': 3, 'nisan': 4, 'mayıs': 5, 'haziran': 6,
    'temmuz': 7, 'ağustos': 8, 'eylül': 9, 'ekim': 10, 'kasım': 11, 'aralık': 12
  };
  
  for (const [name, month] of Object.entries(monthNames)) {
    if (trimmed.includes(name)) {
      return month;
    }
  }
  
  return null;
}

/**
 * Peşinat tutarını parse eder
 * Ev ID formatını (örn: GZP-H12-004) parse etmez
 * "300.000" ve "300000" aynı şekilde parse edilir
 */
function parseAmount(input: string): number | null {
  // Tüm boşlukları kaldır
  const trimmed = input.trim();
  
  // ÖNCE ev ID formatı kontrolü yap - eğer ev ID formatı varsa parse etme
  const evIdPattern = /^[A-Z]+-[A-Z0-9]+-\d+$/i;
  if (evIdPattern.test(trimmed)) {
    return null; // Bu bir ev ID'si, peşinat değil
  }
  
  // Binlik ayırıcıları (nokta, virgül) kaldır ve sadece sayıları çıkar
  // "300.000" → "300000", "300,000" → "300000", "300000" → "300000"
  const numbersOnly = trimmed.replace(/[^\d]/g, '');
  
  if (numbersOnly.length === 0) {
    return null;
  }
  
  const amount = parseFloat(numbersOnly);
  
  // Geçerli bir sayı mı ve 0'dan büyük mü kontrol et
  if (!isNaN(amount) && isFinite(amount) && amount > 0) {
    return amount;
  }
  
  return null;
}

/**
 * Taksit sayısını parse eder
 */
function parseInstallments(input: string): number | null {
  const match = input.match(/(\d+)\s*(ay|taksit)?/i);
  if (match) {
    const count = parseInt(match[1]);
    return count > 0 ? count : null;
  }
  return null;
}

/**
 * Faiz oranını parse eder (aylık veya yıllık)
 * "%2" → 2% = 0.02 (ondalık formata çevrilir)
 * "2" → 2% = 2 (yüzde olarak kalır, kod içinde /100 yapılır)
 * "0.02" → %0.02 = 0.02 (ondalık olarak kalır)
 * Returns: { rate: number, isAnnual: boolean } | null
 */
function parseInterestRate(input: string): { rate: number; isAnnual: boolean } | null {
  const lower = input.toLowerCase();
  const isAnnual = lower.includes('yıllık') || lower.includes('yillik') || lower.includes('annual') || lower.includes('yıl') || lower.includes('yil');
  
  // Yıllık oran formatı: "26.8" veya "%26.8" (ondalık olabilir)
  if (isAnnual) {
    const match = input.match(/(%?\s*\d+[\d.,]*)\s*%/i);
    if (match) {
      // Yüzde işareti varsa, sayıyı 100'e böl (örn: "%26.8" → 26.8)
      const rate = parseFloat(match[1].replace(/[%,]/g, '').trim().replace(',', '.'));
      return rate > 0 ? { rate, isAnnual: true } : null;
    }
    // Sadece sayı varsa
    const numMatch = input.match(/(\d+[\d.,]*)/);
    if (numMatch) {
      const rate = parseFloat(numMatch[1].replace(',', '.'));
      return rate > 0 ? { rate, isAnnual: true } : null;
    }
  }
  
  // Aylık oran formatı: "%2" veya "2" veya "0.02"
  // Eğer yüzde işareti varsa (%2), sayıyı 100'e böl (2 → 0.02)
  // Eğer yüzde işareti yoksa (2), sayıyı olduğu gibi al (2 → 2, kod içinde /100 yapılır)
  const percentMatch = input.match(/(%?\s*)(\d+[\d.,]*)\s*%/i);
  if (percentMatch) {
    // Yüzde işareti var, sayıyı 100'e böl (örn: "%2" → 0.02)
    const rate = parseFloat(percentMatch[2].replace(',', '.')) / 100;
    return rate > 0 ? { rate, isAnnual: false } : null;
  }
  
  // Yüzde işareti yok, sadece sayı (örn: "2" veya "0.02")
  const numMatch = input.match(/(\d+[\d.,]*)/);
  if (numMatch) {
    const rate = parseFloat(numMatch[1].replace(',', '.'));
    // Eğer sayı 1'den küçükse (örn: 0.02), ondalık olarak kabul et
    // Eğer sayı 1'den büyükse (örn: 2), yüzde olarak kabul et (kod içinde /100 yapılacak)
    return rate > 0 ? { rate, isAnnual: false } : null;
  }
  
  return null;
}

/**
 * Ev ID'sini parse eder
 */
function parseApartmentId(input: string): string | null {
  const match = input.match(/([A-Z]+-[A-Z0-9]+-\d+)/i);
  return match ? match[1].toUpperCase() : null;
}

/**
 * Alternatif daireleri bulur - istenen taksit miktarına uygun, teslim süresi daha uzun olanlar
 * Her daire için, o dairenin PV'sine ve mevcut peşinat tutarına göre taksit hesaplanır
 */
function findAlternativeApartments(
  apartments: Apartment[],
  desiredInstallment: number,
  downAmount: number,
  nInstallments: number,
  monthlyRate: number,
  downYear: number,
  downMonth: number,
  startYear: number,
  startMonth: number,
  currentApartmentId: string,
  installmentTolerance: number = 5000 // ±5.000 TL tolerans
): Apartment[] {
  const currentApartment = apartments.find(apt => apt.ev_id === currentApartmentId);
  if (!currentApartment) return [];
  
  // Mevcut daireyi hariç tut
  const filtered = apartments.filter(apt => apt.ev_id !== currentApartmentId);
  
  // Her daire için, o dairenin PV'sine ve mevcut peşinat tutarına göre taksit hesapla
  const candidates = filtered.map(apt => {
    try {
      const monthlyRateDecimal = monthlyRate > 1 ? monthlyRate / 100 : monthlyRate;
      
      // Bu daire için taksit planını hesapla (targetPv kullanarak)
      const npvResult = calculateNPV({
        targetPv: apt.bugunku_pesin_fiyat,
        monthlyRate: monthlyRateDecimal,
        downAmount: downAmount,
        downYear: downYear,
        downMonth: downMonth,
        nInstallments: nInstallments,
        startYear: startYear,
        startMonth: startMonth,
      });
      
      const calculatedInstallment = npvResult.modelA.monthlyInstallment;
      const deliveryMonths = parseDeliveryTime(apt.teslim_suresi);
      
      return {
        apartment: apt,
        calculatedInstallment,
        deliveryMonths,
        pv: apt.bugunku_pesin_fiyat,
      };
    } catch (error) {
      return null;
    }
  }).filter(item => item !== null) as Array<{
    apartment: Apartment;
    calculatedInstallment: number;
    deliveryMonths: number;
    pv: number;
  }>;
  
  // İstenen taksit miktarına ±tolerans aralığında olan daireleri filtrele
  const minInstallment = desiredInstallment - installmentTolerance;
  const maxInstallment = desiredInstallment + installmentTolerance;
  
  const matching = candidates.filter(item => 
    item.calculatedInstallment >= minInstallment && 
    item.calculatedInstallment <= maxInstallment &&
    item.calculatedInstallment > 0 // Negatif taksit olamaz
  );
  
  // Sırala: önce istenen taksit miktarına en yakın, sonra en uzun teslim süresi
  matching.sort((a, b) => {
    const diffA = Math.abs(a.calculatedInstallment - desiredInstallment);
    const diffB = Math.abs(b.calculatedInstallment - desiredInstallment);
    
    if (Math.abs(diffA - diffB) < 1000) {
      // Taksit farkları yakınsa, teslim süresi daha uzun olanı önce getir
      return b.deliveryMonths - a.deliveryMonths;
    }
    return diffA - diffB; // İstenen taksit miktarına daha yakın olanı önce getir
  });
  
  // En fazla 5 alternatif döndür
  return matching.slice(0, 5).map(item => item.apartment);
}

/**
 * Teslim süresini aya çevirir (örn: "6 ay" → 6, "12 ay" → 12)
 */
function parseDeliveryTime(teslimSuresi: string): number {
  const match = teslimSuresi.match(/(\d+)\s*ay/i);
  if (match) {
    return parseInt(match[1]);
  }
  return 0;
}

/**
 * Chatbot yanıtı oluşturur - Python dosyasındaki akışa göre
 */
export function generateBotResponse(
  userMessage: string,
  state: ConversationState,
  apartments: Apartment[]
): { message: string; npvResult?: NPVResult; newState?: ConversationState } {
  const lowerMessage = userMessage.toLowerCase().trim();
  const currentDate = getCurrentDate();
  const newState: ConversationState = { ...state };
  
  // İlk mesaj veya merhaba
  if (!state.step || lowerMessage.includes('merhaba') || lowerMessage.includes('selam') || lowerMessage.includes('başla') || lowerMessage.includes('yeni')) {
    newState.step = 'waiting_for_apartment';
    newState.startYear = currentDate.year;
    newState.startMonth = currentDate.month;
    
    const monthNames = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 
                        'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
    const currentMonthName = monthNames[currentDate.month - 1];
    
    return {
      message: `=== NPV Taksit Hesaplayıcı (Satıcı Finansmanı) ===\n\nMerhaba! 👋\n\n📅 Bugünkü tarih: ${new Date().getDate()} ${currentMonthName} ${currentDate.year}\n\nTaksit planı oluşturmak için sırayla şu bilgilere ihtiyacım var:\n\n1️⃣ Ev seçimi\n2️⃣ İndirim oranı (faiz oranı)\n3️⃣ Peşinat tutarı\n4️⃣ Peşinat yılı\n5️⃣ Peşinat ayı\n6️⃣ Taksit adedi\n\nBaşlayalım mı? Sağdaki listeden bir ev seçebilir veya Ev ID'sini yazabilirsiniz (örnek: GZP-H04-001)`,
      newState,
    };
  }

  // Yardım mesajı
  if (lowerMessage.includes('yardım') || lowerMessage.includes('nasıl') || lowerMessage.includes('help')) {
    const currentStep = state.step || 'waiting_for_apartment';
    let stepInfo = '';
    
    switch (currentStep) {
      case 'waiting_for_apartment':
        stepInfo = 'Şu anda **Ev Seçimi** adımındasınız.';
        break;
      case 'waiting_for_interest_rate':
        stepInfo = 'Şu anda **İndirim Oranı (Faiz Oranı)** adımındasınız.';
        break;
      case 'waiting_for_down_payment':
        stepInfo = 'Şu anda **Peşinat Tutarı** adımındasınız.';
        break;
      case 'waiting_for_down_payment_year':
        stepInfo = 'Şu anda **Peşinat Yılı** adımındasınız.';
        break;
      case 'waiting_for_down_payment_month':
        stepInfo = 'Şu anda **Peşinat Ayı** adımındasınız.';
        break;
      case 'waiting_for_installments':
        stepInfo = 'Şu anda **Taksit Adedi** adımındasınız.';
        break;
      default:
        stepInfo = 'Taksit planı oluşturma sürecindesiniz.';
    }
    
    return {
      message: `📋 **Yardım**\n\n${stepInfo}\n\n**Tüm Adımlar:**\n1. Ev Seçimi\n2. İndirim Oranı (Faiz Oranı)\n3. Peşinat Tutarı\n4. Peşinat Yılı\n5. Peşinat Ayı\n6. Taksit Adedi`,
    };
  }

  // Adım 1: Ev seçimi
  if (state.step === 'waiting_for_apartment') {
    // ÖNCE ev ID kontrolü yap - bu en önemli
    const evId = parseApartmentId(userMessage);
    if (evId) {
      const apartment = apartments.find(apt => apt.ev_id === evId);
      if (apartment) {
        newState.apartmentId = evId;
        newState.step = 'waiting_for_interest_rate';
        
        return {
          message: `Harika! ${evId} numaralı evi seçtiniz. 🏠\n\nBu ev hakkında bilgiler:\n• Oda sayısı: ${apartment.oda_sayisi}\n• Metrekare: ${apartment.m2}m²\n• Konum: ${apartment.mahalle}, ${apartment.ilce}\n• Peşin fiyat: ${formatMoney(apartment.bugunku_pesin_fiyat)}\n\nŞimdi faiz oranını belirleyelim. 💹\n\nYıllık faiz oranı mı gireceksiniz, yoksa aylık faiz oranı mı? (E/H) [H]:`,
          newState,
        };
      } else {
        // Ev ID formatı doğru ama ev bulunamadı - parseAmount'a BAKMA
        return {
          message: `"${evId}" numaralı ev bulunamadı. 😕\n\nLütfen sağdaki listeden geçerli bir Ev ID seçin veya yazın.\n\nÖrnek: GZP-H04-001`,
        };
      }
    }
    
    // Ev ID formatı yoksa, diğer kontrolleri yap ama bu adımda kabul etme
    const amount = parseAmount(userMessage);
    const year = parseYear(userMessage);
    const month = parseMonth(userMessage);
    const installments = parseInstallments(userMessage);
    const rateInfo = parseInterestRate(userMessage);
    
    if (amount || year || month !== null || installments || rateInfo) {
      return {
        message: `Önce bir ev seçmemiz gerekiyor. 🏠\n\nSağdaki listeden bir ev tıklayabilir veya Ev ID'sini yazabilirsiniz.\n\nÖrnek: GZP-H04-001`,
      };
    }
    
    return {
      message: `Bir ev seçmemiz gerekiyor. Sağdaki listeden bir ev tıklayabilir veya Ev ID'sini yazabilirsiniz. 🏠\n\nÖrnek: GZP-H04-001`,
    };
  }

  // Adım 2: İndirim Oranı (Faiz Oranı) - Python'daki gibi önce bu soruluyor
  if (state.step === 'waiting_for_interest_rate') {
    // ÖNCE ev ID kontrolü yap - eğer ev ID formatı varsa parse etme
    const evId = parseApartmentId(userMessage);
    if (evId) {
      return {
        message: `Şu anda faiz oranını belirlememiz gerekiyor. 💹\n\nEv zaten seçilmiş. Lütfen yıllık faiz oranı mı gireceksiniz, yoksa aylık faiz oranı mı?\n\nÖrnek: "aylık" veya "yıllık" yazabilirsiniz.`,
      };
    }
    
    // Yıllık mı aylık mı sorusu - Python'daki gibi
    if (state.isAnnualRateSelected === undefined) {
      // Henüz yıllık/aylık seçimi yapılmamış
      // "yıllık", "annual", "e", "evet" gibi kelimeleri kontrol et
      if (lowerMessage.includes('yıllık') || lowerMessage.includes('yillik') || lowerMessage.includes('annual') || 
          lowerMessage === 'e' || lowerMessage === 'evet' || lowerMessage === 'y' || lowerMessage === 'yes') {
        newState.isAnnualRateSelected = true;
        return {
          message: `Tamam, yıllık faiz oranını gireceğiz. 💹\n\nYıllık oranınız nedir? (örnek: 26.8 veya %26.8)`,
          newState,
        };
      }
      
      // "aylık", "monthly", "h", "hayır" gibi kelimeleri kontrol et
      if (lowerMessage.includes('aylık') || lowerMessage.includes('aylik') || lowerMessage.includes('monthly') ||
          lowerMessage === 'h' || lowerMessage === 'hayır' || lowerMessage === 'n' || lowerMessage === 'no' || lowerMessage === '') {
        newState.isAnnualRateSelected = false;
        return {
          message: `Tamam, aylık faiz oranını gireceğiz. 💹\n\nAylık oranınız nedir? (örnek: 2 veya %2)`,
          newState,
        };
      }
      
      // Kullanıcı doğrudan oran yazmış olabilir - yıllık mı aylık mı anlamaya çalış
      // AMA önce ev ID formatı olmadığından emin ol
      const rateInfo = parseInterestRate(userMessage);
      if (rateInfo) {
        if (rateInfo.isAnnual) {
          const monthlyRate = annualToMonthlyRate(rateInfo.rate / 100) * 100;
          newState.monthlyRate = monthlyRate;
          newState.isAnnualRateSelected = true;
          newState.step = 'waiting_for_down_payment';
          return {
            message: `Anladım! Yıllık oranınız %${rateInfo.rate}, bu da aylık olarak yaklaşık %${monthlyRate.toFixed(3)} ediyor. 👍\n\nŞimdi peşinat tutarınızı öğrenebilir miyim? Kaç TL peşinat ödemeyi planlıyorsunuz?`,
            newState,
          };
        } else {
          // rateInfo.rate zaten ondalık formatta (örn: 0.02), mesajda yüzde olarak göster
          newState.monthlyRate = rateInfo.rate;
          newState.isAnnualRateSelected = false;
          newState.step = 'waiting_for_down_payment';
          const ratePercent = rateInfo.rate * 100;
          return {
            message: `Anladım! Aylık oranınız %${ratePercent.toFixed(2)} olarak kaydedildi. 👍\n\nŞimdi peşinat tutarınızı öğrenebilir miyim? Kaç TL peşinat ödemeyi planlıyorsunuz?`,
            newState,
          };
        }
      }
      
      // Sadece sayı olarak deneyelim - AMA ev ID formatı olmadığından emin ol
      const numMatch = userMessage.match(/(\d+[\d.,]*)/);
      if (numMatch) {
        // Ev ID formatı kontrolü: Eğer sayı içinde tire (-) varsa ve format ev ID'sine benziyorsa, parse etme
        const matchedNumber = numMatch[1];
        // Ev ID formatı: A-Z-A-Z0-9-0-9 (örn: GZP-H12-004)
        // Eğer kullanıcı sadece sayı yazdıysa (tire yoksa), faiz oranı olabilir
        if (!userMessage.includes('-') || !/^[A-Z]+-[A-Z0-9]+-\d+$/i.test(userMessage)) {
          const rate = parseFloat(matchedNumber.replace(',', '.'));
          if (rate > 0 && rate < 1000) { // Faiz oranı genellikle 1000'den küçük olur
            // Varsayılan olarak aylık kabul et (Python'da [H] varsayılan)
            newState.monthlyRate = rate;
            newState.isAnnualRateSelected = false;
            newState.step = 'waiting_for_down_payment';
            return {
              message: `Anladım! Aylık oranınız %${rate} olarak kaydedildi. 👍\n\nŞimdi peşinat tutarınızı öğrenebilir miyim? Kaç TL peşinat ödemeyi planlıyorsunuz?`,
              newState,
            };
          }
        }
      }
      
      return {
        message: `Faiz oranını belirlememiz gerekiyor. 💹\n\nYıllık faiz oranı mı gireceksiniz, yoksa aylık faiz oranı mı?\n\nÖrnek: "aylık" veya "yıllık" yazabilirsiniz.`,
      };
    } else {
      // Yıllık/aylık seçimi yapılmış, şimdi oran değerini al
      // AMA önce ev ID formatı olmadığından emin ol
      const numMatch = userMessage.match(/(\d+[\d.,]*)/);
      if (numMatch) {
        // Ev ID formatı kontrolü
        if (!userMessage.includes('-') || !/^[A-Z]+-[A-Z0-9]+-\d+$/i.test(userMessage)) {
          const rate = parseFloat(numMatch[1].replace(',', '.'));
          if (rate > 0 && rate < 1000) { // Faiz oranı genellikle 1000'den küçük olur
            if (state.isAnnualRateSelected) {
              // Yıllık oran
              const monthlyRate = annualToMonthlyRate(rate / 100) * 100;
              newState.monthlyRate = monthlyRate;
              newState.step = 'waiting_for_down_payment';
              return {
                message: `Anladım! Yıllık oranınız %${rate}, bu da aylık olarak yaklaşık %${monthlyRate.toFixed(3)} ediyor. 👍\n\nŞimdi peşinat tutarınızı öğrenebilir miyim? Kaç TL peşinat ödemeyi planlıyorsunuz?`,
                newState,
              };
            } else {
              // Aylık oran
              newState.monthlyRate = rate;
              newState.step = 'waiting_for_down_payment';
              return {
                message: `Anladım! Aylık oranınız %${rate} olarak kaydedildi. 👍\n\nŞimdi peşinat tutarınızı öğrenebilir miyim? Kaç TL peşinat ödemeyi planlıyorsunuz?`,
                newState,
              };
            }
          }
        }
      }
      
      return {
        message: state.isAnnualRateSelected 
          ? `Yıllık faiz oranınız nedir? (örnek: 26.8 veya %26.8)`
          : `Aylık faiz oranınız nedir? (örnek: 2 veya %2)`,
      };
    }
  }

  // Adım 3: Peşinat tutarı
  if (state.step === 'waiting_for_down_payment') {
    // ÖNCE faiz oranının girilip girilmediğini kontrol et
    if (!state.monthlyRate) {
      // Faiz oranı girilmemiş, önce faiz oranını sor
      newState.step = 'waiting_for_interest_rate';
      return {
        message: `Önce faiz oranını belirlememiz gerekiyor. 💹\n\nYıllık faiz oranı mı gireceksiniz, yoksa aylık faiz oranı mı?\n\nÖrnek: "aylık" veya "yıllık" yazabilirsiniz.`,
        newState,
      };
    }
    
    // ÖNCE ev ID kontrolü yap - eğer ev ID formatı varsa parseAmount'a bakma
    const evId = parseApartmentId(userMessage);
    if (evId) {
      return {
        message: `Şu anda peşinat tutarınızı öğrenmek istiyorum. 💰\n\nEv zaten seçilmiş. Lütfen peşinat tutarınızı TL cinsinden yazın.\n\nÖrnek: 1000000 veya 500000 TL`,
      };
    }
    
    // Ev ID formatı yoksa, peşinat tutarını parse et
    const amount = parseAmount(userMessage);
    
    if (amount) {
      if (amount < 1000) {
        return {
          message: `Peşinat tutarı çok küçük görünüyor. Lütfen geçerli bir peşinat tutarı girin.\n\nÖrnek: 1000000 veya 500000 TL`,
        };
      }
      
      // Peşinat tutarı evin fiyatından fazla olamaz
      const apartment = apartments.find(apt => apt.ev_id === state.apartmentId);
      if (apartment && amount > apartment.bugunku_pesin_fiyat) {
        return {
          message: `Peşinat tutarı evin fiyatından fazla olamaz. 😕\n\nEvin fiyatı: ${formatMoney(apartment.bugunku_pesin_fiyat)}\nGirdiğiniz peşinat: ${formatMoney(amount)}\n\nLütfen evin fiyatından düşük bir peşinat tutarı girin.`,
        };
      }
      
      newState.downAmount = amount;
      newState.step = 'waiting_for_down_payment_year';
      
      const defaultYear = newState.startYear || currentDate.year;
      
      return {
        message: `Anladım, peşinat tutarınız ${formatMoney(amount)}. 👍\n\nŞimdi peşinatı hangi yılda ödemeyi planlıyorsunuz? (YYYY)\n\nÖrnek: 2026\n\nVeya boş bırakırsanız ${defaultYear} kullanılacak.`,
        newState,
      };
    }
    
    return {
      message: `Peşinat tutarını anlayamadım. Lütfen sadece sayı olarak yazın.\n\nÖrnek: 1000000 veya 500000 TL`,
    };
  }

  // Adım 4: Peşinat yılı
  if (state.step === 'waiting_for_down_payment_year') {
    const year = parseYear(userMessage);
    const defaultYear = newState.startYear || currentDate.year;
    
    if (year) {
      newState.downYear = year;
      newState.step = 'waiting_for_down_payment_month';
      
      return {
        message: `Peşinat yılı: ${year} olarak kaydedildi. 📅\n\nŞimdi peşinatı hangi ayda ödemeyi planlıyorsunuz? (1-12)\n\nÖrnek: 3 veya Mart`,
        newState,
      };
    }
    
    // Eğer boş bırakıldıysa varsayılan yılı kullan
    if (userMessage.trim() === '') {
      newState.downYear = defaultYear;
      newState.step = 'waiting_for_down_payment_month';
      return {
        message: `Peşinat yılı: ${defaultYear} (varsayılan) olarak kaydedildi. 📅\n\nŞimdi peşinatı hangi ayda ödemeyi planlıyorsunuz? (1-12)\n\nÖrnek: 3 veya Mart`,
        newState,
      };
    }
    
    return {
      message: `Yılı anlayamadım. Lütfen yıl olarak yazın (YYYY).\n\nÖrnek: 2026\n\nVeya boş bırakırsanız ${defaultYear} kullanılacak.`,
    };
  }

  // Adım 5: Peşinat ayı
  if (state.step === 'waiting_for_down_payment_month') {
    const month = parseMonth(userMessage);
    
    if (month !== null) {
      // Geçmiş tarih kontrolü
      const today = new Date(currentDate.year, currentDate.month - 1, 1);
      const downDate = new Date(newState.downYear || currentDate.year, month - 1, 1);
      
      if (downDate < today) {
        const monthNames = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 
                            'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
        const currentMonthName = monthNames[currentDate.month - 1];
        return {
          message: `Peşinat tarihi bugünden önce olamaz. 📅\n\nBugünkü tarih: ${new Date().getDate()} ${currentMonthName} ${currentDate.year}\n\nLütfen gelecek bir ay girin (1-12).`,
        };
      }
      
      newState.downMonth = month;
      newState.step = 'waiting_for_installments';
      
      const monthNames = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 
                          'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
      
      return {
        message: `Peşinat ayı: ${monthNames[month - 1]} olarak kaydedildi. 📅\n\nHarika! Şimdi son adım: kaç ay taksit ödemek istersiniz?\n\nÖrnek: 24 ay veya 36\n\nVeya boş bırakırsanız 24 ay kullanılacak.`,
        newState,
      };
    }
    
    return {
      message: `Ayı anlayamadım. Lütfen ay olarak yazın (1-12) veya ay ismini yazın.\n\nÖrnek: 3 veya Mart`,
    };
  }

  // Adım 6: Taksit adedi
  if (state.step === 'waiting_for_installments') {
    const installments = parseInstallments(userMessage);
    
    if (installments) {
      newState.nInstallments = installments;
      newState.step = 'completed';
      
      // Tüm bilgiler hazır, NPV hesaplamasını yap
      const apartment = apartments.find(apt => apt.ev_id === newState.apartmentId);
      if (apartment && newState.monthlyRate && newState.downAmount && newState.downYear && newState.downMonth) {
        try {
          const monthlyRateDecimal = newState.monthlyRate > 1 
            ? newState.monthlyRate / 100 
            : newState.monthlyRate;
          
          const npvResult = calculateNPV({
            targetPv: apartment.bugunku_pesin_fiyat,
            monthlyRate: monthlyRateDecimal,
            downAmount: newState.downAmount,
            downYear: newState.downYear,
            downMonth: newState.downMonth,
            nInstallments: installments,
            startYear: newState.startYear || currentDate.year,
            startMonth: newState.startMonth || currentDate.month,
          });

          // Validasyon: Aylık taksit ve toplam faiz eksiye düşemez
          const modelAInterest = npvResult.modelA.nominalTotal - apartment.bugunku_pesin_fiyat;
          const modelBInterest = npvResult.modelB.nominalTotal - apartment.bugunku_pesin_fiyat;
          
          if (npvResult.modelA.monthlyInstallment < 0 || npvResult.modelB.monthlyInstallment < 0) {
            return {
              message: `Hesaplama hatası: Aylık taksit negatif olamaz. 😕\n\nLütfen peşinat tutarınızı düşürün veya taksit sayısını artırın.`,
            };
          }
          
          if (modelAInterest < 0 || modelBInterest < 0) {
            return {
              message: `Hesaplama hatası: Toplam faiz negatif olamaz. 😕\n\nBu durumda peşinat tutarı çok yüksek veya faiz oranı çok düşük. Lütfen bilgilerinizi kontrol edin.`,
            };
          }

          const betterModel = (npvResult.modelA.nominalTotal < npvResult.modelB.nominalTotal) ? 'A' : 'B';
          newState.lastNpvResult = npvResult;
          const betterModelResult = betterModel === 'A' ? npvResult.modelA : npvResult.modelB;
          
          return {
            message: `Hesaplama tamamlandı! ✅\n\nTaksit planınız aşağıdaki kartta görüntüleniyor.\n\n💡 Eğer aylık taksit ${formatMoney(betterModelResult.monthlyInstallment)} size fazla geliyorsa, "daha düşük taksit ödemek istiyorum" yazabilirsiniz. Size daha uygun alternatifler önerebilirim.`,
            npvResult,
            newState,
          };
        } catch (error) {
          console.error('NPV hesaplama hatası:', error);
          return {
            message: `Hesaplama sırasında bir hata oluştu. Lütfen bilgilerinizi kontrol edip tekrar deneyin.`,
          };
        }
      }
    } else if (userMessage.trim() === '') {
      // Varsayılan 24 ay
      newState.nInstallments = 24;
      newState.step = 'completed';
      
      // Tüm bilgiler hazır, NPV hesaplamasını yap
      const apartment = apartments.find(apt => apt.ev_id === newState.apartmentId);
      if (apartment && newState.monthlyRate && newState.downAmount && newState.downYear && newState.downMonth) {
        try {
          const monthlyRateDecimal = newState.monthlyRate > 1 
            ? newState.monthlyRate / 100 
            : newState.monthlyRate;
          
          const npvResult = calculateNPV({
            targetPv: apartment.bugunku_pesin_fiyat,
            monthlyRate: monthlyRateDecimal,
            downAmount: newState.downAmount,
            downYear: newState.downYear,
            downMonth: newState.downMonth,
            nInstallments: 24,
            startYear: newState.startYear || currentDate.year,
            startMonth: newState.startMonth || currentDate.month,
          });

          // Validasyon: Aylık taksit ve toplam faiz eksiye düşemez
          const modelAInterest = npvResult.modelA.nominalTotal - apartment.bugunku_pesin_fiyat;
          const modelBInterest = npvResult.modelB.nominalTotal - apartment.bugunku_pesin_fiyat;
          
          if (npvResult.modelA.monthlyInstallment < 0 || npvResult.modelB.monthlyInstallment < 0) {
            return {
              message: `Hesaplama hatası: Aylık taksit negatif olamaz. 😕\n\nLütfen peşinat tutarınızı düşürün veya taksit sayısını artırın.`,
            };
          }
          
          if (modelAInterest < 0 || modelBInterest < 0) {
            return {
              message: `Hesaplama hatası: Toplam faiz negatif olamaz. 😕\n\nBu durumda peşinat tutarı çok yüksek veya faiz oranı çok düşük. Lütfen bilgilerinizi kontrol edin.`,
            };
          }

          const betterModel = (npvResult.modelA.nominalTotal < npvResult.modelB.nominalTotal) ? 'A' : 'B';
          newState.lastNpvResult = npvResult;
          const betterModelResult = betterModel === 'A' ? npvResult.modelA : npvResult.modelB;
          
          return {
            message: `Hesaplama tamamlandı! ✅\n\nTaksit planınız aşağıdaki kartta görüntüleniyor.\n\n💡 Eğer aylık taksit ${formatMoney(betterModelResult.monthlyInstallment)} size fazla geliyorsa, "daha düşük taksit ödemek istiyorum" yazabilirsiniz. Size daha uygun alternatifler önerebilirim.`,
            npvResult,
            newState,
          };
        } catch (error) {
          console.error('NPV hesaplama hatası:', error);
          return {
            message: `Hesaplama sırasında bir hata oluştu. Lütfen bilgilerinizi kontrol edip tekrar deneyin.`,
          };
        }
      }
    } else {
      return {
        message: `Taksit adedini anlayamadım. Lütfen sayı olarak yazın.\n\nÖrnek: 24 ay veya 36\n\nVeya boş bırakırsanız 24 ay kullanılacak.`,
      };
    }
  }

  // Daha düşük taksit isteği kontrolü - completed adımında olabilir
  if (state.step === 'completed' && state.lastNpvResult) {
    const lowerInstallmentKeywords = ['daha düşük taksit', 'düşük taksit', 'taksit fazla', 'taksit çok', 'daha az taksit', 'düşük ödeme', 'azaltmak'];
    if (lowerInstallmentKeywords.some(keyword => lowerMessage.includes(keyword))) {
      newState.step = 'waiting_for_lower_installment';
      const betterModel = (state.lastNpvResult.modelA.nominalTotal < state.lastNpvResult.modelB.nominalTotal) ? 'A' : 'B';
      const currentInstallment = betterModel === 'A' ? state.lastNpvResult.modelA.monthlyInstallment : state.lastNpvResult.modelB.monthlyInstallment;
      
      return {
        message: `Anladım, aylık taksit ${formatMoney(currentInstallment)} size fazla geliyor. 👍\n\nHangi aylık taksit miktarını ödemek istersiniz?\n\nÖrnek: 40000 veya 40000 TL`,
        newState,
      };
    }
  }

  // İstenen düşük taksit miktarını al
  if (state.step === 'waiting_for_lower_installment') {
    // Peşinat önerisi kabul edildi mi kontrol et
    if (state.suggestedDownAmount && (lowerMessage.includes('evet') || lowerMessage.includes('kabul') || lowerMessage.includes('tamam') || lowerMessage === 'e')) {
      const apartment = apartments.find(apt => apt.ev_id === state.apartmentId);
      if (apartment && state.desiredInstallment) {
        try {
          const monthlyRateDecimal = (state.monthlyRate || 2) > 1 
            ? (state.monthlyRate || 2) / 100 
            : (state.monthlyRate || 0.02);
          
          const npvResult = calculateNPV({
            targetPv: apartment.bugunku_pesin_fiyat,
            monthlyRate: monthlyRateDecimal,
            downAmount: state.suggestedDownAmount,
            downYear: state.downYear!,
            downMonth: state.downMonth!,
            nInstallments: state.nInstallments || 24,
            startYear: state.startYear || currentDate.year,
            startMonth: state.startMonth || currentDate.month,
          });
          
          const acceptedDownAmount = state.suggestedDownAmount!;
          newState.downAmount = acceptedDownAmount;
          newState.step = 'completed';
          newState.lastNpvResult = npvResult;
          newState.suggestedDownAmount = undefined;
          
          return {
            message: `Harika! Peşinat tutarını ${formatMoney(acceptedDownAmount)} olarak güncelledim. ✅\n\nTaksit planınız aşağıdaki kartta görüntüleniyor.\n\nAylık taksit: ${formatMoney(npvResult.modelA.monthlyInstallment)}`,
            npvResult,
            newState,
          };
        } catch (error) {
          return {
            message: `Hesaplama sırasında bir hata oluştu. Lütfen tekrar deneyin.`,
          };
        }
      }
    }
    
    // Önce taksit sayısı artırma sorusunu kontrol et
    const installmentMatch = userMessage.match(/(\d+)\s*ay/i);
    if (installmentMatch && (lowerMessage.includes('taksitle') || lowerMessage.includes('taksit') || lowerMessage.includes('olabilir') || lowerMessage.includes('olur'))) {
      const requestedInstallments = parseInt(installmentMatch[1]);
      if (requestedInstallments > (state.nInstallments || 24)) {
        // Taksit sayısını artırarak yeniden hesapla
        const apartment = apartments.find(apt => apt.ev_id === state.apartmentId);
        if (apartment && state.desiredInstallment) {
          try {
            const monthlyRateDecimal = (state.monthlyRate || 2) > 1 
              ? (state.monthlyRate || 2) / 100 
              : (state.monthlyRate || 0.02);
            
            const npvResult = calculateNPV({
              targetPv: apartment.bugunku_pesin_fiyat,
              monthlyRate: monthlyRateDecimal,
              downAmount: state.downAmount!,
              downYear: state.downYear!,
              downMonth: state.downMonth!,
              nInstallments: requestedInstallments,
              startYear: state.startYear || currentDate.year,
              startMonth: state.startMonth || currentDate.month,
            });
            
            const calculatedInstallment = npvResult.modelA.monthlyInstallment;
            const isFeasible = calculatedInstallment >= (state.desiredInstallment - 5000) && calculatedInstallment <= (state.desiredInstallment + 5000);
            
            if (isFeasible) {
              newState.nInstallments = requestedInstallments;
              newState.step = 'completed';
              newState.lastNpvResult = npvResult;
              
              return {
                message: `Evet! ${requestedInstallments} ay taksitle aylık taksit ${formatMoney(calculatedInstallment)} olur. Bu sizin istediğiniz aralığa (${formatMoney(state.desiredInstallment - 5000)} - ${formatMoney(state.desiredInstallment + 5000)}) uygun! ✅\n\nTaksit planınız aşağıdaki kartta görüntüleniyor.`,
                npvResult,
                newState,
              };
            } else {
              return {
                message: `${requestedInstallments} ay taksitle aylık taksit ${formatMoney(calculatedInstallment)} olur. Bu hala istediğiniz aralığa (${formatMoney(state.desiredInstallment - 5000)} - ${formatMoney(state.desiredInstallment + 5000)}) uygun değil. 😕\n\nDaha uzun vadeli taksit (örn: ${requestedInstallments + 12} ay) veya peşinat tutarını artırmayı deneyebilirsiniz.`,
              };
            }
          } catch (error) {
            return {
              message: `Hesaplama sırasında bir hata oluştu. Lütfen tekrar deneyin.`,
            };
          }
        }
      }
    }
    
    // Peşinat artırma sorusunu kontrol et
    if (lowerMessage.includes('peşinat') && (lowerMessage.includes('yükselt') || lowerMessage.includes('artır') || lowerMessage.includes('ne kadar'))) {
      const apartment = apartments.find(apt => apt.ev_id === state.apartmentId);
      if (apartment && state.desiredInstallment) {
        try {
          const monthlyRateDecimal = (state.monthlyRate || 2) > 1 
            ? (state.monthlyRate || 2) / 100 
            : (state.monthlyRate || 0.02);
          
          // Peşinat tutarını kademeli olarak artırarak deneme
          const currentDownAmount = state.downAmount || 0;
          const maxDownAmount = apartment.bugunku_pesin_fiyat * 0.5; // En fazla ev fiyatının %50'si
          const step = 50000; // 50.000 TL adımlarla artır
          
          let suggestedDownAmount = currentDownAmount + step;
          let foundFeasible = false;
          let suggestedInstallment = 0;
          
          while (suggestedDownAmount <= maxDownAmount && !foundFeasible) {
            const npvResult = calculateNPV({
              targetPv: apartment.bugunku_pesin_fiyat,
              monthlyRate: monthlyRateDecimal,
              downAmount: suggestedDownAmount,
              downYear: state.downYear!,
              downMonth: state.downMonth!,
              nInstallments: state.nInstallments || 24,
              startYear: state.startYear || currentDate.year,
              startMonth: state.startMonth || currentDate.month,
            });
            
            suggestedInstallment = npvResult.modelA.monthlyInstallment;
            foundFeasible = suggestedInstallment >= (state.desiredInstallment - 5000) && suggestedInstallment <= (state.desiredInstallment + 5000);
            
            if (!foundFeasible) {
              suggestedDownAmount += step;
            }
          }
          
          if (foundFeasible) {
            return {
              message: `Evet! Peşinat tutarını ${formatMoney(suggestedDownAmount)}'ye yükseltirseniz, aylık taksit ${formatMoney(suggestedInstallment)} olur. Bu sizin istediğiniz aralığa (${formatMoney(state.desiredInstallment - 5000)} - ${formatMoney(state.desiredInstallment + 5000)}) uygun! ✅\n\nMevcut peşinat: ${formatMoney(currentDownAmount)}\nÖnerilen peşinat: ${formatMoney(suggestedDownAmount)}\nFark: ${formatMoney(suggestedDownAmount - currentDownAmount)}\n\nBu peşinat tutarını kabul ediyor musunuz?`,
              newState: { ...newState, suggestedDownAmount },
            };
          } else {
            return {
              message: `Maalesef peşinat tutarını ev fiyatının %50'sine kadar artırsak bile (${formatMoney(maxDownAmount)}), istediğiniz taksit aralığına (${formatMoney(state.desiredInstallment - 5000)} - ${formatMoney(state.desiredInstallment + 5000)}) ulaşamıyoruz. 😕\n\nDaha uzun vadeli taksit (örn: ${(state.nInstallments || 24) + 12} ay) veya biraz daha yüksek bir taksit miktarı deneyebilirsiniz.`,
            };
          }
        } catch (error) {
          return {
            message: `Hesaplama sırasında bir hata oluştu. Lütfen tekrar deneyin.`,
          };
        }
      }
    }
    
    const amount = parseAmount(userMessage);
    
    if (amount && amount > 0) {
      newState.desiredInstallment = amount;
      newState.step = 'showing_alternatives';
      
      // Mevcut bilgilerle yeni NPV hesapla (targetNominal kullanarak)
      const apartment = apartments.find(apt => apt.ev_id === state.apartmentId);
      if (!apartment) {
        return {
          message: `Bir hata oluştu. Lütfen tekrar deneyin.`,
        };
      }
      
      try {
        const monthlyRateDecimal = (state.monthlyRate || 2) > 1 
          ? (state.monthlyRate || 2) / 100 
          : (state.monthlyRate || 0.02);
        
        // Yeni nominal toplam = peşinat + (yeni taksit * taksit sayısı)
        const newNominalTotal = (state.downAmount || 0) + (amount * (state.nInstallments || 24));
        
        // Mode 2: Target nominal ile NPV hesapla
        const newNpvResult = calculateNPV({
          targetNominal: newNominalTotal,
          monthlyRate: monthlyRateDecimal,
          downAmount: state.downAmount!,
          downYear: state.downYear!,
          downMonth: state.downMonth!,
          nInstallments: state.nInstallments!,
          startYear: state.startYear || currentDate.year,
          startMonth: state.startMonth || currentDate.month,
        });
        
        // Validasyon: Aylık taksit ve toplam faiz eksiye düşemez
        const modelAInterest = newNpvResult.modelA.nominalTotal - newNpvResult.modelA.presentValue;
        const modelBInterest = newNpvResult.modelB.nominalTotal - newNpvResult.modelB.presentValue;
        
        if (newNpvResult.modelA.monthlyInstallment < 0 || newNpvResult.modelB.monthlyInstallment < 0) {
          return {
            message: `Hesaplama hatası: Aylık taksit negatif olamaz. 😕\n\nLütfen daha yüksek bir taksit miktarı deneyin.`,
          };
        }
        
        if (modelAInterest < 0 || modelBInterest < 0) {
          return {
            message: `Hesaplama hatası: Toplam faiz negatif olamaz. 😕\n\nBu taksit miktarı çok düşük. Lütfen biraz daha yüksek bir taksit miktarı deneyin.`,
          };
        }
        
        newState.calculatedPv = newNpvResult.modelA.presentValue;
        
        // Alternatif daireleri bul (istenen taksit miktarına ±5.000 TL tolerans ile)
        const alternatives = findAlternativeApartments(
          apartments,
          amount, // İstenen taksit miktarı
          state.downAmount!,
          state.nInstallments!,
          monthlyRateDecimal * 100, // Yüzde olarak
          state.downYear!,
          state.downMonth!,
          state.startYear || currentDate.year,
          state.startMonth || currentDate.month,
          state.apartmentId!,
          5000 // ±5.000 TL tolerans
        );
        
        if (alternatives.length > 0) {
          // Alternatif daireleri state'te sakla (liste numarasıyla seçim için)
          newState.alternativeApartments = alternatives;
          
          let message = `Anladım! ${formatMoney(amount)} aylık taksit istiyorsunuz (±${formatMoney(5000)} tolerans ile).\n\n---\n\n🏠 **Size Uygun Alternatif Daireler:**\n\n`;
          
          alternatives.forEach((alt, index) => {
            // Her daire için taksit miktarını hesapla
            try {
              const altMonthlyRateDecimal = monthlyRateDecimal;
              const altNpvResult = calculateNPV({
                targetPv: alt.bugunku_pesin_fiyat,
                monthlyRate: altMonthlyRateDecimal,
                downAmount: state.downAmount!,
                downYear: state.downYear!,
                downMonth: state.downMonth!,
                nInstallments: state.nInstallments!,
                startYear: state.startYear || currentDate.year,
                startMonth: state.startMonth || currentDate.month,
              });
              
              const altInstallment = altNpvResult.modelA.monthlyInstallment;
              
              message += `${index + 1}. **${alt.ev_id}** - ${alt.mahalle}, ${alt.ilce}\n`;
              message += `   • Oda: ${alt.oda_sayisi} | Metrekare: ${alt.m2}m² | Kat: ${alt.kat}\n`;
              message += `   • Peşin fiyat: ${formatMoney(alt.bugunku_pesin_fiyat)}\n`;
              message += `   • Aylık taksit: ${formatMoney(altInstallment)}\n`;
              message += `   • Teslim süresi: ${alt.teslim_suresi}\n\n`;
            } catch (error) {
              message += `${index + 1}. **${alt.ev_id}** - ${alt.mahalle}, ${alt.ilce}\n`;
              message += `   • Oda: ${alt.oda_sayisi} | Metrekare: ${alt.m2}m² | Kat: ${alt.kat}\n`;
              message += `   • Peşin fiyat: ${formatMoney(alt.bugunku_pesin_fiyat)}\n`;
              message += `   • Teslim süresi: ${alt.teslim_suresi}\n\n`;
            }
          });
          
          message += `Bu daireler sizin istediğiniz taksit aralığına (${formatMoney(amount - 5000)} - ${formatMoney(amount + 5000)}) uygun. Teslim süreleri biraz daha uzun olabilir. 🎯\n\nHangi daireyi seçmek istersiniz? (Numara veya Ev ID yazabilirsiniz)`;
          
          return {
            message,
            newState,
          };
        } else {
          // Alternatif daire bulunamadı - kullanıcıya öneriler sun
          const currentApartment = apartments.find(apt => apt.ev_id === state.apartmentId);
          if (currentApartment) {
            // Mevcut daire için taksit sayısını artırarak deneme
            const extendedInstallments = (state.nInstallments || 24) + 12; // 12 ay ekle
            const extendedMonthlyRateDecimal = monthlyRateDecimal;
            
            try {
              const extendedNpvResult = calculateNPV({
                targetPv: currentApartment.bugunku_pesin_fiyat,
                monthlyRate: extendedMonthlyRateDecimal,
                downAmount: state.downAmount!,
                downYear: state.downYear!,
                downMonth: state.downMonth!,
                nInstallments: extendedInstallments,
                startYear: state.startYear || currentDate.year,
                startMonth: state.startMonth || currentDate.month,
              });
              
              const extendedInstallment = extendedNpvResult.modelA.monthlyInstallment;
              const isExtendedFeasible = extendedInstallment >= (amount - 5000) && extendedInstallment <= (amount + 5000);
              
              return {
                message: `Maalesef ${formatMoney(amount)} aylık taksit ile uygun alternatif daire bulamadım. 😕\n\n💡 **Önerilerim:**\n\n1. **Taksit sayısını artırmayı deneyin:** ${extendedInstallments} ay taksitle aylık taksit ${formatMoney(extendedInstallment)} olur. ${isExtendedFeasible ? 'Bu sizin istediğiniz aralığa uygun! ✅' : 'Hala istediğiniz aralığa uygun değil.'}\n\n2. **Peşinat tutarını artırmayı deneyin:** Daha yüksek peşinat ile aylık taksit düşer.\n\n3. **Biraz daha yüksek bir taksit miktarı deneyin:** ${formatMoney(amount + 5000)} gibi.\n\nHangi seçeneği denemek istersiniz? "36 ay taksitle olabilir mi?" veya "Peşinatı ne kadar yükseltirsem olabilir?" gibi sorular sorabilirsiniz.`,
                newState,
              };
            } catch (error) {
              return {
                message: `Maalesef ${formatMoney(amount)} aylık taksit ile uygun alternatif daire bulamadım. 😕\n\n💡 **Önerilerim:**\n\n1. **Taksit sayısını artırmayı deneyin:** Daha uzun vadeli taksitler aylık taksiti düşürür.\n\n2. **Peşinat tutarını artırmayı deneyin:** Daha yüksek peşinat ile aylık taksit düşer.\n\n3. **Biraz daha yüksek bir taksit miktarı deneyin:** ${formatMoney(amount + 5000)} gibi.\n\nHangi seçeneği denemek istersiniz? "36 ay taksitle olabilir mi?" veya "Peşinatı ne kadar yükseltirsem olabilir?" gibi sorular sorabilirsiniz.`,
                newState,
              };
            }
          } else {
            return {
              message: `Maalesef ${formatMoney(amount)} aylık taksit ile uygun alternatif daire bulamadım. 😕\n\nLütfen biraz daha yüksek bir taksit miktarı deneyin veya farklı bir ödeme planı oluşturalım.`,
              newState,
            };
          }
        }
      } catch (error) {
        console.error('Alternatif hesaplama hatası:', error);
        return {
          message: `Hesaplama sırasında bir hata oluştu. Lütfen tekrar deneyin.`,
        };
      }
    }
    
    return {
      message: `Lütfen geçerli bir taksit miktarı girin.\n\nÖrnek: 40000 veya 40000 TL`,
    };
  }

  // Alternatif daire seçimi
  if (state.step === 'showing_alternatives') {
    // Peşinat önerisi kabul edildi mi kontrol et
    if (state.suggestedDownAmount && (lowerMessage.includes('evet') || lowerMessage.includes('kabul') || lowerMessage.includes('tamam') || lowerMessage === 'e')) {
      const apartment = apartments.find(apt => apt.ev_id === state.apartmentId);
      if (apartment && state.desiredInstallment) {
        try {
          const monthlyRateDecimal = (state.monthlyRate || 2) > 1 
            ? (state.monthlyRate || 2) / 100 
            : (state.monthlyRate || 0.02);
          
          const npvResult = calculateNPV({
            targetPv: apartment.bugunku_pesin_fiyat,
            monthlyRate: monthlyRateDecimal,
            downAmount: state.suggestedDownAmount,
            downYear: state.downYear!,
            downMonth: state.downMonth!,
            nInstallments: state.nInstallments || 24,
            startYear: state.startYear || currentDate.year,
            startMonth: state.startMonth || currentDate.month,
          });
          
          const acceptedDownAmount = state.suggestedDownAmount!;
          newState.downAmount = acceptedDownAmount;
          newState.step = 'completed';
          newState.lastNpvResult = npvResult;
          newState.suggestedDownAmount = undefined;
          
          return {
            message: `Harika! Peşinat tutarını ${formatMoney(acceptedDownAmount)} olarak güncelledim. ✅\n\nTaksit planınız aşağıdaki kartta görüntüleniyor.\n\nAylık taksit: ${formatMoney(npvResult.modelA.monthlyInstallment)}`,
            npvResult,
            newState,
          };
        } catch (error) {
          return {
            message: `Hesaplama sırasında bir hata oluştu. Lütfen tekrar deneyin.`,
          };
        }
      }
    }
    
    // Önce taksit sayısı artırma sorusunu kontrol et
    const installmentMatch = userMessage.match(/(\d+)\s*ay/i);
    if (installmentMatch && (lowerMessage.includes('taksitle') || lowerMessage.includes('taksit') || lowerMessage.includes('olabilir') || lowerMessage.includes('olur'))) {
      const requestedInstallments = parseInt(installmentMatch[1]);
      if (requestedInstallments > (state.nInstallments || 24)) {
        // Taksit sayısını artırarak yeniden hesapla
        const apartment = apartments.find(apt => apt.ev_id === state.apartmentId);
        if (apartment && state.desiredInstallment) {
          try {
            const monthlyRateDecimal = (state.monthlyRate || 2) > 1 
              ? (state.monthlyRate || 2) / 100 
              : (state.monthlyRate || 0.02);
            
            const npvResult = calculateNPV({
              targetPv: apartment.bugunku_pesin_fiyat,
              monthlyRate: monthlyRateDecimal,
              downAmount: state.downAmount!,
              downYear: state.downYear!,
              downMonth: state.downMonth!,
              nInstallments: requestedInstallments,
              startYear: state.startYear || currentDate.year,
              startMonth: state.startMonth || currentDate.month,
            });
            
            const calculatedInstallment = npvResult.modelA.monthlyInstallment;
            const isFeasible = calculatedInstallment >= (state.desiredInstallment - 5000) && calculatedInstallment <= (state.desiredInstallment + 5000);
            
            if (isFeasible) {
              newState.nInstallments = requestedInstallments;
              newState.step = 'completed';
              newState.lastNpvResult = npvResult;
              
              return {
                message: `Evet! ${requestedInstallments} ay taksitle aylık taksit ${formatMoney(calculatedInstallment)} olur. Bu sizin istediğiniz aralığa (${formatMoney(state.desiredInstallment - 5000)} - ${formatMoney(state.desiredInstallment + 5000)}) uygun! ✅\n\nTaksit planınız aşağıdaki kartta görüntüleniyor.`,
                npvResult,
                newState,
              };
            } else {
              return {
                message: `${requestedInstallments} ay taksitle aylık taksit ${formatMoney(calculatedInstallment)} olur. Bu hala istediğiniz aralığa (${formatMoney(state.desiredInstallment - 5000)} - ${formatMoney(state.desiredInstallment + 5000)}) uygun değil. 😕\n\nDaha uzun vadeli taksit (örn: ${requestedInstallments + 12} ay) veya peşinat tutarını artırmayı deneyebilirsiniz.`,
              };
            }
          } catch (error) {
            return {
              message: `Hesaplama sırasında bir hata oluştu. Lütfen tekrar deneyin.`,
            };
          }
        }
      }
    }
    
    // Peşinat artırma sorusunu kontrol et
    if (lowerMessage.includes('peşinat') && (lowerMessage.includes('yükselt') || lowerMessage.includes('artır') || lowerMessage.includes('ne kadar'))) {
      const apartment = apartments.find(apt => apt.ev_id === state.apartmentId);
      if (apartment && state.desiredInstallment) {
        try {
          const monthlyRateDecimal = (state.monthlyRate || 2) > 1 
            ? (state.monthlyRate || 2) / 100 
            : (state.monthlyRate || 0.02);
          
          // Peşinat tutarını kademeli olarak artırarak deneme
          const currentDownAmount = state.downAmount || 0;
          const maxDownAmount = apartment.bugunku_pesin_fiyat * 0.5; // En fazla ev fiyatının %50'si
          const step = 50000; // 50.000 TL adımlarla artır
          
          let suggestedDownAmount = currentDownAmount + step;
          let foundFeasible = false;
          let suggestedInstallment = 0;
          
          while (suggestedDownAmount <= maxDownAmount && !foundFeasible) {
            const npvResult = calculateNPV({
              targetPv: apartment.bugunku_pesin_fiyat,
              monthlyRate: monthlyRateDecimal,
              downAmount: suggestedDownAmount,
              downYear: state.downYear!,
              downMonth: state.downMonth!,
              nInstallments: state.nInstallments || 24,
              startYear: state.startYear || currentDate.year,
              startMonth: state.startMonth || currentDate.month,
            });
            
            suggestedInstallment = npvResult.modelA.monthlyInstallment;
            foundFeasible = suggestedInstallment >= (state.desiredInstallment - 5000) && suggestedInstallment <= (state.desiredInstallment + 5000);
            
            if (!foundFeasible) {
              suggestedDownAmount += step;
            }
          }
          
          if (foundFeasible) {
            return {
              message: `Evet! Peşinat tutarını ${formatMoney(suggestedDownAmount)}'ye yükseltirseniz, aylık taksit ${formatMoney(suggestedInstallment)} olur. Bu sizin istediğiniz aralığa (${formatMoney(state.desiredInstallment - 5000)} - ${formatMoney(state.desiredInstallment + 5000)}) uygun! ✅\n\nMevcut peşinat: ${formatMoney(currentDownAmount)}\nÖnerilen peşinat: ${formatMoney(suggestedDownAmount)}\nFark: ${formatMoney(suggestedDownAmount - currentDownAmount)}\n\nBu peşinat tutarını kabul ediyor musunuz?`,
              newState: { ...newState, suggestedDownAmount },
            };
          } else {
            return {
              message: `Maalesef peşinat tutarını ev fiyatının %50'sine kadar artırsak bile (${formatMoney(maxDownAmount)}), istediğiniz taksit aralığına (${formatMoney(state.desiredInstallment - 5000)} - ${formatMoney(state.desiredInstallment + 5000)}) ulaşamıyoruz. 😕\n\nDaha uzun vadeli taksit (örn: ${(state.nInstallments || 24) + 12} ay) veya biraz daha yüksek bir taksit miktarı deneyebilirsiniz.`,
            };
          }
        } catch (error) {
          return {
            message: `Hesaplama sırasında bir hata oluştu. Lütfen tekrar deneyin.`,
          };
        }
      }
    }
    
    let selectedApartment: Apartment | null = null;
    
    // Önce liste numarasını kontrol et (örn: "5", "5.", "1", "2")
    const listNumberMatch = userMessage.match(/^(\d+)\.?$/);
    if (listNumberMatch && state.alternativeApartments) {
      const index = parseInt(listNumberMatch[1]) - 1; // 1-based to 0-based
      if (index >= 0 && index < state.alternativeApartments.length) {
        selectedApartment = state.alternativeApartments[index];
      }
    }
    
    // Liste numarası bulunamadıysa, ev ID'sini kontrol et
    if (!selectedApartment) {
      const evId = parseApartmentId(userMessage);
      if (evId) {
        selectedApartment = apartments.find(apt => apt.ev_id === evId) || null;
      }
    }
    
        if (selectedApartment) {
      // Yeni daire seçildi, bu dairenin PV'sine ve mevcut peşinat tutarına göre taksit planını hesapla
      newState.apartmentId = selectedApartment.ev_id;
      newState.step = 'completed';
      newState.alternativeApartments = undefined; // Artık gerek yok
      
      const monthlyRateDecimal = (state.monthlyRate || 2) > 1 
        ? (state.monthlyRate || 2) / 100 
        : (state.monthlyRate || 0.02);
      
      // Seçilen daire için, o dairenin PV'sine ve mevcut peşinat tutarına göre taksit planı hesapla (targetPv kullanarak)
      const finalNpvResult = calculateNPV({
        targetPv: selectedApartment.bugunku_pesin_fiyat,
        monthlyRate: monthlyRateDecimal,
        downAmount: state.downAmount!,
        downYear: state.downYear!,
        downMonth: state.downMonth!,
        nInstallments: state.nInstallments!,
        startYear: state.startYear || currentDate.year,
        startMonth: state.startMonth || currentDate.month,
      });
      
      // Validasyon: Aylık taksit ve toplam faiz eksiye düşemez
      const modelAInterest = finalNpvResult.modelA.nominalTotal - finalNpvResult.modelA.presentValue;
      const modelBInterest = finalNpvResult.modelB.nominalTotal - finalNpvResult.modelB.presentValue;
      
      if (finalNpvResult.modelA.monthlyInstallment < 0 || finalNpvResult.modelB.monthlyInstallment < 0) {
        return {
          message: `Hesaplama hatası: Aylık taksit negatif olamaz. 😕\n\nLütfen daha yüksek bir taksit miktarı deneyin.`,
        };
      }
      
      if (modelAInterest < 0 || modelBInterest < 0) {
        return {
          message: `Hesaplama hatası: Toplam faiz negatif olamaz. 😕\n\nBu taksit miktarı çok düşük. Lütfen biraz daha yüksek bir taksit miktarı deneyin.`,
        };
      }
      
      newState.lastNpvResult = finalNpvResult;
      
      const calculatedInstallment = finalNpvResult.modelA.monthlyInstallment;
      
      return {
        message: `Harika! ${selectedApartment.ev_id} numaralı daireyi seçtiniz. 🎉\n\nBu daire için aylık taksit planı aşağıdaki kartta görüntüleniyor.\n\nHesaplanan aylık taksit: ${formatMoney(calculatedInstallment)}\nTeslim süresi: ${selectedApartment.teslim_suresi}`,
        npvResult: finalNpvResult,
        newState,
      };
    } else {
      return {
        message: `Lütfen listeden bir daire seçin. Numara (örn: 1, 2, 3) veya Ev ID (örn: GZP-H04-001) yazabilirsiniz.`,
      };
    }
  }

  // Completed adımında, kullanıcı yeni bir daire seçmek isterse veya yeni bir işlem yapmak isterse
  if (state.step === 'completed') {
    // Yeni bir daire seçildi mi kontrol et
    const evId = parseApartmentId(userMessage);
    if (evId) {
      const apartment = apartments.find(apt => apt.ev_id === evId);
      if (apartment) {
        // Yeni bir akış başlat
        newState.apartmentId = evId;
        newState.step = 'waiting_for_interest_rate';
        newState.downAmount = undefined;
        newState.downYear = undefined;
        newState.downMonth = undefined;
        newState.nInstallments = undefined;
        newState.monthlyRate = undefined;
        newState.isAnnualRateSelected = undefined;
        newState.desiredInstallment = undefined;
        newState.calculatedPv = undefined;
        newState.lastNpvResult = undefined;
        newState.alternativeApartments = undefined;
        
        return {
          message: `Harika! ${evId} numaralı evi seçtiniz. 🏠\n\nBu ev hakkında bilgiler:\n• Oda sayısı: ${apartment.oda_sayisi}\n• Metrekare: ${apartment.m2}m²\n• Konum: ${apartment.mahalle}, ${apartment.ilce}\n• Peşin fiyat: ${formatMoney(apartment.bugunku_pesin_fiyat)}\n\nŞimdi faiz oranını belirleyelim. 💹\n\nYıllık faiz oranı mı gireceksiniz, yoksa aylık faiz oranı mı?\n\nÖrnek: "aylık" veya "yıllık" yazabilirsiniz.`,
          newState,
        };
      }
    }
    
    // "daha düşük taksit" gibi bir istek varsa
    if (userMessage.toLowerCase().includes('daha düşük') || userMessage.toLowerCase().includes('düşük taksit')) {
      newState.step = 'waiting_for_lower_installment';
      return {
        message: `Anladım, aylık taksit size fazla geliyor. 👍\n\nHangi aylık taksit miktarını ödemek istersiniz?\n\nÖrnek: 40000 veya 40000 TL`,
        newState,
      };
    }
    
    // Başka bir mesaj ise, kullanıcıya yardımcı ol
    return {
      message: `Başka bir sorunuz var mı? 🤔\n\n• Yeni bir daire seçmek için Ev ID yazabilirsiniz (örn: GZP-H04-001)\n• Daha düşük taksit istiyorsanız "daha düşük taksit ödemek istiyorum" yazabilirsiniz\n• Yeni bir hesaplama yapmak için sağdaki listeden bir daire seçebilirsiniz`,
    };
  }

  // Tüm bilgiler toplandıysa NPV hesapla (sadece completed değilse)
  if (newState.step !== 'completed' && 
      newState.apartmentId && newState.downAmount && newState.downYear && 
      newState.downMonth && newState.nInstallments && newState.monthlyRate) {
    
    // Faiz oranı mutlaka girilmiş olmalı
    if (!newState.monthlyRate) {
      newState.step = 'waiting_for_interest_rate';
      return {
        message: `Faiz oranını belirlememiz gerekiyor. 💹\n\nYıllık faiz oranı mı gireceksiniz, yoksa aylık faiz oranı mı?\n\nÖrnek: "aylık" veya "yıllık" yazabilirsiniz.`,
        newState,
      };
    }
    
    const apartment = apartments.find(apt => apt.ev_id === newState.apartmentId);
    if (apartment) {
      try {
        // Faiz oranını ondalık formata çevir
        // Eğer oran 1'den büyükse (örn: 2), yüzde olarak kabul et ve 100'e böl
        // Eğer oran 1'den küçükse (örn: 0.02), zaten ondalık formatta
        const monthlyRateDecimal = newState.monthlyRate > 1 
          ? newState.monthlyRate / 100 
          : newState.monthlyRate;
        
        const npvResult = calculateNPV({
          targetPv: apartment.bugunku_pesin_fiyat,
          monthlyRate: monthlyRateDecimal,
          downAmount: newState.downAmount!,
          downYear: newState.downYear!,
          downMonth: newState.downMonth!,
          nInstallments: newState.nInstallments!,
          startYear: newState.startYear || currentDate.year,
          startMonth: newState.startMonth || currentDate.month,
        });

        // Validasyon: Aylık taksit ve toplam faiz eksiye düşemez
        const modelAInterest = npvResult.modelA.nominalTotal - apartment.bugunku_pesin_fiyat;
        const modelBInterest = npvResult.modelB.nominalTotal - apartment.bugunku_pesin_fiyat;
        
        if (npvResult.modelA.monthlyInstallment < 0 || npvResult.modelB.monthlyInstallment < 0) {
          return {
            message: `Hesaplama hatası: Aylık taksit negatif olamaz. 😕\n\nLütfen peşinat tutarınızı düşürün veya taksit sayısını artırın.`,
          };
        }
        
        if (modelAInterest < 0 || modelBInterest < 0) {
          return {
            message: `Hesaplama hatası: Toplam faiz negatif olamaz. 😕\n\nBu durumda peşinat tutarı çok yüksek veya faiz oranı çok düşük. Lütfen bilgilerinizi kontrol edin.`,
          };
        }

        const betterModel = (npvResult.modelA.nominalTotal < npvResult.modelB.nominalTotal) ? 'A' : 'B';
        
        // Son NPV sonucunu kaydet
        newState.lastNpvResult = npvResult;
        newState.step = 'completed';
        
        const betterModelResult = betterModel === 'A' ? npvResult.modelA : npvResult.modelB;
        
        return {
          message: `Hesaplama tamamlandı! ✅\n\nTaksit planınız aşağıdaki kartta görüntüleniyor.\n\n💡 Eğer aylık taksit ${formatMoney(betterModelResult.monthlyInstallment)} size fazla geliyorsa, "daha düşük taksit ödemek istiyorum" yazabilirsiniz. Size daha uygun alternatifler önerebilirim.`,
          npvResult,
          newState,
        };
      } catch (error) {
        console.error('NPV hesaplama hatası:', error);
        return {
          message: `Hesaplama sırasında bir hata oluştu. Lütfen bilgilerinizi kontrol edip tekrar deneyin.`,
        };
      }
    }
  }

  // Anlaşılamayan mesaj
  return {
    message: `Üzgünüm, anlayamadım. 😅\n\nLütfen mevcut adım için istenen bilgiyi girin. "Yardım" yazarak adımları görebilirsiniz.`,
  };
}
