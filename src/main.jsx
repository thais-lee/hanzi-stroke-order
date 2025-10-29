import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { inject } from '@vercel/analytics';
import { SpeedInsights } from '@vercel/speed-insights/react';
inject();
import './index.css';
import './styles.css';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <SpeedInsights />
    <App />
  </StrictMode>,
);
