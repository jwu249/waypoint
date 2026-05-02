/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState } from 'react';

const NavContext = createContext({
  tripName: '',
  setTripName: () => {},
  tripHref: '',
  setTripHref: () => {},
  onShare: null,
  setOnShare: () => {},
});

export function NavProvider({ children }) {
  const [tripName, setTripName] = useState('');
  const [tripHref, setTripHref] = useState('');
  const [onShare, setOnShare] = useState(null);
  return (
    <NavContext.Provider value={{ tripName, setTripName, tripHref, setTripHref, onShare, setOnShare }}>
      {children}
    </NavContext.Provider>
  );
}

export const useNav = () => useContext(NavContext);
