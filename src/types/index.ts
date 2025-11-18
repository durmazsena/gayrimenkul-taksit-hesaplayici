export interface Apartment {
  ev_id: string;
  proje_adi: string;
  sehir: string;
  ilce: string;
  mahalle: string;
  blok: string;
  kat: number;
  oda_sayisi: string;
  m2: number;
  teslim_suresi: string;
  bitis_tarihi: string;
  bugunku_pesin_fiyat: number;
}

export interface NPVInputs {
  targetPv?: number;
  targetNominal?: number;
  monthlyRate: number;
  downAmount: number;
  downYear: number;
  downMonth: number;
  nInstallments: number;
  startYear: number;
  startMonth: number;
}

export interface ScheduleEntry {
  date: string;
  amount: number;
  type: 'installment' | 'down_payment';
}

export interface NPVResult {
  modelA: {
    monthlyInstallment: number;
    nominalTotal: number;
    presentValue: number;
    schedule: ScheduleEntry[];
  };
  modelB: {
    monthlyInstallment: number;
    nominalTotal: number;
    presentValue: number;
    schedule: ScheduleEntry[];
  };
  downPaymentPV: number;
  downPaymentDate: string;
}

export interface ChatMessage {
  role: 'user' | 'bot';
  content: string;
}

export type ConversationStep = 
  | 'waiting_for_apartment'
  | 'waiting_for_interest_rate'
  | 'waiting_for_down_payment'
  | 'waiting_for_down_payment_year'
  | 'waiting_for_down_payment_month'
  | 'waiting_for_installments'
  | 'completed'
  | 'waiting_for_lower_installment'
  | 'showing_alternatives';

export interface ConversationState {
  step?: ConversationStep;
  apartmentId?: string;
  downAmount?: number;
  monthlyRate?: number;
  nInstallments?: number;
  startYear?: number;
  startMonth?: number;
  downYear?: number;
  downMonth?: number;
  isAnnualRateSelected?: boolean; // Yıllık mı aylık mı seçildi mi?
  desiredInstallment?: number; // Kullanıcının istediği düşük taksit miktarı
  calculatedPv?: number; // İstenen taksit miktarından hesaplanan PV
  lastNpvResult?: NPVResult; // Son hesaplanan NPV sonucu
  alternativeApartments?: Apartment[]; // Alternatif daireler listesi (liste numarasıyla seçim için)
  suggestedDownAmount?: number; // Önerilen peşinat tutarı (kullanıcı onayı bekleniyor)
}
