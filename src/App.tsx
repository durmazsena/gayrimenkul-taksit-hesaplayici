import { useState, useEffect, useRef } from 'react';
import { Send, Home as HomeIcon, MapPin, Layers, Calendar, DollarSign, RefreshCw, MessageSquare, Filter, GitCompare, TrendingUp } from 'lucide-react';
import type { Apartment, ChatMessage, ConversationState, ConversationStep, NPVResult } from './types';
import { loadApartmentsFromCSV, filterApartments } from './lib/csv-loader';
import { generateBotResponse } from './lib/chatbot';
import { NPVResultCard } from './components/NPVResultCard';
import { formatMoney } from './lib/utils';

export default function App() {
  const [apartments, setApartments] = useState<Apartment[]>([]);
  const [filteredApartments, setFilteredApartments] = useState<Apartment[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [selectedApartment, setSelectedApartment] = useState<Apartment | null>(null);
  const [conversationState, setConversationState] = useState<ConversationState>({});
  const [npvResults, setNpvResults] = useState<Array<{result: NPVResult; apartmentId: string; apartmentPrice: number}>>([]);
  
  // Filters
  const [searchText, setSearchText] = useState('');
  const [minPrice, setMinPrice] = useState<number>(0);
  const [maxPrice, setMaxPrice] = useState<number>(10000000);
  const [selectedRooms, setSelectedRooms] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  
  // Compare
  const [compareList, setCompareList] = useState<Apartment[]>([]);
  const [compareModalOpen, setCompareModalOpen] = useState(false);
  
  const chatEndRef = useRef<HTMLDivElement>(null);

  // CSV'den verileri yükle ve ilk mesajı göster
  useEffect(() => {
    loadApartmentsFromCSV().then(data => {
      setApartments(data);
      setFilteredApartments(data);
      setLoading(false);
      
      // Bugünkü tarihi ayarla
      const today = new Date();
      setConversationState({
        startYear: today.getFullYear(),
        startMonth: today.getMonth() + 1,
        step: 'waiting_for_apartment',
      });
      
      // Hoş geldin mesajını göster
      const { message: welcomeMessage } = generateBotResponse('', {
        startYear: today.getFullYear(),
        startMonth: today.getMonth() + 1,
        step: 'waiting_for_apartment',
      }, data);
      
      if (welcomeMessage) {
        setChatMessages([{ role: 'bot', content: welcomeMessage }]);
      }
    });
  }, []);

  // Filtreleme
  useEffect(() => {
    const filtered = filterApartments(apartments, {
      searchText,
      minPrice: minPrice > 0 ? minPrice : undefined,
      maxPrice: maxPrice < 10000000 ? maxPrice : undefined,
      odaSayisi: selectedRooms.length > 0 ? selectedRooms : undefined,
    });
    setFilteredApartments(filtered);
  }, [apartments, searchText, minPrice, maxPrice, selectedRooms]);

  // Auto scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleSendMessage = () => {
    if (!message.trim()) return;

    const userMsg: ChatMessage = { role: 'user', content: message };
    setChatMessages(prev => [...prev, userMsg]);

    // Bot yanıtı oluştur (yeni chatbot mantığı state'i kendi içinde yönetiyor)
    const { message: botMessage, npvResult: result, newState } = generateBotResponse(
      message,
      conversationState,
      apartments
    );

    // Konuşma durumunu güncelle (chatbot'tan dönen newState'i kullan)
    if (newState) {
      setConversationState(newState);
      
      // Ev seçildiyse selectedApartment'ı güncelle
      if (newState.apartmentId && newState.apartmentId !== conversationState.apartmentId) {
        const apartment = apartments.find(apt => apt.ev_id === newState.apartmentId);
        if (apartment) {
          setSelectedApartment(apartment);
        }
      }
    }

    // Bugünkü tarihi otomatik olarak ayarla (ilk mesajda)
    if (!conversationState.startYear || !conversationState.startMonth) {
      const today = new Date();
      setConversationState(prev => ({
        ...prev,
        startYear: today.getFullYear(),
        startMonth: today.getMonth() + 1,
      }));
    }

    if (result) {
      const apartmentId = newState?.apartmentId || conversationState.apartmentId;
      if (apartmentId) {
        const apartment = apartments.find(apt => apt.ev_id === apartmentId);
        if (apartment) {
          // Eğer aynı daire için yeniden hesaplama yapılıyorsa güncelle, yoksa yeni kart ekle
          setNpvResults(prev => {
            const existingIndex = prev.findIndex(item => item.apartmentId === apartmentId);
            if (existingIndex >= 0) {
              // Aynı daire için güncelleme - sadece bu kartı güncelle, diğerlerini koru
              const updated = [...prev];
              updated[existingIndex] = { 
                result, 
                apartmentId, 
                apartmentPrice: apartment.bugunku_pesin_fiyat 
              };
              return updated;
            }
            // Yeni daire - yeni kartı ekle (tüm kartlar tutulur)
            return [...prev, { 
              result, 
              apartmentId, 
              apartmentPrice: apartment.bugunku_pesin_fiyat 
            }];
          });
        }
      }
    }

    const botMsg: ChatMessage = { role: 'bot', content: botMessage };
    setTimeout(() => {
      setChatMessages(prev => [...prev, botMsg]);
    }, 500);

    setMessage('');
  };

  const handleSelectApartment = (apt: Apartment) => {
    setSelectedApartment(apt);
    
    // Bugünkü tarihi otomatik olarak ayarla
    const today = new Date();
    
    // Eğer completed adımındaysa, yeni bir akış başlat (tüm bilgileri sıfırla)
    const isCompleted = conversationState.step === 'completed';
    const updatedState = isCompleted ? {
      // Yeni akış için state'i sıfırla
      apartmentId: apt.ev_id,
      startYear: today.getFullYear(),
      startMonth: today.getMonth() + 1,
      step: 'waiting_for_interest_rate' as const,
      downAmount: undefined,
      downYear: undefined,
      downMonth: undefined,
      nInstallments: undefined,
      monthlyRate: undefined,
      isAnnualRateSelected: undefined,
      desiredInstallment: undefined,
      calculatedPv: undefined,
      lastNpvResult: undefined,
      alternativeApartments: undefined,
    } : {
      // Mevcut akışa devam et
      ...conversationState,
      apartmentId: apt.ev_id,
      startYear: today.getFullYear(),
      startMonth: today.getMonth() + 1,
      step: (conversationState.step === 'waiting_for_apartment' ? 'waiting_for_interest_rate' : conversationState.step) as ConversationStep,
    };
    setConversationState(updatedState);
    
    const autoMessage = apt.ev_id;
    setChatMessages(prev => [...prev, { role: 'user', content: autoMessage }]);
    
    const { message: botMessage, npvResult: result, newState } = generateBotResponse(autoMessage, updatedState, apartments);
    
    if (newState) {
      setConversationState(newState);
    }

    // NPV sonucu varsa ekle
    if (result) {
      const apartmentId = newState?.apartmentId || apt.ev_id;
      const apartment = apartments.find(a => a.ev_id === apartmentId) || apt;
      setNpvResults(prev => {
        const existingIndex = prev.findIndex(item => item.apartmentId === apartmentId);
        if (existingIndex >= 0) {
          // Aynı daire için güncelleme
          const updated = [...prev];
          updated[existingIndex] = { 
            result, 
            apartmentId, 
            apartmentPrice: apartment.bugunku_pesin_fiyat 
          };
          return updated;
        }
        // Yeni daire - yeni kartı ekle (tüm kartlar tutulur)
        return [...prev, { 
          result, 
          apartmentId, 
          apartmentPrice: apartment.bugunku_pesin_fiyat 
        }];
      });
    }
    
    setTimeout(() => {
      setChatMessages(prev => [...prev, { role: 'bot', content: botMessage }]);
    }, 500);
  };

  const toggleRoomFilter = (room: string) => {
    setSelectedRooms(prev =>
      prev.includes(room) ? prev.filter(r => r !== room) : [...prev, room]
    );
  };

  const toggleCompare = (apt: Apartment) => {
    setCompareList(prev => {
      const exists = prev.find(a => a.ev_id === apt.ev_id);
      if (exists) {
        return prev.filter(a => a.ev_id !== apt.ev_id);
      } else {
        if (prev.length >= 4) {
          alert('En fazla 4 konut karşılaştırabilirsiniz');
          return prev;
        }
        return [...prev, apt];
      }
    });
  };

  const clearChat = () => {
    setChatMessages([]);
    setSelectedApartment(null);
    const today = new Date();
    setConversationState({
      startYear: today.getFullYear(),
      startMonth: today.getMonth() + 1,
      step: 'waiting_for_apartment',
    });
    setNpvResults([]);
  };

  const uniqueRooms = Array.from(new Set(apartments.map(apt => apt.oda_sayisi))).sort();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600">Veriler yükleniyor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
                <HomeIcon className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Gayrimenkul Taksit Planı</h1>
                <div className="flex items-center gap-2">
                  <p className="text-sm text-gray-600">NPV Tabanlı Hesaplama</p>
                  <span className="text-xs text-gray-400">•</span>
                  <p className="text-sm text-gray-600">
                    📅 {new Date().toLocaleDateString('tr-TR', { 
                      year: 'numeric', 
                      month: 'long', 
                      day: 'numeric' 
                    })}
                  </p>
                </div>
              </div>
            </div>
            {compareList.length > 0 && (
              <button
                onClick={() => setCompareModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
              >
                <GitCompare className="w-4 h-4" />
                Karşılaştır ({compareList.length})
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Sol Sütun: Chatbox */}
          <div className="space-y-4">
            <div className="bg-white rounded-lg shadow-lg h-[calc(100vh-200px)] flex flex-col">
              <div className="border-b p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-primary" />
                    <h2 className="font-bold">AI Danışman</h2>
                  </div>
                  <button
                    onClick={clearChat}
                    className="text-gray-500 hover:text-gray-700"
                    title="Sohbeti temizle"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-sm text-gray-600 mt-1">
                  Ev seçimi, peşinat ve taksit planı için yardım alın
                </p>
              </div>
              
              {/* Chat Messages */}
              <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
                {chatMessages.length === 0 && (
                  <div className="text-center text-gray-500 py-8">
                    <MessageSquare className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                    <p>Merhaba! Size nasıl yardımcı olabilirim?</p>
                    <p className="text-sm mt-2">Sağdaki listeden bir ev seçerek başlayabilirsiniz.</p>
                  </div>
                )}
                
                {chatMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-3 whitespace-pre-wrap ${
                        msg.role === 'user'
                          ? 'bg-primary text-white'
                          : 'bg-white border border-gray-200'
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}
                
                <div ref={chatEndRef} />
              </div>
              
              {/* Chat Input */}
              <div className="border-t p-4">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendMessage();
                  }}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Mesajınızı yazın..."
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <button
                    type="submit"
                    disabled={!message.trim()}
                    className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </form>
              </div>
            </div>
          </div>

          {/* Sağ Sütun: Ev Listesi */}
          <div className="space-y-4">
            <div className="bg-white rounded-lg shadow-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <HomeIcon className="w-5 h-5 text-primary" />
                  <h2 className="font-bold">Ev Portföyü</h2>
                  <span className="text-sm text-gray-500">({filteredApartments.length} ev bulundu)</span>
                </div>
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className="flex items-center gap-2 px-3 py-2 border rounded-lg hover:bg-gray-50"
                >
                  <Filter className="w-4 h-4" />
                  Filtrele
                </button>
              </div>

              {/* Filters */}
              {showFilters && (
                <div className="mb-4 p-4 bg-gray-50 rounded-lg space-y-3">
                  <input
                    type="text"
                    placeholder="Ara (Ev ID, mahalle, ilçe...)"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                  
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      placeholder="Min Fiyat"
                      value={minPrice || ''}
                      onChange={(e) => setMinPrice(Number(e.target.value))}
                      className="px-3 py-2 border rounded-lg"
                    />
                    <input
                      type="number"
                      placeholder="Max Fiyat"
                      value={maxPrice === 10000000 ? '' : maxPrice}
                      onChange={(e) => setMaxPrice(Number(e.target.value) || 10000000)}
                      className="px-3 py-2 border rounded-lg"
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {uniqueRooms.map(room => (
                      <button
                        key={room}
                        onClick={() => toggleRoomFilter(room)}
                        className={`px-3 py-1 rounded-full text-sm ${
                          selectedRooms.includes(room)
                            ? 'bg-primary text-white'
                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                      >
                        {room}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Apartment List */}
              <div className="space-y-3 max-h-[400px] overflow-y-auto custom-scrollbar">
                {filteredApartments.map(apt => (
                  <div
                    key={apt.ev_id}
                    className={`border rounded-lg p-4 cursor-pointer transition-all hover:shadow-md ${
                      selectedApartment?.ev_id === apt.ev_id
                        ? 'border-primary bg-blue-50'
                        : 'border-gray-200 hover:border-primary'
                    }`}
                    onClick={() => handleSelectApartment(apt)}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="font-bold text-lg">{apt.ev_id}</h3>
                        <span className="text-xs bg-gray-100 px-2 py-1 rounded">{apt.oda_sayisi}</span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleCompare(apt);
                        }}
                        className={`p-2 rounded-lg ${
                          compareList.find(a => a.ev_id === apt.ev_id)
                            ? 'bg-primary text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                        title="Karşılaştırmaya ekle"
                      >
                        <GitCompare className="w-4 h-4" />
                      </button>
                    </div>
                    
                    <div className="space-y-1 text-sm text-gray-600">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4" />
                        {apt.mahalle}, {apt.ilce}
                      </div>
                      <div className="flex items-center gap-2">
                        <Layers className="w-4 h-4" />
                        Blok {apt.blok} • Kat {apt.kat} • {apt.m2}m²
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        Teslim: {apt.teslim_suresi} ({apt.bitis_tarihi})
                      </div>
                    </div>
                    
                    <div className="mt-3 pt-3 border-t flex items-center gap-2">
                      <DollarSign className="w-5 h-5 text-primary" />
                      <span className="text-xl font-bold text-primary">
                        {formatMoney(apt.bugunku_pesin_fiyat)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Taksit Planı Kartları - Alt Bölüm (Tüm Genişlik) */}
        {npvResults.length > 0 && (
          <div className="mt-6 bg-white rounded-lg shadow-lg p-6">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-5 h-5 text-primary" />
              <h2 className="font-bold text-xl">Taksit Planları</h2>
              {npvResults.length > 1 && (
                <span className="text-sm text-gray-500">({npvResults.length} plan - karşılaştırma)</span>
              )}
            </div>
            
            <div className={`grid gap-6 ${npvResults.length === 1 ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'}`}>
              {npvResults.map((item, index) => (
                <div key={`${item.apartmentId}-${index}`} className="border border-gray-200 rounded-lg p-4">
                  <div className="text-sm text-gray-600 mb-3 font-medium flex items-center gap-2">
                    <HomeIcon className="w-4 h-4" />
                    Daire: {item.apartmentId}
                  </div>
                  <NPVResultCard 
                    result={item.result} 
                    apartmentPrice={item.apartmentPrice}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Compare Modal */}
      {compareModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between">
              <h2 className="text-xl font-bold">Konut Karşılaştırma</h2>
              <button
                onClick={() => setCompareModalOpen(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            
            <div className="p-4">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="border p-2 text-left font-semibold">Özellik</th>
                      {compareList.map(apt => (
                        <th key={apt.ev_id} className="border p-2 text-center font-semibold">
                          {apt.ev_id}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="border p-2 font-medium">Fiyat</td>
                      {compareList.map(apt => (
                        <td key={apt.ev_id} className="border p-2 text-center font-bold text-primary">
                          {formatMoney(apt.bugunku_pesin_fiyat)}
                        </td>
                      ))}
                    </tr>
                    <tr className="bg-gray-50">
                      <td className="border p-2 font-medium">Konum</td>
                      {compareList.map(apt => (
                        <td key={apt.ev_id} className="border p-2 text-center">
                          {apt.mahalle}, {apt.ilce}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td className="border p-2 font-medium">Oda Sayısı</td>
                      {compareList.map(apt => (
                        <td key={apt.ev_id} className="border p-2 text-center">
                          {apt.oda_sayisi}
                        </td>
                      ))}
                    </tr>
                    <tr className="bg-gray-50">
                      <td className="border p-2 font-medium">Metrekare</td>
                      {compareList.map(apt => (
                        <td key={apt.ev_id} className="border p-2 text-center">
                          {apt.m2}m²
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td className="border p-2 font-medium">Blok / Kat</td>
                      {compareList.map(apt => (
                        <td key={apt.ev_id} className="border p-2 text-center">
                          Blok {apt.blok} / Kat {apt.kat}
                        </td>
                      ))}
                    </tr>
                    <tr className="bg-gray-50">
                      <td className="border p-2 font-medium">Teslim Süresi</td>
                      {compareList.map(apt => (
                        <td key={apt.ev_id} className="border p-2 text-center">
                          {apt.teslim_suresi}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td className="border p-2 font-medium">Teslim Tarihi</td>
                      {compareList.map(apt => (
                        <td key={apt.ev_id} className="border p-2 text-center">
                          {apt.bitis_tarihi}
                        </td>
                      ))}
                    </tr>
                    <tr className="bg-gray-50">
                      <td className="border p-2 font-medium">m² Başına Fiyat</td>
                      {compareList.map(apt => (
                        <td key={apt.ev_id} className="border p-2 text-center">
                          {formatMoney(apt.bugunku_pesin_fiyat / apt.m2)}/m²
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
              
              <div className="mt-4 flex justify-end gap-2">
                <button
                  onClick={() => setCompareList([])}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  Listeyi Temizle
                </button>
                <button
                  onClick={() => setCompareModalOpen(false)}
                  className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
                >
                  Kapat
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
