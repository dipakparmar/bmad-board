import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { BmadProjectBoardPreview } from './BmadProjectBoard';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Board root element is missing');

createRoot(root).render(
  <StrictMode>
    <BmadProjectBoardPreview />
  </StrictMode>,
);
