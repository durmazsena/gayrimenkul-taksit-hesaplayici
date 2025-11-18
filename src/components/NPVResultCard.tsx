import { Calendar, DollarSign, TrendingUp } from 'lucide-react';
import type { NPVResult } from '../types';
import { formatMoney } from '../lib/utils';

interface NPVResultCardProps {
  result: NPVResult;
  apartmentPrice: number;
}

export function NPVResultCard({ result, apartmentPrice }: NPVResultCardProps) {
  const modelAInterest = result.modelA.nominalTotal - apartmentPrice;
  const modelBInterest = result.modelB.nominalTotal - apartmentPrice;
  const betterModel = modelAInterest < modelBInterest ? 'A' : 'B';

  return (
    <div className="mt-4 border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-white rounded-lg p-4">
      <div className="flex items-center gap-2 text-blue-700 font-bold text-lg mb-4">
        <TrendingUp className="w-5 h-5" />
        NPV Taksit Planı Hesaplaması
      </div>

      {/* Model A */}
      <div className={`p-4 rounded-lg border-2 mb-4 ${betterModel === 'A' ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-gray-50'}`}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-lg">Model A: Taksitler Hemen Başlar</h3>
          {betterModel === 'A' && (
            <span className="bg-green-600 text-white text-xs px-2 py-1 rounded">Önerilen</span>
          )}
        </div>
        
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white p-3 rounded-md">
            <div className="text-sm text-gray-600 mb-1">Aylık Taksit</div>
            <div className="text-xl font-bold text-blue-600">
              {formatMoney(result.modelA.monthlyInstallment)}
            </div>
          </div>
          
          <div className="bg-white p-3 rounded-md">
            <div className="text-sm text-gray-600 mb-1">Toplam Ödeme</div>
            <div className="text-xl font-bold text-gray-900">
              {formatMoney(result.modelA.nominalTotal)}
            </div>
          </div>
          
          <div className="bg-white p-3 rounded-md">
            <div className="text-sm text-gray-600 mb-1">Bugünkü Değer</div>
            <div className="text-lg font-semibold text-gray-700">
              {formatMoney(result.modelA.presentValue)}
            </div>
          </div>
          
          <div className="bg-white p-3 rounded-md">
            <div className="text-sm text-gray-600 mb-1">Toplam Faiz</div>
            <div className="text-lg font-semibold text-red-600">
              {formatMoney(modelAInterest)}
            </div>
          </div>
        </div>
      </div>

      {/* Model B */}
      <div className={`p-4 rounded-lg border-2 mb-4 ${betterModel === 'B' ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-gray-50'}`}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-lg">Model B: Peşinat Ayında Taksit Yok</h3>
          {betterModel === 'B' && (
            <span className="bg-green-600 text-white text-xs px-2 py-1 rounded">Önerilen</span>
          )}
        </div>
        
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white p-3 rounded-md">
            <div className="text-sm text-gray-600 mb-1">Aylık Taksit</div>
            <div className="text-xl font-bold text-blue-600">
              {formatMoney(result.modelB.monthlyInstallment)}
            </div>
          </div>
          
          <div className="bg-white p-3 rounded-md">
            <div className="text-sm text-gray-600 mb-1">Toplam Ödeme</div>
            <div className="text-xl font-bold text-gray-900">
              {formatMoney(result.modelB.nominalTotal)}
            </div>
          </div>
          
          <div className="bg-white p-3 rounded-md">
            <div className="text-sm text-gray-600 mb-1">Bugünkü Değer</div>
            <div className="text-lg font-semibold text-gray-700">
              {formatMoney(result.modelB.presentValue)}
            </div>
          </div>
          
          <div className="bg-white p-3 rounded-md">
            <div className="text-sm text-gray-600 mb-1">Toplam Faiz</div>
            <div className="text-lg font-semibold text-red-600">
              {formatMoney(modelBInterest)}
            </div>
          </div>
        </div>
      </div>

      {/* Karşılaştırma */}
      <div className="bg-blue-100 p-4 rounded-lg mb-4">
        <h4 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
          <DollarSign className="w-4 h-4" />
          Karşılaştırma
        </h4>
        <p className="text-sm text-blue-800">
          <strong>Model {betterModel}</strong> toplam {formatMoney(Math.abs(modelAInterest - modelBInterest))} daha avantajlı
        </p>
      </div>

      {/* İlk 6 Aylık Takvim */}
      <div className="border-t pt-4">
        <h4 className="font-semibold text-gray-900 mb-3">İlk 6 Aylık Ödeme Takvimi (Model {betterModel})</h4>
        <div className="space-y-2">
          {(betterModel === 'A' ? result.modelA.schedule : result.modelB.schedule)
            .slice(0, 6)
            .map((entry, idx) => (
              <div key={idx} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                <span className="text-sm font-medium text-gray-700 flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  {entry.date}
                </span>
                <span className="text-sm font-bold text-blue-600">{formatMoney(entry.amount)}</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
