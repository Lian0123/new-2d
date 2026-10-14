import React from 'react';
import { createRoot } from 'react-dom/client';
import Demo from './Demo';
import './demo.css';

createRoot(document.getElementById('root')!).render(<React.StrictMode><Demo /></React.StrictMode>);
