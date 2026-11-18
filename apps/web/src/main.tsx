import '@park/engine';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { loadCharacters } from './lib/characters';
import './styles/tokens.css';
import './styles/global.css';
import './components/components.css';
import './components/mahjong.css';
import './screens/table.css';
import './styles/device.css'; // 设备形态适配层（PC/Pad/手机/折叠屏/阔直板），最后加载以便覆盖

void loadCharacters();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
