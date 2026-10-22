import { createContext, useContext } from 'react';

// { wedding, setWedding } for the wedding open in the app shell.
export const WeddingContext = createContext(null);
export const useWedding = () => useContext(WeddingContext);
