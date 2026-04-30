import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Library from './pages/Library';
import TripInput from './pages/TripInput';
import Itinerary from './pages/Itinerary';

export default function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        <Route path="/" element={<Library />} />
        <Route path="/new" element={<TripInput />} />
        <Route path="/trip/:id" element={<Itinerary />} />
      </Routes>
    </BrowserRouter>
  );
}
