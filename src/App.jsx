import React, { useState, useEffect, useCallback } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { Navigation, MapPin, Trash2, Zap, Plus, Info, Loader2, ChevronUp, ChevronDown } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import './App.css'

// Custom Numbered Icon Generator
const createNumberedIcon = (number, isStart) => {
  return L.divIcon({
    className: 'custom-div-icon',
    html: `<div class="marker-pin ${isStart ? 'start' : ''}">
             <span>${isStart ? 'A' : number}</span>
           </div>`,
    iconSize: [30, 42],
    iconAnchor: [15, 42]
  });
};

function MapEvents({ onMapClick }) {
  useMapEvents({
    click: (e) => onMapClick(e.latlng),
  });
  return null;
}

const API_BASE_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:8000' 
  : 'https://gosmart-production.up.railway.app'; 

function App() {
  const [errands, setErrands] = useState([]);
  const [currentPos, setCurrentPos] = useState([31.4368, 31.6669]); // Default to Damietta
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({ distance: 0, time: 0 });
  const [roadLegs, setRoadLegs] = useState([]);
  const [mapRef, setMapRef] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const routeColors = ['#4285F4', '#34A853', '#FBBC05', '#EA4335', '#8E44AD', '#1ABC9C', '#D35400'];

  const handleManualSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    
    setIsSearching(true);
    try {
      // Search specifically in New Damietta, Egypt
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${searchQuery} دمياط الجديدة&accept-language=ar&limit=1`);
      const data = await response.json();
      
      if (data && data.length > 0) {
        const result = data[0];
        const newErrand = {
          id: Date.now(),
          name: result.display_name.split(',')[0],
          sub: result.display_name.split(',').slice(1, 3).join(',').trim(),
          lat: parseFloat(result.lat),
          lng: parseFloat(result.lon)
        };
        setErrands(prev => [...prev, newErrand]);
        setSearchQuery('');
        focusOnLocation(newErrand.lat, newErrand.lng);
      } else {
        alert("لم يتم العثور على المكان في دمياط الجديدة");
      }
    } catch (error) {
      console.error("Search error:", error);
    } finally {
      setIsSearching(false);
    }
  };

  const focusOnLocation = (lat, lng) => {
    if (mapRef) {
      mapRef.flyTo([lat, lng], 17, { duration: 1.5 });
    }
  };

  // Use dynamic geolocation for starting point
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          setCurrentPos([latitude, longitude]);
          
          setLoading(true);
          const place = await fetchPlaceName(latitude, longitude);
          setErrands([{
            id: 'start',
            name: 'موقعي الحالي',
            sub: place.sub,
            lat: latitude,
            lng: longitude,
            isStart: true
          }]);
          setLoading(false);
        },
        () => {
          // Fallback if denied
          setErrands([{
            id: 'start',
            name: 'جامعة دمياط (افتراضي)',
            sub: 'كلية الحاسبات والذكاء الاصطناعي',
            lat: 31.4385,
            lng: 31.6669,
            isStart: true
          }]);
        }
      );
    }
  }, []);

  const fetchPlaceName = async (lat, lng) => {
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=ar`);
      const data = await response.json();
      return {
        name: data.address.road || data.address.suburb || data.address.city || 'دمياط الجديدة',
        sub: data.display_name.split(',').slice(0, 2).join(',').trim()
      };
    } catch (error) {
      return { name: 'مكان في دمياط الجديدة', sub: `${lat.toFixed(4)}, ${lng.toFixed(4)}` };
    }
  };

  const handleMapClick = async (latlng) => {
    setLoading(true);
    const place = await fetchPlaceName(latlng.lat, latlng.lng);
    const newErrand = {
      id: Date.now(),
      ...place,
      lat: latlng.lat,
      lng: latlng.lng
    };
    setErrands(prev => [...prev, newErrand]);
    setLoading(false);
  };

  const optimizeRoute = async (isManual = false) => {
    if (errands.length < 2) return;
    setLoading(true);
    
    try {
      const response = await fetch(`${API_BASE_URL}/optimize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points: errands, skip_optimization: isManual })
      });
      
      const result = await response.json();
      
      setErrands(result.path);
      setRoadLegs(result.legs);
      setStats({
        distance: result.distance,
        time: result.time
      });
    } catch (error) {
      console.error("Backend Error:", error);
      alert("Error connecting to Python backend!");
    } finally {
      setLoading(false);
    }
  };

  const clearAll = () => {
    setErrands(prev => prev.filter(e => e.isStart));
    setRoadLegs([]);
    setStats({ distance: 0, time: 0 });
  };

  const togglePriority = (id) => {
    setErrands(prev => prev.map(e => 
      e.id === id ? { ...e, priority: !e.priority } : e
    ));
  };

  const removeErrand = (id) => {
    setErrands(prev => prev.filter(e => e.id !== id));
    setRoadLegs([]); // Clear path as points changed
  };

  const moveErrand = (index, direction) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= errands.length) return;
    
    const newErrands = [...errands];
    const temp = newErrands[index];
    newErrands[index] = newErrands[newIndex];
    newErrands[newIndex] = temp;
    setErrands(newErrands);
  };

  if (!currentPos) return <div className="loading-screen"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
             <Navigation size={28} color="var(--primary)" />
             <h1 style={{ fontSize: '1.8rem' }}>GoSmart</h1>
          </div>
          <small style={{ color: '#aaa' }}>Damietta Smart Route</small>
        </div>

        <form onSubmit={handleManualSearch} className="search-box">
          <input 
            type="text" 
            placeholder="ابحث عن مكان (بنك، صيدلية...)" 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <button type="submit" disabled={isSearching}>
            {isSearching ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
          </button>
        </form>

        <section className="errand-section">
          <p className="section-title">ترتيب الزيارة</p>
          <div className="errand-list scrollable">
            <AnimatePresence>
              {errands.map((errand, index) => (
                <motion.div 
                  key={errand.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className={`errand-card compact ${errand.isStart ? 'active' : ''} ${errand.priority ? 'priority' : ''}`}
                  onClick={() => focusOnLocation(errand.lat, errand.lng)}
                >
                  <div className="errand-index-small">{index + 1}</div>
                  <div className="errand-info">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <h3 style={{ fontSize: '0.9rem' }}>{errand.name}</h3>
                      {errand.priority && <Zap size={12} fill="#FBBC05" color="#FBBC05" />}
                    </div>
                  </div>
                  
                  {!errand.isStart && (
                    <div className="reorder-actions-horizontal">
                      <button onClick={(e) => { e.stopPropagation(); moveErrand(index, -1); }} disabled={index === 0}>
                        <ChevronUp size={14} />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); moveErrand(index, 1); }} disabled={index === errands.length - 1}>
                        <ChevronDown size={14} />
                      </button>
                    </div>
                  )}
                  
                  {!errand.isStart && (
                    <button 
                      className={`priority-btn-small ${errand.priority ? 'active' : ''}`}
                      onClick={(e) => { e.stopPropagation(); togglePriority(errand.id); }}
                    >
                      <Zap size={14} />
                    </button>
                  )}

                  {!errand.isStart && (
                    <button 
                      className="delete-btn-small"
                      onClick={(e) => { e.stopPropagation(); removeErrand(errand.id); }}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </section>

        <div className="stats-mini">
           <div>{stats.distance} كم</div>
           <div>{stats.time} دقيقة</div>
        </div>

        <div className="actions-grid-compact">
            <button className="btn-primary-small" onClick={() => optimizeRoute(false)} disabled={errands.length < 2 || loading}>
              {loading ? <Loader2 className="animate-spin" size={18} /> : <Zap size={18} fill="white" />}
              Smart Optimize
            </button>
            <button className="btn-secondary-small" onClick={() => optimizeRoute(true)} disabled={errands.length < 2 || loading}>
              <Navigation size={18} />
              رسم المسار الحالي
            </button>
            <button className="btn-danger-small" onClick={clearAll}>
              <Trash2 size={16} />
            </button>
        </div>
      </aside>

      <main className="map-viewport">
        <MapContainer 
          center={currentPos} 
          zoom={15} 
          scrollWheelZoom={true} 
          zoomControl={false}
          ref={setMapRef}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapEvents onMapClick={handleMapClick} />
          
          {errands.map((errand, index) => (
            <Marker 
              key={errand.id} 
              position={[errand.lat, errand.lng]}
              icon={createNumberedIcon(index + 1, errand.isStart)}
            >
              <Popup>
                <div style={{ padding: '5px', textAlign: 'right', direction: 'rtl' }}>
                  <strong>{errand.isStart ? 'بداية المشوار' : `#${index + 1} ${errand.name}`}</strong><br/>
                  <small>{errand.sub}</small>
                </div>
              </Popup>
            </Marker>
          ))}

          {roadLegs.map((leg, idx) => (
            <React.Fragment key={idx}>
              {/* Casing */}
              <Polyline 
                positions={leg.geometry} 
                color="white" 
                weight={10} 
                opacity={1}
                lineJoin="round"
              />
              {/* Colored Segment */}
              <Polyline 
                positions={leg.geometry} 
                color={routeColors[idx % routeColors.length]} 
                weight={6} 
                opacity={0.9}
                lineJoin="round"
                dashArray="10, 10"
                className="route-flow"
              >
                <Popup>
                  <div style={{ direction: 'rtl', textAlign: 'right' }}>
                    <strong>المرحلة {idx + 1}</strong><br/>
                    من: {leg.from}<br/>
                    إلى: {leg.to}<br/>
                    المسافة: {leg.distance} كم
                  </div>
                </Popup>
              </Polyline>
            </React.Fragment>
          ))}
        </MapContainer>
      </main>
    </div>
  )
}

export default App
