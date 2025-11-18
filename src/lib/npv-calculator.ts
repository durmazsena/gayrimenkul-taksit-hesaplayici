/**
 * NPV-based pricing helper for real-estate (seller financing)
 * Converted from Python to TypeScript
 * 
 * Features:
 * - Mode 1: Target Present Value (PV) → compute monthly installment T and nominal total
 * - Mode 2: Target Nominal Total (down + installments) → compute T, and report PV under both models
 * - Two cash-flow models:
 *     A) Concurrent: taksitler bugünden bir ay sonra başlar
 *     B) Skip: taksitler bugünden bir ay sonra başlar, peşinat ayında taksit alınmaz
 */

export interface NPVInputs {
  targetPv?: number;          // Hedef bugünkü değer (Mode 1)
  targetNominal?: number;     // Hedef nominal toplam (Mode 2)
  monthlyRate: number;        // Aylık oran (örn: 0.02 = %2)
  downAmount: number;         // Peşinat tutarı
  downYear: number;           // Peşinat yılı
  downMonth: number;          // Peşinat ayı (1-12)
  nInstallments: number;      // Taksit adedi
  startYear: number;          // Başlangıç yılı (bugün)
  startMonth: number;         // Başlangıç ayı (bugün)
}

export interface ScheduleEntry {
  date: string;               // YYYY-MM format
  amount: number;             // Tutar
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

/**
 * Başlangıç ve bitiş tarihleri arasındaki ay sayısını hesaplar
 */
function monthsBetween(startYear: number, startMonth: number, endYear: number, endMonth: number): number {
  return (endYear - startYear) * 12 + (endMonth - startMonth);
}

/**
 * Bugünkü değer (Present Value) hesaplar
 */
function presentValue(amount: number, monthsAhead: number, r: number): number {
  return amount / Math.pow(1 + r, monthsAhead);
}

/**
 * Geometric sum discount hesaplar
 * Sum_{k=startMonth..startMonth+n-1} 1/(1+r)^k  optionally skipping k==skipIndex
 */
function geometricSumDiscount(
  n: number,
  r: number,
  startMonth: number = 1,
  skipIndex?: number
): number {
  let sum = 0.0;
  for (let i = 0; i < n; i++) {
    const k = startMonth + i;
    if (skipIndex !== undefined && k === skipIndex) {
      continue;
    }
    sum += 1.0 / Math.pow(1 + r, k);
  }
  return sum;
}

/**
 * Model A (Concurrent) için ödeme takvimi oluşturur
 * Taksitler bugünden bir ay sonra başlar
 */
function scheduleConcurrent(inp: NPVInputs, T: number): ScheduleEntry[] {
  const schedule: ScheduleEntry[] = [];
  const startDate = new Date(inp.startYear, inp.startMonth - 1, 1);
  
  // Taksitler bir ay sonra başlar (k=1'den başla)
  for (let k = 1; k <= inp.nInstallments; k++) {
    const date = new Date(startDate);
    date.setMonth(date.getMonth() + k);
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    schedule.push({
      date: dateStr,
      amount: T,
      type: 'installment'
    });
  }
  
  return schedule;
}

/**
 * Model B (Skip) için ödeme takvimi oluşturur
 * Taksitler bugünden bir ay sonra başlar, peşinat ayında taksit alınmaz
 */
function scheduleSkip(inp: NPVInputs, T: number): ScheduleEntry[] {
  const schedule: ScheduleEntry[] = [];
  const t = monthsBetween(inp.startYear, inp.startMonth, inp.downYear, inp.downMonth);
  const startDate = new Date(inp.startYear, inp.startMonth - 1, 1);
  
  let paid = 0;
  let k = 1; // Taksitler bir ay sonra başlar
  
  while (paid < inp.nInstallments) {
    const dateK = new Date(startDate);
    dateK.setMonth(dateK.getMonth() + k);
    
    if (k === t) {
      // Peşinat ayında taksit alınmaz
      k++;
      continue;
    }
    
    const dateStr = `${dateK.getFullYear()}-${String(dateK.getMonth() + 1).padStart(2, '0')}`;
    schedule.push({
      date: dateStr,
      amount: T,
      type: 'installment'
    });
    paid++;
    k++;
  }
  
  return schedule;
}

/**
 * Ödeme takviminin bugünkü değerini hesaplar
 */
function pvOfSchedule(schedule: ScheduleEntry[], inp: NPVInputs): number {
  let pv = 0.0;
  const start = new Date(inp.startYear, inp.startMonth - 1, 1);
  
  for (const entry of schedule) {
    const [year, month] = entry.date.split('-').map(Number);
    const dt = new Date(year, month - 1, 1);
    const months = (dt.getFullYear() - start.getFullYear()) * 12 + (dt.getMonth() - start.getMonth());
    pv += presentValue(entry.amount, months, inp.monthlyRate);
  }
  
  return pv;
}

/**
 * NPV hesaplama ana fonksiyonu
 */
export function calculateNPV(inputs: NPVInputs): NPVResult {
  const t = monthsBetween(inputs.startYear, inputs.startMonth, inputs.downYear, inputs.downMonth);
  const pvDown = presentValue(inputs.downAmount, t, inputs.monthlyRate);
  const downDate = `${inputs.downYear}-${String(inputs.downMonth).padStart(2, '0')}`;
  
  let modelA, modelB;
  
  if (inputs.targetPv !== undefined) {
    // MODE 1: Target PV fixed → solve T for each model
    const remainingPv = inputs.targetPv - pvDown;
    
    // Model A: Concurrent
    const sCon = geometricSumDiscount(inputs.nInstallments, inputs.monthlyRate, 1);
    const tCon = remainingPv / sCon;
    const schedCon = scheduleConcurrent(inputs, tCon);
    const pvCon = pvDown + pvOfSchedule(schedCon, inputs);
    const nominalCon = inputs.downAmount + tCon * inputs.nInstallments;
    
    modelA = {
      monthlyInstallment: tCon,
      nominalTotal: nominalCon,
      presentValue: pvCon,
      schedule: schedCon
    };
    
    // Model B: Skip
    const skipIdx = (1 <= t && t <= inputs.nInstallments + 1) ? t : undefined;
    const sSkip = geometricSumDiscount(inputs.nInstallments + 1, inputs.monthlyRate, 1, skipIdx);
    const tSkip = remainingPv / sSkip;
    const schedSkip = scheduleSkip(inputs, tSkip);
    const pvSkip = pvDown + pvOfSchedule(schedSkip, inputs);
    const nominalSkip = inputs.downAmount + tSkip * inputs.nInstallments;
    
    modelB = {
      monthlyInstallment: tSkip,
      nominalTotal: nominalSkip,
      presentValue: pvSkip,
      schedule: schedSkip
    };
    
  } else if (inputs.targetNominal !== undefined) {
    // MODE 2: Target nominal fixed → T common, PV differs by model
    const tCommon = (inputs.targetNominal - inputs.downAmount) / inputs.nInstallments;
    
    // Model A: Concurrent
    const schedCon = scheduleConcurrent(inputs, tCommon);
    const pvCon = pvDown + pvOfSchedule(schedCon, inputs);
    
    modelA = {
      monthlyInstallment: tCommon,
      nominalTotal: inputs.targetNominal,
      presentValue: pvCon,
      schedule: schedCon
    };
    
    // Model B: Skip
    const schedSkip = scheduleSkip(inputs, tCommon);
    const pvSkip = pvDown + pvOfSchedule(schedSkip, inputs);
    
    modelB = {
      monthlyInstallment: tCommon,
      nominalTotal: inputs.targetNominal,
      presentValue: pvSkip,
      schedule: schedSkip
    };
    
  } else {
    throw new Error('Either targetPv or targetNominal must be provided');
  }
  
  return {
    modelA,
    modelB,
    downPaymentPV: pvDown,
    downPaymentDate: downDate
  };
}

/**
 * Yıllık oranı aylık orana dönüştürür
 */
export function annualToMonthlyRate(annualRate: number): number {
  return Math.pow(1 + annualRate, 1/12) - 1;
}

/**
 * Para formatı (Türk Lirası)
 */
export function formatMoney(amount: number): string {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
}
