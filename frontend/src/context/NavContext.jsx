import { createContext, useContext, useState } from 'react';

const NavContext = createContext({ tripName: '', setTripName: () => {}, onShare: null, setOnShare: () => {} });

export function NavProvider({ children }) {
  const [tripName, setTripName] = useState('');
  const [onShare,  setOnShare]  = useState(null);
  return (
    <NavContext.Provider value={{ tripName, setTripName, onShare, setOnShare }}>
      {children}
    </NavContext.Provider>
  );
}

export const useNav = () => useContext(NavContext);
