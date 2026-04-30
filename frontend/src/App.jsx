import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NavProvider, useNav } from './context/NavContext';
import Navbar from './components/Navbar';
import Library from './pages/Library';
import TripInput from './pages/TripInput';
import Itinerary from './pages/Itinerary';
import Explore from './pages/Explore';
import Auth from './pages/Auth';

function AppRoutes() {
  const { user, loading } = useAuth();
  const { tripName, onShare } = useNav();

  if (loading) return <div className="loading-state">Loading…</div>;

  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<Auth />} />
      </Routes>
    );
  }

  return (
    <>
      <Navbar tripName={tripName} onShare={onShare} />
      <Routes>
        <Route path="/"         element={<Library />} />
        <Route path="/new"      element={<TripInput />} />
        <Route path="/trip/:id" element={<Itinerary />} />
        <Route path="/explore"  element={<Explore />} />
        <Route path="*"         element={<Navigate to="/" replace />} />
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
