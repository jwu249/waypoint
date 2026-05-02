import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NavProvider, useNav } from './context/NavContext';
import Navbar from './components/Navbar';
import Landing from './pages/Landing';
import Library from './pages/Library';
import TripInput from './pages/TripInput';
import Itinerary from './pages/Itinerary';
import Explore from './pages/Explore';
import Auth from './pages/Auth';

function AppRoutes() {
  const { user, loading } = useAuth();
  const { tripName, tripHref, onShare } = useNav();
  const location = useLocation();
  const { pathname, search } = location;

  if (loading) return <div className="loading-state">Loading…</div>;

  if (!user) {
    return (
      <Routes location={location} key={`${pathname}${search}`}>
        <Route path="/" element={<Landing />} />
        <Route path="/landing" element={<Navigate to="/" replace />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  return (
    <>
      {pathname !== '/' && <Navbar tripName={tripName} tripHref={tripHref} onShare={onShare} />}
      <Routes location={location} key={`${pathname}${search}`}>
        <Route path="/"         element={<Landing />} />
        <Route path="/landing"  element={<Navigate to="/" replace />} />
        <Route path="/trips"    element={<Library />} />
        <Route path="/new"      element={<TripInput />} />
        <Route path="/trip/:id" element={<Itinerary />} />
        <Route path="/explore"  element={<Explore />} />
        <Route path="*"         element={<Navigate to="/trips" replace />} />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <NavProvider>
          <AppRoutes />
        </NavProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
