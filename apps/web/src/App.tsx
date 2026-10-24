import { EMERGENCY_NUMBER } from '@defikarta/core';
import { useState } from 'react';
import { AedCard } from './AedCard';
import { Cpr } from './Cpr';
import { MapView } from './MapView';
import { useAeds, useGeolocation } from './useAeds';

type View = 'map' | 'call' | 'cpr';

export function App() {
  const [view, setView] = useState<View>('map');
  const { coords, status } = useGeolocation();
  const { ranked, offline } = useAeds(coords);
  const nearest = coords ? ranked[0] : undefined;

  return (
    <div className="app">
      <header className={view === 'map' ? 'top' : 'top top-red'}>
        {view !== 'map' && (
          <button className="back" onClick={() => setView('map')} aria-label="Назад">
            ←
          </button>
        )}
        <span className="brand">ДефиКарта</span>
        <span className="tag">Стара Загора</span>
      </header>

      {view === 'map' && (
        <main className="map-view">
          <MapView aeds={ranked} coords={coords} />
          {(offline || status === 'denied') && (
            <div className="banner">
              {status === 'denied' ? 'Няма достъп до местоположение — показваме всички дефибрилатори.' : 'Няма връзка — показваме запазените данни.'}
            </div>
          )}
          <div className="sheet">
            <button className="sos" onClick={() => setView('call')}>
              Някой припадна
              <small>112 · масаж · най-близък AED</small>
            </button>
            {nearest && <AedCard aed={nearest} from={coords} />}
            <p className="count-line">
              {ranked.length} известни дефибрилатора в града. Знаеш ли за още? Скоро: „Добави AED“.
            </p>
          </div>
        </main>
      )}

      {view === 'call' && (
        <main className="page">
          <p className="step">Стъпка 1 от 2</p>
          <h1>Обади се на 112</h1>
          <p className="lead">Кажи: „Човек е в безсъзнание и не диша нормално“ и адреса. Включи високоговорителя и не затваряй.</p>
          <a className="call" href={`tel:${EMERGENCY_NUMBER}`}>
            📞 {EMERGENCY_NUMBER}
          </a>
          <button className="next" onClick={() => setView('cpr')}>
            Обадих се → към масажа
          </button>
          <p className="small">Ако друг човек вече звъни на 112, продължи направо към масажа.</p>
        </main>
      )}

      {view === 'cpr' && (
        <main className="page">
          <p className="step">Стъпка 2 от 2</p>
          <Cpr />
          {nearest && (
            <section>
              <h2 className="aed-title">Пратете някой за този дефибрилатор:</h2>
              <AedCard aed={nearest} from={coords} />
            </section>
          )}
        </main>
      )}
    </div>
  );
}
