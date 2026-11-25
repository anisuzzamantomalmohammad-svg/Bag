import { createContext, useContext } from 'react';

// { tab, setTab, push, pop, openSheet, closeSheet }
export const NavCtx = createContext(null);
export const useNav = () => useContext(NavCtx);
