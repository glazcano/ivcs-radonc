import './utils/applicationPeers';
import {initializeLanguage} from './i18n';
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {LibraryManager} from './components/LibraryManager';
import './index.css';

void initializeLanguage().then(()=>{
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {window.location.pathname==='/library'?<LibraryManager/>:<App />}
  </StrictMode>,
);

});
